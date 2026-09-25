import { z } from 'zod';

const cursorPayloadSchema = z.object({
  key: z.string().datetime({ offset: true }),
  id: z.string().min(1),
});

export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): CursorPayload | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid cursor');
  }
  const parsed = cursorPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new Error('Invalid cursor');
  return parsed.data;
}

export function parseLimit(value: unknown, fallback = 50, maximum = 100): number {
  if (value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`limit must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}
