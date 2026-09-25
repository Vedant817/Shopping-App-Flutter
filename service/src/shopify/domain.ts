const shopLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidMyshopifyDomain(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length > 253 || value !== value.toLowerCase()) return false;
  if (value.includes('..') || value.includes('--')) return false;
  const suffix = '.myshopify.com';
  if (!value.endsWith(suffix)) return false;
  const label = value.slice(0, -suffix.length);
  return shopLabel.test(label);
}

export function normalizeMyshopifyDomain(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isValidMyshopifyDomain(normalized)) {
    throw new Error('Invalid Shopify shop domain');
  }
  return normalized;
}

export function parseShopHost(value: string): string {
  if (value.includes('://') && !value.toLowerCase().startsWith('https://')) throw new Error('Invalid Shopify shop host');
  const authority = value.includes('://') ? value.slice(value.indexOf('://') + 3).split('/')[0] ?? '' : value.split('/')[0] ?? '';
  if (authority.includes('@') || authority.includes(':')) throw new Error('Invalid Shopify shop host');
  let parsed: URL;
  try {
    parsed = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error('Invalid Shopify shop host');
  }
  if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Invalid Shopify shop host');
  }
  return normalizeMyshopifyDomain(parsed.hostname);
}
