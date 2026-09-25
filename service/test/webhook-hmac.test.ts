import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookHmac } from '../src/ingestion/webhooks.js';

describe('webhook HMAC', () => {
  it('verifies the exact raw request body against Shopify\'s base64 digest', () => {
    const body = Buffer.from('{"id":123,"note":"café"}', 'utf8');
    const secret = 'webhook-secret';
    const digest = createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyWebhookHmac(body, digest, secret)).toBe(true);
    expect(verifyWebhookHmac(Buffer.from('{"id":123}'), digest, secret)).toBe(false);
  });

  it('rejects the hex encoding Shopify does not send', () => {
    const body = Buffer.from('{}');
    const secret = 'webhook-secret';
    const hexDigest = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookHmac(body, hexDigest, secret)).toBe(false);
  });

  it('rejects malformed, truncated, and missing signatures', () => {
    const body = Buffer.from('{}');
    const secret = 'webhook-secret';
    const digest = createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyWebhookHmac(body, 'not-base64!', secret)).toBe(false);
    expect(verifyWebhookHmac(body, digest.slice(0, 20), secret)).toBe(false);
    expect(verifyWebhookHmac(body, undefined, secret)).toBe(false);
    expect(verifyWebhookHmac(body, digest, 'other-secret')).toBe(false);
  });
});
