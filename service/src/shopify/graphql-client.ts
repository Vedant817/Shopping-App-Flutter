import { setTimeout as sleep } from 'node:timers/promises';
import { normalizeMyshopifyDomain } from './domain.js';

export type ShopifyGraphqlError = {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
};

export class ShopifyApiError extends Error {
  readonly status: number;
  readonly errors: ShopifyGraphqlError[];
  readonly retryAfterMs?: number;
  readonly throttleStatus?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(options: {
    message: string;
    status: number;
    errors?: ShopifyGraphqlError[];
    retryAfterMs?: number;
    throttleStatus?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(options.message);
    this.name = 'ShopifyApiError';
    this.status = options.status;
    this.errors = options.errors ?? [];
    this.retryAfterMs = options.retryAfterMs;
    this.throttleStatus = options.throttleStatus;
    this.requestId = options.requestId;
  }

  get isThrottled(): boolean {
    return this.status === 429 || this.errors.some((error) => error.extensions?.code === 'THROTTLED');
  }
}

type Fetch = typeof fetch;

export type ShopifyGraphqlClientOptions = {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
  fetchImpl?: Fetch;
  minRequestIntervalMs?: number;
  maxRetries?: number;
};

export type GraphqlConnection<T> = {
  edges?: Array<{ cursor: string; node: T }>;
  nodes?: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export type GraphqlPage<T> = {
  nodes: T[];
  edges?: Array<{ cursor: string; node: T }>;
  endCursor: string | null;
  hasNextPage: boolean;
};

export class ShopifyGraphqlClient {
  readonly shopDomain: string;
  readonly apiVersion: string;
  private readonly accessToken: string;
  private readonly fetchImpl: Fetch;
  private readonly minRequestIntervalMs: number;
  private readonly maxRetries: number;
  private lastRequestAt = 0;

  constructor(options: ShopifyGraphqlClientOptions) {
    this.shopDomain = normalizeMyshopifyDomain(options.shopDomain);
    if (!/^\d{4}-(01|04|07|10)$/.test(options.apiVersion)) throw new Error('A supported Shopify API version is required');
    if (!options.accessToken) throw new Error('Shopify access token is required');
    this.accessToken = options.accessToken;
    this.apiVersion = options.apiVersion;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 100;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async execute<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await this.executeOnce<T>(query, variables);
      } catch (error) {
        if (!(error instanceof ShopifyApiError) || !error.isThrottled || attempt >= this.maxRetries) throw error;
        await sleep(error.retryAfterMs ?? Math.min(30000, 500 * 2 ** attempt));
        attempt += 1;
      }
    }
  }

  private async executeOnce<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (this.minRequestIntervalMs > 0) {
      const wait = this.lastRequestAt + this.minRequestIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
    }
    this.lastRequestAt = Date.now();
    const response = await this.fetchImpl(`https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-shopify-access-token': this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await parseResponse(response);
    const errors = readGraphqlErrors(payload);
    const throttleStatus = readThrottleStatus(payload);
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    if (!response.ok || errors.length > 0) {
      throw new ShopifyApiError({
        message: errors[0]?.message ?? `Shopify Admin API request failed with status ${response.status}`,
        status: response.status,
        errors,
        retryAfterMs,
        throttleStatus,
        requestId: response.headers.get('x-request-id') ?? undefined,
      });
    }
    if (!isRecord(payload) || !isRecord(payload.data)) {
      throw new ShopifyApiError({ message: 'Shopify Admin API returned an invalid response', status: response.status });
    }
    return payload.data as T;
  }

  async forEachPage<T>(
    query: string,
    variables: Record<string, unknown>,
    selectConnection: (data: T) => GraphqlConnection<unknown>,
    onPage: (page: GraphqlPage<unknown>) => Promise<void>,
  ): Promise<void> {
    let after = typeof variables.after === 'string' ? variables.after : null;
    let hasNextPage = true;
    while (hasNextPage) {
      const data: T = await this.execute<T>(query, { ...variables, after });
      const connection = selectConnection(data);
      const nodes = connection.nodes ?? connection.edges?.map((edge) => edge.node) ?? [];
      await onPage({ nodes, edges: connection.edges, endCursor: connection.pageInfo.endCursor, hasNextPage: connection.pageInfo.hasNextPage });
      hasNextPage = connection.pageInfo.hasNextPage;
      if (hasNextPage && !connection.pageInfo.endCursor) {
        throw new ShopifyApiError({ message: 'Shopify pagination omitted its cursor', status: 502 });
      }
      after = connection.pageInfo.endCursor;
    }
  }

  async paginate<T>(
    query: string,
    variables: Record<string, unknown>,
    selectConnection: (data: T) => GraphqlConnection<unknown>,
  ): Promise<Array<{ cursor: string; node: unknown; endCursor: string | null }>> {
    const result: Array<{ cursor: string; node: unknown; endCursor: string | null }> = [];
    let fallbackCursorIndex = 0;
    await this.forEachPage(query, variables, selectConnection, async (page) => {
      if (page.edges) {
        page.edges.forEach((edge) => result.push({ cursor: edge.cursor, node: edge.node, endCursor: page.endCursor }));
        return;
      }
      page.nodes.forEach((node) => {
        result.push({ cursor: String(fallbackCursorIndex), node, endCursor: page.endCursor });
        fallbackCursorIndex += 1;
      });
    });
    return result;
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGraphqlErrors(payload: unknown): ShopifyGraphqlError[] {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return [];
  return payload.errors.filter(isRecord).map((error) => ({
    message: typeof error.message === 'string' ? error.message : 'Shopify GraphQL error',
    path: Array.isArray(error.path) ? error.path.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number') : undefined,
    extensions: isRecord(error.extensions) ? error.extensions : undefined,
  }));
}

function readThrottleStatus(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload) || !isRecord(payload.extensions) || !isRecord(payload.extensions.cost)) return undefined;
  const status = payload.extensions.cost.throttleStatus;
  return isRecord(status) ? status : undefined;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
