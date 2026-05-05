export type { ReviewIssue } from '../../domain/review/entities/review-issue.js';
export type { ReviewResult } from '../../domain/review/entities/review-result.js';
import type { ReviewResult } from '../../domain/review/entities/review-result.js';

export interface ReviewOptions {
  model?: string;
  language?: string;
  maxTokens?: number;
  rules?: string;
  confidenceThreshold?: number;
  /** Model to fall back to if the primary provider/model fails. */
  fallbackModel?: string;
  /** Called when the primary provider fails and fallback is triggered. */
  onFallback?: (fallbackModel: string, reason: string) => void;
}

export interface ModelDetail {
  id: string;
  name: string;
  isDefault?: boolean;
  isPremium?: boolean;
  multiplier?: number;
  maxContextTokens?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsToolCalls?: boolean;
  supportsStreaming?: boolean;
  supportsReasoning?: boolean;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  policyState?: string;
}

export interface ReviewModelPort {
  /**
   * Unique provider identifier that **doubles as the routing prefix** in
   * model strings.
   *
   * When a model identifier carries the form `<providerId>:<modelName>` the
   * `ProviderRegistry` routes the call to the provider whose `providerId`
   * matches the extracted prefix.
   *
   * Convention: use a short, lowercase, URL-safe token (e.g. `'copilot'`,
   * `'ollama'`, `'openai'`).  Adding a new provider requires only implementing
   * this interface with a new `providerId` — no changes to the registry are
   * needed.
   */
  readonly providerId: string;

  /**
   * Returns `true` when this provider is capable of handling the given model
   * string.  The default implementation in each provider checks that
   * `parseModelId(model).providerId === this.providerId`.
   *
   * Override this method only when additional matching logic is required
   * (e.g. feature flags, capability checks).
   */
  supportsModel(model: string): boolean;
  listModels(): Promise<ModelDetail[]>;
  review(diff: string, options: ReviewOptions): Promise<ReviewResult>;
  generateRuleQueries?(diff: string, model: string): Promise<string[]>;
  stop?(): Promise<void>;
}