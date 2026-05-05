import { approveAll, type SessionEvent } from '@github/copilot-sdk';
import { getGitHubTokenFromAzure } from '../../../services/credentials.js';
import type { ReviewOptions, ReviewResult } from '../../../application/ports/review-model.port.js';
import { getPromptRepository, renderPrompt } from '../../prompts/file-prompt.repository.js';
import { getClient, log } from './copilot-client.factory.js';
import { extractReviewScope, type ReviewScope } from '../../../domain/review/services/review-scope.service.js';
import { filterIssuesToReviewScope } from '../../../domain/review/services/issue-filter.service.js';
import type { ReviewIssue } from '../../../domain/review/entities/review-issue.js';
import { stripProviderPrefix } from '../../../domain/shared/model-identifier.js';

// ─── Review ───────────────────────────────────────────────────────────────────

export async function reviewCode(diff: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  const rawModel = options.model ?? 'gpt-4o';
  const model = stripProviderPrefix(rawModel, 'copilot');
  const { language = 'English', rules } = options;
  const confidenceThreshold = options.confidenceThreshold ?? 75;
  const reviewScope = extractReviewScope(diff);

  try {
    const token = getGitHubTokenFromAzure();
    const { system, user } = await buildReviewPrompt(language, diff, rules);
    const promptSize = system.length + user.length;

    log(`[berean] Token source: ${token ? 'env var' : 'SDK default'}`);
    log(`[berean] Node version: ${process.version}`);
    log(`[berean] Prompt size: ${promptSize} chars (~${Math.round(promptSize / 4)} tokens)`);

    let content = '';
    const TIMEOUT_MS = 300_000;

    const client = await getClient();

    log(`[berean] Starting client...`);
    await client.start();
    log(`[berean] Client started, creating review session...`);

    const session = await client.createSession({
      model,
      streaming: false,
      systemMessage: { mode: 'replace', content: system },
      onPermissionRequest: approveAll,
      ...(token ? { gitHubToken: token } : {}),
    });

    content = await new Promise<string>((resolve, reject) => {
      const messages: string[] = [];
      let gotMessage = false;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;

      const pickBestMessage = (): string => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].trimStart().startsWith('{')) return messages[i];
        }
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].includes('{')) return messages[i];
        }
        return messages[messages.length - 1] || '';
      };

      function gotJsonLikeMessage(): boolean {
        return messages.some(m => m.trimStart().startsWith('{'));
      }

      const timeoutId = setTimeout(() => {
        unsubscribe();
        if (gotMessage && messages.length > 0) {
          log(`[berean] Timeout reached but got response, using best of ${messages.length} message(s)`);
          resolve(pickBestMessage());
        } else {
          reject(new Error(`No response received after ${TIMEOUT_MS / 1000}s`));
        }
      }, TIMEOUT_MS);

      const settle = () => {
        if (settleTimer) clearTimeout(settleTimer);
        const delay = gotJsonLikeMessage() ? 5_000 : 15_000;
        settleTimer = setTimeout(() => {
          if (messages.length > 0) {
            clearTimeout(timeoutId);
            unsubscribe();
            const best = pickBestMessage();
            log(`[berean] Response settled (no new events for ${delay / 1000}s), picked best of ${messages.length} message(s)`);
            resolve(best);
          }
        }, delay);
      };

      const unsubscribe = session.on((event: SessionEvent) => {
        const eventType = event.type as string;
        log(`[berean] Event: ${eventType}`);

        if (eventType === 'assistant.message') {
          const data = event.data as Record<string, unknown>;
          const msgContent = data?.content as string;
          if (msgContent) {
            messages.push(msgContent);
            log(`[berean] Message #${messages.length} received (${msgContent.length} chars, json-like: ${msgContent.trimStart().startsWith('{')})`);
          }
          gotMessage = true;
          settle();
        } else if (eventType === 'session.idle') {
          if (settleTimer) clearTimeout(settleTimer);
          clearTimeout(timeoutId);
          unsubscribe();
          log(`[berean] session.idle received`);
          resolve(pickBestMessage());
        } else if (eventType === 'session.error') {
          if (settleTimer) clearTimeout(settleTimer);
          clearTimeout(timeoutId);
          unsubscribe();
          const data = event.data as Record<string, string>;
          reject(new Error(data?.message ?? 'Session error'));
        } else {
          if (gotMessage) settle();
        }
      });

      log(`[berean] Sending prompt (${user.length} chars)...`);
      session.send({ prompt: user }).catch((e: Error) => {
        if (settleTimer) clearTimeout(settleTimer);
        clearTimeout(timeoutId);
        unsubscribe();
        reject(e);
      });
    });

    if (!content) {
      return { success: false, error: 'Empty response from API', model };
    }

    const result = parseReviewResponse(content, model, reviewScope);
    if (result.issues && confidenceThreshold) {
      result.issues = result.issues.filter(i => (i.confidence || 100) >= confidenceThreshold);
    }
    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errMsg, model };
  }
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseReviewResponse(content: string, model: string, reviewScope: ReviewScope): ReviewResult {
  try {
    let jsonContent = content;

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    type ParsedReview = {
      summary?: string;
      recommendation?: ReviewResult['recommendation'];
      issues?: ReviewResult['issues'];
      positives?: string[];
      recommendations?: string[];
    };

    let parsed = tryParseJson(jsonContent) as ParsedReview | null;
    if (!parsed) {
      parsed = extractJsonFromMixedContent(content) as ParsedReview | null;
    }

    if (parsed) {
      return {
        success: true,
        summary: parsed.summary,
        recommendation: parsed.recommendation,
        issues: filterIssuesToReviewScope(parsed.issues, reviewScope),
        positives: parsed.positives,
        recommendations: parsed.recommendations,
        review: content,
        model,
      };
    }

    log(`[berean] ⚠ Could not parse review response as JSON (${content.length} chars). Content starts with: "${content.substring(0, 120)}..."`);
    return { success: true, review: content, model };
  } catch {
    return { success: true, review: content, model };
  }
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    let fixedJson = text;
    const openBraces = (fixedJson.match(/{/g) ?? []).length;
    const closeBraces = (fixedJson.match(/}/g) ?? []).length;
    const openBrackets = (fixedJson.match(/\[/g) ?? []).length;
    const closeBrackets = (fixedJson.match(/\]/g) ?? []).length;

    fixedJson = fixedJson.replace(/,\s*"[^"]*$/, '');
    fixedJson = fixedJson.replace(/,\s*$/, '');
    fixedJson = fixedJson.replace(/:\s*"[^"]*$/, ': ""');

    for (let i = 0; i < openBrackets - closeBrackets; i++) fixedJson += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) fixedJson += '}';

    try {
      return JSON.parse(fixedJson);
    } catch {
      return null;
    }
  }
}

function extractJsonFromMixedContent(content: string): Record<string, unknown> | null {
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const braceIndex = content.indexOf('{', searchFrom);
    if (braceIndex === -1) break;

    const candidate = content.substring(braceIndex);
    const result = tryParseJson(candidate);
    if (result && typeof result === 'object' && !Array.isArray(result) && ('summary' in result || 'issues' in result || 'recommendation' in result)) {
      log(`[berean] Extracted JSON from mixed content at position ${braceIndex}`);
      return result;
    }

    searchFrom = braceIndex + 1;
  }
  return null;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

async function buildReviewPrompt(language: string, diff: string, rules?: string): Promise<{ system: string; user: string }> {
  const repository = getPromptRepository();
  const [systemTemplate, userTemplate] = await Promise.all([
    repository.getPrompt('review/v1/system.md'),
    repository.getPrompt('review/v1/user.md'),
  ]);
  const rulesBlock = rules
    ? `\n\n---\n\nPROJECT-SPECIFIC RULES AND GUIDELINES (use these to evaluate the code, they take priority over general rules):\n\n${rules}`
    : '';

  return {
    system: renderPrompt(systemTemplate, { language, rulesBlock }),
    user: renderPrompt(userTemplate, { diff }),
  };
}

export { extractReviewScope, filterIssuesToReviewScope };
export type { ReviewIssue, ReviewScope };
