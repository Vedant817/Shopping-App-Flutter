import { describe, expect, it } from 'vitest';
import {
  ADMIN_API_WEBHOOK_TOPICS,
  APP_CONFIG_ONLY_WEBHOOK_TOPICS,
  registerAppWebhooks,
  toSubscriptionTopicEnum,
  webhookCallbackUrl,
} from '../src/shopify/webhook-registration.js';
import { SHOPIFY_WEBHOOK_TOPICS } from '../src/ingestion/webhooks.js';

function clientReturning(payloadFor: (topic: string) => unknown) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    client: {
      execute: async (_query: string, variables: Record<string, unknown> = {}) => {
        calls.push(variables);
        return payloadFor(String(variables.topic));
      },
    } as never,
  };
}

const created = (topic: string) => ({
  webhookSubscriptionCreate: {
    userErrors: [],
    webhookSubscription: { id: `gid://shopify/WebhookSubscription/${topic}`, topic },
  },
});

const userError = (topic: string, message: string) => ({
  webhookSubscriptionCreate: { userErrors: [{ field: ['topic'], message }], webhookSubscription: null },
});

const PROTECTED = 'This app is not approved to subscribe to webhook topics containing protected customer data.';

describe('app webhook registration', () => {
  it('only asks for topics the webhook endpoint would accept', () => {
    for (const topic of ADMIN_API_WEBHOOK_TOPICS) {
      expect(SHOPIFY_WEBHOOK_TOPICS.has(topic)).toBe(true);
    }
  });

  it('converts header topic names into the Admin API enum spelling', () => {
    // The mutation rejects `orders/paid`; it only accepts ORDERS_PAID.
    expect(toSubscriptionTopicEnum('orders/paid')).toBe('ORDERS_PAID');
    expect(toSubscriptionTopicEnum('app/uninstalled')).toBe('APP_UNINSTALLED');
    expect(toSubscriptionTopicEnum('refunds/create')).toBe('REFUNDS_CREATE');
  });

  it('registers every operational topic on a clean store', async () => {
    const { client, calls } = clientReturning((topic) => created(topic));
    const result = await registerAppWebhooks(client, 'https://api.example.com/v1/webhooks/shopify');
    expect(result.registered.sort()).toEqual([...ADMIN_API_WEBHOOK_TOPICS].sort());
    expect(result.failed).toEqual([]);
    expect(calls).toHaveLength(ADMIN_API_WEBHOOK_TOPICS.length);
    expect(calls.every((call) => call.uri === 'https://api.example.com/v1/webhooks/shopify')).toBe(true);
  });

  it('treats an existing subscription as success so reinstalls stay idempotent', async () => {
    const { client } = clientReturning((topic) => userError(topic, 'Address has already been taken'));
    const result = await registerAppWebhooks(client, 'https://api.example.com/v1/webhooks/shopify');
    expect(result.registered).toEqual([]);
    expect(result.alreadyPresent).toHaveLength(ADMIN_API_WEBHOOK_TOPICS.length);
    expect(result.failed).toEqual([]);
  });

  it('separates approval blocks from real failures', async () => {
    // Protected customer data approval is a Partner review, not a code defect,
    // so it must not be reported as a failure that someone tries to "fix".
    const { client } = clientReturning((topic) =>
      topic.startsWith('ORDERS_') || topic === 'REFUNDS_CREATE' || topic === 'CUSTOMERS_CREATE' || topic === 'CUSTOMERS_UPDATE'
        ? userError(topic, PROTECTED)
        : created(topic),
    );
    const result = await registerAppWebhooks(client, 'https://api.example.com/v1/webhooks/shopify');
    expect(result.awaitingApproval.sort()).toEqual([
      'customers/create',
      'customers/update',
      'orders/cancelled',
      'orders/fulfilled',
      'orders/paid',
      'orders/updated',
      'orders/create',
      'refunds/create',
    ].sort());
    expect(result.failed).toEqual([]);
    expect(result.registered).toContain('products/create');
  });

  it('reports a genuinely rejected topic without losing the others', async () => {
    const { client } = clientReturning((topic) =>
      topic === 'PRODUCTS_CREATE' ? userError(topic, 'Address protocol http:// is not supported') : created(topic),
    );
    const result = await registerAppWebhooks(client, 'https://api.example.com/v1/webhooks/shopify');
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.topic).toBe('products/create');
    expect(result.registered).toHaveLength(ADMIN_API_WEBHOOK_TOPICS.length - 1);
  });

  it('keeps going when a topic throws so one failure cannot hide the rest', async () => {
    let call = 0;
    const client = {
      execute: async () => {
        call += 1;
        if (call === 1) throw new Error('network reset');
        return created(ADMIN_API_WEBHOOK_TOPICS[call - 1] ?? 'unknown');
      },
    } as never;
    const result = await registerAppWebhooks(client, 'https://api.example.com/v1/webhooks/shopify');
    expect(result.failed).toEqual([{ topic: 'app/uninstalled', message: 'network reset' }]);
    expect(result.registered).toHaveLength(ADMIN_API_WEBHOOK_TOPICS.length - 1);
  });

  it('lists the compliance topics that no Admin API mutation can create', () => {
    // Shopify dropped these from the WebhookSubscriptionTopic enum, so they can
    // only arrive through an app config release.
    expect(APP_CONFIG_ONLY_WEBHOOK_TOPICS).toEqual([
      'customers/data_request',
      'customers/redact',
      'privacy/delete',
      'shop/redact',
    ]);
    for (const topic of APP_CONFIG_ONLY_WEBHOOK_TOPICS) {
      expect(ADMIN_API_WEBHOOK_TOPICS).not.toContain(topic);
      expect(SHOPIFY_WEBHOOK_TOPICS.has(topic)).toBe(true);
    }
  });

  it('omits event topics, which Shopify only allows per subscription', () => {
    expect(ADMIN_API_WEBHOOK_TOPICS).not.toContain('events/create');
    expect(ADMIN_API_WEBHOOK_TOPICS).not.toContain('custom_events/create');
  });

  it('builds the callback url from the public base url', () => {
    expect(webhookCallbackUrl('https://api.example.com/')).toBe('https://api.example.com/v1/webhooks/shopify');
    expect(webhookCallbackUrl('https://api.example.com')).toBe('https://api.example.com/v1/webhooks/shopify');
  });
});
