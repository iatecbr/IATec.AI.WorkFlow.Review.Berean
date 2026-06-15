import { describe, it, expect } from 'vitest';
import { parseModelId, stripProviderPrefix } from '../src/domain/shared/model-identifier.js';

describe('parseModelId', () => {
  it('parses standard provider:model format', () => {
    const result = parseModelId('copilot:gpt-4o');
    expect(result).toEqual({
      providerId: 'copilot',
      modelName: 'gpt-4o',
      raw: 'copilot:gpt-4o',
    });
  });

  it('preserves colons in model name (ollama tags)', () => {
    const result = parseModelId('ollama:gemma4:31b-cloud');
    expect(result).toEqual({
      providerId: 'ollama',
      modelName: 'gemma4:31b-cloud',
      raw: 'ollama:gemma4:31b-cloud',
    });
  });

  it('returns empty providerId when no colon', () => {
    const result = parseModelId('gpt-4o');
    expect(result).toEqual({
      providerId: '',
      modelName: 'gpt-4o',
      raw: 'gpt-4o',
    });
  });

  it('lowercases the provider prefix', () => {
    const result = parseModelId('COPILOT:gpt-4o');
    expect(result.providerId).toBe('copilot');
    expect(result.modelName).toBe('gpt-4o');
  });

  it('does not lowercase the model name', () => {
    const result = parseModelId('ollama:Gemma-2B');
    expect(result.modelName).toBe('Gemma-2B');
  });

  it('handles colon at start (empty provider)', () => {
    const result = parseModelId(':gpt-4o');
    expect(result).toEqual({
      providerId: '',
      modelName: 'gpt-4o',
      raw: ':gpt-4o',
    });
  });

  it('handles colon at end (empty model name)', () => {
    const result = parseModelId('ollama:');
    expect(result).toEqual({
      providerId: 'ollama',
      modelName: '',
      raw: 'ollama:',
    });
  });

  it('preserves raw string', () => {
    const raw = 'OpenAI:text-embedding-3-small';
    const result = parseModelId(raw);
    expect(result.raw).toBe(raw);
  });
});

describe('stripProviderPrefix', () => {
  it('strips matching prefix', () => {
    expect(stripProviderPrefix('ollama:gemma4:31b-cloud', 'ollama')).toBe('gemma4:31b-cloud');
  });

  it('returns unchanged when prefix does not match', () => {
    expect(stripProviderPrefix('gemma4:31b-cloud', 'ollama')).toBe('gemma4:31b-cloud');
  });

  it('does not strip partial prefix', () => {
    expect(stripProviderPrefix('ollama2:gpt-4o', 'ollama')).toBe('ollama2:gpt-4o');
  });

  it('handles string without colon', () => {
    expect(stripProviderPrefix('gpt-4o', 'copilot')).toBe('gpt-4o');
  });

  it('is case-sensitive', () => {
    expect(stripProviderPrefix('Ollama:gpt-4o', 'ollama')).toBe('Ollama:gpt-4o');
  });
});
