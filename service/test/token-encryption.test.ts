import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptToken, decodeEncryptionKey, encryptToken } from '../src/crypto/token-vault.js';

describe('Shopify token vault', () => {
  const key = randomBytes(32).toString('base64');

  it('round trips an offline token with AES-256-GCM', () => {
    const token = 'offline-token-value';
    const encrypted = encryptToken(token, key);
    expect(encrypted).not.toContain(token);
    expect(decryptToken(encrypted, key)).toBe(token);
  });

  it('rejects invalid keys, empty tokens, and tampering', () => {
    expect(() => decodeEncryptionKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => encryptToken('', key)).toThrow(/empty/);
    const encrypted = encryptToken('token', key);
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    parts[3] = ciphertext.toString('base64url');
    expect(() => decryptToken(parts.join('.'), key)).toThrow();
  });
});
