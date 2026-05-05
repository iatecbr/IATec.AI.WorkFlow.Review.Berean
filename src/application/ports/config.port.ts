// ─── AppConfig ────────────────────────────────────────────────────────────────

export interface AppConfig {
  /** Default AI model (e.g. "gpt-4o", "ollama:gemma3"). */
  defaultModel: string;
  /** Default review language (e.g. "English", "Portuguese"). */
  defaultLanguage: string;
  /** Path to a rules file or directory (optional). */
  rulesPath?: string;
  /** Maximum number of characters allowed in the rules block. */
  maxRulesChars?: number;
  /** Fallback model used when the primary provider/model fails. */
  fallbackModel?: string;
  /** Hostname/IP the web server binds to (default: 127.0.0.1). */
  serverHost?: string;
  /** TCP port the web server listens on (default: 3000). */
  serverPort?: number;
}

// ─── Port ─────────────────────────────────────────────────────────────────────

export interface ConfigPort {
  get<K extends keyof AppConfig>(key: K): AppConfig[K] | undefined;
}
