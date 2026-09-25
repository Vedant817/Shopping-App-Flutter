import { describe, expect, it } from 'vitest';
import { isValidMyshopifyDomain, normalizeMyshopifyDomain, parseShopHost } from '../src/shopify/domain.js';

describe('Shopify shop validation', () => {
  it('accepts one strict myshopify label', () => {
    expect(isValidMyshopifyDomain('example-shop.myshopify.com')).toBe(true);
    expect(normalizeMyshopifyDomain('example-shop.myshopify.com')).toBe('example-shop.myshopify.com');
    expect(parseShopHost('https://example-shop.myshopify.com/')).toBe('example-shop.myshopify.com');
  });

  it('rejects lookalike domains and URL components', () => {
    for (const value of [
      'example-shop.myshopify.com.evil.test',
      'shop.example.myshopify.com',
      'example_shop.myshopify.com',
      'example--shop.myshopify.com',
      'example-shop.myshopify.com.',
      'https://example-shop.myshopify.com/path',
      'example-shop.myshopify.com:443',
    ]) {
      expect(isValidMyshopifyDomain(value)).toBe(false);
      if (value.includes('://') || value.includes('/') || value.includes(':')) expect(() => parseShopHost(value)).toThrow();
      if (value.endsWith('.')) expect(() => normalizeMyshopifyDomain(value)).toThrow();
    }
  });
});
