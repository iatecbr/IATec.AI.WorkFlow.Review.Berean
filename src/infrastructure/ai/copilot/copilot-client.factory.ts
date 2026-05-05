import { CopilotClient } from '@github/copilot-sdk';
import { getGitHubTokenFromAzure } from '../../../services/credentials.js';

function log(msg: string): void {
  if (process.env.BEREAN_VERBOSE) {
    console.error(msg);
  }
}

let _client: CopilotClient | null = null;

export async function getClient(): Promise<CopilotClient> {
  if (_client) return _client;

  const token = getGitHubTokenFromAzure();
  const options: Record<string, unknown> = {};
  if (token) {
    options.gitHubToken = token;
    options.useLoggedInUser = false;
  }

  _client = new CopilotClient(options);
  return _client;
}

export async function stopClient(): Promise<void> {
  if (_client) {
    await _client.stop();
    _client = null;
  }
}

export { log };
