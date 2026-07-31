import { describe, it, expect } from 'vitest';
import { filterIssuesToReviewScope } from '../src/domain/review/services/issue-filter.service.js';
import type { ReviewScope } from '../src/domain/review/services/review-scope.service.js';
import type { ReviewIssue } from '../src/domain/review/entities/review-issue.js';

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    severity: 'warning',
    category: 'bug',
    confidence: 0.9,
    title: 'Test issue',
    message: 'Test message',
    ...overrides,
  };
}

function makeScope(
  changedFiles: string[] = [],
  changedLines: Record<string, number[]> = {},
): ReviewScope {
  return {
    changedFiles: new Set(changedFiles),
    changedLinesByFile: new Map(
      Object.entries(changedLines).map(([file, lines]) => [file, new Set(lines)]),
    ),
  };
}

describe('filterIssuesToReviewScope', () => {
  it('returns empty array for no issues', () => {
    expect(filterIssuesToReviewScope([], makeScope())).toEqual([]);
  });

  it('keeps issues without a file property (global issues)', () => {
    const issue = makeIssue({ file: undefined });
    const scope = makeScope(['src/a.ts'], { 'src/a.ts': [1] });
    expect(filterIssuesToReviewScope([issue], scope)).toHaveLength(1);
  });

  it('keeps issues in changed files with no specific line', () => {
    const issue = makeIssue({ file: 'src/a.ts', line: undefined });
    const scope = makeScope(['src/a.ts'], { 'src/a.ts': [1] });
    expect(filterIssuesToReviewScope([issue], scope)).toHaveLength(1);
  });

  it('filters out issues in files not in the review scope', () => {
    const issue = makeIssue({ file: 'src/b.ts', line: 1 });
    const scope = makeScope(['src/a.ts'], { 'src/a.ts': [1] });
    expect(filterIssuesToReviewScope([issue], scope)).toHaveLength(0);
  });

  it('filters out issues on lines not in the changed lines set', () => {
    const issue = makeIssue({ file: 'src/a.ts', line: 99 });
    const scope = makeScope(['src/a.ts'], { 'src/a.ts': [1, 2, 3] });
    expect(filterIssuesToReviewScope([issue], scope)).toHaveLength(0);
  });

  it('keeps issues on changed lines', () => {
    const issue = makeIssue({ file: 'src/a.ts', line: 2 });
    const scope = makeScope(['src/a.ts'], { 'src/a.ts': [1, 2, 3] });
    expect(filterIssuesToReviewScope([issue], scope)).toHaveLength(1);
  });

  it('filters out issues when file has empty changed lines set', () => {
    const issue = makeIssue({ file: 'src/a.ts', line: 1 });
    const scope = makeScope(['src/a.ts'], {});
    expect(filterIssuesToReviewScope([issue], scope)).toHaveLength(0);
  });

  it('handles mixed issues correctly', () => {
    const issues = [
      makeIssue({ title: 'global', file: undefined }),
      makeIssue({ title: 'in-scope', file: 'src/a.ts', line: 5 }),
      makeIssue({ title: 'wrong-line', file: 'src/a.ts', line: 99 }),
      makeIssue({ title: 'wrong-file', file: 'src/b.ts', line: 1 }),
    ];
    const scope = makeScope(['src/a.ts'], { 'src/a.ts': [5] });
    const result = filterIssuesToReviewScope(issues, scope);
    expect(result.map(i => i.title)).toEqual(['global', 'in-scope']);
  });
});
