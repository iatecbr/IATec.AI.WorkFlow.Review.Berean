/**
 * Direct HTTP provider for GitHub Copilot API.
 * Bypasses the SDK/CLI subprocess — preferred in CI/CD environments.
 *
 * Flow: GitHub PAT → Copilot token exchange → Chat Completions API
 *
 * Requirements for the GitHub token:
 *  - Must be a Classic PAT (NOT fine-grained — github_pat_* tokens are unsupported)
 *  - The GitHub account must have an active GitHub Copilot subscription
 *  - The PAT must include the 'copilot' scope (or at minimum read:user)
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { version: VERSION } = _require('../../package.json') as { version: string };

interface CopilotToken {
  token: string;
  expires_at: number;
}

let cachedToken: CopilotToken | null = null;

/**
 * Classify a GitHub token to produce actionable error messages.
 *  - 'fine-grained'  → starts with github_pat_ (not supported by Copilot token exchange)
 *  - 'actions'       → starts with ghs_ (GitHub Actions GITHUB_TOKEN — no Copilot subscription)
 *  - 'classic'       → starts with ghp_ (correct type)
 *  - 'unknown'       → any other format
 */
function classifyToken(token: string): 'fine-grained' | 'actions' | 'classic' | 'unknown' {
  if (token.startsWith('github_pat_')) return 'fine-grained';
  if (token.startsWith('ghs_')) return 'actions';
  if (token.startsWith('ghp_')) return 'classic';
  return 'unknown';
}

function tokenExchangeErrorMessage(status: number, body: string, token: string): string {
  const kind = classifyToken(token);
  const base = `Copilot token exchange failed (HTTP ${status})`;

  if (status === 403 || status === 401) {
    if (kind === 'fine-grained') {
      return (
        `${base}: fine-grained PATs (github_pat_*) are NOT supported by the Copilot API.\n` +
        `  → Create a Classic PAT at https://github.com/settings/tokens\n` +
        `    with the 'copilot' scope (or at minimum 'read:user') and set it as COPILOT_GITHUB_TOKEN.`
      );
    }
    if (kind === 'actions') {
      return (
        `${base}: GitHub Actions GITHUB_TOKEN (ghs_*) has no Copilot subscription.\n` +
        `  → Set COPILOT_GITHUB_TOKEN as a repository/pipeline secret using a personal Classic PAT\n` +
        `    with an active GitHub Copilot Individual or Business subscription.`
      );
    }
    // Classic PAT but still 403
    return (
      `${base}: access denied.\n` +
      `  Ensure:\n` +
      `  1. Your GitHub account has an active Copilot Individual or Business subscription.\n` +
      `  2. The PAT is a Classic token (not fine-grained) with the 'copilot' scope.\n` +
      `  3. If using Copilot Business/Enterprise, your org admin has not blocked API access.\n` +
      `  Raw response: ${body}`
    );
  }

  return `${base}: ${body}`;
}

/**
 * Exchange a GitHub Classic PAT for a short-lived Copilot API token (cached).
 */
async function getCopilotToken(githubToken: string): Promise<string> {
  // Reuse cached token if still valid (60 s buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() / 1000 + 60) {
    return cachedToken.token;
  }

  const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/json',
      'User-Agent': `berean-cli/${VERSION}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(tokenExchangeErrorMessage(response.status, body, githubToken));
  }

  const data = await response.json() as CopilotToken;
  cachedToken = data;
  return data.token;
}

/**
 * Call the Copilot Chat Completions API with separate system and user messages.
 */
export async function chatCompletion(
  githubToken: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs: number = 300_000,
): Promise<string> {
  const copilotToken = await getCopilotToken(githubToken);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.individual.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': `berean-cli/${VERSION}`,
        'Editor-Version': `berean/${VERSION}`,
        'Copilot-Integration-Id': 'vscode-chat',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Copilot API error (${response.status}): ${body}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data?.choices?.[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Copilot API timeout after ${timeoutMs / 1000}s`);
    }
    throw error;
  }
}
