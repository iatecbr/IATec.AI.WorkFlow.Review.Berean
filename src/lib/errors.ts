import axios from 'axios';

/**
 * Extracts a human-readable message from any thrown value, including
 * `AggregateError` (connection refused, DNS failures, etc.) and axios errors.
 *
 * @param error  The caught value.
 * @param context  Optional context label to make the message more actionable
 *                 (e.g. the endpoint URL when reporting a connection failure).
 */
export function extractErrorMessage(error: unknown, context?: string): string {
  const raw = rawMessage(error);

  if (isConnectionRefused(raw)) {
    const url = context ?? 'the configured endpoint';
    return (
      `Cannot connect to ${url}. ` +
      `Make sure the service is running and the endpoint is correct. ` +
      `If running inside Docker, use http://host.docker.internal:<port> instead of http://localhost:<port>.`
    );
  }

  return raw;
}

function isConnectionRefused(msg: string): boolean {
  return msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ECONNRESET');
}

function rawMessage(error: unknown): string {
  if (error instanceof AggregateError && error.errors?.length > 0) {
    const inner = error.errors
      .map((e: unknown) => (e instanceof Error ? (e.message || e.name) : String(e)))
      .filter(Boolean)
      .join('; ');
    return inner || error.name;
  }

  if (axios.isAxiosError(error)) {
    if (error.response) {
      return `HTTP ${error.response.status}: ${JSON.stringify(error.response.data).substring(0, 200)}`;
    }
    if (error.cause instanceof AggregateError) {
      return rawMessage(error.cause);
    }
    return error.message || `Request failed (${error.code ?? 'unknown'})`;
  }

  if (error instanceof Error) {
    return error.message || error.name || String(error);
  }

  return String(error) || 'Unknown error';
}
