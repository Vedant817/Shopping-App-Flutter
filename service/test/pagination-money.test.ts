import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, parseLimit } from '../src/utils/cursor.js';
import { addMoney, divideMoney, parseMoney, ratio } from '../src/utils/money.js';

describe('pagination and money parsing', () => {
  it('round trips opaque keyset cursors', () => {
    const cursor = encodeCursor({ key: '2026-01-02T03:04:05.000Z', id: 'gid-2' });
    expect(decodeCursor(cursor)).toEqual({ key: '2026-01-02T03:04:05.000Z', id: 'gid-2' });
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(() => decodeCursor('not-a-cursor')).toThrow(/Invalid cursor/);
  });

  it('validates limits and preserves fixed decimal money', () => {
    expect(parseLimit('25')).toBe(25);
    expect(() => parseLimit('0')).toThrow();
    expect(() => parseLimit('101')).toThrow();
    expect(parseMoney('10.5000')).toBe('10.5');
    expect(addMoney('0.1', '0.2')).toBe('0.3');
    expect(divideMoney('10', '4')).toBe('2.5');
    expect(ratio('1', '3')).toBe('0.3333');
  });
});
