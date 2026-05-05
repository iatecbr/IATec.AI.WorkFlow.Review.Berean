import type {
  ModelDetail,
  ReviewModelPort,
  ReviewOptions,
  ReviewResult,
} from '../application/ports/review-model.port.js';
import { reviewCode } from '../infrastructure/ai/copilot/copilot-review.adapter.js';
import { fetchModels } from '../infrastructure/ai/copilot/copilot-models.adapter.js';
import { generateRuleQueries } from '../infrastructure/ai/copilot/copilot-queries.adapter.js';
import { stopClient } from '../infrastructure/ai/copilot/copilot-client.factory.js';
import { parseModelId } from '../domain/shared/model-identifier.js';

export class CopilotReviewModelProvider implements ReviewModelPort {
  readonly providerId = 'copilot';

  /**
   * Handles any model identifier whose provider prefix matches `'copilot'`
   * (e.g. `copilot:gpt-4o`, `copilot:gpt-5.3-codex`).
   *
   * Unprefixed model strings are intentionally NOT claimed here — the
   * `ProviderRegistry` routes those to the configured default provider.
   */
  supportsModel(model: string): boolean {
    return parseModelId(model).providerId === this.providerId;
  }

  async listModels(): Promise<ModelDetail[]> {
    return fetchModels();
  }

  async review(diff: string, options: ReviewOptions): Promise<ReviewResult> {
    return reviewCode(diff, options);
  }

  async generateRuleQueries(diff: string, model: string): Promise<string[]> {
    return generateRuleQueries(diff, model);
  }

  async stop(): Promise<void> {
    await stopClient();
  }
}

export const copilotReviewModelProvider = new CopilotReviewModelProvider();