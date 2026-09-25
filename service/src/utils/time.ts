import { z } from 'zod';

const dateSchema = z.coerce.date();

export type DateRange = {
  from: Date;
  to: Date;
  preset: string;
};

export function resolveRange(input: { from?: unknown; to?: unknown; preset?: unknown; now?: Date }): DateRange {
  const now = input.now ?? new Date();
  const hasFrom = input.from !== undefined && input.from !== '';
  const hasTo = input.to !== undefined && input.to !== '';
  if (hasFrom !== hasTo) throw new Error('from and to must be provided together');
  if (hasFrom && hasTo) {
    const from = dateSchema.parse(input.from);
    const to = dateSchema.parse(input.to);
    if (from >= to) throw new Error('from must be before to');
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days > 366) throw new Error('date range cannot exceed 366 days');
    return { from, to, preset: 'custom' };
  }
  const preset = input.preset === undefined || input.preset === '' ? '30d' : String(input.preset).toLowerCase();
  const daysByPreset: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysByPreset[preset];
  if (days === undefined) throw new Error('preset must be one of 7d, 30d, or 90d');
  return { from: new Date(now.getTime() - days * 86400000), to: now, preset };
}

export function localDateLabels(from: Date, to: Date, timeZone: string): string[] {
  if (from >= to) throw new Error('from must be before to');
  const first = localDateKey(from, timeZone);
  const last = localDateKey(new Date(to.getTime() - 1), timeZone);
  const labels: string[] = [];
  const cursor = new Date(`${first}T00:00:00.000Z`);
  const end = new Date(`${last}T00:00:00.000Z`);
  while (cursor <= end) {
    labels.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return labels;
}

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error('Invalid timezone date');
  return `${values.year}-${values.month}-${values.day}`;
}

export function toIso(date: Date): string {
  return date.toISOString();
}
