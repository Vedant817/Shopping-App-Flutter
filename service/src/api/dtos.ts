import type { WorkspaceCapabilities, WorkspaceRole } from '../auth/tenant.js';

export type WorkspaceDto = {
  id: string;
  shopDomain: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  role: WorkspaceRole;
  capabilities: WorkspaceCapabilities;
};

export type PeriodDemand = {
  from: string;
  to: string;
  revenue: string;
  units: number;
  orderCount: number;
  currencyCode: string;
  metricBasis: 'gross_non_cancelled_order_value';
};

export type ProductVariantOptionDto = {
  name: string;
  value: string;
};

export type ProductVariantDto = {
  id: string;
  title: string;
  position: number;
  sku: string | null;
  barcode: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  taxable: boolean | null;
  imageUrl: string | null;
  options: ProductVariantOptionDto[];
};

export type ProductDto = {
  id: string;
  title: string;
  handle: string | null;
  description: string | null;
  category: string | null;
  vendor: string | null;
  sku: string | null;
  skus: string[];
  productType: string | null;
  status: string;
  tags: string[];
  thumbnail: string | null;
  priceMin: string | null;
  priceMax: string | null;
  inventoryQuantity: number | null;
  variantCount: number;
  variantsTruncated: boolean;
  variants: ProductVariantDto[];
  updatedAt: string;
};

export type CustomerDto = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  company: string | null;
  ordersCount: number | null;
  totalSpent: string | null;
  periodSpend: string | null;
  periodOrderCount: number | null;
  avatarUrl: string | null;
  updatedAt: string;
};

export type OrderDto = {
  id: string;
  name: string | null;
  orderNumber: number | null;
  customerId: string | null;
  email: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currencyCode: string;
  subtotalPrice: string;
  totalDiscounts: string;
  totalTax: string;
  totalPrice: string;
  totalUnits: number;
  orderedAt: string;
  cancelledAt: string | null;
  updatedAt: string;
};

export type CheckoutDto = {
  id: string;
  cartId: string | null;
  customerId: string | null;
  email: string | null;
  currencyCode: string;
  subtotalPrice: string;
  totalPrice: string;
  totalUnits: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type DataQualityDto = {
  productMediaCoverage: string;
  customerMediaCoverage: string;
  customerEmailCoverage: string;
  stockCoverage: string;
  linkedOrderCustomerRate: string;
  linkedOrderCustomers: number;
  orderCount: number;
};

export type JobResourceStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export type JobResourceDto = {
  resource: string;
  status: JobResourceStatus;
  cursorFrom: string | null;
  cursorTo: string | null;
  recordsRead: number;
  recordsWritten: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  variantsTruncated: boolean;
};

export type IngestionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export type IngestionJobDto = {
  jobId: string;
  workspaceId: string;
  resource: string;
  status: IngestionJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  resources: JobResourceDto[];
};

export type SyncDto = {
  jobId: string | null;
  status: 'idle' | IngestionJobStatus;
  resource: string | null;
  attempts: number;
  maxAttempts: number;
  startedAt: string | null;
  completedAt: string | null;
  cursor: string | null;
  watermark: string | null;
  lastSyncedAt: string | null;
  error: string | null;
  resources: JobResourceDto[];
};

export type DecisionDto = {
  code: string;
  title: string;
  description: string;
  priority: 'positive' | 'attention' | 'information';
  evidence: Record<string, string | number | boolean | null>;
};

export type OverviewDto = {
  workspace: WorkspaceDto;
  range: { from: string; to: string; preset: string };
  generatedAt: string;
  currencyCode: string;
  metricBasis: 'gross_non_cancelled_order_value';
  metrics: {
    revenue: string;
    averageOrderValue: string;
    orderCount: number;
    customerCount: number;
    units: number;
    discountRate: string;
    currencyCode: string;
    metricBasis: 'gross_non_cancelled_order_value';
  };
  trend: Array<{ date: string; revenue: string }>;
  topCustomers: Array<{ customer: CustomerDto; spend: string; orderCount: number; units: number }>;
  decisions: DecisionDto[];
  dataQuality: DataQualityDto;
  sync: SyncDto;
};
