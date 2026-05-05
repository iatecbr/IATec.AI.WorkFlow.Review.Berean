// ─── Shared result/input types ────────────────────────────────────────────────

export interface PRDetails {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface PRBasicInfoResult {
  success: boolean;
  prDetails?: PRDetails;
  error?: string;
}

export interface FetchDiffOptions {
  /** When set, only returns changes since this iteration (incremental mode) */
  fromIterationId?: number;
  /** Commit IDs that should be included in the current review scope */
  newCommitIds?: string[];
  /** Last commit included in the previous review, used as base for commit-range diffs */
  previousCommitId?: string;
  /** Folder paths to exclude from the diff (e.g. ['node_modules', 'dist']) */
  skipFolders?: string[];
}

export interface PRDiffResult {
  success: boolean;
  diff?: string;
  prDetails?: PRDetails;
  currentIterationId?: number;
  skippedFiles?: number;
  error?: string;
}

export interface PostCommentResult {
  success: boolean;
  threadId?: number;
  error?: string;
}

export interface BereanComment {
  threadId: number;
  commentId: number;
  content: string;
  createdDate: string;
  reviewedCommits?: string[];
  reviewedIterationId?: number;
}

export interface InlineComment {
  filePath: string;
  line: number;
  content: string;
}

// ─── Port interface ───────────────────────────────────────────────────────────

export interface SourceControlPort {
  platform: 'azure-devops' | 'github';

  fetchPRBasicInfo(): Promise<PRBasicInfoResult>;
  fetchPRDiff(options?: FetchDiffOptions): Promise<PRDiffResult>;
  postPRComment(comment: string): Promise<PostCommentResult>;
  postInlineComments(comments: InlineComment[]): Promise<{ success: number; failed: number; errors: string[] }>;
  findBereanComments(): Promise<BereanComment[]>;
  getPRCommits(): Promise<string[]>;
  updatePRComment(threadId: number, commentId: number, newContent: string): Promise<PostCommentResult>;
}

// ─── Resolution result ────────────────────────────────────────────────────────

export interface ResolveSourceControlResult {
  adapter?: SourceControlPort;
  error?: string;
}

// ─── Domain utilities (platform-agnostic comment tagging) ─────────────────────

const BEREAN_TAG = '<!-- berean-review -->';
const BEREAN_COMMITS_START = '<!-- berean-commits:';
const BEREAN_COMMITS_END = ':berean-commits -->';
const BEREAN_ITERATION_START = '<!-- berean-iteration:';
const BEREAN_ITERATION_END = ':berean-iteration -->';

/**
 * Embeds the reviewed commit IDs and the Berean tag into a comment body.
 */
export function addReviewedCommitsTag(comment: string, commitIds: string[]): string {
  const tag = `${BEREAN_COMMITS_START}${commitIds.join(',')}${BEREAN_COMMITS_END}`;
  return `${BEREAN_TAG}\n${comment}\n\n${tag}`;
}

/**
 * Embeds the reviewed iteration ID into a comment body (as a hidden HTML tag).
 */
export function addReviewedIterationTag(comment: string, iterationId: number): string {
  return `${comment}\n${BEREAN_ITERATION_START}${iterationId}${BEREAN_ITERATION_END}`;
}

/**
 * Returns true when the PR description contains a Berean ignore keyword.
 * Normalises whitespace so "@ berean : ignore" also matches.
 */
export function shouldIgnorePR(description: string | undefined): boolean {
  if (!description) return false;
  const normalised = description.replace(/\s+/g, ' ').toLowerCase();
  const ignorePatterns = [
    '@berean: ignore',
    '@berean:ignore',
    '@berean ignore',
    '[berean:ignore]',
    '[berean: ignore]',
  ];
  return ignorePatterns.some(p => normalised.includes(p));
}
