import { parseGitHubPRUrl } from '../scm/github/github-http.client.js';
import { parsePRUrl as parseAzurePRUrl } from '../scm/azure-devops/azure-http.client.js';
import { getAzureDevOpsPATFromPipeline, getGitHubToken } from '../../services/credentials.js';
import type { ResolveSourceControlResult } from '../../application/ports/source-control.port.js';
import { buildGitHubAdapter } from './github.adapter.js';
import { buildAzureDevOpsAdapter } from './azure-devops.adapter.js';

/**
 * Detect the SCM platform from a PR URL and return the matching adapter.
 *
 * Supported URL formats:
 *   GitHub:       https://github.com/{owner}/{repo}/pull/{number}
 *   Azure DevOps: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
 *                 https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}
 */
export function resolveSourceControlFromUrl(url: string): ResolveSourceControlResult {
  const ghInfo = parseGitHubPRUrl(url);
  if (ghInfo) {
    if (!getGitHubToken()) {
      return { error: 'GitHub token not configured. Set GITHUB_TOKEN or GH_TOKEN environment variable.' };
    }
    return { adapter: buildGitHubAdapter(ghInfo) };
  }

  const azInfo = parseAzurePRUrl(url);
  if (azInfo) {
    if (!getAzureDevOpsPATFromPipeline()) {
      return {
        error:
          'Azure DevOps PAT not configured. Set AZURE_DEVOPS_PAT env var or run: berean config set azure-pat <token>',
      };
    }
    return { adapter: buildAzureDevOpsAdapter(azInfo) };
  }

  return {
    error:
      'Invalid PR URL. Supported formats:\n' +
      '  GitHub:      https://github.com/{owner}/{repo}/pull/{number}\n' +
      '  Azure DevOps: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}',
  };
}

/**
 * Build an adapter from explicit CLI flags.
 *
 * GitHub:       --owner + --repo + --pr
 * Azure DevOps: --org + --project + --repo + --pr
 */
export function resolveSourceControlFromFlags(flags: {
  org?: string;
  project?: string;
  repo?: string;
  pr?: string;
  owner?: string;
}): ResolveSourceControlResult {
  if (flags.owner && flags.repo && flags.pr) {
    if (!getGitHubToken()) {
      return { error: 'GitHub token not configured. Set GITHUB_TOKEN or GH_TOKEN environment variable.' };
    }
    return {
      adapter: buildGitHubAdapter({
        owner: flags.owner,
        repo: flags.repo,
        pullNumber: parseInt(flags.pr, 10),
      }),
    };
  }

  if (flags.org && flags.project && flags.repo && flags.pr) {
    if (!getAzureDevOpsPATFromPipeline()) {
      return {
        error:
          'Azure DevOps PAT not configured. Set AZURE_DEVOPS_PAT env var or run: berean config set azure-pat <token>',
      };
    }
    return {
      adapter: buildAzureDevOpsAdapter({
        organization: flags.org,
        project: flags.project,
        repository: flags.repo,
        pullRequestId: parseInt(flags.pr, 10),
      }),
    };
  }

  return {
    error:
      'Please provide a PR URL or use flags:\n' +
      '  GitHub:      --owner, --repo, --pr\n' +
      '  Azure DevOps: --org, --project, --repo, --pr',
  };
}
