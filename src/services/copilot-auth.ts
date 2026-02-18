import { getGitHubTokenFromAzure } from './credentials.js';
import { execSync } from 'child_process';

/**
 * Check if user is authenticated (has a GitHub token available)
 */
export function isAuthenticated(): boolean {
  // Check for explicit token first
  if (getGitHubTokenFromAzure()) return true;

  // Check if copilot CLI is logged in
  try {
    const result = execSync('copilot auth status', { 
      encoding: 'utf-8', 
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    return result.includes('Logged in') || result.includes('authenticated');
  } catch {
    return false;
  }
}

/**
 * Get auth status with details
 */
export async function getAuthStatus(): Promise<{
  authenticated: boolean;
  method: 'env' | 'cli' | 'none';
  token?: string;
  error?: string;
}> {
  const token = getGitHubTokenFromAzure();
  
  if (token) {
    // Mask token for display
    const masked = token.substring(0, 8) + '...' + token.slice(-4);
    return { 
      authenticated: true, 
      method: 'env',
      token: masked
    };
  }

  // Check copilot CLI auth
  try {
    const result = execSync('copilot auth status', { 
      encoding: 'utf-8', 
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    if (result.includes('Logged in') || result.includes('authenticated')) {
      return { authenticated: true, method: 'cli' };
    }
  } catch {
    // CLI not logged in
  }

  return { authenticated: false, method: 'none' };
}

/**
 * Login via copilot CLI (interactive)
 */
export function loginViaCLI(): void {
  try {
    execSync('copilot auth login', { stdio: 'inherit' });
  } catch (error) {
    throw new Error('Login failed. Make sure the Copilot CLI is installed: npm install -g @github/copilot');
  }
}

/**
 * Logout via copilot CLI
 */
export function logoutViaCLI(): void {
  try {
    execSync('copilot auth logout', { stdio: 'inherit' });
  } catch {
    // Ignore errors on logout
  }
}
