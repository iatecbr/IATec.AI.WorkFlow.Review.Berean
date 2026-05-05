import type { ServerResponse } from 'node:http';
import type { ReviewPullRequestResult } from '../../../application/use-cases/review-pull-request.js';
import { extractErrorMessage } from '../../../lib/errors.js';

/**
 * Wraps a raw HTTP `ServerResponse` and exposes typed helpers for emitting
 * Server-Sent Events in the review HTTP route.
 *
 * The route only needs to call `start()` → `onProgress` → `sendResult/sendError`
 * → `end()`, with no awareness of the underlying SSE wire format.
 */
export class SseReviewPresenter {
  constructor(private readonly res: ServerResponse) {}

  start(): void {
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
  }

  sendProgress(phase: string, message: string): void {
    this.emit('progress', { phase, message });
  }

  sendResult(result: ReviewPullRequestResult): void {
    this.emit('result', { result });
  }

  sendError(error: unknown): void {
    this.emit('error', { error: extractErrorMessage(error) });
  }

  end(): void {
    this.res.end();
  }

  private emit(event: string, payload: unknown): void {
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}
