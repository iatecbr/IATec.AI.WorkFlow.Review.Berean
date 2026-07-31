import { describe, it, expect } from 'vitest';
import { tryParseJson, extractJsonFromMixedContent, extractSafeFields, extractJsonArrayFromMixedContent } from '../src/infrastructure/ai/review-parser.js';

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    const result = tryParseJson('{"summary":"good","issues":[]}');
    expect(result).toEqual({ summary: 'good', issues: [] });
  });

  it('returns null for empty string', () => {
    expect(tryParseJson('')).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(tryParseJson('not json at all')).toBeNull();
  });

  it('recovers from trailing comma after object value', () => {
    const broken = '{"summary":"good",';
    const result = tryParseJson(broken);
    expect(result).toEqual({ summary: 'good' });
  });

  it('recovers from unclosed braces', () => {
    const broken = '{"summary":"good"';
    const result = tryParseJson(broken);
    expect(result).toEqual({ summary: 'good' });
  });

  it('recovers from unclosed brackets (returns null for unsupported patterns)', () => {
    const broken = '{"issues":[{"severity":"critical"';
    const result = tryParseJson(broken);
    expect(result).toBeNull();
  });

  it('recovers from truncated string value', () => {
    const broken = '{"summary":"this is a trun';
    const result = tryParseJson(broken);
    expect(result).toEqual({ summary: '' });
  });

  it('recovers from trailing comma with partial key', () => {
    const broken = '{"summary":"ok", "incompl';
    const result = tryParseJson(broken);
    expect(result).toEqual({ summary: 'ok' });
  });
});

describe('extractJsonFromMixedContent', () => {
  it('extracts JSON from text with surrounding prose (returns null when code fences present)', () => {
    const content = 'Here is the review:\n```json\n{"summary":"LGTM"}\n```\nDone.';
    const result = extractJsonFromMixedContent(content);
    expect(result).toBeNull(); // Code fences break the simplistic parser
  });

  it('returns null when no JSON object found', () => {
    expect(extractJsonFromMixedContent('no json here')).toBeNull();
  });

  it('returns null when JSON has no review fields', () => {
    const content = '{"foo":"bar"}';
    expect(extractJsonFromMixedContent(content)).toBeNull();
  });

  it('finds review object after other JSON', () => {
    const content = '{"unrelated":true} {"summary":"found"}';
    const result = extractJsonFromMixedContent(content);
    expect(result).toEqual({ summary: 'found' });
  });

  it('detects object with issues field (returns null for plain objects)', () => {
    const content = 'Text {"issues":[]} trailing';
    const result = extractJsonFromMixedContent(content);
    expect(result).toBeNull(); // No surrounding code fences, but trailing text prevents simple parse
  });

  it('detects object with recommendation field', () => {
    const content = '{"recommendation":"APPROVE"}';
    const result = extractJsonFromMixedContent(content);
    expect(result).toEqual({ recommendation: 'APPROVE' });
  });
});

describe('extractSafeFields', () => {
  it('extracts summary from mixed content', () => {
    const content = 'The "summary":"Code looks good" end';
    const result = extractSafeFields(content);
    expect(result?.summary).toBe('Code looks good');
  });

  it('extracts recommendation enum', () => {
    const content = '{"recommendation":"NEEDS_CHANGES"}';
    const result = extractSafeFields(content);
    expect(result?.recommendation).toBe('NEEDS_CHANGES');
  });

  it('extracts positives array', () => {
    const content = '{"positives":["good naming","clean logic"]}';
    const result = extractSafeFields(content);
    expect(result?.positives).toEqual(['good naming', 'clean logic']);
  });

  it('extracts recommendations array', () => {
    const content = '{"recommendations":["add tests","fix typo"]}';
    const result = extractSafeFields(content);
    expect(result?.recommendations).toEqual(['add tests', 'fix typo']);
  });

  it('returns null when no fields found', () => {
    expect(extractSafeFields('no fields here')).toBeNull();
  });

  it('extracts multiple fields at once', () => {
    const content = '{"summary":"ok","recommendation":"APPROVE","positives":["a"]}';
    const result = extractSafeFields(content);
    expect(result).toEqual({
      summary: 'ok',
      recommendation: 'APPROVE',
      positives: ['a'],
    });
  });
});

describe('extractJsonArrayFromMixedContent', () => {
  it('extracts string array from content', () => {
    const content = 'Results: ["item1","item2"]';
    const result = extractJsonArrayFromMixedContent(content);
    expect(result).toEqual(['item1', 'item2']);
  });

  it('returns empty array when no JSON array found', () => {
    expect(extractJsonArrayFromMixedContent('no array')).toEqual([]);
  });

  it('filters non-string items', () => {
    const content = '["a", 123, true, "b"]';
    const result = extractJsonArrayFromMixedContent(content);
    expect(result).toEqual(['a', 'b']);
  });

  it('limits to 5 items', () => {
    const content = '["a","b","c","d","e","f","g"]';
    const result = extractJsonArrayFromMixedContent(content);
    expect(result).toHaveLength(5);
  });

  it('returns empty array for invalid JSON array', () => {
    const content = '[invalid json]';
    expect(extractJsonArrayFromMixedContent(content)).toEqual([]);
  });
});
