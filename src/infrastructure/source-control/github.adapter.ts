import {
  fetchGitHubPRBasicInfo,
  fetchGitHubPRDiff,
  postGitHubPRComment,
  postGitHubInlineComments,
  findGitHubBereanComments,
  getGitHubPRCommits,
  updateGitHubPRComment,
  type GitHubPRInfo,
} from '../scm/github/github-http.client.js';
import type { SourceControlPort, FetchDiffOptions } from '../../application/ports/source-control.port.js';

export function buildGitHubAdapter(info: GitHubPRInfo): SourceControlPort {
  return {
    platform: 'github',
    fetchPRBasicInfo: () => fetchGitHubPRBasicInfo(info),
    fetchPRDiff: (opts?: FetchDiffOptions) => fetchGitHubPRDiff(info, opts),
    postPRComment: (comment) => postGitHubPRComment(info, comment),
    postInlineComments: (comments) => postGitHubInlineComments(info, comments),
    findBereanComments: () => findGitHubBereanComments(info),
    getPRCommits: () => getGitHubPRCommits(info),
    updatePRComment: (_threadId, commentId, newContent) => updateGitHubPRComment(info, commentId, newContent),
  };
}
