import 'dart:async';

import 'package:decimal/decimal.dart';
import 'package:threadline/core/auth_service.dart';
import 'package:threadline/core/commerce_repository.dart';
import 'package:threadline/core/models.dart';
import 'package:threadline/core/services.dart';

final fixtureNow = DateTime.utc(2026, 1, 31, 12);

int _rangeDays(InsightRange range) => switch (range) {
  InsightRange.sevenDays => 7,
  InsightRange.thirtyDays => 30,
  InsightRange.ninetyDays => 90,
};

WorkspaceDto fixtureWorkspace({
  String id = 'workspace-primary',
  String name = 'Primary Store',
  String shopDomain = 'primary-store.myshopify.com',
  String currencyCode = 'USD',
  WorkspaceRole role = WorkspaceRole.owner,
  WorkspaceCapabilitiesDto? capabilities,
}) {
  return WorkspaceDto(
    id: id,
    shopDomain: shopDomain,
    name: name,
    currencyCode: currencyCode,
    timeZone: 'UTC',
    role: role,
    capabilities:
        capabilities ??
        WorkspaceCapabilitiesDto(
          canEnqueueSync:
              role == WorkspaceRole.owner || role == WorkspaceRole.admin,
          canManageMembers:
              role == WorkspaceRole.owner || role == WorkspaceRole.admin,
          canChangeOwnerRoles: role == WorkspaceRole.owner,
        ),
  );
}

ProductDto fixtureProduct({
  String id = 'gid://shopify/Product/1',
  String title = 'Task Lamp',
  String? description = 'A focused task lamp.',
  String? category = 'Lighting',
  String? vendor = 'North Workshop',
  String? sku = 'NW-LAMP',
  int inventoryQuantity = 24,
  bool variantsTruncated = false,
}) {
  return ProductDto(
    id: id,
    title: title,
    handle: 'task-lamp',
    description: description,
    category: category,
    vendor: vendor,
    sku: sku,
    skus: const ['NW-LAMP'],
    productType: 'Lighting',
    status: 'ACTIVE',
    tags: const ['desk', 'task'],
    thumbnail: null,
    priceMin: Decimal.fromInt(84),
    priceMax: Decimal.fromInt(96),
    inventoryQuantity: inventoryQuantity,
    variantCount: 1,
    variantsTruncated: variantsTruncated,
    variants: [
      ProductVariantDto(
        id: 'gid://shopify/ProductVariant/1',
        title: 'Default',
        position: 1,
        sku: sku,
        barcode: null,
        price: Decimal.fromInt(84),
        compareAtPrice: null,
        inventoryQuantity: inventoryQuantity,
        inventoryPolicy: 'DENY',
        taxable: true,
        imageUrl: null,
        options: const [
          ProductVariantOptionDto(name: 'Title', value: 'Default'),
        ],
      ),
    ],
    updatedAt: fixtureNow,
  );
}

CustomerDto fixtureCustomer({
  String id = 'gid://shopify/Customer/1',
  String firstName = 'Ari',
  String lastName = 'Stone',
  String email = 'ari@example.com',
  String periodSpend = '240.00',
}) {
  return CustomerDto(
    id: id,
    firstName: firstName,
    lastName: lastName,
    email: email,
    phone: null,
    city: 'Portland',
    province: 'Oregon',
    country: 'United States',
    company: 'Field Office',
    ordersCount: 3,
    totalSpent: Decimal.parse('640.00'),
    periodSpend: Decimal.parse(periodSpend),
    periodOrderCount: 2,
    avatarUrl: null,
    updatedAt: fixtureNow,
  );
}

OrderDto fixtureOrder({
  String id = 'gid://shopify/Order/1',
  String customerId = 'gid://shopify/Customer/1',
  String total = '120.00',
  int daysAgo = 1,
}) {
  return OrderDto(
    id: id,
    name: '#1001',
    orderNumber: 1001,
    customerId: customerId,
    email: 'ari@example.com',
    financialStatus: 'PAID',
    fulfillmentStatus: 'FULFILLED',
    currencyCode: 'USD',
    subtotalPrice: Decimal.parse(total),
    totalDiscounts: Decimal.zero,
    totalTax: Decimal.zero,
    totalPrice: Decimal.parse(total),
    totalUnits: 2,
    orderedAt: fixtureNow.subtract(Duration(days: daysAgo)),
    cancelledAt: null,
    updatedAt: fixtureNow.subtract(Duration(days: daysAgo)),
  );
}

SyncDto fixtureSync({
  String? jobId,
  SyncStatus status = SyncStatus.idle,
  List<JobResourceDto> resources = const [],
}) {
  return SyncDto(
    jobId: jobId,
    status: status,
    resource: null,
    attempts: status == SyncStatus.idle ? 0 : 1,
    maxAttempts: 5,
    startedAt: status == SyncStatus.idle ? null : fixtureNow,
    completedAt: status == SyncStatus.succeeded ? fixtureNow : null,
    cursor: null,
    watermark: fixtureNow,
    lastSyncedAt: fixtureNow,
    error: null,
    resources: resources,
  );
}

JobResourceDto fixtureJobResource({
  String resource = 'products',
  JobStatus status = JobStatus.queued,
  int recordsRead = 0,
  int recordsWritten = 0,
  String? error,
}) {
  return JobResourceDto(
    resource: resource,
    status: status,
    cursorFrom: null,
    cursorTo: null,
    recordsRead: recordsRead,
    recordsWritten: recordsWritten,
    startedAt: null,
    completedAt: null,
    error: error,
    variantsTruncated: false,
  );
}

IngestionJobDto fixtureJob({
  String jobId = 'job-1',
  String workspaceId = 'workspace-primary',
  JobStatus status = JobStatus.succeeded,
  List<JobResourceDto>? resources,
}) {
  return IngestionJobDto(
    jobId: jobId,
    workspaceId: workspaceId,
    resource: 'all',
    status: status,
    attempts: 1,
    maxAttempts: 5,
    availableAt: fixtureNow,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
    error: null,
    resources:
        resources ??
        [
          fixtureJobResource(
            status: status == JobStatus.failed ? JobStatus.failed : status,
            recordsRead: 12,
            recordsWritten: status == JobStatus.succeeded ? 12 : 4,
            error: status == JobStatus.failed ? 'Synthetic test failure' : null,
          ),
        ],
  );
}

DataQualityDto fixtureDataQuality() {
  return DataQualityDto(
    productMediaCoverage: Decimal.fromInt(1),
    customerMediaCoverage: Decimal.fromInt(1),
    customerEmailCoverage: Decimal.fromInt(1),
    stockCoverage: Decimal.fromInt(1),
    linkedOrderCustomerRate: Decimal.fromInt(1),
    linkedOrderCustomers: 2,
    orderCount: 2,
  );
}

OverviewDto fixtureOverview({
  WorkspaceDto? workspace,
  InsightRange range = InsightRange.thirtyDays,
}) {
  final currentWorkspace = workspace ?? fixtureWorkspace();
  return OverviewDto(
    workspace: currentWorkspace,
    range: DateRangeDto(
      from: fixtureNow.subtract(Duration(days: _rangeDays(range))),
      to: fixtureNow,
      preset: range.apiValue,
    ),
    generatedAt: fixtureNow,
    metrics: OverviewMetricsDto(
      revenue: Decimal.fromInt(651758),
      averageOrderValue: Decimal.fromInt(325879),
      orderCount: 2,
      customerCount: 2,
      units: 4,
      discountRate: Decimal.parse('0.08'),
      currencyCode: 'USD',
      metricBasis: MetricBasis.grossNonCancelledOrderValue,
    ),
    trend: [
      TrendPointDto(
        date: DateTime.utc(2026, 1, 30),
        revenue: Decimal.fromInt(300),
      ),
      TrendPointDto(
        date: DateTime.utc(2026, 1, 31),
        revenue: Decimal.fromInt(200),
      ),
    ],
    topCustomers: [
      TopCustomerDto(
        customer: fixtureCustomer(),
        spend: Decimal.fromInt(240),
        orderCount: 2,
        units: 4,
      ),
    ],
    decisions: const [
      DecisionDto(
        code: 'revenue_momentum',
        title: 'Revenue is growing',
        description: 'The latest verified period is above the prior period.',
        priority: DecisionPriority.positive,
        evidence: {},
      ),
    ],
    dataQuality: fixtureDataQuality(),
    sync: fixtureSync(),
    currencyCode: 'USD',
    metricBasis: MetricBasis.grossNonCancelledOrderValue,
  );
}

ProductDetailDto fixtureProductDetail({ProductDto? product}) {
  return ProductDetailDto(
    product: product ?? fixtureProduct(),
    periodDemand: PeriodDemandDto(
      from: fixtureNow.subtract(const Duration(days: 30)),
      to: fixtureNow,
      revenue: Decimal.fromInt(240),
      units: 4,
      orderCount: 2,
      currencyCode: 'USD',
      metricBasis: MetricBasis.grossNonCancelledOrderValue,
    ),
  );
}

CustomerDetailDto fixtureCustomerDetail({CustomerDto? customer}) {
  return CustomerDetailDto(
    customer: customer ?? fixtureCustomer(),
    periodDemand: PeriodDemandDto(
      from: fixtureNow.subtract(const Duration(days: 30)),
      to: fixtureNow,
      revenue: Decimal.fromInt(240),
      units: 4,
      orderCount: 2,
      currencyCode: 'USD',
      metricBasis: MetricBasis.grossNonCancelledOrderValue,
    ),
    recentOrders: [fixtureOrder()],
  );
}

class FakeAuthService implements AuthService {
  FakeAuthService({this.currentUser});

  @override
  AuthUser? currentUser;
  final StreamController<AuthUser?> changes = StreamController.broadcast();
  String? sentEmail;
  String? verifiedToken;
  int signOutCalls = 0;

  @override
  Stream<AuthUser?> get authStateChanges => changes.stream;

  @override
  Future<void> sendEmailOtp(String email) async {
    sentEmail = email;
  }

  @override
  Future<void> verifyEmailOtp({
    required String email,
    required String token,
  }) async {
    verifiedToken = token;
    currentUser = AuthUser(
      id: 'user-1',
      email: email,
      accessToken: 'access-token',
    );
    changes.add(currentUser);
  }

  @override
  Future<void> signOut() async {
    signOutCalls++;
    currentUser = null;
    changes.add(null);
  }

  void emit(AuthUser? user) {
    currentUser = user;
    changes.add(user);
  }

  Future<void> dispose() => changes.close();
}

class FakeDeepLinkService implements DeepLinkService {
  FakeDeepLinkService({this.initialLink});

  Uri? initialLink;
  final StreamController<Uri> changes = StreamController.broadcast();

  @override
  Stream<Uri> get links => changes.stream;

  @override
  Future<Uri?> getInitialLink() async => initialLink;

  void emit(Uri uri) => changes.add(uri);

  Future<void> dispose() => changes.close();
}

class FakeAuthorizationLauncher implements AuthorizationLauncher {
  Uri? opened;

  @override
  Future<void> open(Uri url) async {
    opened = url;
  }
}

class FakeCommerceRepository implements CommerceRepository {
  FakeCommerceRepository({
    List<WorkspaceDto>? workspaces,
    this.products,
    this.customers,
    this.members,
  }) : workspaces = workspaces ?? [fixtureWorkspace()];

  List<WorkspaceDto> workspaces;
  List<ProductDto>? products;
  List<CustomerDto>? customers;
  List<WorkspaceMemberDto>? members;
  OverviewDto? overview;
  Object? error;
  Duration delay = Duration.zero;
  String? pendingProductId;
  String? pendingCustomerId;
  String? productQuery;
  String? productCategory;
  String? productCursor;
  String? customerQuery;
  String? customerCursor;
  int getJobCalls = 0;
  int enqueueSyncCalls = 0;
  int listWorkspacesCalls = 0;
  final List<String> requestedWorkspaceIds = [];
  final List<InsightRange> overviewRanges = [];
  JobStatus jobStatus = JobStatus.succeeded;
  List<JobStatus>? jobStatuses;

  @override
  Future<List<WorkspaceDto>> listWorkspaces({
    CancellationToken? cancellationToken,
  }) async {
    listWorkspacesCalls++;
    return _guard(() => List<WorkspaceDto>.of(workspaces));
  }

  @override
  Future<WorkspaceDto> getWorkspace(
    String workspaceId, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(
      () => workspaces.firstWhere((item) => item.id == workspaceId),
    );
  }

  @override
  Future<OverviewDto> getOverview(
    String workspaceId,
    InsightRange range, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    overviewRanges.add(range);
    return _guard(
      () =>
          overview ??
          fixtureOverview(
            workspace: workspaces.firstWhere((item) => item.id == workspaceId),
            range: range,
          ),
    );
  }

  @override
  Future<ProductPageDto> listProducts(
    String workspaceId, {
    String? query,
    String? category,
    String? cursor,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    productQuery = query;
    productCategory = category;
    productCursor = cursor;
    final items = products ?? [fixtureProduct()];
    return _guard(
      () => ProductPageDto(
        items: items,
        nextCursor: cursor == null && items.length > 1 ? 'next' : null,
      ),
    );
  }

  @override
  Future<ProductDetailDto> getProductDetail(
    String workspaceId,
    String productId,
    InsightRange range, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    pendingProductId = productId;
    final selected =
        products?.where((item) => item.id == productId).firstOrNull ??
        fixtureProduct(id: productId);
    return _guard(() => fixtureProductDetail(product: selected));
  }

  @override
  Future<CustomerPageDto> listCustomers(
    String workspaceId,
    InsightRange range, {
    String? query,
    String? cursor,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    customerQuery = query;
    customerCursor = cursor;
    final items = customers ?? [fixtureCustomer()];
    return _guard(
      () => CustomerPageDto(
        items: items,
        nextCursor: cursor == null && items.length > 1 ? 'next' : null,
      ),
    );
  }

  @override
  Future<CustomerDetailDto> getCustomerDetail(
    String workspaceId,
    String customerId,
    InsightRange range, {
    bool includeCancelled = false,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    pendingCustomerId = customerId;
    final selected =
        customers?.where((item) => item.id == customerId).firstOrNull ??
        fixtureCustomer(id: customerId);
    return _guard(() => fixtureCustomerDetail(customer: selected));
  }

  @override
  Future<OrderPageDto> listOrders(
    String workspaceId,
    InsightRange range, {
    String? customerId,
    bool includeCancelled = false,
    String? cursor,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(
      () => const OrderPageDto(
        items: [],
        nextCursor: null,
        includeCancelled: false,
        cancellationPolicy: 'excluded',
      ),
    );
  }

  @override
  Future<SyncDto> getSync(
    String workspaceId, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(fixtureSync);
  }

  @override
  Future<IngestionJobDto> getJob(
    String workspaceId,
    String jobId, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    getJobCalls++;
    final statuses = jobStatuses;
    final status = statuses == null || statuses.isEmpty
        ? jobStatus
        : statuses[getJobCalls <= statuses.length
              ? getJobCalls - 1
              : statuses.length - 1];
    return _guard(
      () => fixtureJob(jobId: jobId, workspaceId: workspaceId, status: status),
    );
  }

  @override
  Future<SyncEnqueueDto> enqueueSync(
    String workspaceId, {
    List<String> resources = const [
      'products',
      'customers',
      'orders',
      'abandoned_checkouts',
    ],
    String? idempotencyKey,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    enqueueSyncCalls++;
    return _guard(
      () => const SyncEnqueueDto(
        jobId: 'job-1',
        status: JobStatus.queued,
        duplicate: false,
      ),
    );
  }

  @override
  Future<WorkspaceMemberPageDto> listMembers(
    String workspaceId, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(
      () => WorkspaceMemberPageDto(
        items:
            members ??
            [
              WorkspaceMemberDto(
                userId: 'user-1',
                role: WorkspaceRole.owner,
                email: 'owner@example.com',
                createdAt: fixtureNow,
                updatedAt: fixtureNow,
              ),
            ],
      ),
    );
  }

  @override
  Future<MembershipMutationDto> addMember(
    String workspaceId, {
    required String userId,
    required WorkspaceRole role,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(() {
      members ??= [];
      members!.add(
        WorkspaceMemberDto(
          userId: userId,
          role: role,
          email: null,
          createdAt: fixtureNow,
          updatedAt: fixtureNow,
        ),
      );
      return MembershipMutationDto(
        userId: userId,
        role: role,
        status: 'active',
      );
    });
  }

  @override
  Future<MembershipMutationDto> updateMemberRole(
    String workspaceId,
    String userId, {
    required WorkspaceRole role,
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(() {
      final index = members?.indexWhere((member) => member.userId == userId);
      if (index != null && index >= 0) {
        members![index] = WorkspaceMemberDto(
          userId: userId,
          role: role,
          email: members![index].email,
          createdAt: members![index].createdAt,
          updatedAt: fixtureNow,
        );
      }
      return MembershipMutationDto(
        userId: userId,
        role: role,
        status: 'active',
      );
    });
  }

  @override
  Future<void> removeMember(
    String workspaceId,
    String userId, {
    CancellationToken? cancellationToken,
  }) async {
    requestedWorkspaceIds.add(workspaceId);
    return _guard(() {
      members?.removeWhere((member) => member.userId == userId);
    });
  }

  @override
  Future<ShopifyInstallAuthorizationDto> createShopifyInstall(
    String shopDomain,
    Uri mobileReturnUrl, {
    CancellationToken? cancellationToken,
  }) async {
    return _guard(
      () => ShopifyInstallAuthorizationDto(
        authorizationUrl: Uri.parse(
          'https://$shopDomain/admin/oauth/authorize?client_id=test',
        ),
        shopDomain: shopDomain,
        returnUrl: mobileReturnUrl,
      ),
    );
  }

  Future<T> _guard<T>(T Function() value) async {
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    final currentError = error;
    if (currentError != null) throw currentError;
    return value();
  }
}
