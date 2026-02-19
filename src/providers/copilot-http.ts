/**
 * Direct HTTP provider for GitHub Copilot API.
 * Bypasses the SDK/CLI subprocess — preferred in CI/CD environments.
 *
 * Flow: GitHub PAT → Copilot token exchange → Chat Completions API
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
 * Exchange a GitHub PAT for a short-lived Copilot API token (cached).
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
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
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
