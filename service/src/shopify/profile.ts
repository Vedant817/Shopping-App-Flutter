import { ShopifyGraphqlClient } from './graphql-client.js';

const SHOP_PROFILE_QUERY = `#graphql
  query BackendShopProfile {
    shop {
      id
      name
      currencyCode
      ianaTimezone
      primaryDomain { url }
    }
  }
`;

export type ShopifyShopProfile = {
  id: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  primaryDomainUrl?: string;
};

export async function fetchShopProfile(client: ShopifyGraphqlClient): Promise<ShopifyShopProfile> {
  const data = await client.execute<{ shop: Record<string, unknown> }>(SHOP_PROFILE_QUERY);
  const shop = data.shop;
  if (typeof shop.id !== 'string' || typeof shop.name !== 'string' || typeof shop.currencyCode !== 'string') {
    throw new Error('Shopify shop profile is incomplete');
  }
  // ianaTimezone replaced timezone on Shop. It is nullable, so a store without
  // one configured falls back to UTC rather than failing the install.
  const ianaTimezone = typeof shop.ianaTimezone === 'string' ? shop.ianaTimezone.trim() : '';
  const primaryDomain = typeof shop.primaryDomain === 'object' && shop.primaryDomain !== null ? shop.primaryDomain as Record<string, unknown> : undefined;
  return {
    id: shop.id,
    name: shop.name,
    currencyCode: shop.currencyCode,
    timeZone: ianaTimezone || 'UTC',
    primaryDomainUrl: typeof primaryDomain?.url === 'string' ? primaryDomain.url : undefined,
  };
}
