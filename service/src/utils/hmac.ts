import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacSha256(value: string | Buffer, secret: string | Buffer): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

export function hmacSha256Hex(value: string | Buffer, secret: string | Buffer): string {
  return hmacSha256(value, secret).toString('hex');
}

export function verifyHmacHex(value: string | Buffer, secret: string | Buffer, expectedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const actual = hmacSha256(value, secret);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function stableQueryString(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}=${item}`)
    .join('&');
}
