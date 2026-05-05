import type {
  ModelDetail,
  ReviewIssue,
  ReviewModelPort,
  ReviewOptions,
  ReviewResult,
} from '../application/ports/review-model.port.js';
import { getPromptRepository, renderPrompt } from '../infrastructure/prompts/file-prompt.repository.js';
import { getOllamaApiKey, getOllamaEndpoint, getOllamaModel } from '../services/credentials.js';
import { OllamaProvider } from '../infrastructure/ai/ollama/ollama-http.client.js';
import { extractErrorMessage } from '../lib/errors.js';
import { extractReviewScope } from '../domain/review/services/review-scope.service.js';
import { filterIssuesToReviewScope } from '../domain/review/services/issue-filter.service.js';
import { parseModelId, stripProviderPrefix } from '../domain/shared/model-identifier.js';

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

    const result = tryParseJson(content.substring(braceIndex));
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result;
    }

    searchFrom = braceIndex + 1;
  }

  return null;
}

function extractJsonArrayFromMixedContent(content: string): string[] {
  const match = content.match(/\[[\s\S]*?\]/);
  if (!match) {
    return [];
  }

  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function parseReviewResponse(content: string, model: string, diff: string): ReviewResult {
  try {
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    type ParsedReview = {
      summary?: string;
      recommendation?: ReviewResult['recommendation'];
      issues?: ReviewIssue[];
      positives?: string[];
      recommendations?: string[];
    };

    const reviewScope = extractReviewScope(diff);
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

    return { success: true, review: content, model };
  } catch {
    return { success: true, review: content, model };
  }
}

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

async function buildQueryGenerationPrompt(diff: string): Promise<{ system: string; user: string }> {
  const repository = getPromptRepository();
  const [systemTemplate, userTemplate] = await Promise.all([
    repository.getPrompt('query-generation/v1/system.md'),
    repository.getPrompt('query-generation/v1/user.md'),
  ]);

  return {
    system: systemTemplate,
    user: renderPrompt(userTemplate, { diffExcerpt: diff.substring(0, 2_000) }),
  };
}

/**
 * Strips the `ollama:` prefix (if present) and returns the bare model name
 * that the Ollama HTTP client expects (e.g. `'gemma4:31b-cloud'`).
 * Falls back to the value from credentials when no explicit model is given.
 */
function normalizeModel(model?: string): string | undefined {
  const candidate = model ?? getOllamaModel();
  if (!candidate) return undefined;
  return stripProviderPrefix(candidate, 'ollama');
}

export class OllamaReviewModelProvider implements ReviewModelPort {
  readonly providerId = 'ollama';

  /**
   * Handles any model identifier whose provider prefix matches `'ollama'`
   * (e.g. `ollama:gemma4:31b-cloud`, `ollama:llama3.2`).
   */
  supportsModel(model: string): boolean {
    return parseModelId(model).providerId === this.providerId;
  }

  async listModels(): Promise<ModelDetail[]> {
    const endpoint = getOllamaEndpoint();
    if (!endpoint) {
      return [];
    }

    const provider = new OllamaProvider({
      endpoint,
      model: normalizeModel() ?? 'unknown',
      apiKey: getOllamaApiKey(),
    });

    try {
      const models = await provider.listModels();
      const configuredModel = normalizeModel();
      return models.map(model => ({
        ...model,
        id: `ollama:${model.id}`,
        isDefault: model.id === configuredModel,
      }));
    } catch {
      return [];
    }
  }

  async review(diff: string, options: ReviewOptions): Promise<ReviewResult> {
    const endpoint = getOllamaEndpoint();
    const model = normalizeModel(options.model);

    if (!endpoint) {
      return {
        success: false,
        error: 'Ollama endpoint not configured. Set OLLAMA_ENDPOINT or run: berean config set ollama-endpoint <url>',
      };
    }

    if (!model) {
      return {
        success: false,
        error: 'Ollama model not configured. Use --model ollama:<model> or set OLLAMA_MODEL.',
      };
    }

    try {
      const provider = new OllamaProvider({
        endpoint,
        model,
        apiKey: getOllamaApiKey(),
      });
      const { system, user } = await buildReviewPrompt(options.language ?? 'English', diff, options.rules);
      const content = await provider.generate(user, { system });
      const result = parseReviewResponse(content, `ollama:${model}`, diff);

      if (result.issues && options.confidenceThreshold) {
        result.issues = result.issues.filter(issue => (issue.confidence || 100) >= options.confidenceThreshold!);
      }

      return result;
    } catch (error) {
      return { success: false, error: extractErrorMessage(error, endpoint) };
    }
  }

  async generateRuleQueries(diff: string, model: string): Promise<string[]> {
    const endpoint = getOllamaEndpoint();
    const normalizedModel = normalizeModel(model);

    if (!endpoint || !normalizedModel) {
      return [];
    }

    const provider = new OllamaProvider({
      endpoint,
      model: normalizedModel,
      apiKey: getOllamaApiKey(),
    });
    const prompt = await buildQueryGenerationPrompt(diff);

    try {
      const content = await provider.generate(prompt.user, { system: prompt.system });
      return extractJsonArrayFromMixedContent(content);
    } catch {
      return [];
    }
  }
}

export const ollamaReviewModelProvider = new OllamaReviewModelProvider();