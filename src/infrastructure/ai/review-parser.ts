import type { ReviewResult } from '../../application/ports/review-model.port.js';
import type { ReviewIssue } from '../../domain/review/entities/review-issue.js';
import { filterIssuesToReviewScope } from '../../domain/review/services/issue-filter.service.js';
import type { ReviewScope } from '../../domain/review/services/review-scope.service.js';

export type ParsedReview = {
  summary?: string;
  recommendation?: ReviewResult['recommendation'];
  issues?: ReviewIssue[];
  positives?: string[];
  recommendations?: string[];
};

export function tryParseJson(text: string): Record<string, unknown> | null {
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

export function extractJsonFromMixedContent(content: string): Record<string, unknown> | null {
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const braceIndex = content.indexOf('{', searchFrom);
    if (braceIndex === -1) break;

    const result = tryParseJson(content.substring(braceIndex));
    if (
      result &&
      typeof result === 'object' &&
      !Array.isArray(result) &&
      ('summary' in result || 'issues' in result || 'recommendation' in result)
    ) {
      return result;
    }

    searchFrom = braceIndex + 1;
  }
  return null;
}

export function extractSafeFields(content: string): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};

  const summaryMatch = content.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (summaryMatch) fields.summary = summaryMatch[1];

  const recMatch = content.match(/"recommendation"\s*:\s*"([A-Z_]+)"/);
  if (recMatch) fields.recommendation = recMatch[1];

  function extractStringArray(key: string): string[] | undefined {
    const arrayMatch = content.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
    if (!arrayMatch) return undefined;
    const items: string[] = [];
    const itemPattern = /"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = itemPattern.exec(arrayMatch[1])) !== null) {
      items.push(m[1]);
    }
    return items.length > 0 ? items : undefined;
  }

  const positives = extractStringArray('positives');
  if (positives) fields.positives = positives;

  const recommendations = extractStringArray('recommendations');
  if (recommendations) fields.recommendations = recommendations;

  return Object.keys(fields).length > 0 ? fields : null;
}

export function extractJsonArrayFromMixedContent(content: string): string[] {
  const match = content.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function parseReviewContent(
  content: string,
  model: string,
  reviewScope: ReviewScope,
): ReviewResult {
  try {
    const jsonContent = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1].trim() ?? content;

    const parsed = (
      tryParseJson(jsonContent) ??
      extractJsonFromMixedContent(content) ??
      extractSafeFields(jsonContent)
    ) as ParsedReview | null;

    if (!parsed) {
      return { success: true, review: content, model };
    }

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
  } catch {
    return { success: true, review: content, model };
  }
}
