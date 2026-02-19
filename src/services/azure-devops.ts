import { getAzureDevOpsPATFromPipeline } from './credentials.js';

export interface PRInfo {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: number;
  hostname?: string;
}

export interface PRDetails {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
}

export interface PRDiffResult {
  success: boolean;
  diff?: string;
  prDetails?: PRDetails;
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
}

export interface InlineComment {
  filePath: string;
  line: number;
  content: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ApiContext {
  apiBase: string;
  headers: Record<string, string>;
}

function createApiContext(prInfo: PRInfo, pat: string): ApiContext {
  const baseUrl = prInfo.hostname
    ? `https://${prInfo.hostname}`
    : `https://dev.azure.com/${prInfo.organization}`;
  return {
    apiBase: `${baseUrl}/${prInfo.project}/_apis`,
    headers: {
      'Authorization': `Basic ${Buffer.from(':' + pat).toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
}

function getPat(): string | null {
  return getAzureDevOpsPATFromPipeline();
}

const MAX_FILES = 40;
const MAX_FILE_CHARS = 5000;
const FETCH_CONCURRENCY = 5;
const CODE_EXTENSIONS = [
  '.js', '.ts', '.py', '.cs', '.java', '.go', '.rs',
  '.cpp', '.c', '.jsx', '.tsx', '.vue', '.rb', '.php',
];

type ChangeEntry = { item?: { path: string }; path?: string; changeType?: number };

// ---------------------------------------------------------------------------
// PR URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse Azure DevOps PR URL into components.
 * Supports both dev.azure.com and visualstudio.com formats.
 */
export function parsePRUrl(url: string): PRInfo | null {
  try {
    const parsed = new URL(url);
    const { hostname, pathname } = parsed;

    if (hostname === 'dev.azure.com') {
      const match = pathname.match(/^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/);
      if (match) {
        return {
          organization: match[1],
          project: match[2],
          repository: match[3],
          pullRequestId: parseInt(match[4], 10),
        };
      }
    }

    if (hostname.endsWith('.visualstudio.com')) {
      const org = hostname.replace('.visualstudio.com', '');
      const match = pathname.match(/^\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/);
      if (match) {
        return {
          organization: org,
          project: match[1],
          repository: match[2],
          pullRequestId: parseInt(match[3], 10),
          hostname,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Diff fetching
// ---------------------------------------------------------------------------

async function fetchFileSection(
  entry: ChangeEntry,
  ctx: ApiContext,
  repoId: string,
  sourceBranch: string,
  targetBranch: string,
): Promise<string> {
  const filePath = entry.item?.path || entry.path;
  if (!filePath) return '';

  const changeType = getChangeTypeName(entry.changeType);
  let section = `\n## ${changeType}: ${filePath}\n`;

  if (changeType === 'Delete') {
    return section + '(File deleted)\n';
  }

  const { apiBase, headers } = ctx;
  const itemsBase = `${apiBase}/git/repositories/${repoId}/items`;

  try {
    const sourceUrl =
      `${itemsBase}?path=${encodeURIComponent(filePath)}` +
      `&versionDescriptor.version=${encodeURIComponent(sourceBranch)}` +
      `&versionDescriptor.versionType=branch&includeContent=true&api-version=7.1`;

    const contentResponse = await fetch(sourceUrl, { headers });
    if (!contentResponse.ok) {
      return section + `(Could not fetch content - ${contentResponse.status})\n`;
    }

    const contentData = await contentResponse.json() as { content?: string };
    if (!contentData.content) {
      return section + '(Binary or empty file)\n';
    }

    const content = contentData.content;

    if (changeType === 'Add') {
      const truncated = content.substring(0, MAX_FILE_CHARS);
      section += '```diff\n' + truncated.split('\n').map((l: string) => '+ ' + l).join('\n');
      if (truncated.length < content.length) section += '\n... (file truncated)';
      section += '\n```\n';
    } else {
      const targetUrl =
        `${itemsBase}?path=${encodeURIComponent(filePath)}` +
        `&versionDescriptor.version=${encodeURIComponent(targetBranch)}` +
        `&versionDescriptor.versionType=branch&includeContent=true&api-version=7.1`;

      const targetResponse = await fetch(targetUrl, { headers });
      if (targetResponse.ok) {
        const targetData = await targetResponse.json() as { content?: string };
        const diff = generateSimpleDiff(targetData.content || '', content, MAX_FILE_CHARS);
        section += diff ? `\`\`\`diff\n${diff}\n\`\`\`\n` : '(No text changes detected)\n';
      } else {
        const preview = content.substring(0, MAX_FILE_CHARS);
        section += '```\n' + preview + (preview.length < content.length ? '\n... (truncated)' : '') + '\n```\n';
      }
    }
  } catch {
    section += '(Error fetching content)\n';
  }

  return section;
}

/**
 * Fetch PR diff from Azure DevOps.
 * PR details and iterations are fetched in parallel.
 * File contents are fetched in parallel batches of FETCH_CONCURRENCY.
 */
export async function fetchPRDiff(prInfo: PRInfo): Promise<PRDiffResult> {
  const pat = getPat();
  if (!pat) {
    return {
      success: false,
      error: 'Azure DevOps PAT not configured. Set AZURE_DEVOPS_PAT env var or run: berean config set azure-pat <token>',
    };
  }

  const ctx = createApiContext(prInfo, pat);
  const { apiBase, headers } = ctx;
  const repoPath = `${apiBase}/git/repositories/${prInfo.repository}`;
  const prBase = `${repoPath}/pullRequests/${prInfo.pullRequestId}`;

  try {
    // Fetch PR details and iterations in parallel
    const [prResponse, iterResponse] = await Promise.all([
      fetch(`${prBase}?api-version=7.1`, { headers }),
      fetch(`${prBase}/iterations?api-version=7.1`, { headers }),
    ]);

    if (!prResponse.ok) {
      if (prResponse.status === 401) return { success: false, error: 'Azure DevOps token is invalid or expired' };
      if (prResponse.status === 403) return { success: false, error: 'Access denied. Check your token permissions.' };
      if (prResponse.status === 404) return { success: false, error: 'Pull request not found. Check the URL.' };
      return { success: false, error: `Azure DevOps API error: ${prResponse.status}` };
    }

    const prData = await prResponse.json() as {
      title: string;
      description?: string;
      sourceRefName: string;
      targetRefName: string;
      repository?: { id: string };
    };

    const sourceBranch = prData.sourceRefName?.replace('refs/heads/', '');
    const targetBranch = prData.targetRefName?.replace('refs/heads/', '');
    const repoId = prData.repository?.id || prInfo.repository;

    // Resolve change entries from iterations
    let changeEntries: ChangeEntry[] = [];

    if (iterResponse.ok) {
      const iterData = await iterResponse.json() as { value: Array<{ id: number }> };
      const iterations = iterData.value || [];

      if (iterations.length > 0) {
        const latestId = iterations[iterations.length - 1].id;
        const changesResponse = await fetch(
          `${prBase}/iterations/${latestId}/changes?api-version=7.1`,
          { headers },
        );
        if (changesResponse.ok) {
          const changesData = await changesResponse.json() as { changeEntries: ChangeEntry[] };
          changeEntries = changesData.changeEntries || [];
        }
      }
    }

    // Fallback: collect changes from commits (deduplicated, in parallel)
    if (changeEntries.length === 0) {
      const commitsResponse = await fetch(`${prBase}/commits?api-version=7.1`, { headers });
      if (commitsResponse.ok) {
        const commitsData = await commitsResponse.json() as { value: Array<{ commitId: string }> };
        const commits = commitsData.value || [];

        const perCommit = await Promise.all(
          commits.map(({ commitId }) =>
            fetch(
              `${apiBase}/git/repositories/${prInfo.repository}/commits/${commitId}/changes?api-version=7.1`,
              { headers },
            )
              .then(r => r.ok ? r.json() as Promise<{ changes: ChangeEntry[] }> : { changes: [] as ChangeEntry[] })
              .catch(() => ({ changes: [] as ChangeEntry[] })),
          ),
        );

        const seen = new Set<string>();
        for (const { changes } of perCommit) {
          for (const change of changes) {
            const p = change.item?.path || change.path;
            if (p && !seen.has(p)) {
              seen.add(p);
              changeEntries.push(change);
            }
          }
        }
      }
    }

    // Build diff header
    let diffContent = `# Pull Request: ${prData.title}\n`;
    if (prData.description) diffContent += `Description: ${prData.description}\n`;
    diffContent += `\nBranch: ${sourceBranch} → ${targetBranch}\n`;
    diffContent += `Files changed: ${changeEntries.length}\n\n---\n`;

    if (changeEntries.length === 0) {
      diffContent += '\n⚠️ No file changes detected.\n';
      return {
        success: true,
        diff: diffContent,
        prDetails: { title: prData.title, description: prData.description || '', sourceBranch, targetBranch },
      };
    }

    // Sort: code files first
    const sortedEntries = [...changeEntries].sort((a, b) => {
      const pathA = a.item?.path || a.path || '';
      const pathB = b.item?.path || b.path || '';
      const isCodeA = CODE_EXTENSIONS.some(ext => pathA.endsWith(ext));
      const isCodeB = CODE_EXTENSIONS.some(ext => pathB.endsWith(ext));
      return isCodeA === isCodeB ? 0 : isCodeA ? -1 : 1;
    });

    const filesToProcess = sortedEntries.slice(0, MAX_FILES);

    // Fetch file sections in parallel batches
    const sections: string[] = [];
    for (let i = 0; i < filesToProcess.length; i += FETCH_CONCURRENCY) {
      const batch = filesToProcess.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(entry => fetchFileSection(entry, ctx, repoId, sourceBranch, targetBranch)),
      );
      sections.push(...results);
    }

    diffContent += sections.join('');

    if (changeEntries.length > MAX_FILES) {
      diffContent += `\n---\n⚠️ ${changeEntries.length - MAX_FILES} files not shown (limit: ${MAX_FILES})\n`;
    }

    return {
      success: true,
      diff: diffContent,
      prDetails: { title: prData.title, description: prData.description || '', sourceBranch, targetBranch },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function getChangeTypeName(changeType?: number): string {
  const types: Record<number, string> = { 1: 'Add', 2: 'Edit', 4: 'Delete', 8: 'Rename', 16: 'SourceRename' };
  return types[changeType || 0] || 'Change';
}

function generateSimpleDiff(oldContent: string, newContent: string, maxChars: number): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const result: string[] = [];
  let chars = 0;
  let oldIdx = 0;
  let newIdx = 0;

  while ((oldIdx < oldLines.length || newIdx < newLines.length) && chars < maxChars) {
    if (oldIdx >= oldLines.length) {
      const line = `+ ${newLines[newIdx++]}`;
      result.push(line);
      chars += line.length;
    } else if (newIdx >= newLines.length) {
      const line = `- ${oldLines[oldIdx++]}`;
      result.push(line);
      chars += line.length;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      oldIdx++;
      newIdx++;
    } else {
      const line1 = `- ${oldLines[oldIdx++]}`;
      const line2 = `+ ${newLines[newIdx++]}`;
      result.push(line1, line2);
      chars += line1.length + line2.length;
    }
  }

  if (chars >= maxChars) result.push('... (diff truncated)');
  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Comment tagging
// ---------------------------------------------------------------------------

const BEREAN_TAG = '<!-- berean-review -->';
const BEREAN_COMMITS_START = '<!-- berean-commits:';
const BEREAN_COMMITS_END = ':berean-commits -->';

/**
 * Find existing Berean review comments on a PR.
 */
export async function findBereanComments(prInfo: PRInfo): Promise<BereanComment[]> {
  const pat = getPat();
  if (!pat) return [];

  const { apiBase, headers } = createApiContext(prInfo, pat);

  try {
    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads?api-version=7.1`,
      { headers },
    );
    if (!response.ok) return [];

    const data = await response.json() as {
      value: Array<{
        id: number;
        comments: Array<{ id: number; content: string; publishedDate: string }>;
      }>;
    };

    const bereanComments: BereanComment[] = [];
    for (const thread of data.value || []) {
      for (const comment of thread.comments || []) {
        if (
          comment.content?.includes(BEREAN_TAG) ||
          comment.content?.includes('Generated by [Berean]') ||
          comment.content?.includes('Generated by Berean')
        ) {
          bereanComments.push({
            threadId: thread.id,
            commentId: comment.id,
            content: comment.content,
            createdDate: comment.publishedDate,
            reviewedCommits: extractReviewedCommits(comment.content),
          });
        }
      }
    }
    return bereanComments;
  } catch {
    return [];
  }
}

function extractReviewedCommits(content: string): string[] {
  const startIdx = content.indexOf(BEREAN_COMMITS_START);
  const endIdx = content.indexOf(BEREAN_COMMITS_END);
  if (startIdx === -1 || endIdx === -1) return [];
  return content
    .substring(startIdx + BEREAN_COMMITS_START.length, endIdx)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function addReviewedCommitsTag(comment: string, commitIds: string[]): string {
  return `${BEREAN_TAG}\n${comment}\n\n${BEREAN_COMMITS_START}${commitIds.join(',')}${BEREAN_COMMITS_END}`;
}

export function shouldIgnorePR(description: string | undefined): boolean {
  if (!description) return false;
  const ignorePatterns = [
    '@berean: ignore', '@berean:ignore', '@berean ignore',
    '[berean:ignore]', '[berean: ignore]',
  ];
  const lower = description.toLowerCase();
  return ignorePatterns.some(p => lower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// PR data
// ---------------------------------------------------------------------------

export async function getPRCommits(prInfo: PRInfo): Promise<string[]> {
  const pat = getPat();
  if (!pat) return [];

  const { apiBase, headers } = createApiContext(prInfo, pat);
  try {
    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/commits?api-version=7.1`,
      { headers },
    );
    if (!response.ok) return [];
    const data = await response.json() as { value: Array<{ commitId: string }> };
    return (data.value || []).map(c => c.commitId);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Posting comments
// ---------------------------------------------------------------------------

export async function updatePRComment(
  prInfo: PRInfo,
  threadId: number,
  commentId: number,
  newContent: string,
): Promise<PostCommentResult> {
  const pat = getPat();
  if (!pat) return { success: false, error: 'Azure DevOps PAT not configured' };

  const { apiBase, headers } = createApiContext(prInfo, pat);
  try {
    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads/${threadId}/comments/${commentId}?api-version=7.1`,
      { method: 'PATCH', headers, body: JSON.stringify({ content: newContent }) },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string };
      return { success: false, error: err.message || `HTTP ${response.status}` };
    }
    return { success: true, threadId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function postPRComment(prInfo: PRInfo, comment: string): Promise<PostCommentResult> {
  const pat = getPat();
  if (!pat) return { success: false, error: 'Azure DevOps PAT not configured' };

  const { apiBase, headers } = createApiContext(prInfo, pat);
  try {
    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads?api-version=7.1`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          comments: [{ parentCommentId: 0, content: comment, commentType: 1 }],
          status: 1,
        }),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string };
      return { success: false, error: err.message || `HTTP ${response.status}` };
    }
    const data = await response.json() as { id: number };
    return { success: true, threadId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function getLatestIterationId(
  prInfo: PRInfo,
  apiBase: string,
  headers: Record<string, string>,
): Promise<number> {
  try {
    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/iterations?api-version=7.1`,
      { headers },
    );
    if (!response.ok) return 1;
    const data = await response.json() as { value: Array<{ id: number }> };
    const iterations = data.value || [];
    return iterations.length > 0 ? iterations[iterations.length - 1].id : 1;
  } catch {
    return 1;
  }
}

async function postSingleInlineComment(
  prInfo: PRInfo,
  filePath: string,
  line: number,
  content: string,
  iterationId: number,
  apiBase: string,
  headers: Record<string, string>,
): Promise<PostCommentResult> {
  try {
    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads?api-version=7.1`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          comments: [{ parentCommentId: 0, content, commentType: 1 }],
          status: 1,
          threadContext: {
            filePath,
            rightFileStart: { line, offset: 1 },
            rightFileEnd: { line, offset: 1 },
          },
          pullRequestThreadContext: {
            iterationContext: {
              firstComparingIteration: iterationId,
              secondComparingIteration: iterationId,
            },
            changeTrackingId: 0,
          },
        }),
      },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string };
      return { success: false, error: err.message || `HTTP ${response.status}` };
    }
    const data = await response.json() as { id: number };
    return { success: true, threadId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Post multiple inline comments.
 * Fetches the latest iteration ID once before the loop.
 */
export async function postInlineComments(
  prInfo: PRInfo,
  comments: InlineComment[],
): Promise<{ success: number; failed: number; errors: string[] }> {
  const pat = getPat();
  if (!pat) {
    return { success: 0, failed: comments.length, errors: ['Azure DevOps PAT not configured'] };
  }

  const { apiBase, headers } = createApiContext(prInfo, pat);
  const iterationId = await getLatestIterationId(prInfo, apiBase, headers);

  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const comment of comments) {
    const result = await postSingleInlineComment(
      prInfo, comment.filePath, comment.line, comment.content, iterationId, apiBase, headers,
    );
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push(`${comment.filePath}:${comment.line} - ${result.error}`);
    }
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}
