import { describe, expect, it } from 'vitest';
import { localDateLabels } from '../src/utils/time.js';

describe('workspace-local trend dates', () => {
  it('preserves local labels across a spring DST transition', () => {
    expect(localDateLabels(new Date('2026-03-07T05:00:00.000Z'), new Date('2026-03-12T04:00:00.000Z'), 'America/New_York')).toEqual([
      '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11',
    ]);
  });

  it('preserves local labels across a fall DST transition', () => {
    expect(localDateLabels(new Date('2026-10-31T04:00:00.000Z'), new Date('2026-11-05T05:00:00.000Z'), 'America/New_York')).toEqual([
      '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
    ]);
  });
});
