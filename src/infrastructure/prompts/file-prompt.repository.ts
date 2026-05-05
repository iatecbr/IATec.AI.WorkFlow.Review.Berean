import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { PromptRepository } from '../../application/ports/prompt-repository.port.js';

class FilePromptRepository implements PromptRepository {
  private readonly cache = new Map<string, string>();
  private readonly promptsRoot: string;

  constructor() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    this.promptsRoot = path.resolve(here, '..', '..', '..', 'prompts');
  }

  async getPrompt(templatePath: string): Promise<string> {
    const cacheKey = templatePath.replace(/\\/g, '/');
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const fullPath = path.join(this.promptsRoot, templatePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    this.cache.set(cacheKey, content);
    return content;
  }
}

const promptRepository = new FilePromptRepository();

export function getPromptRepository(): PromptRepository {
  return promptRepository;
}

export function renderPrompt(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}