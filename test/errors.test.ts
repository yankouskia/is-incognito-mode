import { describe, expect, it } from 'vitest';

import { IncognitoDetectionError } from '../src/errors.ts';

describe('IncognitoDetectionError', () => {
  it('preserves name, code, message, and cause', () => {
    const cause = new Error('underlying');
    const err = new IncognitoDetectionError('PROBE_FAILED', 'boom', { cause });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IncognitoDetectionError);
    expect(err.name).toBe('IncognitoDetectionError');
    expect(err.code).toBe('PROBE_FAILED');
    expect(err.message).toBe('boom');
    expect(err.cause).toBe(cause);
  });

  it('does not require a cause', () => {
    const err = new IncognitoDetectionError('NOT_A_BROWSER', 'no nav');
    expect(err.cause).toBeUndefined();
  });
});
