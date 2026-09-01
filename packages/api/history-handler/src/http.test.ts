import { describe, expect, it } from 'vitest';
import { decodeCursor, parseBoundedNumber, parseJsonBody, parseRange } from './http.js';

describe('history HTTP input helpers', () => {
  it('clamps pagination limits and defaults invalid values', () => {
    expect(parseBoundedNumber('500', 20, 1, 100)).toBe(100);
    expect(parseBoundedNumber('0', 20, 1, 100)).toBe(20);
  });

  it('uses provided ranges and rejects invalid cursors', () => {
    expect(parseRange({ from: '10', to: '20' }, 1, 2)).toEqual({ from: 10, to: 20 });
    expect(() => decodeCursor('not-a-cursor')).toThrow('invalid cursor');
  });

  it('only accepts object request bodies', () => {
    expect(parseJsonBody('{"deviceId":"device"}')).toEqual({ deviceId: 'device' });
    expect(() => parseJsonBody('[]')).toThrow('invalid request body');
  });
});
