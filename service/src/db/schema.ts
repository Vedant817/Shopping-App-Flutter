import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const appUsers = pgTable('app_users', {
  id: text('id').primaryKey(),
  email: text('email'),
  createdAt,
  updatedAt,
});

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  shopDomain: text('shop_domain').notNull(),
  name: text('name').notNull(),
  currencyCode: text('currency_code').notNull(),
  timeZone: text('time_zone').notNull(),
  shopifyShopId: text('shopify_shop_id'),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  uninstalledAt: timestamp('uninstalled_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('workspaces_shop_domain_unique').on(table.shopDomain),
  index('workspaces_updated_at_idx').on(table.updatedAt),
]);

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }),
  check('workspace_members_role_check', sql`role in ('owner', 'admin', 'member', 'viewer')`),
  index('workspace_members_user_idx').on(table.userId),
]);

export const shopifyInstallations = pgTable('shopify_installations', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  encryptedOfflineToken: text('encrypted_offline_token').notNull(),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  reauthorizeRequiredAt: timestamp('reauthorize_required_at', { withTimezone: true }),
  scopes: text('scopes').array().notNull(),
  apiVersion: text('api_version').notNull(),
  installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  uninstalledAt: timestamp('uninstalled_at', { withTimezone: true }),
  createdAt,
  updatedAt,
});

export const oauthStates = pgTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => appUsers.id, { onDelete: 'set null' }),
  shopDomain: text('shop_domain').notNull(),
  codeVerifierEncrypted: text('code_verifier_encrypted').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  returnUrl: text('return_url').notNull(),
  createdAt,
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
});

export const syncCursors = pgTable('sync_cursors', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  resource: text('resource').notNull(),
  cursor: text('cursor'),
  watermarkAt: timestamp('watermark_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.resource] }),
]);

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  resource: text('resource').notNull(),
  status: text('status').notNull().default('running'),
  cursorFrom: text('cursor_from'),
  cursorTo: text('cursor_to'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
  stats: jsonb('stats').$type<Record<string, number>>().notNull().default({}),
  createdAt,
}, (table) => [
  index('sync_runs_workspace_started_idx').on(table.workspaceId, table.startedAt),
  index('sync_runs_status_idx').on(table.status),
]);

export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  resource: text('resource').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
  lastError: text('last_error'),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('ingestion_jobs_workspace_idempotency_unique').on(table.workspaceId, table.idempotencyKey),
  index('ingestion_jobs_claim_idx').on(table.status, table.availableAt, table.createdAt),
  index('ingestion_jobs_stale_lock_idx').on(table.status, table.lockedAt),
]);

export const ingestionJobResources = pgTable('ingestion_job_resources', {
  jobId: uuid('job_id').notNull().references(() => ingestionJobs.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  resource: text('resource').notNull(),
  status: text('status').notNull().default('queued'),
  cursorFrom: text('cursor_from'),
  cursorTo: text('cursor_to'),
  recordsRead: integer('records_read').notNull().default(0),
  recordsWritten: integer('records_written').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  error: text('error'),
  variantsComplete: boolean('variants_complete').notNull().default(false),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.jobId, table.resource] }),
  index('ingestion_job_resources_workspace_status_idx').on(table.workspaceId, table.status),
]);

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: text('webhook_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  shopDomain: text('shop_domain').notNull(),
  topic: text('topic').notNull(),
  apiVersion: text('api_version'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  hmac: text('hmac').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  status: text('status').notNull().default('queued'),
  error: text('error'),
}, (table) => [
  uniqueIndex('webhook_events_webhook_id_unique').on(table.webhookId),
  index('webhook_events_workspace_received_idx').on(table.workspaceId, table.receivedAt),
  index('webhook_events_status_idx').on(table.status),
]);

export const products = pgTable('products', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  title: text('title').notNull(),
  handle: text('handle'),
  description: text('description'),
  descriptionHtml: text('description_html'),
  category: text('category'),
  variantsComplete: boolean('variants_complete').notNull().default(false),
  vendor: text('vendor'),
  productType: text('product_type'),
  status: text('status').notNull(),
  tags: text('tags').array().notNull().default([]),
  totalInventory: integer('total_inventory'),
  featuredImageUrl: text('featured_image_url'),
  onlineStoreUrl: text('online_store_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  shopifyCreatedAt: timestamp('shopify_created_at', { withTimezone: true }),
  shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('products_workspace_updated_idx').on(table.workspaceId, table.updatedAt, table.id),
  index('products_workspace_status_idx').on(table.workspaceId, table.status),
  index('products_workspace_category_idx').on(table.workspaceId, table.category, table.updatedAt, table.id),
]);

export const productVariants = pgTable('product_variants', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  id: text('id').notNull(),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
  sku: text('sku'),
  barcode: text('barcode'),
  price: numeric('price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  compareAtPrice: numeric('compare_at_price', { precision: 18, scale: 4, mode: 'string' }),
  inventoryQuantity: integer('inventory_quantity'),
  inventoryPolicy: text('inventory_policy'),
  taxable: boolean('taxable'),
  imageUrl: text('image_url'),
  optionValues: jsonb('option_values').$type<Array<{ name: string; value: string }>>().notNull().default([]),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('product_variants_workspace_product_idx').on(table.workspaceId, table.productId),
]);

export const customers = pgTable('customers', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  email: text('email'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  company: text('company'),
  city: text('city'),
  province: text('province'),
  country: text('country'),
  state: text('state'),
  verifiedEmail: boolean('verified_email'),
  ordersCount: integer('orders_count'),
  totalSpent: numeric('total_spent', { precision: 18, scale: 4, mode: 'string' }),
  defaultAddress: jsonb('default_address').$type<Record<string, unknown> | null>(),
  avatarUrl: text('avatar_url'),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  shopifyCreatedAt: timestamp('shopify_created_at', { withTimezone: true }),
  shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('customers_workspace_updated_idx').on(table.workspaceId, table.updatedAt, table.id),
  index('customers_workspace_email_idx').on(table.workspaceId, table.email),
  index('customers_workspace_name_idx').on(table.workspaceId, table.lastName, table.firstName, table.id),
]);

export const orders = pgTable('orders', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  name: text('name'),
  orderNumber: integer('order_number'),
  customerId: text('customer_id'),
  email: text('email'),
  financialStatus: text('financial_status'),
  fulfillmentStatus: text('fulfillment_status'),
  currencyCode: text('currency_code').notNull(),
  subtotalPrice: numeric('subtotal_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalDiscounts: numeric('total_discounts', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalTax: numeric('total_tax', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalPrice: numeric('total_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalUnits: integer('total_units').notNull().default(0),
  sourceName: text('source_name'),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  shopifyCreatedAt: timestamp('shopify_created_at', { withTimezone: true }),
  shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('orders_workspace_processed_idx').on(table.workspaceId, table.processedAt, table.id),
  index('orders_workspace_created_idx').on(table.workspaceId, table.shopifyCreatedAt, table.id),
  index('orders_workspace_customer_idx').on(table.workspaceId, table.customerId, table.shopifyCreatedAt, table.id),
  index('orders_workspace_status_idx').on(table.workspaceId, table.financialStatus, table.fulfillmentStatus),
]);

export const orderLines = pgTable('order_lines', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  orderId: text('order_id').notNull(),
  id: text('id').notNull(),
  productId: text('product_id'),
  variantId: text('variant_id'),
  title: text('title').notNull(),
  variantTitle: text('variant_title'),
  sku: text('sku'),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalDiscount: numeric('total_discount', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalPrice: numeric('total_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.orderId, table.id] }),
  index('order_lines_workspace_product_idx').on(table.workspaceId, table.productId),
  index('order_lines_workspace_order_idx').on(table.workspaceId, table.orderId),
]);

export const carts = pgTable('carts', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  customerId: text('customer_id'),
  currencyCode: text('currency_code').notNull(),
  totalPrice: numeric('total_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  subtotalPrice: numeric('subtotal_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalQuantity: integer('total_quantity').notNull().default(0),
  abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('carts_workspace_updated_idx').on(table.workspaceId, table.shopifyUpdatedAt, table.id),
]);

export const cartLines = pgTable('cart_lines', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  cartId: text('cart_id').notNull(),
  id: text('id').notNull(),
  productId: text('product_id'),
  variantId: text('variant_id'),
  title: text('title').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalPrice: numeric('total_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.cartId, table.id] }),
  index('cart_lines_workspace_product_idx').on(table.workspaceId, table.productId),
]);

export const checkouts = pgTable('checkouts', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  cartId: text('cart_id'),
  customerId: text('customer_id'),
  email: text('email'),
  currencyCode: text('currency_code').notNull(),
  totalPrice: numeric('total_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  subtotalPrice: numeric('subtotal_price', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  totalQuantity: integer('total_quantity').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  shopifyCreatedAt: timestamp('shopify_created_at', { withTimezone: true }),
  shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('checkouts_workspace_updated_idx').on(table.workspaceId, table.shopifyUpdatedAt, table.id),
]);

export const customEvents = pgTable('custom_events', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  eventType: text('event_type').notNull(),
  customerId: text('customer_id'),
  sessionId: text('session_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('custom_events_workspace_occurred_idx').on(table.workspaceId, table.occurredAt, table.id),
  index('custom_events_workspace_type_idx').on(table.workspaceId, table.eventType),
]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
  actorUserId: text('actor_user_id').references(() => appUsers.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  requestId: text('request_id'),
  createdAt,
}, (table) => [
  index('audit_events_workspace_created_idx').on(table.workspaceId, table.createdAt),
  index('audit_events_actor_created_idx').on(table.actorUserId, table.createdAt),
]);

export const refunds = pgTable('refunds', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  orderId: text('order_id').notNull(),
  note: text('note'),
  totalAmount: numeric('total_amount', { precision: 18, scale: 4, mode: 'string' }).notNull(),
  currencyCode: text('currency_code').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  shopifyCreatedAt: timestamp('shopify_created_at', { withTimezone: true }),
  shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
  updatedAt,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('refunds_workspace_order_idx').on(table.workspaceId, table.orderId),
  index('refunds_workspace_processed_idx').on(table.workspaceId, table.processedAt),
]);

export const complianceExports = pgTable('compliance_exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  webhookId: text('webhook_id').notNull(),
  customerId: text('customer_id').notNull(),
  status: text('status').notNull().default('queued'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  error: text('error'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt,
  updatedAt,
}, (table) => [
  uniqueIndex('compliance_exports_workspace_webhook_unique').on(table.workspaceId, table.webhookId),
  index('compliance_exports_workspace_customer_idx').on(table.workspaceId, table.customerId),
]);

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
  processedJobs: integer('processed_jobs').notNull().default(0),
  failedJobs: integer('failed_jobs').notNull().default(0),
  retryCount: integer('retry_count').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const serviceMetadata = pgTable('service_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt,
});

export const schema = {
  appUsers,
  workspaces,
  workspaceMembers,
  shopifyInstallations,
  oauthStates,
  syncCursors,
  syncRuns,
  ingestionJobs,
  ingestionJobResources,
  webhookEvents,
  products,
  productVariants,
  customers,
  orders,
  orderLines,
  carts,
  cartLines,
  checkouts,
  customEvents,
  auditEvents,
  refunds,
  complianceExports,
  workerHeartbeats,
  serviceMetadata,
};
