import type { ReviewResult } from '../entities/review-result.js';
import type { ReviewScope } from './review-scope.service.js';

export function filterIssuesToReviewScope(
  issues: ReviewResult['issues'],
  reviewScope: ReviewScope,
): ReviewResult['issues'] {
  if (!issues || issues.length === 0) return issues;

  return issues.filter(issue => {
    if (!issue.file) return true;
    if (!reviewScope.changedFiles.has(issue.file)) return false;
    if (issue.line == null) return true;
    const changedLines = reviewScope.changedLinesByFile.get(issue.file);
    if (!changedLines || changedLines.size === 0) return false;
    return changedLines.has(issue.line);
  });
}
