import { describe, expect, it } from 'vitest';
import { processCustomerDataRequest, redactCustomer } from '../src/ingestion/compliance.js';

describe('privacy compliance jobs', () => {
  it('creates an idempotent customer export payload', async () => {
    const statements: unknown[] = [];
    const db = { execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } };
    await processCustomerDataRequest(db as never, { workspaceId: 'workspace-1', webhookId: 'hook-1', customerId: 'customer-1', topic: 'customers/data_request' });
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('compliance_exports');
    expect(serialized).toContain('orderLines');
    expect(serialized).toContain('privacy.data_request_completed');
  });

  it('redacts customer-linked data while retaining order records', async () => {
    const statements: unknown[] = [];
    const db = {
      execute: async (query: unknown) => { statements.push(query); return { rows: [] }; },
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ execute: async (query: unknown) => { statements.push(query); return { rows: [] }; } }),
    };
    await redactCustomer(db as never, { workspaceId: 'workspace-1', webhookId: 'hook-2', customerId: 'customer-1', topic: 'customers/redact' });
    const serialized = JSON.stringify(statements);
    expect(serialized).toContain('update orders set customer_id = null');
    expect(serialized).toContain('update customers set email = null');
    expect(serialized).toContain('delete from custom_events');
  });
});
