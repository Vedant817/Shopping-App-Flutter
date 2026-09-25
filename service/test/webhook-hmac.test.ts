import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookHmac } from '../src/ingestion/webhooks.js';

describe('webhook HMAC', () => {
  it('verifies the exact raw request body', () => {
    const body = Buffer.from('{"id":123,"note":"café"}', 'utf8');
    const secret = 'webhook-secret';
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookHmac(body, digest, secret)).toBe(true);
    expect(verifyWebhookHmac(Buffer.from('{"id":123}'), digest, secret)).toBe(false);
  });

  it('rejects malformed and missing signatures', () => {
    const body = Buffer.from('{}');
    expect(verifyWebhookHmac(body, 'not-hex', 'secret')).toBe(false);
    expect(verifyWebhookHmac(body, undefined, 'secret')).toBe(false);
  });
});
