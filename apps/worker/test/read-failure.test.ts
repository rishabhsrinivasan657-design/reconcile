import { ReplayMiss } from '@reconcile/llm';
import { describe, expect, it } from 'vitest';
import { DEMO_MODE_MESSAGE, readFailure } from '../src/workers.ts';

describe('read failures (M7 AC-6)', () => {
  it('a file without a recorded AI answer gets the demo-mode message and stops at once', () => {
    expect(readFailure(new ReplayMiss('No recorded response for abc'))).toEqual({
      permanent: true,
      message: DEMO_MODE_MESSAGE,
    });
    expect(DEMO_MODE_MESSAGE).toMatch(/only reads the sample documents/);
  });
  it('other errors keep their message and are retried', () => {
    expect(readFailure(new Error('socket hang up'))).toEqual({
      permanent: false,
      message: 'socket hang up',
    });
  });
});
