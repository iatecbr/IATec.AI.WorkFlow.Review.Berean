import axios from 'axios';
import type { ModelDetail } from '../../../application/ports/review-model.port.js';

// Re-export so existing call sites that import extractErrorMessage from here
// continue to work during incremental migration.
export { extractErrorMessage } from '../../../lib/errors.js';

export interface OllamaProviderOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
}

interface OllamaGenerateOptions {
  system?: string;
}

interface OllamaTagResponse {
  models?: Array<{
    name: string;
    details?: {
      parameter_size?: string;
      format?: string;
      family?: string;
    };
  }>;
}

export class OllamaProvider {
  private endpoint: string;
  private model: string;
  private apiKey?: string;
  private isOpenAICompatible: boolean;

  constructor(options: OllamaProviderOptions) {
    this.endpoint = options.endpoint.trim().replace(/\/$/, '');
    this.model = options.model;
    this.apiKey = options.apiKey;
    // Auto-detect OpenAI-compatible endpoints (e.g. https://ollama.com/v1, https://api.openai.com/v1)
    this.isOpenAICompatible = /\/v\d+$/.test(this.endpoint);
  }

  async generate(prompt: string, options: OllamaGenerateOptions = {}): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (this.isOpenAICompatible) {
      const messages: Array<{ role: string; content: string }> = [];
      if (options.system) {
        messages.push({ role: 'system', content: options.system });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await axios.post(
        `${this.endpoint}/chat/completions`,
        { model: this.model, messages, stream: false },
        { headers },
      );
      const choice = response.data?.choices?.[0];
      return choice?.message?.content ?? choice?.text ?? '';
    }

    const response = await axios.post(
      `${this.endpoint}/api/generate`,
      { model: this.model, prompt, system: options.system, stream: false },
      { headers },
    );
    return response.data.response || response.data.result || '';
  }

  async listModels(): Promise<ModelDetail[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (this.isOpenAICompatible) {
      interface OpenAIModelsResponse { data?: Array<{ id: string }> }
      const response = await axios.get<OpenAIModelsResponse>(`${this.endpoint}/models`, { headers });
      return (response.data.data ?? []).map(m => ({
        id: m.id,
        name: m.id,
        supportsVision: false,
        supportsReasoning: false,
        isPremium: false,
      }));
    }

    const response = await axios.get<OllamaTagResponse>(`${this.endpoint}/api/tags`, { headers });
    const models = response.data.models ?? [];
    return models.map(model => ({
      id: model.name,
      name: model.name,
      supportsVision: model.details?.family?.toLowerCase().includes('vision') ?? false,
      supportsReasoning: false,
      isPremium: false,
    }));
  }
}
