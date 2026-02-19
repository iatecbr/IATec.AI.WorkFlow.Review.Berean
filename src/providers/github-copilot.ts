import { CopilotClient } from '@github/copilot-sdk';
import { getGitHubTokenFromAzure } from '../services/credentials.js';
import { chatCompletion } from './copilot-http.js';

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  success: boolean;
  review?: string;
  summary?: string;
  issues?: ReviewIssue[];
  positives?: string[];
  recommendations?: string[];
  error?: string;
  model?: string;
}

export interface ReviewOptions {
  model?: string;
  language?: string;
  maxTokens?: number;
  rules?: string;
}

export interface ModelDetail {
  id: string;
  name: string;
  isDefault: boolean;
  isPremium?: boolean;
  multiplier?: number;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsToolCalls?: boolean;
  supportsStreaming?: boolean;
  supportsReasoning?: boolean;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  policyState?: string;
}

// ---------------------------------------------------------------------------
// Config / environment
// ---------------------------------------------------------------------------

const DEBUG = !!process.env.BEREAN_DEBUG;

/** True when running inside a CI/CD pipeline (Azure DevOps, GitHub Actions, etc.) */
const IS_CI = !!(
  process.env.CI ||
  process.env.TF_BUILD ||
  process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI
);

function log(msg: string): void {
  if (DEBUG) console.error(`[berean] ${msg}`);
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: CopilotClient | null = null;

async function getClient(): Promise<CopilotClient> {
  if (_client) return _client;
  const token = getGitHubTokenFromAzure();
  const options: Record<string, unknown> = {};
  if (token) {
    options.githubToken = token;
    options.useLoggedInUser = false;
  }
  _client = new CopilotClient(options);
  return _client;
}

export async function stopClient(): Promise<void> {
  if (_client) {
    await _client.stop();
    _client = null;
  }
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * Review code using GitHub Copilot.
 *
 * Strategy:
 * - CI environment or no SDK available → use direct HTTP API (faster, no subprocess)
 * - Interactive use → test SDK first; fall back to HTTP if it fails
 */
export async function reviewCode(diff: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  const { model = 'gpt-4o', language = 'English', rules } = options;
  const systemPrompt = buildReviewPrompt(language, rules);
  const userContent = `Here is the code diff to review:\n\n${diff}`;
  const token = getGitHubTokenFromAzure();
  const TIMEOUT_MS = 300_000;

  log(`Model: ${model} | CI: ${IS_CI} | Token: ${token ? 'env var' : 'SDK default'}`);

  // In CI, the SDK subprocess is unreliable — use HTTP directly
  if (IS_CI) {
    if (!token) {
      return { success: false, error: 'No GitHub token found. Set GITHUB_TOKEN, GH_TOKEN, or COPILOT_GITHUB_TOKEN.', model };
    }
    log('CI detected — using direct HTTP API');
    return reviewViaHttp(token, model, systemPrompt, userContent, TIMEOUT_MS);
  }

  // Interactive use: test SDK, fall back to HTTP
  try {
    const client = await getClient();
    await client.start();

    log('Testing SDK connectivity...');
    let sdkWorks = false;
    const testSession = await client.createSession({ model, streaming: false });
    try {
      const testResponse = await testSession.sendAndWait({ prompt: 'Reply with just: OK' }, 30_000);
      sdkWorks = !!testResponse?.data?.content;
      log(`SDK test: ${sdkWorks ? 'OK' : 'empty response'}`);
    } catch (err) {
      log(`SDK test failed: ${err instanceof Error ? err.message : err}`);
    }

    if (!sdkWorks) {
      if (token) {
        log('SDK unavailable — falling back to HTTP API');
        return reviewViaHttp(token, model, systemPrompt, userContent, TIMEOUT_MS);
      }
      return { success: false, error: 'GitHub Copilot SDK unavailable and no token for HTTP fallback', model };
    }

    log('Using SDK for review...');
    const sdkPrompt = `${systemPrompt}\n\n---\n\n${userContent}`;
    const content = await reviewViaSdkSession(client, model, sdkPrompt, TIMEOUT_MS);

    if (!content) {
      if (token) {
        log('SDK returned empty — falling back to HTTP API');
        return reviewViaHttp(token, model, systemPrompt, userContent, TIMEOUT_MS);
      }
      return { success: false, error: 'Empty response from API', model };
    }

    return parseReviewResponse(content, model);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    log(`SDK error: ${errMsg}`);
    if (token) {
      log('SDK failed — falling back to HTTP API');
      return reviewViaHttp(token, model, systemPrompt, userContent, TIMEOUT_MS);
    }
    return { success: false, error: errMsg, model };
  }
}

async function reviewViaHttp(
  token: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs: number,
): Promise<ReviewResult> {
  try {
    const content = await chatCompletion(token, model, systemPrompt, userContent, timeoutMs);
    if (!content) return { success: false, error: 'Empty response from Copilot API', model };
    return parseReviewResponse(content, model);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', model };
  }
}

async function reviewViaSdkSession(
  client: CopilotClient,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const session = await client.createSession({ model, streaming: false });

  return new Promise<string>((resolve, reject) => {
    let result = '';
    let gotMessage = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const timeoutId = setTimeout(() => {
      unsubscribe();
      gotMessage && result
        ? resolve(result)
        : reject(new Error(`No response after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const settle = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (result) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(result);
        }
      }, 5_000);
    };

    const unsubscribe = session.on((event: Record<string, unknown>) => {
      const type = event.type as string;

      if (type === 'assistant.message') {
        const data = event.data as Record<string, unknown>;
        result = (data?.content as string) || result;
        gotMessage = true;
        settle();
      } else if (type === 'session.idle') {
        if (settleTimer) clearTimeout(settleTimer);
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(result);
      } else if (type === 'session.error') {
        if (settleTimer) clearTimeout(settleTimer);
        clearTimeout(timeoutId);
        unsubscribe();
        const data = event.data as Record<string, string>;
        reject(new Error(data?.message || 'Session error'));
      } else if (gotMessage) {
        settle();
      }
    });

    session.send({ prompt }).catch((e: Error) => {
      if (settleTimer) clearTimeout(settleTimer);
      clearTimeout(timeoutId);
      unsubscribe();
      reject(e);
    });
  });
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseReviewResponse(content: string, model: string): ReviewResult {
  try {
    let jsonContent = content;

    // Strip markdown code fences if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonContent = jsonMatch[1].trim();

    let parsed: {
      summary?: string;
      issues?: ReviewResult['issues'];
      positives?: string[];
      recommendations?: string[];
    } | null = null;

    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      // Attempt to repair truncated JSON
      let fixed = jsonContent
        .replace(/,\s*"[^"]*$/, '')
        .replace(/,\s*$/, '')
        .replace(/:\s*"[^"]*$/, ': ""');

      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      fixed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      fixed += '}'.repeat(Math.max(0, openBraces - closeBraces));

      try { parsed = JSON.parse(fixed); } catch { /* ignore */ }
    }

    if (parsed) {
      return {
        success: true,
        summary: parsed.summary,
        issues: parsed.issues,
        positives: parsed.positives,
        recommendations: parsed.recommendations,
        review: content,
        model,
      };
    }

    return { success: true, review: content, model };
  } catch {
    return { success: true, review: content, model };
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildReviewPrompt(language: string, rules?: string): string {
  let prompt = `You are an expert code reviewer. Analyze the provided code changes (git diff) and provide a comprehensive review.

You MUST respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text). The JSON must contain:

{
  "summary": "Brief summary of what the changes do (2-3 sentences)",
  "issues": [
    {
      "severity": "critical|warning|suggestion",
      "file": "/path/to/file.ts",
      "line": 42,
      "message": "Description of the issue and how to fix it",
      "suggestion": "Optional: corrected code snippet if applicable"
    }
  ],
  "positives": ["List of good practices observed"],
  "recommendations": ["General recommendations for improvement"]
}

CRITICAL RULES:
1. Response must be ONLY the JSON object - no markdown, no \`\`\`json blocks, just raw JSON
2. "file" must be the EXACT file path as shown in the diff (e.g., "/src/services/api.ts")
3. "line" must be a specific line number from the NEW version of the file
4. "issues" array can be empty [] if there are no problems
5. All text content must be in ${language}

Severity levels:
- critical: Security vulnerabilities, bugs that will cause crashes, data loss
- warning: Code smells, potential bugs, performance issues
- suggestion: Style improvements, refactoring opportunities

Be specific and actionable. If the code is good, return empty issues array and list positives.`;

  if (rules) {
    prompt += `\n\n---\n\nPROJECT-SPECIFIC RULES AND GUIDELINES (use these to evaluate the code):\n\n${rules}`;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const FALLBACK_MODELS: ModelDetail[] = [
  { id: 'gpt-4o', name: 'GPT-4o', isDefault: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', isDefault: false },
  { id: 'gpt-4.1', name: 'GPT-4.1', isDefault: false },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', isDefault: false },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', isDefault: false },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', isDefault: false },
  { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5', isDefault: false },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', isDefault: false },
  { id: 'o3-mini', name: 'o3-mini', isDefault: false },
];

/**
 * Fetch available models from Copilot SDK.
 * Falls back to a hardcoded list if the API call fails.
 */
export async function fetchModels(): Promise<ModelDetail[]> {
  try {
    const client = await getClient();
    await client.start();
    const models = await client.listModels();

    return models.map((m) => {
      const caps = m.capabilities as unknown as Record<string, unknown>;
      const limits = (caps?.limits ?? {}) as Record<string, unknown>;
      const supports = (caps?.supports ?? {}) as Record<string, unknown>;
      const billing = (m.billing ?? {}) as unknown as Record<string, unknown>;

      return {
        id: m.id,
        name: m.name,
        isDefault: m.id === 'gpt-4o',
        isPremium: (billing.is_premium as boolean) ?? false,
        multiplier: m.billing?.multiplier ?? 0,
        maxContextTokens: limits.max_context_window_tokens as number | undefined,
        maxOutputTokens: limits.max_output_tokens as number | undefined,
        supportsVision: m.capabilities?.supports?.vision ?? false,
        supportsToolCalls: (supports.tool_calls as boolean) ?? false,
        supportsStreaming: (supports.streaming as boolean) ?? false,
        supportsReasoning: m.capabilities?.supports?.reasoningEffort ?? false,
        reasoningEfforts: m.supportedReasoningEfforts as string[] | undefined,
        defaultReasoningEffort: m.defaultReasoningEffort as string | undefined,
        policyState: m.policy?.state,
      };
    });
  } catch {
    return FALLBACK_MODELS;
  }
}
