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

/**
 * Parse Azure DevOps PR URL into components
 */
export function parsePRUrl(url: string): PRInfo | null {
  // Format: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
  // Or: https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}
  
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    
    // dev.azure.com format
    if (hostname === 'dev.azure.com') {
      const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/);
      if (match) {
        return {
          organization: match[1],
          project: match[2],
          repository: match[3],
          pullRequestId: parseInt(match[4], 10)
        };
      }
    }
    
    // visualstudio.com format
    if (hostname.endsWith('.visualstudio.com')) {
      const org = hostname.replace('.visualstudio.com', '');
      const match = parsed.pathname.match(/^\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/);
      if (match) {
        return {
          organization: org,
          project: match[1],
          repository: match[2],
          pullRequestId: parseInt(match[3], 10),
          hostname: hostname
        };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch PR diff from Azure DevOps
 */
export async function fetchPRDiff(prInfo: PRInfo): Promise<PRDiffResult> {
  const pat = getAzureDevOpsPATFromPipeline();
  
  if (!pat) {
    return {
      success: false,
      error: 'Azure DevOps PAT not configured. Set AZURE_DEVOPS_PAT env var or run: berean config set azure-pat <token>'
    };
  }

  try {
    const baseUrl = prInfo.hostname 
      ? `https://${prInfo.hostname}`
      : `https://dev.azure.com/${prInfo.organization}`;
    
    const apiBase = `${baseUrl}/${prInfo.project}/_apis`;
    const authHeader = `Basic ${Buffer.from(':' + pat).toString('base64')}`;
    
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Get PR details
    const prResponse = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}?api-version=7.1`,
      { headers }
    );

    if (!prResponse.ok) {
      if (prResponse.status === 401) {
        return { success: false, error: 'Azure DevOps token is invalid or expired' };
      }
      if (prResponse.status === 403) {
        return { success: false, error: 'Access denied. Check your token permissions.' };
      }
      if (prResponse.status === 404) {
        return { success: false, error: 'Pull request not found. Check the URL.' };
      }
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
    const repoId = prData.repository?.id;

    // Get iterations to find changes
    const iterResponse = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/iterations?api-version=7.1`,
      { headers }
    );

    let changeEntries: Array<{ item?: { path: string }; path?: string; changeType?: number }> = [];

    if (iterResponse.ok) {
      const iterData = await iterResponse.json() as { value: Array<{ id: number }> };
      const iterations = iterData.value || [];

      if (iterations.length > 0) {
        const latestIteration = iterations[iterations.length - 1];
        
        const changesResponse = await fetch(
          `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/iterations/${latestIteration.id}/changes?api-version=7.1`,
          { headers }
        );

        if (changesResponse.ok) {
          const changesData = await changesResponse.json() as { changeEntries: typeof changeEntries };
          changeEntries = changesData.changeEntries || [];
        }
      }
    }

    // If no changes from iterations, try commits
    if (changeEntries.length === 0) {
      const commitsResponse = await fetch(
        `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/commits?api-version=7.1`,
        { headers }
      );

      if (commitsResponse.ok) {
        const commitsData = await commitsResponse.json() as { value: Array<{ commitId: string }> };
        const commits = commitsData.value || [];

        for (const commit of commits) {
          const commitChangesResponse = await fetch(
            `${apiBase}/git/repositories/${prInfo.repository}/commits/${commit.commitId}/changes?api-version=7.1`,
            { headers }
          );

          if (commitChangesResponse.ok) {
            const commitChangesData = await commitChangesResponse.json() as { changes: typeof changeEntries };
            const commitChanges = commitChangesData.changes || [];
            
            for (const change of commitChanges) {
              const path = change.item?.path || change.path;
              if (path && !changeEntries.find(e => (e.item?.path || e.path) === path)) {
                changeEntries.push(change);
              }
            }
          }
        }
      }
    }

    // Build diff content
    let diffContent = `# Pull Request: ${prData.title}\n`;
    if (prData.description) {
      diffContent += `Description: ${prData.description}\n`;
    }
    diffContent += `\nBranch: ${sourceBranch} → ${targetBranch}\n`;
    diffContent += `Files changed: ${changeEntries.length}\n\n---\n`;

    if (changeEntries.length === 0) {
      diffContent += '\n⚠️ No file changes detected.\n';
      return {
        success: true,
        diff: diffContent,
        prDetails: {
          title: prData.title,
          description: prData.description || '',
          sourceBranch,
          targetBranch
        }
      };
    }

    const MAX_FILES = 40;
    const MAX_FILE_CHARS = 5000;
    
    // Prioritize code files
    const codeExtensions = ['.js', '.ts', '.py', '.cs', '.java', '.go', '.rs', '.cpp', '.c', '.jsx', '.tsx', '.vue', '.rb', '.php'];
    const sortedEntries = [...changeEntries].sort((a, b) => {
      const pathA = a.item?.path || a.path || '';
      const pathB = b.item?.path || b.path || '';
      const isCodeA = codeExtensions.some(ext => pathA.endsWith(ext));
      const isCodeB = codeExtensions.some(ext => pathB.endsWith(ext));
      if (isCodeA && !isCodeB) return -1;
      if (isCodeB && !isCodeA) return 1;
      return 0;
    });

    const filesToProcess = sortedEntries.slice(0, MAX_FILES);

    for (const entry of filesToProcess) {
      const path = entry.item?.path || entry.path;
      if (!path) continue;

      const changeType = getChangeTypeName(entry.changeType);
      
      try {
        let fileSection = `\n## ${changeType}: ${path}\n`;

        if (changeType === 'Delete') {
          fileSection += '(File deleted)\n';
        } else {
          // Fetch file content
          const contentResponse = await fetch(
            `${apiBase}/git/repositories/${repoId || prInfo.repository}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${encodeURIComponent(sourceBranch)}&versionDescriptor.versionType=branch&includeContent=true&api-version=7.1`,
            { headers }
          );

          if (contentResponse.ok) {
            const contentData = await contentResponse.json() as { content?: string };
            if (contentData.content) {
              const content = contentData.content;
              
              if (changeType === 'Add') {
                const truncated = content.substring(0, MAX_FILE_CHARS);
                fileSection += '```diff\n' + truncated.split('\n').map((l: string) => '+ ' + l).join('\n');
                if (truncated.length < content.length) {
                  fileSection += '\n... (file truncated)';
                }
                fileSection += '\n```\n';
              } else {
                // For edits, try to get target for comparison
                const targetResponse = await fetch(
                  `${apiBase}/git/repositories/${repoId || prInfo.repository}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${encodeURIComponent(targetBranch)}&versionDescriptor.versionType=branch&includeContent=true&api-version=7.1`,
                  { headers }
                );

                if (targetResponse.ok) {
                  const targetData = await targetResponse.json() as { content?: string };
                  const targetContent = targetData.content || '';
                  const diff = generateSimpleDiff(targetContent, content, MAX_FILE_CHARS);
                  
                  if (diff) {
                    fileSection += '```diff\n' + diff + '\n```\n';
                  } else {
                    fileSection += '(No text changes detected)\n';
                  }
                } else {
                  const preview = content.substring(0, MAX_FILE_CHARS);
                  fileSection += '```\n' + preview;
                  if (preview.length < content.length) {
                    fileSection += '\n... (truncated)';
                  }
                  fileSection += '\n```\n';
                }
              }
            } else {
              fileSection += '(Binary or empty file)\n';
            }
          } else {
            fileSection += `(Could not fetch content - ${contentResponse.status})\n`;
          }
        }

        diffContent += fileSection;

      } catch (e) {
        diffContent += `\n## ${changeType}: ${path}\n(Error fetching content)\n`;
      }
    }

    if (changeEntries.length > MAX_FILES) {
      diffContent += `\n---\n⚠️ ${changeEntries.length - MAX_FILES} files not shown (limit: ${MAX_FILES})\n`;
    }

    return {
      success: true,
      diff: diffContent,
      prDetails: {
        title: prData.title,
        description: prData.description || '',
        sourceBranch,
        targetBranch
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

function getChangeTypeName(changeType?: number): string {
  const types: Record<number, string> = {
    1: 'Add',
    2: 'Edit',
    4: 'Delete',
    8: 'Rename',
    16: 'SourceRename'
  };
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
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];
    
    if (oldIdx >= oldLines.length) {
      const line = `+ ${newLine}`;
      result.push(line);
      chars += line.length;
      newIdx++;
    } else if (newIdx >= newLines.length) {
      const line = `- ${oldLine}`;
      result.push(line);
      chars += line.length;
      oldIdx++;
    } else if (oldLine === newLine) {
      oldIdx++;
      newIdx++;
    } else {
      const line1 = `- ${oldLine}`;
      const line2 = `+ ${newLine}`;
      result.push(line1, line2);
      chars += line1.length + line2.length;
      oldIdx++;
      newIdx++;
    }
  }
  
  if (chars >= maxChars) {
    result.push('... (diff truncated)');
  }
  
  return result.join('\n');
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

// Tag to identify Berean comments
const BEREAN_TAG = '<!-- berean-review -->';
const BEREAN_COMMITS_START = '<!-- berean-commits:';
const BEREAN_COMMITS_END = ':berean-commits -->';

/**
 * Find existing Berean review comments on a PR
 */
export async function findBereanComments(prInfo: PRInfo): Promise<BereanComment[]> {
  const pat = getAzureDevOpsPATFromPipeline();
  
  if (!pat) {
    return [];
  }

  try {
    const baseUrl = prInfo.hostname 
      ? `https://${prInfo.hostname}`
      : `https://dev.azure.com/${prInfo.organization}`;
    
    const apiBase = `${baseUrl}/${prInfo.project}/_apis`;
    const authHeader = `Basic ${Buffer.from(':' + pat).toString('base64')}`;
    
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads?api-version=7.1`,
      { headers }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { 
      value: Array<{
        id: number;
        comments: Array<{
          id: number;
          content: string;
          publishedDate: string;
        }>;
      }>;
    };

    const bereanComments: BereanComment[] = [];

    for (const thread of data.value || []) {
      for (const comment of thread.comments || []) {
        if (comment.content?.includes(BEREAN_TAG) || comment.content?.includes('Generated by [Berean]') || comment.content?.includes('Generated by Berean')) {
          const reviewedCommits = extractReviewedCommits(comment.content);
          bereanComments.push({
            threadId: thread.id,
            commentId: comment.id,
            content: comment.content,
            createdDate: comment.publishedDate,
            reviewedCommits
          });
        }
      }
    }

    return bereanComments;
  } catch {
    return [];
  }
}

/**
 * Extract reviewed commit IDs from a Berean comment
 */
function extractReviewedCommits(content: string): string[] {
  const startIdx = content.indexOf(BEREAN_COMMITS_START);
  const endIdx = content.indexOf(BEREAN_COMMITS_END);
  
  if (startIdx === -1 || endIdx === -1) {
    return [];
  }
  
  const commitsStr = content.substring(startIdx + BEREAN_COMMITS_START.length, endIdx);
  return commitsStr.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Add reviewed commits tag to a comment
 */
export function addReviewedCommitsTag(comment: string, commitIds: string[]): string {
  const tag = `${BEREAN_COMMITS_START}${commitIds.join(',')}${BEREAN_COMMITS_END}`;
  return `${BEREAN_TAG}\n${comment}\n\n${tag}`;
}

/**
 * Get all commit IDs for a PR
 */
export async function getPRCommits(prInfo: PRInfo): Promise<string[]> {
  const pat = getAzureDevOpsPATFromPipeline();
  
  if (!pat) {
    return [];
  }

  try {
    const baseUrl = prInfo.hostname 
      ? `https://${prInfo.hostname}`
      : `https://dev.azure.com/${prInfo.organization}`;
    
    const apiBase = `${baseUrl}/${prInfo.project}/_apis`;
    const authHeader = `Basic ${Buffer.from(':' + pat).toString('base64')}`;
    
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/commits?api-version=7.1`,
      { headers }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { value: Array<{ commitId: string }> };
    return (data.value || []).map(c => c.commitId);
  } catch {
    return [];
  }
}

/**
 * Check if PR description contains ignore keyword
 */
export function shouldIgnorePR(description: string | undefined): boolean {
  if (!description) return false;
  const ignorePatterns = [
    '@berean: ignore',
    '@berean:ignore',
    '@berean ignore',
    '[berean:ignore]',
    '[berean: ignore]'
  ];
  const lowerDesc = description.toLowerCase();
  return ignorePatterns.some(p => lowerDesc.includes(p.toLowerCase()));
}

/**
 * Update an existing Berean comment (for incremental reviews)
 */
export async function updatePRComment(
  prInfo: PRInfo,
  threadId: number,
  commentId: number,
  newContent: string
): Promise<PostCommentResult> {
  const pat = getAzureDevOpsPATFromPipeline();
  
  if (!pat) {
    return { success: false, error: 'Azure DevOps PAT not configured' };
  }

  try {
    const baseUrl = prInfo.hostname 
      ? `https://${prInfo.hostname}`
      : `https://dev.azure.com/${prInfo.organization}`;
    
    const apiBase = `${baseUrl}/${prInfo.project}/_apis`;
    const authHeader = `Basic ${Buffer.from(':' + pat).toString('base64')}`;
    
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads/${threadId}/comments/${commentId}?api-version=7.1`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ content: newContent })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      return { 
        success: false, 
        error: errorData.message || `HTTP ${response.status}` 
      };
    }

    return { success: true, threadId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export interface InlineComment {
  filePath: string;
  line: number;
  content: string;
}

/**
 * Post a general comment to a PR
 */
export async function postPRComment(
  prInfo: PRInfo, 
  comment: string
): Promise<PostCommentResult> {
  const pat = getAzureDevOpsPATFromPipeline();
  
  if (!pat) {
    return { success: false, error: 'Azure DevOps PAT not configured' };
  }

  try {
    const baseUrl = prInfo.hostname 
      ? `https://${prInfo.hostname}`
      : `https://dev.azure.com/${prInfo.organization}`;
    
    const apiBase = `${baseUrl}/${prInfo.project}/_apis`;
    const authHeader = `Basic ${Buffer.from(':' + pat).toString('base64')}`;
    
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const threadPayload = {
      comments: [
        {
          parentCommentId: 0,
          content: comment,
          commentType: 1
        }
      ],
      status: 1
    };

    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads?api-version=7.1`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(threadPayload)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      return { 
        success: false, 
        error: errorData.message || `HTTP ${response.status}` 
      };
    }

    const data = await response.json() as { id: number };
    return { success: true, threadId: data.id };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Post an inline comment to a specific file/line in a PR
 */
export async function postInlineComment(
  prInfo: PRInfo,
  filePath: string,
  line: number,
  content: string
): Promise<PostCommentResult> {
  const pat = getAzureDevOpsPATFromPipeline();
  
  if (!pat) {
    return { success: false, error: 'Azure DevOps PAT not configured' };
  }

  try {
    const baseUrl = prInfo.hostname 
      ? `https://${prInfo.hostname}`
      : `https://dev.azure.com/${prInfo.organization}`;
    
    const apiBase = `${baseUrl}/${prInfo.project}/_apis`;
    const authHeader = `Basic ${Buffer.from(':' + pat).toString('base64')}`;
    
    const headers = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Get the latest iteration ID
    const iterResponse = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/iterations?api-version=7.1`,
      { headers }
    );

    let iterationId = 1;
    if (iterResponse.ok) {
      const iterData = await iterResponse.json() as { value: Array<{ id: number }> };
      const iterations = iterData.value || [];
      if (iterations.length > 0) {
        iterationId = iterations[iterations.length - 1].id;
      }
    }

    const threadPayload = {
      comments: [
        {
          parentCommentId: 0,
          content: content,
          commentType: 1
        }
      ],
      status: 1,
      threadContext: {
        filePath: filePath,
        rightFileStart: { line: line, offset: 1 },
        rightFileEnd: { line: line, offset: 1 }
      },
      pullRequestThreadContext: {
        iterationContext: {
          firstComparingIteration: iterationId,
          secondComparingIteration: iterationId
        },
        changeTrackingId: 0
      }
    };

    const response = await fetch(
      `${apiBase}/git/repositories/${prInfo.repository}/pullRequests/${prInfo.pullRequestId}/threads?api-version=7.1`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(threadPayload)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      return { 
        success: false, 
        error: errorData.message || `HTTP ${response.status}` 
      };
    }

    const data = await response.json() as { id: number };
    return { success: true, threadId: data.id };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Post multiple inline comments
 */
export async function postInlineComments(
  prInfo: PRInfo,
  comments: InlineComment[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (const comment of comments) {
    const result = await postInlineComment(
      prInfo,
      comment.filePath,
      comment.line,
      comment.content
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
