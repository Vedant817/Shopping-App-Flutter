import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function decodeEncryptionKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Encryption key must be base64 encoded');
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must decode to exactly 32 bytes');
  return key;
}

export function encryptToken(token: string, encodedKey: string): string {
  if (typeof token !== 'string' || token.length === 0) throw new Error('Token must not be empty');
  const key = decodeEncryptionKey(encodedKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptToken(value: string, encodedKey: string): string {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Encrypted token format is invalid');
  const key = decodeEncryptionKey(encodedKey);
  try {
    const iv = Buffer.from(parts[1] ?? '', 'base64url');
    const tag = Buffer.from(parts[2] ?? '', 'base64url');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('Encrypted token components are invalid');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Encrypted token could not be decrypted');
  }
}
