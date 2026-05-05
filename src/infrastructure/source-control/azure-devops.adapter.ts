import {
  fetchPRBasicInfo as fetchAzurePRBasicInfo,
  fetchPRDiff as fetchAzurePRDiff,
  postPRComment as postAzurePRComment,
  postInlineComments as postAzureInlineComments,
  findBereanComments as findAzureBereanComments,
  getPRCommits as getAzurePRCommits,
  updatePRComment as updateAzurePRComment,
  type PRInfo as AzurePRInfo,
} from '../scm/azure-devops/azure-http.client.js';
import type { SourceControlPort, FetchDiffOptions } from '../../application/ports/source-control.port.js';

export function buildAzureDevOpsAdapter(info: AzurePRInfo): SourceControlPort {
  return {
    platform: 'azure-devops',
    fetchPRBasicInfo: () => fetchAzurePRBasicInfo(info),
    fetchPRDiff: (opts?: FetchDiffOptions) => fetchAzurePRDiff(info, opts),
    postPRComment: (comment) => postAzurePRComment(info, comment),
    postInlineComments: (comments) => postAzureInlineComments(info, comments),
    findBereanComments: () => findAzureBereanComments(info),
    getPRCommits: () => getAzurePRCommits(info),
    updatePRComment: (threadId, commentId, newContent) => updateAzurePRComment(info, threadId, commentId, newContent),
  };
}
