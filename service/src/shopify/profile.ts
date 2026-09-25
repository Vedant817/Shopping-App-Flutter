import { ShopifyGraphqlClient } from './graphql-client.js';

const SHOP_PROFILE_QUERY = `#graphql
  query BackendShopProfile {
    shop {
      id
      name
      currencyCode
      timezone
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
  if (typeof shop.id !== 'string' || typeof shop.name !== 'string' || typeof shop.currencyCode !== 'string' || typeof shop.timezone !== 'string') {
    throw new Error('Shopify shop profile is incomplete');
  }
  const primaryDomain = typeof shop.primaryDomain === 'object' && shop.primaryDomain !== null ? shop.primaryDomain as Record<string, unknown> : undefined;
  return {
    id: shop.id,
    name: shop.name,
    currencyCode: shop.currencyCode,
    timeZone: shop.timezone,
    primaryDomainUrl: typeof primaryDomain?.url === 'string' ? primaryDomain.url : undefined,
  };
}
