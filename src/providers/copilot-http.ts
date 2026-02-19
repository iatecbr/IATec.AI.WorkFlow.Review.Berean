/**
 * Direct HTTP provider for GitHub Copilot API
 * Bypasses the SDK/CLI subprocess for environments where it doesn't work (CI/CD)
 * 
 * Flow: GitHub PAT → Copilot token exchange → Chat Completions API
 */

interface CopilotToken {
  token: string;
  expires_at: number;
}

let cachedToken: CopilotToken | null = null;

/**
 * Exchange GitHub PAT for a Copilot API token
 */
async function getCopilotToken(githubToken: string): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expires_at > Date.now() / 1000 + 60) {
    return cachedToken.token;
  }

  console.error(`[berean-http] Exchanging GitHub token for Copilot token...`);
  
  const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/json',
      'User-Agent': 'berean-cli/0.2.0',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  const data = await response.json() as CopilotToken;
  cachedToken = data;
  console.error(`[berean-http] Copilot token obtained (expires: ${new Date(data.expires_at * 1000).toISOString()})`);
  return data.token;
}

/**
 * Call Copilot Chat Completions API directly via HTTP
 */
export async function chatCompletion(
  githubToken: string,
  model: string,
  prompt: string,
  timeoutMs: number = 300_000,
): Promise<string> {
  const copilotToken = await getCopilotToken(githubToken);

  console.error(`[berean-http] Sending chat completion request (model: ${model}, prompt: ${prompt.length} chars)...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.individual.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'berean-cli/0.2.0',
        'Editor-Version': 'berean/0.2.0',
        'Copilot-Integration-Id': 'vscode-chat',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt },
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

    const content = data?.choices?.[0]?.message?.content || '';
    console.error(`[berean-http] Response received (${content.length} chars)`);
    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Copilot API timeout after ${timeoutMs / 1000}s`);
    }
    throw error;
  }
}
