import type { ShopifyGraphqlClient } from './graphql-client.js';

/**
 * App-scoped topics registered through the Admin API at install time.
 *
 * `shopify.app.toml` is the declared source of truth, but a config change only
 * reaches a store when a new app version is released and the merchant accepts
 * it. Until then the store keeps whatever topics it was installed with, which
 * is how an app passes every test and still never hears about a new order. So
 * the install callback also declares the operational set directly, which takes
 * effect immediately and is re-asserted on every reinstall.
 *
 * `events/*` and `custom_events/*` are deliberately absent: Shopify only allows
 * those on a per-event subscription, not as an app-wide topic. The webhook
 * endpoint still accepts them, so a subscription created that way works.
 */
export const ADMIN_API_WEBHOOK_TOPICS = [
  'app/uninstalled',
  'products/create',
  'products/update',
  'products/delete',
  'customers/create',
  'customers/update',
  'customers/delete',
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'orders/fulfilled',
  'orders/paid',
  'refunds/create',
] as const;

/**
 * Topics that cannot be registered through the Admin API.
 *
 * Shopify removed the mandatory GDPR topics from the `WebhookSubscriptionTopic`
 * enum in the 2026-07 Admin API, so there is no mutation that can create them.
 * They exist only as an app-config declaration, which means they take effect
 * when a new app version is released rather than at install time. They are
 * listed here so the install callback can report the gap instead of silently
 * pretending the store is fully covered.
 */
export const APP_CONFIG_ONLY_WEBHOOK_TOPICS = [
  'customers/data_request',
  'customers/redact',
  'privacy/delete',
  'shop/redact',
] as const;

const MUTATION = `
  mutation ThreadlineRegisterWebhook($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
      userErrors { field message }
      webhookSubscription { id topic }
    }
  }
`;

export type WebhookRegistrationResult = {
  registered: string[];
  alreadyPresent: string[];
  failed: { topic: string; message: string }[];
  /**
   * Topics Shopify refused because the app lacks protected customer data
   * approval. These are not defects: they clear automatically the moment the
   * app is approved, and the next install re-registers them.
   */
  awaitingApproval: string[];
  appConfigOnly: string[];
};

function isAlreadyPresent(message: string): boolean {
  return /already|exists|duplicate|taken/i.test(message);
}

function isProtectedDataBlock(message: string): boolean {
  return /protected customer data/i.test(message);
}

/**
 * Converts a webhook topic as it appears in the `X-Shopify-Topic` header
 * (`orders/paid`) into the `WebhookSubscriptionTopic` enum name the Admin API
 * expects (`ORDERS_PAID`). The two spellings are not interchangeable, and
 * passing the header form is rejected as an invalid enum variable.
 */
export function toSubscriptionTopicEnum(topic: string): string {
  return topic.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * Declares every Admin-API-capable app-scoped topic for this shop.
 *
 * The mutation takes a single topic, so each one is registered separately. A
 * failure on one topic must not cost the rest: a missing `orders/create` matters
 * far more than the `orders/fulfilled` that comes after it. Registering a topic
 * that already exists comes back as a user error, which is treated as success.
 */
export async function registerAppWebhooks(
  client: ShopifyGraphqlClient,
  callbackUrl: string,
): Promise<WebhookRegistrationResult> {
  const result: WebhookRegistrationResult = {
    registered: [],
    alreadyPresent: [],
    failed: [],
    awaitingApproval: [],
    appConfigOnly: [...APP_CONFIG_ONLY_WEBHOOK_TOPICS],
  };

  for (const topic of ADMIN_API_WEBHOOK_TOPICS) {
    try {
      const data = await client.execute<{
        webhookSubscriptionCreate: {
          userErrors: { field?: string[] | null; message: string }[];
          webhookSubscription: { id: string; topic: string } | null;
        } | null;
      }>(MUTATION, { topic: toSubscriptionTopicEnum(topic), uri: callbackUrl });

      const payload = data.webhookSubscriptionCreate;
      if (!payload) {
        result.failed.push({ topic, message: 'Shopify returned no subscription result' });
        continue;
      }
      const errors = payload.userErrors ?? [];
      if (errors.length === 0) {
        if (payload.webhookSubscription) result.registered.push(topic);
        else result.failed.push({ topic, message: 'Shopify accepted the request without returning a subscription' });
        continue;
      }
      // Every reported error refers to the single topic just submitted.
      const messages = errors.map((error) => error.message);
      if (messages.every(isAlreadyPresent)) {
        result.alreadyPresent.push(topic);
      } else if (messages.every(isProtectedDataBlock)) {
        result.awaitingApproval.push(topic);
      } else {
        result.failed.push({ topic, message: messages.join('; ') });
      }
    } catch (error) {
      result.failed.push({ topic, message: error instanceof Error ? error.message : 'unknown error' });
    }
  }

  return result;
}

/** Absolute webhook URL for a shop, derived from the public API base URL. */
export function webhookCallbackUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/v1/webhooks/shopify`;
}
