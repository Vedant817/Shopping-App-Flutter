import { describe, expect, it } from 'vitest';
import { upsertCheckoutWithExecutor, upsertCustomerWithExecutor, upsertOrderWithExecutor, upsertRefund } from '../src/db/upserts.js';

describe('Shopify 2026-07 payload normalization', () => {
  it('accepts current customer, order, refund, and abandoned checkout shapes', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => {
        statements.push(query);
        return { rows: [] };
      },
    };

    await upsertCustomerWithExecutor(db as never, 'workspace-1', {
      id: 'gid://shopify/Customer/1',
      defaultEmailAddress: { emailAddress: 'customer@example.test' },
      firstName: 'Ada',
      lastName: 'Lovelace',
      defaultPhoneNumber: null,
      state: 'CA',
      verifiedEmail: true,
      numberOfOrders: 3,
      amountSpent: { amount: '100.0000', currencyCode: 'USD' },
      image: { url: 'https://cdn.example.test/customer.png' },
      defaultAddress: { city: 'London' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    await upsertOrderWithExecutor(db as never, 'workspace-1', {
      id: 'gid://shopify/Order/1',
      name: '#1001',
      number: 1001,
      email: 'customer@example.test',
      displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'FULFILLED',
      currencyCode: 'USD',
      subtotalPriceSet: { shopMoney: { amount: '30.0000', currencyCode: 'USD' } },
      totalDiscountsSet: { shopMoney: { amount: '0.0000', currencyCode: 'USD' } },
      totalTaxSet: { shopMoney: { amount: '0.0000', currencyCode: 'USD' } },
      totalPriceSet: { shopMoney: { amount: '30.0000', currencyCode: 'USD' } },
      subtotalLineItemsQuantity: 2,
      sourceName: 'web',
      processedAt: '2026-01-02T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      cancelledAt: null,
      customer: { id: 'gid://shopify/Customer/1' },
      lineItems: {
        nodes: [{
          id: 'gid://shopify/LineItem/1',
          title: 'Widget',
          quantity: 2,
          originalUnitPriceSet: { shopMoney: { amount: '15.0000', currencyCode: 'USD' } },
          totalDiscountSet: { shopMoney: { amount: '0.0000', currencyCode: 'USD' } },
          discountedTotalSet: { shopMoney: { amount: '30.0000', currencyCode: 'USD' } },
        }],
      },
    }, { replaceLines: true });
    await upsertRefund(db as never, 'workspace-1', {
      id: 'gid://shopify/Refund/1',
      order: { id: 'gid://shopify/Order/1', currencyCode: 'USD' },
      totalRefundedSet: { shopMoney: { amount: '5.0000', currencyCode: 'USD' } },
      createdAt: '2026-01-02T00:00:00Z',
    });
    await upsertCheckoutWithExecutor(db as never, 'workspace-1', {
      id: 'gid://shopify/AbandonedCheckout/1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      totalPriceSet: { shopMoney: { amount: '50.0000', currencyCode: 'USD' } },
      subtotalPriceSet: { shopMoney: { amount: '45.0000', currencyCode: 'USD' } },
      customer: { id: 'gid://shopify/Customer/1', defaultEmailAddress: { emailAddress: 'customer@example.test' } },
      lineItems: { nodes: [{ id: 'line-1', quantity: 2 }] },
    });

    expect(statements).toHaveLength(6);
    expect(JSON.stringify(statements)).toContain('customers');
    expect(JSON.stringify(statements)).toContain('checkouts');
    expect(JSON.stringify(statements)).toContain('customer@example.test');
  });

  it('falls back to legacy scalar money fields when only deprecated shapes are present', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => {
        statements.push(query);
        return { rows: [] };
      },
    };

    await upsertOrderWithExecutor(db as never, 'workspace-1', {
      id: 'gid://shopify/Order/2',
      name: '#1002',
      orderNumber: 1002,
      financialStatus: 'PAID',
      currencyCode: 'USD',
      subtotalPrice: '12.0000',
      totalDiscounts: '0.0000',
      totalTax: '0.0000',
      totalPrice: '12.0000',
      totalUnits: 1,
      lineItems: {
        nodes: [{
          id: 'gid://shopify/LineItem/2',
          title: 'Gadget',
          quantity: 1,
          originalUnitPrice: '12.0000',
          totalDiscount: '0.0000',
          totalPrice: '12.0000',
        }],
      },
    });

    expect(statements).toHaveLength(2);
    expect(JSON.stringify(statements)).toContain('12.0000');
  });
});
