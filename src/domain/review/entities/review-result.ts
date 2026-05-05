import type { ReviewIssue } from './review-issue.js';

export interface ReviewResult {
  success: boolean;
  review?: string;
  summary?: string;
  recommendation?: 'APPROVE' | 'APPROVE_WITH_SUGGESTIONS' | 'NEEDS_CHANGES' | 'NEEDS_DISCUSSION';
  issues?: ReviewIssue[];
  positives?: string[];
  recommendations?: string[];
  error?: string;
  model?: string;
}
