import 'package:decimal/decimal.dart';

enum LoadStatus { idle, loading, ready, failure }

enum InsightRange {
  sevenDays('7d', '7D'),
  thirtyDays('30d', '30D'),
  ninetyDays('90d', '90D');

  const InsightRange(this.apiValue, this.label);

  final String apiValue;
  final String label;
}

enum JobStatus { queued, running, succeeded, failed, dead }

enum SyncStatus { idle, queued, running, succeeded, failed, dead }

enum DecisionPriority { positive, attention, information }

enum WorkspaceRole { owner, admin, member, viewer }

enum MetricBasis {
  grossNonCancelledOrderValue('gross_non_cancelled_order_value');

  const MetricBasis(this.wireName);

  final String wireName;
}

class WorkspaceCapabilitiesDto {
  const WorkspaceCapabilitiesDto({
    required this.canEnqueueSync,
    required this.canManageMembers,
    required this.canChangeOwnerRoles,
  });

  factory WorkspaceCapabilitiesDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceCapabilitiesDto(
      canEnqueueSync: _boolean(json, 'canEnqueueSync'),
      canManageMembers: _boolean(json, 'canManageMembers'),
      canChangeOwnerRoles:
          _optionalBoolean(json, 'canChangeOwnerRoles') ?? false,
    );
  }

  final bool canEnqueueSync;
  final bool canManageMembers;
  final bool canChangeOwnerRoles;
}

class WorkspaceDto {
  const WorkspaceDto({
    required this.id,
    required this.shopDomain,
    required this.name,
    required this.currencyCode,
    required this.timeZone,
    required this.role,
    required this.capabilities,
  });

  factory WorkspaceDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceDto(
      id: _string(json, 'id'),
      shopDomain: _string(json, 'shopDomain'),
      name: _string(json, 'name'),
      currencyCode: _string(json, 'currencyCode'),
      timeZone: _string(json, 'timeZone'),
      role: _enumByName(WorkspaceRole.values, json, 'role'),
      capabilities: WorkspaceCapabilitiesDto.fromJson(
        _object(json, 'capabilities'),
      ),
    );
  }

  final String id;
  final String shopDomain;
  final String name;
  final String currencyCode;
  final String timeZone;
  final WorkspaceRole role;
  final WorkspaceCapabilitiesDto capabilities;
}

class WorkspaceMemberDto {
  const WorkspaceMemberDto({
    required this.userId,
    required this.role,
    required this.email,
    required this.createdAt,
    required this.updatedAt,
  });

  factory WorkspaceMemberDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceMemberDto(
      userId: _string(json, 'userId'),
      role: _enumByName(WorkspaceRole.values, json, 'role'),
      email: _nullableString(json, 'email'),
      createdAt: _date(json, 'createdAt'),
      updatedAt: _date(json, 'updatedAt'),
    );
  }

  final String userId;
  final WorkspaceRole role;
  final String? email;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class WorkspaceMemberPageDto {
  const WorkspaceMemberPageDto({required this.items});

  factory WorkspaceMemberPageDto.fromJson(Map<String, dynamic> json) {
    return WorkspaceMemberPageDto(
      items: _list(
        json,
        'items',
      ).map(WorkspaceMemberDto.fromJson).toList(growable: false),
    );
  }

  final List<WorkspaceMemberDto> items;
}

class MembershipMutationDto {
  const MembershipMutationDto({
    required this.userId,
    required this.role,
    required this.status,
  });

  factory MembershipMutationDto.fromJson(Map<String, dynamic> json) {
    return MembershipMutationDto(
      userId: _string(json, 'userId'),
      role: json['role'] == null
          ? null
          : _enumByName(WorkspaceRole.values, json, 'role'),
      status: _string(json, 'status'),
    );
  }

  final String userId;
  final WorkspaceRole? role;
  final String status;
}

class PeriodDemandDto {
  const PeriodDemandDto({
    required this.from,
    required this.to,
    required this.revenue,
    required this.units,
    required this.orderCount,
    required this.currencyCode,
    required this.metricBasis,
  });

  factory PeriodDemandDto.fromJson(Map<String, dynamic> json) {
    return PeriodDemandDto(
      from: _date(json, 'from'),
      to: _date(json, 'to'),
      revenue: _decimal(json, 'revenue'),
      units: _integer(json, 'units'),
      orderCount: _integer(json, 'orderCount'),
      currencyCode: _string(json, 'currencyCode'),
      metricBasis: _metricBasis(json),
    );
  }

  final DateTime from;
  final DateTime to;
  final Decimal revenue;
  final int units;
  final int orderCount;
  final String currencyCode;
  final MetricBasis metricBasis;
}

class ProductVariantOptionDto {
  const ProductVariantOptionDto({required this.name, required this.value});

  factory ProductVariantOptionDto.fromJson(Map<String, dynamic> json) {
    return ProductVariantOptionDto(
      name: _string(json, 'name'),
      value: _string(json, 'value'),
    );
  }

  final String name;
  final String value;
}

class ProductVariantDto {
  const ProductVariantDto({
    required this.id,
    required this.title,
    required this.position,
    required this.sku,
    required this.barcode,
    required this.price,
    required this.compareAtPrice,
    required this.inventoryQuantity,
    required this.inventoryPolicy,
    required this.taxable,
    required this.imageUrl,
    required this.options,
  });

  factory ProductVariantDto.fromJson(Map<String, dynamic> json) {
    return ProductVariantDto(
      id: _string(json, 'id'),
      title: _string(json, 'title'),
      position: _integer(json, 'position'),
      sku: _nullableString(json, 'sku'),
      barcode: _nullableString(json, 'barcode'),
      price: _decimal(json, 'price'),
      compareAtPrice: _nullableDecimal(json, 'compareAtPrice'),
      inventoryQuantity: _nullableInteger(json, 'inventoryQuantity'),
      inventoryPolicy: _nullableString(json, 'inventoryPolicy'),
      taxable: _nullableBoolean(json, 'taxable'),
      imageUrl: _nullableString(json, 'imageUrl'),
      options: _list(
        json,
        'options',
      ).map(ProductVariantOptionDto.fromJson).toList(growable: false),
    );
  }

  final String id;
  final String title;
  final int position;
  final String? sku;
  final String? barcode;
  final Decimal price;
  final Decimal? compareAtPrice;
  final int? inventoryQuantity;
  final String? inventoryPolicy;
  final bool? taxable;
  final String? imageUrl;
  final List<ProductVariantOptionDto> options;
}

class ProductDto {
  const ProductDto({
    required this.id,
    required this.title,
    required this.handle,
    required this.description,
    required this.category,
    required this.vendor,
    required this.sku,
    required this.skus,
    required this.productType,
    required this.status,
    required this.tags,
    required this.thumbnail,
    required this.priceMin,
    required this.priceMax,
    required this.inventoryQuantity,
    required this.variantCount,
    required this.variantsTruncated,
    required this.variants,
    required this.updatedAt,
  });

  factory ProductDto.fromJson(Map<String, dynamic> json) {
    return ProductDto(
      id: _string(json, 'id'),
      title: _string(json, 'title'),
      handle: _nullableString(json, 'handle'),
      description: _nullableString(json, 'description'),
      category: _nullableString(json, 'category'),
      vendor: _nullableString(json, 'vendor'),
      sku: _nullableString(json, 'sku'),
      skus: _stringList(json, 'skus'),
      productType: _nullableString(json, 'productType'),
      status: _string(json, 'status'),
      tags: _stringList(json, 'tags'),
      thumbnail: _nullableString(json, 'thumbnail'),
      priceMin: _nullableDecimal(json, 'priceMin'),
      priceMax: _nullableDecimal(json, 'priceMax'),
      inventoryQuantity: _nullableInteger(json, 'inventoryQuantity'),
      variantCount: _integer(json, 'variantCount'),
      variantsTruncated: _boolean(json, 'variantsTruncated'),
      variants: _list(
        json,
        'variants',
      ).map(ProductVariantDto.fromJson).toList(growable: false),
      updatedAt: _date(json, 'updatedAt'),
    );
  }

  final String id;
  final String title;
  final String? handle;
  final String? description;
  final String? category;
  final String? vendor;
  final String? sku;
  final List<String> skus;
  final String? productType;
  final String status;
  final List<String> tags;
  final String? thumbnail;
  final Decimal? priceMin;
  final Decimal? priceMax;
  final int? inventoryQuantity;
  final int variantCount;
  final bool variantsTruncated;
  final List<ProductVariantDto> variants;
  final DateTime updatedAt;
}

class CustomerDto {
  const CustomerDto({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phone,
    required this.city,
    required this.province,
    required this.country,
    required this.company,
    required this.ordersCount,
    required this.totalSpent,
    required this.periodSpend,
    required this.periodOrderCount,
    required this.avatarUrl,
    required this.updatedAt,
  });

  factory CustomerDto.fromJson(Map<String, dynamic> json) {
    return CustomerDto(
      id: _string(json, 'id'),
      firstName: _nullableString(json, 'firstName'),
      lastName: _nullableString(json, 'lastName'),
      email: _nullableString(json, 'email'),
      phone: _nullableString(json, 'phone'),
      city: _nullableString(json, 'city'),
      province: _nullableString(json, 'province'),
      country: _nullableString(json, 'country'),
      company: _nullableString(json, 'company'),
      ordersCount: _nullableInteger(json, 'ordersCount'),
      totalSpent: _nullableDecimal(json, 'totalSpent'),
      periodSpend: _nullableDecimal(json, 'periodSpend'),
      periodOrderCount: _nullableInteger(json, 'periodOrderCount'),
      avatarUrl: _nullableString(json, 'avatarUrl'),
      updatedAt: _date(json, 'updatedAt'),
    );
  }

  final String id;
  final String? firstName;
  final String? lastName;
  final String? email;
  final String? phone;
  final String? city;
  final String? province;
  final String? country;
  final String? company;
  final int? ordersCount;
  final Decimal? totalSpent;
  final Decimal? periodSpend;
  final int? periodOrderCount;
  final String? avatarUrl;
  final DateTime updatedAt;

  String get displayName {
    final value = [firstName, lastName]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .join(' ')
        .trim();
    if (value.isNotEmpty) return value;
    if (email case final value? when value.isNotEmpty) return value;
    if (company case final value? when value.isNotEmpty) return value;
    return 'Customer ${id.split('/').last}';
  }

  String get initials {
    final parts = [firstName, lastName]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) return 'C';
    return parts.map((part) => part[0].toUpperCase()).take(2).join();
  }

  String get location => [
    city,
    province,
    country,
  ].whereType<String>().where((part) => part.isNotEmpty).join(', ');
}

class OrderDto {
  const OrderDto({
    required this.id,
    required this.name,
    required this.orderNumber,
    required this.customerId,
    required this.email,
    required this.financialStatus,
    required this.fulfillmentStatus,
    required this.currencyCode,
    required this.subtotalPrice,
    required this.totalDiscounts,
    required this.totalTax,
    required this.totalPrice,
    required this.totalUnits,
    required this.orderedAt,
    required this.cancelledAt,
    required this.updatedAt,
  });

  factory OrderDto.fromJson(Map<String, dynamic> json) {
    return OrderDto(
      id: _string(json, 'id'),
      name: _nullableString(json, 'name'),
      orderNumber: _nullableInteger(json, 'orderNumber'),
      customerId: _nullableString(json, 'customerId'),
      email: _nullableString(json, 'email'),
      financialStatus: _nullableString(json, 'financialStatus'),
      fulfillmentStatus: _nullableString(json, 'fulfillmentStatus'),
      currencyCode: _string(json, 'currencyCode'),
      subtotalPrice: _decimal(json, 'subtotalPrice'),
      totalDiscounts: _decimal(json, 'totalDiscounts'),
      totalTax: _decimal(json, 'totalTax'),
      totalPrice: _decimal(json, 'totalPrice'),
      totalUnits: _integer(json, 'totalUnits'),
      orderedAt: _date(json, 'orderedAt'),
      cancelledAt: _nullableDate(json, 'cancelledAt'),
      updatedAt: _date(json, 'updatedAt'),
    );
  }

  final String id;
  final String? name;
  final int? orderNumber;
  final String? customerId;
  final String? email;
  final String? financialStatus;
  final String? fulfillmentStatus;
  final String currencyCode;
  final Decimal subtotalPrice;
  final Decimal totalDiscounts;
  final Decimal totalTax;
  final Decimal totalPrice;
  final int totalUnits;
  final DateTime orderedAt;
  final DateTime? cancelledAt;
  final DateTime updatedAt;
}

class DataQualityDto {
  const DataQualityDto({
    required this.productMediaCoverage,
    required this.customerMediaCoverage,
    required this.customerEmailCoverage,
    required this.stockCoverage,
    required this.linkedOrderCustomerRate,
    required this.linkedOrderCustomers,
    required this.orderCount,
  });

  factory DataQualityDto.fromJson(Map<String, dynamic> json) {
    return DataQualityDto(
      productMediaCoverage: _decimal(json, 'productMediaCoverage'),
      customerMediaCoverage: _decimal(json, 'customerMediaCoverage'),
      customerEmailCoverage: _decimal(json, 'customerEmailCoverage'),
      stockCoverage: _decimal(json, 'stockCoverage'),
      linkedOrderCustomerRate: _decimal(json, 'linkedOrderCustomerRate'),
      linkedOrderCustomers: _integer(json, 'linkedOrderCustomers'),
      orderCount: _integer(json, 'orderCount'),
    );
  }

  final Decimal productMediaCoverage;
  final Decimal customerMediaCoverage;
  final Decimal customerEmailCoverage;
  final Decimal stockCoverage;
  final Decimal linkedOrderCustomerRate;
  final int linkedOrderCustomers;
  final int orderCount;
}

class JobResourceDto {
  const JobResourceDto({
    required this.resource,
    required this.status,
    required this.cursorFrom,
    required this.cursorTo,
    required this.recordsRead,
    required this.recordsWritten,
    required this.startedAt,
    required this.completedAt,
    required this.error,
    required this.variantsTruncated,
  });

  factory JobResourceDto.fromJson(Map<String, dynamic> json) {
    return JobResourceDto(
      resource: _string(json, 'resource'),
      status: _enumByName(JobStatus.values, json, 'status'),
      cursorFrom: _nullableString(json, 'cursorFrom'),
      cursorTo: _nullableString(json, 'cursorTo'),
      recordsRead: _integer(json, 'recordsRead'),
      recordsWritten: _integer(json, 'recordsWritten'),
      startedAt: _nullableDate(json, 'startedAt'),
      completedAt: _nullableDate(json, 'completedAt'),
      error: _nullableString(json, 'error'),
      variantsTruncated: _boolean(json, 'variantsTruncated'),
    );
  }

  final String resource;
  final JobStatus status;
  final String? cursorFrom;
  final String? cursorTo;
  final int recordsRead;
  final int recordsWritten;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? error;
  final bool variantsTruncated;
}

class IngestionJobDto {
  const IngestionJobDto({
    required this.jobId,
    required this.workspaceId,
    required this.resource,
    required this.status,
    required this.attempts,
    required this.maxAttempts,
    required this.availableAt,
    required this.createdAt,
    required this.updatedAt,
    required this.error,
    required this.resources,
  });

  factory IngestionJobDto.fromJson(Map<String, dynamic> json) {
    return IngestionJobDto(
      jobId: _string(json, 'jobId'),
      workspaceId: _string(json, 'workspaceId'),
      resource: _string(json, 'resource'),
      status: _enumByName(JobStatus.values, json, 'status'),
      attempts: _integer(json, 'attempts'),
      maxAttempts: _integer(json, 'maxAttempts'),
      availableAt: _date(json, 'availableAt'),
      createdAt: _date(json, 'createdAt'),
      updatedAt: _date(json, 'updatedAt'),
      error: _nullableString(json, 'error'),
      resources: _list(
        json,
        'resources',
      ).map(JobResourceDto.fromJson).toList(growable: false),
    );
  }

  final String jobId;
  final String workspaceId;
  final String resource;
  final JobStatus status;
  final int attempts;
  final int maxAttempts;
  final DateTime availableAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? error;
  final List<JobResourceDto> resources;

  bool get isTerminal =>
      status == JobStatus.succeeded || status == JobStatus.dead;
}

class SyncDto {
  const SyncDto({
    required this.jobId,
    required this.status,
    required this.resource,
    required this.attempts,
    required this.maxAttempts,
    required this.startedAt,
    required this.completedAt,
    required this.cursor,
    required this.watermark,
    required this.lastSyncedAt,
    required this.error,
    required this.resources,
  });

  factory SyncDto.fromJson(Map<String, dynamic> json) {
    return SyncDto(
      jobId: _nullableString(json, 'jobId'),
      status: _enumByName(SyncStatus.values, json, 'status'),
      resource: _nullableString(json, 'resource'),
      attempts: _integer(json, 'attempts'),
      maxAttempts: _integer(json, 'maxAttempts'),
      startedAt: _nullableDate(json, 'startedAt'),
      completedAt: _nullableDate(json, 'completedAt'),
      cursor: _nullableString(json, 'cursor'),
      watermark: _nullableDate(json, 'watermark'),
      lastSyncedAt: _nullableDate(json, 'lastSyncedAt'),
      error: _nullableString(json, 'error'),
      resources: _list(
        json,
        'resources',
      ).map(JobResourceDto.fromJson).toList(growable: false),
    );
  }

  final String? jobId;
  final SyncStatus status;
  final String? resource;
  final int attempts;
  final int maxAttempts;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? cursor;
  final DateTime? watermark;
  final DateTime? lastSyncedAt;
  final String? error;
  final List<JobResourceDto> resources;
}

class DecisionDto {
  const DecisionDto({
    required this.code,
    required this.title,
    required this.description,
    required this.priority,
    required this.evidence,
  });

  factory DecisionDto.fromJson(Map<String, dynamic> json) {
    return DecisionDto(
      code: _string(json, 'code'),
      title: _string(json, 'title'),
      description: _string(json, 'description'),
      priority: _enumByName(DecisionPriority.values, json, 'priority'),
      evidence: _object(
        json,
        'evidence',
      ).map((key, value) => MapEntry(key, _jsonScalar(value))),
    );
  }

  final String code;
  final String title;
  final String description;
  final DecisionPriority priority;
  final Map<String, Object?> evidence;
}

class OverviewMetricsDto {
  const OverviewMetricsDto({
    required this.revenue,
    required this.averageOrderValue,
    required this.orderCount,
    required this.customerCount,
    required this.units,
    required this.discountRate,
    required this.currencyCode,
    required this.metricBasis,
  });

  factory OverviewMetricsDto.fromJson(Map<String, dynamic> json) {
    return OverviewMetricsDto(
      revenue: _decimal(json, 'revenue'),
      averageOrderValue: _decimal(json, 'averageOrderValue'),
      orderCount: _integer(json, 'orderCount'),
      customerCount: _integer(json, 'customerCount'),
      units: _integer(json, 'units'),
      discountRate: _decimal(json, 'discountRate'),
      currencyCode: _string(json, 'currencyCode'),
      metricBasis: _metricBasis(json),
    );
  }

  final Decimal revenue;
  final Decimal averageOrderValue;
  final int orderCount;
  final int customerCount;
  final int units;
  final Decimal discountRate;
  final String currencyCode;
  final MetricBasis metricBasis;
}

class TrendPointDto {
  const TrendPointDto({required this.date, required this.revenue});

  factory TrendPointDto.fromJson(Map<String, dynamic> json) {
    return TrendPointDto(
      date: _date(json, 'date'),
      revenue: _decimal(json, 'revenue'),
    );
  }

  final DateTime date;
  final Decimal revenue;
}

class TopCustomerDto {
  const TopCustomerDto({
    required this.customer,
    required this.spend,
    required this.orderCount,
    required this.units,
  });

  factory TopCustomerDto.fromJson(Map<String, dynamic> json) {
    return TopCustomerDto(
      customer: CustomerDto.fromJson(_object(json, 'customer')),
      spend: _decimal(json, 'spend'),
      orderCount: _integer(json, 'orderCount'),
      units: _integer(json, 'units'),
    );
  }

  final CustomerDto customer;
  final Decimal spend;
  final int orderCount;
  final int units;
}

class DateRangeDto {
  const DateRangeDto({
    required this.from,
    required this.to,
    required this.preset,
  });

  factory DateRangeDto.fromJson(Map<String, dynamic> json) {
    return DateRangeDto(
      from: _date(json, 'from'),
      to: _date(json, 'to'),
      preset: _string(json, 'preset'),
    );
  }

  final DateTime from;
  final DateTime to;
  final String preset;
}

class OverviewDto {
  const OverviewDto({
    required this.workspace,
    required this.range,
    required this.generatedAt,
    required this.metrics,
    required this.trend,
    required this.topCustomers,
    required this.decisions,
    required this.dataQuality,
    required this.sync,
    required this.currencyCode,
    required this.metricBasis,
  });

  factory OverviewDto.fromJson(Map<String, dynamic> json) {
    return OverviewDto(
      workspace: WorkspaceDto.fromJson(_object(json, 'workspace')),
      range: DateRangeDto.fromJson(_object(json, 'range')),
      generatedAt: _date(json, 'generatedAt'),
      metrics: OverviewMetricsDto.fromJson(_object(json, 'metrics')),
      trend: _list(
        json,
        'trend',
      ).map(TrendPointDto.fromJson).toList(growable: false),
      topCustomers: _list(
        json,
        'topCustomers',
      ).map(TopCustomerDto.fromJson).toList(growable: false),
      decisions: _list(
        json,
        'decisions',
      ).map(DecisionDto.fromJson).toList(growable: false),
      dataQuality: DataQualityDto.fromJson(_object(json, 'dataQuality')),
      sync: SyncDto.fromJson(_object(json, 'sync')),
      currencyCode: _string(json, 'currencyCode'),
      metricBasis: _metricBasis(json),
    );
  }

  final WorkspaceDto workspace;
  final DateRangeDto range;
  final DateTime generatedAt;
  final OverviewMetricsDto metrics;
  final List<TrendPointDto> trend;
  final List<TopCustomerDto> topCustomers;
  final List<DecisionDto> decisions;
  final DataQualityDto dataQuality;
  final SyncDto sync;
  final String currencyCode;
  final MetricBasis metricBasis;
}

class ProductPageDto {
  const ProductPageDto({required this.items, required this.nextCursor});

  factory ProductPageDto.fromJson(Map<String, dynamic> json) {
    return ProductPageDto(
      items: _list(
        json,
        'items',
      ).map(ProductDto.fromJson).toList(growable: false),
      nextCursor: _nullableString(json, 'nextCursor'),
    );
  }

  final List<ProductDto> items;
  final String? nextCursor;
}

class ProductDetailDto {
  const ProductDetailDto({required this.product, required this.periodDemand});

  factory ProductDetailDto.fromJson(Map<String, dynamic> json) {
    return ProductDetailDto(
      product: ProductDto.fromJson(_object(json, 'product')),
      periodDemand: PeriodDemandDto.fromJson(_object(json, 'periodDemand')),
    );
  }

  final ProductDto product;
  final PeriodDemandDto periodDemand;
}

class CustomerPageDto {
  const CustomerPageDto({required this.items, required this.nextCursor});

  factory CustomerPageDto.fromJson(Map<String, dynamic> json) {
    return CustomerPageDto(
      items: _list(
        json,
        'items',
      ).map(CustomerDto.fromJson).toList(growable: false),
      nextCursor: _nullableString(json, 'nextCursor'),
    );
  }

  final List<CustomerDto> items;
  final String? nextCursor;
}

class CustomerDetailDto {
  const CustomerDetailDto({
    required this.customer,
    required this.periodDemand,
    required this.recentOrders,
  });

  factory CustomerDetailDto.fromJson(Map<String, dynamic> json) {
    return CustomerDetailDto(
      customer: CustomerDto.fromJson(_object(json, 'customer')),
      periodDemand: PeriodDemandDto.fromJson(_object(json, 'periodDemand')),
      recentOrders: _list(
        json,
        'recentOrders',
      ).map(OrderDto.fromJson).toList(growable: false),
    );
  }

  final CustomerDto customer;
  final PeriodDemandDto periodDemand;
  final List<OrderDto> recentOrders;
}

class OrderPageDto {
  const OrderPageDto({
    required this.items,
    required this.nextCursor,
    required this.includeCancelled,
    required this.cancellationPolicy,
  });

  factory OrderPageDto.fromJson(Map<String, dynamic> json) {
    final policy = _string(json, 'cancellationPolicy');
    return OrderPageDto(
      items: _list(
        json,
        'items',
      ).map(OrderDto.fromJson).toList(growable: false),
      nextCursor: _nullableString(json, 'nextCursor'),
      includeCancelled: _boolean(json, 'includeCancelled'),
      cancellationPolicy: policy == 'included' ? 'included' : 'excluded',
    );
  }

  final List<OrderDto> items;
  final String? nextCursor;
  final bool includeCancelled;
  final String cancellationPolicy;
}

class SyncEnqueueDto {
  const SyncEnqueueDto({
    required this.jobId,
    required this.status,
    required this.duplicate,
  });

  factory SyncEnqueueDto.fromJson(Map<String, dynamic> json) {
    return SyncEnqueueDto(
      jobId: _string(json, 'jobId'),
      status: _enumByName(JobStatus.values, json, 'status'),
      duplicate: _boolean(json, 'duplicate'),
    );
  }

  final String jobId;
  final JobStatus status;
  final bool duplicate;
}

class ShopifyInstallAuthorizationDto {
  const ShopifyInstallAuthorizationDto({
    required this.authorizationUrl,
    required this.shopDomain,
    required this.returnUrl,
  });

  factory ShopifyInstallAuthorizationDto.fromJson(Map<String, dynamic> json) {
    final returnUrl = Uri.parse(_string(json, 'returnUrl'));
    if (returnUrl.scheme.isEmpty || returnUrl.userInfo.isNotEmpty) {
      throw const FormatException('Shopify return URL is invalid');
    }
    final authorizationUrl = Uri.tryParse(_string(json, 'authorizationUrl'));
    if (authorizationUrl == null || authorizationUrl.scheme != 'https') {
      throw const FormatException('Shopify authorization URL must use HTTPS');
    }
    return ShopifyInstallAuthorizationDto(
      authorizationUrl: authorizationUrl,
      shopDomain: _string(json, 'shopDomain'),
      returnUrl: returnUrl,
    );
  }

  final Uri authorizationUrl;
  final String shopDomain;
  final Uri returnUrl;
}

T _enumByName<T extends Enum>(
  List<T> values,
  Map<String, dynamic> json,
  String key,
) {
  final name = _string(json, key);
  for (final value in values) {
    if (value.name == name) return value;
  }
  throw FormatException('Invalid $key', name);
}

MetricBasis _metricBasis(Map<String, dynamic> json) {
  final wireName = _string(json, 'metricBasis');
  for (final value in MetricBasis.values) {
    if (value.wireName == wireName) return value;
  }
  throw FormatException('Invalid metricBasis', wireName);
}

Map<String, dynamic> _object(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! Map) throw FormatException('Expected $key to be an object');
  return value.map((itemKey, itemValue) => MapEntry('$itemKey', itemValue));
}

List<Map<String, dynamic>> _list(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! List) throw FormatException('Expected $key to be an array');
  return value
      .map((item) {
        if (item is! Map) {
          throw FormatException('Expected $key entries to be objects');
        }
        return item.map(
          (itemKey, itemValue) => MapEntry('$itemKey', itemValue),
        );
      })
      .toList(growable: false);
}

String _string(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! String || value.isEmpty) {
    throw FormatException('Expected $key to be a non-empty string');
  }
  return value;
}

String? _nullableString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value == null) return null;
  if (value is! String) {
    throw FormatException('Expected $key to be a string or null');
  }
  return value;
}

List<String> _stringList(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! List) throw FormatException('Expected $key to be an array');
  return value
      .map((item) {
        if (item is! String) {
          throw FormatException('Expected $key entries to be strings');
        }
        return item;
      })
      .toList(growable: false);
}

int _integer(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! num || !value.isFinite || value != value.roundToDouble()) {
    throw FormatException('Expected $key to be an integer');
  }
  return value.toInt();
}

int? _nullableInteger(Map<String, dynamic> json, String key) {
  if (json[key] == null) return null;
  return _integer(json, key);
}

bool _boolean(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! bool) throw FormatException('Expected $key to be a boolean');
  return value;
}

bool? _nullableBoolean(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value == null) return null;
  if (value is! bool) {
    throw FormatException('Expected $key to be a boolean or null');
  }
  return value;
}

bool? _optionalBoolean(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value == null) return null;
  if (value is! bool) {
    throw FormatException('Expected $key to be a boolean when provided');
  }
  return value;
}

Decimal _decimal(Map<String, dynamic> json, String key) {
  final value = _string(json, key);
  try {
    return Decimal.parse(value);
  } on FormatException {
    throw FormatException('Invalid decimal for $key', value);
  }
}

Decimal? _nullableDecimal(Map<String, dynamic> json, String key) {
  if (json[key] == null) return null;
  return _decimal(json, key);
}

DateTime _date(Map<String, dynamic> json, String key) {
  final value = _string(json, key);
  if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) {
    final date = DateTime.tryParse(value);
    if (date == null) throw FormatException('Invalid date for $key', value);
    return DateTime.utc(date.year, date.month, date.day);
  }
  final result = DateTime.tryParse(value);
  if (result == null) {
    throw FormatException('Invalid timestamp for $key', value);
  }
  return result.toUtc();
}

DateTime? _nullableDate(Map<String, dynamic> json, String key) {
  if (json[key] == null) return null;
  return _date(json, key);
}

Object? _jsonScalar(Object? value) {
  if (value == null || value is String || value is num || value is bool) {
    return value;
  }
  throw const FormatException('Decision evidence must contain scalar values');
}
