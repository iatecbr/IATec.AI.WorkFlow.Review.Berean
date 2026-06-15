import { describe, it, expect } from 'vitest';
import { extractReviewScope, type ReviewScope } from '../src/domain/review/services/review-scope.service.js';

describe('extractReviewScope', () => {
  it('returns empty sets for empty diff', () => {
    const scope = extractReviewScope('');
    expect(scope.changedFiles.size).toBe(0);
    expect(scope.changedLinesByFile.size).toBe(0);
  });

  it('parses a single added file', () => {
    const diff = '## Add: src/utils.ts\n+ const x = 1;';
    const scope = extractReviewScope(diff);
    expect(scope.changedFiles.has('src/utils.ts')).toBe(true);
    expect(scope.changedLinesByFile.get('src/utils.ts')?.size).toBe(1);
  });

  it('tracks line numbers for additions', () => {
    const diff = [
      '## Add: src/index.ts',
      '+ line one',
      '+ line two',
    ].join('\n');
    const scope = extractReviewScope(diff);
    const lines = scope.changedLinesByFile.get('src/index.ts');
    expect(lines?.has(1)).toBe(true);
    expect(lines?.has(2)).toBe(true);
  });

  it('handles hunk headers with line numbers', () => {
    const diff = [
      '## Modified: src/app.ts',
      '@@ -1,3 +10,2 @@',
      '+ new code at line 10',
    ].join('\n');
    const scope = extractReviewScope(diff);
    const lines = scope.changedLinesByFile.get('src/app.ts');
    expect(lines?.has(10)).toBe(true);
  });

  it('skips code fence lines, but counts following additions', () => {
    const diff = [
      '## Add: src/example.ts',
      '```',
      '+ should count after fence',
    ].join('\n');
    const scope = extractReviewScope(diff);
    const lines = scope.changedLinesByFile.get('src/example.ts');
    // The line after the fence is a real addition and should be counted.
    expect(lines?.size).toBe(1);
  });

  it('skips removed lines', () => {
    const diff = [
      '## Modified: src/app.ts',
      '- removed line',
    ].join('\n');
    const scope = extractReviewScope(diff);
    const lines = scope.changedLinesByFile.get('src/app.ts');
    expect(lines?.size).toBe(0);
  });

  it('handles multiple files', () => {
    const diff = [
      '## Add: src/a.ts',
      '+ code a',
      '## Add: src/b.ts',
      '+ code b',
    ].join('\n');
    const scope = extractReviewScope(diff);
    expect(scope.changedFiles.size).toBe(2);
    expect(scope.changedFiles.has('src/a.ts')).toBe(true);
    expect(scope.changedFiles.has('src/b.ts')).toBe(true);
  });

  it('returns correct ReviewScope shape', () => {
    const scope = extractReviewScope('');
    expect(scope).toEqual({
      changedFiles: new Set<string>(),
      changedLinesByFile: new Map<string, Set<number>>(),
    } satisfies ReviewScope);
  });
});
