import type {
  ModelDetail,
  ReviewModelPort,
  ReviewOptions,
  ReviewResult,
} from '../application/ports/review-model.port.js';
import { copilotReviewModelProvider } from './copilot-review-model.js';
import { ollamaReviewModelProvider } from './ollama-review-model.js';
import { parseModelId } from '../domain/shared/model-identifier.js';

/** Errors originating from a provider that are worth retrying on a fallback. */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message;
  // 4xx client errors (except 429 rate-limit) are config problems; no point retrying.
  // 5xx, network errors and timeouts are retryable.
  const match = msg.match(/HTTP (\d{3})/);
  if (match) {
    const status = parseInt(match[1], 10);
    if (status === 429) return true;   // rate-limited — try another provider
    if (status >= 400 && status < 500) return true; // 4xx from provider = config issue, try fallback
    if (status >= 500) return true;
  }
  return true; // network errors, timeouts, etc.
}

class ProviderRegistry {
  private readonly providers: ReviewModelPort[];

  /**
   * The `providerId` of the provider to use when a model string carries no
   * prefix (e.g. a bare `gpt-4o`).  Defaults to the first registered
   * provider.
   *
   * Set to `'copilot'` here for backward-compatibility: historically all
   * unprefixed model IDs were routed to GitHub Copilot.
   */
  private readonly defaultProviderId: string;

  /**
   * @param providers  Ordered list of provider instances.  To add a new
   *   provider, append it here — no other code needs to change.
   * @param defaultProviderId  `providerId` to use when the model string
   *   carries no `<provider>:` prefix.  Defaults to the first provider.
   */
  constructor(providers: ReviewModelPort[], defaultProviderId?: string) {
    if (providers.length === 0) {
      throw new Error('ProviderRegistry requires at least one provider.');
    }
    this.providers = [...providers]; // defensive copy — keeps the registry immutable after construction
    this.defaultProviderId = defaultProviderId ?? providers[0].providerId;
  }

  /**
   * Resolves the correct provider for a given model string using its
   * `<providerId>:` prefix.
   *
   * Routing rules (in order):
   * 1. If the model string has a recognised provider prefix → route to that provider.
   * 2. If the prefix is unknown → log a warning and fall through to the default.
   * 3. If no prefix is present → use `defaultProviderId`.
   */
  resolve(model: string): ReviewModelPort {
    const { providerId } = parseModelId(model);

    if (providerId) {
      const matched = this.providers.find(p => p.providerId === providerId);
      if (matched) return matched;

      console.warn(
        `[berean] Unknown provider prefix "${providerId}" in model "${model}". ` +
        `Falling back to default provider "${this.defaultProviderId}".`,
      );
    }

    return this.providers.find(p => p.providerId === this.defaultProviderId) ?? this.providers[0];
  }

  async listModels(): Promise<ModelDetail[]> {
    const all = await Promise.all(this.providers.map(provider => provider.listModels()));
    const deduped = new Map<string, ModelDetail>();

    for (const models of all) {
      for (const model of models) {
        if (!deduped.has(model.id)) {
          deduped.set(model.id, model);
        }
      }
    }

    return [...deduped.values()];
  }

  async review(diff: string, options: ReviewOptions = {}): Promise<ReviewResult> {
    const primaryModel = options.model ?? '';
    const primaryProvider = this.resolve(primaryModel);

    let primaryResult: ReviewResult;
    try {
      primaryResult = await primaryProvider.review(diff, options);
    } catch (primaryError) {
      const fallbackModel = options.fallbackModel;

      if (!fallbackModel || !isRetryableError(primaryError)) {
        throw primaryError;
      }

      // Avoid re-trying the exact same provider with the exact same model.
      const fallbackProvider = this.resolve(fallbackModel);
      if (fallbackProvider === primaryProvider && fallbackModel === primaryModel) {
        throw primaryError;
      }

      const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
      console.error(
        `[berean] Primary provider "${primaryProvider.providerId}" failed (${reason}). ` +
        `Retrying with fallback model "${fallbackModel}"...`,
      );
      options.onFallback?.(fallbackModel, reason);

      return fallbackProvider.review(diff, { ...options, model: fallbackModel, fallbackModel: undefined, onFallback: undefined });
    }

    // Providers may return { success: false } instead of throwing — handle fallback for those too.
    if (!primaryResult.success && options.fallbackModel) {
      const fallbackModel = options.fallbackModel;
      const fallbackProvider = this.resolve(fallbackModel);

      if (!(fallbackProvider === primaryProvider && fallbackModel === primaryModel)) {
        const reason = primaryResult.error ?? 'unknown error';
        console.error(
          `[berean] Primary provider "${primaryProvider.providerId}" failed (${reason}). ` +
          `Retrying with fallback model "${fallbackModel}"...`,
        );
        options.onFallback?.(fallbackModel, reason);

        return fallbackProvider.review(diff, { ...options, model: fallbackModel, fallbackModel: undefined, onFallback: undefined });
      }
    }

    return primaryResult;
  }

  async generateRuleQueries(diff: string, model: string): Promise<string[]> {
    const provider = this.resolve(model);
    if (!provider.generateRuleQueries) {
      return [];
    }
    return provider.generateRuleQueries(diff, model);
  }

  async stopAll(): Promise<void> {
    for (const provider of this.providers) {
      if (provider.stop) {
        await provider.stop();
      }
    }
  }
}

const registry = new ProviderRegistry(
  [ollamaReviewModelProvider, copilotReviewModelProvider],
  'copilot', // backward-compat: unprefixed model IDs (e.g. 'gpt-4o') default to Copilot
);

export function getReviewProviderRegistry(): ProviderRegistry {
  return registry;
}

export async function listAvailableModels(): Promise<ModelDetail[]> {
  return registry.listModels();
}

export async function reviewWithSelectedProvider(diff: string, options: ReviewOptions = {}): Promise<ReviewResult> {
  return registry.review(diff, options);
}

export async function generateProviderRuleQueries(diff: string, model: string): Promise<string[]> {
  return registry.generateRuleQueries(diff, model);
}

export async function stopProviders(): Promise<void> {
  await registry.stopAll();
}