/**
 * Composition root — single wiring point for the application.
 *
 * The interfaces layer (CLI commands, HTTP routes) imports from here instead of
 * reaching directly into application/, infrastructure/, providers/ or services/.
 * This makes the dependency seam explicit and enables unit-testing use cases by
 * calling them directly with injected mocks, without going through this module.
 */

import { getEnvConfig } from '../infrastructure/config/env-config.repository.js';
import { isAuthenticated } from '../services/copilot-auth.js';
import {
  reviewPullRequest,
  type ReviewPullRequestInput,
  type ReviewPullRequestResult,
} from '../application/use-cases/review-pull-request.js';
import {
  listAvailableModels,
  stopProviders,
} from '../providers/provider-registry.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if the user is authenticated with Copilot.
 * CLI and HTTP layers call this before invoking review operations.
 */
export function checkAuth(): boolean {
  return isAuthenticated();
}

// ─── Review ───────────────────────────────────────────────────────────────────

/**
 * Production-wired entry point for the ReviewPullRequest use case.
 * Injects the default ConfigPort implementation so callers do not need to
 * know about infrastructure/config internals.
 * Callers may still override `config` in the input for testing purposes.
 */
export async function runReview(
  input: Omit<ReviewPullRequestInput, 'config'> & { config?: ReviewPullRequestInput['config'] },
): Promise<ReviewPullRequestResult> {
  return reviewPullRequest({
    config: getEnvConfig(),
    ...input,
  });
}

// ─── Models / Providers ───────────────────────────────────────────────────────

export { listAvailableModels, stopProviders };
