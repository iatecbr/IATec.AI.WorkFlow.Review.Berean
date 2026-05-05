/**
 * @module model-identifier
 *
 * Value object and pure helpers for parsing model identifier strings.
 *
 * Model identifiers follow the convention:
 *
 *   `<providerId>:<modelName>`
 *
 * where `providerId` is the registered prefix of a provider (e.g. `copilot`,
 * `ollama`, `openai`) and `modelName` is everything that follows the **first**
 * colon.  Using only the first colon as the separator allows model names that
 * themselves contain colons (e.g. `gemma4:31b-cloud` in Ollama tag notation)
 * to remain intact.
 *
 * When no colon is present the `providerId` is an empty string, which the
 * registry interprets as "use the configured default provider".
 *
 * ## Extending to new providers
 * No changes are needed here when adding a new provider.  Each provider
 * declares its own `providerId` (which doubles as its prefix), and the
 * `ProviderRegistry` routes based on that value.
 *
 * @example
 *   parseModelId('ollama:gemma4:31b-cloud')
 *   // { providerId: 'ollama', modelName: 'gemma4:31b-cloud', raw: 'ollama:gemma4:31b-cloud' }
 *
 *   parseModelId('copilot:gpt-4o')
 *   // { providerId: 'copilot', modelName: 'gpt-4o', raw: 'copilot:gpt-4o' }
 *
 *   parseModelId('gpt-4o')
 *   // { providerId: '', modelName: 'gpt-4o', raw: 'gpt-4o' }
 */

/**
 * Immutable value object that represents a parsed model identifier.
 */
export interface ParsedModelId {
  /**
   * The provider prefix extracted from the identifier (e.g. `'copilot'`,
   * `'ollama'`).  Empty string when the identifier carries no prefix.
   */
  readonly providerId: string;

  /**
   * The model name with the provider prefix stripped (e.g. `'gpt-4o'`,
   * `'gemma4:31b-cloud'`).
   */
  readonly modelName: string;

  /** The original, unmodified model string. */
  readonly raw: string;
}

/**
 * Parses a model identifier string of the form `providerId:modelName`.
 *
 * Only the **first** colon is treated as the provider/model separator so
 * that Ollama-style tags (`gemma4:31b-cloud`) are preserved in `modelName`.
 */
export function parseModelId(raw: string): ParsedModelId {
  const colonIndex = raw.indexOf(':');

  if (colonIndex === -1) {
    return { providerId: '', modelName: raw, raw };
  }

  return {
    providerId: raw.slice(0, colonIndex).toLowerCase(),
    modelName: raw.slice(colonIndex + 1),
    raw,
  };
}

/**
 * Strips the `<providerId>:` prefix from a model identifier if present.
 * Safe to call with strings that do not carry a prefix — they are returned
 * unchanged.
 *
 * @example
 *   stripProviderPrefix('ollama:gemma4:31b-cloud', 'ollama') // 'gemma4:31b-cloud'
 *   stripProviderPrefix('gemma4:31b-cloud',        'ollama') // 'gemma4:31b-cloud'
 */
export function stripProviderPrefix(model: string, providerId: string): string {
  const prefix = `${providerId}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}
