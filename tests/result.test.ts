import { describe, it, expect } from 'vitest';
import { ok, fail } from '../src/domain/shared/result.js';
import { DomainError } from '../src/domain/shared/errors.js';

describe('ok', () => {
  it('wraps a value in a success Result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(42);
  });

  it('works with null and undefined', () => {
    expect(ok(null).ok && ok(null).value).toBeNull();
    expect(ok(undefined).ok && ok(undefined).value).toBeUndefined();
  });

  it('works with objects', () => {
    const result = ok({ name: 'test' });
    expect(result.ok && result.value).toEqual({ name: 'test' });
  });
});

describe('fail', () => {
  it('wraps an error in a failure Result', () => {
    const error = new DomainError('Something went wrong');
    const result = fail(error);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe(error);
  });

  it('preserves the error message', () => {
    const error = new DomainError('Connection failed', 'CONN_ERR');
    const result = fail(error);
    expect(!result.ok && result.error.message).toBe('Connection failed');
    expect(!result.ok && result.error.code).toBe('CONN_ERR');
  });
});

describe('DomainError', () => {
  it('creates an error with a message', () => {
    const err = new DomainError('Test error');
    expect(err.message).toBe('Test error');
    expect(err.name).toBe('DomainError');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores an optional error code', () => {
    const err = new DomainError('Not found', 'NOT_FOUND');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('has undefined code when not provided', () => {
    const err = new DomainError('Generic error');
    expect(err.code).toBeUndefined();
  });
});
