import 'dart:async';

import 'package:flutter/foundation.dart';

import 'auth_service.dart';
import 'commerce_repository.dart';
import 'models.dart';
import 'services.dart';

enum AppStatus {
  initializing,
  signedOut,
  loadingWorkspaces,
  noWorkspaces,
  ready,
  failure,
}

enum AuthPhase {
  restoring,
  signedOut,
  sendingCode,
  codeSent,
  verifyingCode,
  authenticated,
}

class OverviewViewState {
  const OverviewViewState({
    this.status = LoadStatus.idle,
    this.data,
    this.isRefreshing = false,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final OverviewDto? data;
  final bool isRefreshing;
  final String? error;
  final String? errorRequestId;

  OverviewViewState copyWith({
    LoadStatus? status,
    OverviewDto? data,
    bool clearData = false,
    bool? isRefreshing,
    String? error,
    String? errorRequestId,
    bool clearError = false,
  }) {
    return OverviewViewState(
      status: status ?? this.status,
      data: clearData ? null : data ?? this.data,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class CatalogViewState {
  const CatalogViewState({
    this.status = LoadStatus.idle,
    this.items = const [],
    this.nextCursor,
    this.query = '',
    this.category = '',
    this.isRefreshing = false,
    this.isLoadingMore = false,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final List<ProductDto> items;
  final String? nextCursor;
  final String query;
  final String category;
  final bool isRefreshing;
  final bool isLoadingMore;
  final String? error;
  final String? errorRequestId;

  CatalogViewState copyWith({
    LoadStatus? status,
    List<ProductDto>? items,
    bool clearItems = false,
    String? nextCursor,
    bool clearCursor = false,
    String? query,
    String? category,
    bool? isRefreshing,
    bool? isLoadingMore,
    String? error,
    String? errorRequestId,
    bool clearError = false,
  }) {
    return CatalogViewState(
      status: status ?? this.status,
      items: clearItems ? const [] : items ?? this.items,
      nextCursor: clearCursor ? null : nextCursor ?? this.nextCursor,
      query: query ?? this.query,
      category: category ?? this.category,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class CustomersViewState {
  const CustomersViewState({
    this.status = LoadStatus.idle,
    this.items = const [],
    this.nextCursor,
    this.query = '',
    this.isRefreshing = false,
    this.isLoadingMore = false,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final List<CustomerDto> items;
  final String? nextCursor;
  final String query;
  final bool isRefreshing;
  final bool isLoadingMore;
  final String? error;
  final String? errorRequestId;

  CustomersViewState copyWith({
    LoadStatus? status,
    List<CustomerDto>? items,
    bool clearItems = false,
    String? nextCursor,
    bool clearCursor = false,
    String? query,
    bool? isRefreshing,
    bool? isLoadingMore,
    String? error,
    String? errorRequestId,
    bool clearError = false,
  }) {
    return CustomersViewState(
      status: status ?? this.status,
      items: clearItems ? const [] : items ?? this.items,
      nextCursor: clearCursor ? null : nextCursor ?? this.nextCursor,
      query: query ?? this.query,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class SyncViewState {
  const SyncViewState({
    this.status = LoadStatus.idle,
    this.data,
    this.job,
    this.isRefreshing = false,
    this.isEnqueueing = false,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final SyncDto? data;
  final IngestionJobDto? job;
  final bool isRefreshing;
  final bool isEnqueueing;
  final String? error;
  final String? errorRequestId;

  bool get isPolling =>
      job != null &&
      !job!.isTerminal &&
      (isEnqueueing || status == LoadStatus.loading);

  SyncViewState copyWith({
    LoadStatus? status,
    SyncDto? data,
    IngestionJobDto? job,
    bool clearJob = false,
    bool? isRefreshing,
    bool? isEnqueueing,
    String? error,
    String? errorRequestId,
    bool clearError = false,
  }) {
    return SyncViewState(
      status: status ?? this.status,
      data: data ?? this.data,
      job: clearJob ? null : job ?? this.job,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isEnqueueing: isEnqueueing ?? this.isEnqueueing,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class ProductDetailViewState {
  const ProductDetailViewState({
    this.status = LoadStatus.idle,
    this.requestedId,
    this.data,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final String? requestedId;
  final ProductDetailDto? data;
  final String? error;
  final String? errorRequestId;

  ProductDetailViewState copyWith({
    LoadStatus? status,
    String? requestedId,
    ProductDetailDto? data,
    String? error,
    String? errorRequestId,
    bool clearData = false,
    bool clearError = false,
  }) {
    return ProductDetailViewState(
      status: status ?? this.status,
      requestedId: requestedId ?? this.requestedId,
      data: clearData ? null : data ?? this.data,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class CustomerDetailViewState {
  const CustomerDetailViewState({
    this.status = LoadStatus.idle,
    this.requestedId,
    this.data,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final String? requestedId;
  final CustomerDetailDto? data;
  final String? error;
  final String? errorRequestId;

  CustomerDetailViewState copyWith({
    LoadStatus? status,
    String? requestedId,
    CustomerDetailDto? data,
    String? error,
    String? errorRequestId,
    bool clearData = false,
    bool clearError = false,
  }) {
    return CustomerDetailViewState(
      status: status ?? this.status,
      requestedId: requestedId ?? this.requestedId,
      data: clearData ? null : data ?? this.data,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class MembersViewState {
  const MembersViewState({
    this.status = LoadStatus.idle,
    this.items = const [],
    this.isMutating = false,
    this.error,
    this.errorRequestId,
  });

  final LoadStatus status;
  final List<WorkspaceMemberDto> items;
  final bool isMutating;
  final String? error;
  final String? errorRequestId;

  MembersViewState copyWith({
    LoadStatus? status,
    List<WorkspaceMemberDto>? items,
    bool clearItems = false,
    bool? isMutating,
    String? error,
    String? errorRequestId,
    bool clearError = false,
  }) {
    return MembersViewState(
      status: status ?? this.status,
      items: clearItems ? const [] : items ?? this.items,
      isMutating: isMutating ?? this.isMutating,
      error: clearError ? null : error ?? this.error,
      errorRequestId: clearError ? null : errorRequestId ?? this.errorRequestId,
    );
  }
}

class WorkspaceCache {
  const WorkspaceCache({
    required this.workspace,
    required this.range,
    this.overview = const OverviewViewState(),
    this.catalog = const CatalogViewState(),
    this.customers = const CustomersViewState(),
    this.sync = const SyncViewState(),
    this.productDetail = const ProductDetailViewState(),
    this.customerDetail = const CustomerDetailViewState(),
    this.members = const MembersViewState(),
  });

  final WorkspaceDto workspace;
  final InsightRange range;
  final OverviewViewState overview;
  final CatalogViewState catalog;
  final CustomersViewState customers;
  final SyncViewState sync;
  final ProductDetailViewState productDetail;
  final CustomerDetailViewState customerDetail;
  final MembersViewState members;

  WorkspaceCache copyWith({
    WorkspaceDto? workspace,
    InsightRange? range,
    OverviewViewState? overview,
    CatalogViewState? catalog,
    CustomersViewState? customers,
    SyncViewState? sync,
    ProductDetailViewState? productDetail,
    CustomerDetailViewState? customerDetail,
    MembersViewState? members,
  }) {
    return WorkspaceCache(
      workspace: workspace ?? this.workspace,
      range: range ?? this.range,
      overview: overview ?? this.overview,
      catalog: catalog ?? this.catalog,
      customers: customers ?? this.customers,
      sync: sync ?? this.sync,
      productDetail: productDetail ?? this.productDetail,
      customerDetail: customerDetail ?? this.customerDetail,
      members: members ?? this.members,
    );
  }
}

class AppController extends ChangeNotifier {
  AppController({
    required AuthService authService,
    required CommerceRepository repository,
    required DeepLinkService deepLinkService,
    required AuthorizationLauncher authorizationLauncher,
    required Uri shopifyMobileReturnUrl,
    this.syncPollInterval = const Duration(seconds: 2),
    Future<void> Function(Duration)? delay,
  }) : _authService = authService,
       _repository = repository,
       _deepLinkService = deepLinkService,
       _authorizationLauncher = authorizationLauncher,
       _shopifyMobileReturnUrl = shopifyMobileReturnUrl,
       _delay = delay ?? Future<void>.delayed;

  final AuthService _authService;
  final CommerceRepository _repository;
  final DeepLinkService _deepLinkService;
  final AuthorizationLauncher _authorizationLauncher;
  final Uri _shopifyMobileReturnUrl;
  final Duration syncPollInterval;
  final Future<void> Function(Duration) _delay;

  final Map<String, WorkspaceCache> _workspaceCache = {};
  final Map<String, CancellationToken> _operations = {};
  StreamSubscription<AuthUser?>? _authSubscription;
  StreamSubscription<Uri>? _linkSubscription;
  String? _accessToken;
  String? _selectedWorkspaceId;
  AppStatus _status = AppStatus.initializing;
  AuthPhase _authPhase = AuthPhase.restoring;
  String? _otpEmail;
  String? _authError;
  String? _authMessage;
  String? _workspaceError;
  String? _workspaceErrorRequestId;
  String? _onboardingError;
  bool _isOnboarding = false;
  bool _isRefreshingWorkspaces = false;
  int _workspaceRequestVersion = 0;
  bool _disposed = false;
  bool _initialized = false;
  bool _initialLinkHandled = false;
  int _authVersion = 0;
  String? _pendingSyncIdempotencyKey;

  AppStatus get status => _status;
  AuthPhase get authPhase => _authPhase;
  String? get otpEmail => _otpEmail;
  String? get authError => _authError;
  String? get authMessage => _authMessage;
  String? get workspaceError => _workspaceError;
  String? get workspaceErrorRequestId => _workspaceErrorRequestId;
  String? get onboardingError => _onboardingError;
  bool get isOnboarding => _isOnboarding;
  bool get isRefreshingWorkspaces => _isRefreshingWorkspaces;
  List<WorkspaceDto> get workspaces => _workspaceCache.values
      .map((cache) => cache.workspace)
      .toList(growable: false);
  String? get selectedWorkspaceId => _selectedWorkspaceId;
  WorkspaceDto? get selectedWorkspace => _cache?.workspace;
  InsightRange get range => _cache?.range ?? InsightRange.thirtyDays;
  OverviewViewState get overview =>
      _cache?.overview ?? const OverviewViewState();
  CatalogViewState get catalog => _cache?.catalog ?? const CatalogViewState();
  CustomersViewState get customers =>
      _cache?.customers ?? const CustomersViewState();
  SyncViewState get sync => _cache?.sync ?? const SyncViewState();
  ProductDetailViewState get productDetail =>
      _cache?.productDetail ?? const ProductDetailViewState();
  CustomerDetailViewState get customerDetail =>
      _cache?.customerDetail ?? const CustomerDetailViewState();
  MembersViewState get members => _cache?.members ?? const MembersViewState();
  WorkspaceCache? get _cache {
    final id = _selectedWorkspaceId;
    return id == null ? null : _workspaceCache[id];
  }

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    _authSubscription = _authService.authStateChanges.listen(
      _handleAuthState,
      onError: (_) => _handleAuthState(null),
    );
    _linkSubscription = _deepLinkService.links.listen(_handleDeepLink);
    await _handleAuthState(_authService.currentUser);
    unawaited(_loadInitialLink());
  }

  Future<void> sendOtp(String email) async {
    final normalized = email.trim().toLowerCase();
    if (!_validEmail(normalized)) {
      _authError = 'Enter a valid email address.';
      notifyListeners();
      return;
    }
    _authPhase = AuthPhase.sendingCode;
    _authError = null;
    _authMessage = null;
    _otpEmail = normalized;
    notifyListeners();
    try {
      await _authService.sendEmailOtp(normalized);
      _authPhase = AuthPhase.codeSent;
      _authMessage =
          'If this address can receive Threadline email, a verification code is on its way.';
    } catch (_) {
      _authPhase = AuthPhase.signedOut;
      _authError =
          'We could not start sign-in. Check the address and connection, then try again.';
    }
    notifyListeners();
  }

  Future<void> verifyOtp(String token) async {
    final email = _otpEmail;
    if (email == null) return;
    if (!RegExp(r'^\d{6}$').hasMatch(token.trim())) {
      _authError = 'Enter the six-digit verification code.';
      notifyListeners();
      return;
    }
    _authPhase = AuthPhase.verifyingCode;
    _authError = null;
    notifyListeners();
    try {
      await _authService.verifyEmailOtp(email: email, token: token.trim());
      final user = _authService.currentUser;
      if (user != null) await _handleAuthState(user);
    } catch (_) {
      _authPhase = AuthPhase.codeSent;
      _authError =
          'That code could not be verified. Request a new code and try again.';
      notifyListeners();
    }
  }

  void editEmail() {
    _otpEmail = null;
    _authError = null;
    _authMessage = null;
    _authPhase = AuthPhase.signedOut;
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await _authService.signOut();
    } finally {
      await _handleAuthState(null);
    }
  }

  Future<void> refreshWorkspaces() => _loadWorkspaces();

  Future<void> selectWorkspace(String workspaceId) async {
    if (!_workspaceCache.containsKey(workspaceId) ||
        workspaceId == _selectedWorkspaceId) {
      return;
    }
    _cancelWorkspaceOperations();
    _selectedWorkspaceId = workspaceId;
    _pendingSyncIdempotencyKey = null;
    _replaceCache(
      _workspaceCache[workspaceId]!.copyWith(
        productDetail: const ProductDetailViewState(),
        customerDetail: const CustomerDetailViewState(),
      ),
    );
    _status = AppStatus.ready;
    _workspaceError = null;
    _workspaceErrorRequestId = null;
    notifyListeners();
    await Future.wait<void>([
      loadOverview(refresh: true),
      loadSync(refresh: true),
    ]);
  }

  Future<void> setRange(InsightRange range) async {
    final cache = _cache;
    if (cache == null || cache.range == range) return;
    _replaceCache(
      cache.copyWith(
        range: range,
        overview: cache.overview.copyWith(clearData: true, clearError: true),
        customers: cache.customers.status == LoadStatus.idle
            ? cache.customers
            : cache.customers.copyWith(
                clearItems: true,
                clearCursor: true,
                clearError: true,
              ),
      ),
    );
    notifyListeners();
    if (cache.customers.status != LoadStatus.idle) {
      await searchCustomers(cache.customers.query);
    }
    await loadOverview(refresh: true);
  }

  Future<void> refreshAll() async {
    final cache = _cache;
    if (cache == null) {
      await refreshWorkspaces();
      return;
    }
    final requests = <Future<void>>[
      loadOverview(refresh: true),
      loadSync(refresh: true),
      if (cache.catalog.status != LoadStatus.idle)
        refreshProducts(
          query: cache.catalog.query,
          category: cache.catalog.category,
        ),
      if (cache.customers.status != LoadStatus.idle)
        searchCustomers(cache.customers.query),
    ];
    await Future.wait<void>(requests);
  }

  Future<void> ensureMembers() async {
    final cache = _cache;
    if (cache == null || !cache.workspace.capabilities.canManageMembers) return;
    if (cache.members.status != LoadStatus.idle) return;
    await loadMembers();
  }

  Future<void> loadMembers({bool refresh = false}) async {
    final cache = _cache;
    if (cache == null || !cache.workspace.capabilities.canManageMembers) return;
    _replaceCache(
      cache.copyWith(
        members: cache.members.copyWith(
          status: cache.members.items.isEmpty
              ? LoadStatus.loading
              : LoadStatus.ready,
          isMutating: false,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'members');
    try {
      final page = await _repository.listMembers(
        cache.workspace.id,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          members: current.members.copyWith(
            status: LoadStatus.ready,
            items: page.items,
            isMutating: false,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          members: current.members.copyWith(
            status: current.members.items.isEmpty
                ? LoadStatus.failure
                : LoadStatus.ready,
            isMutating: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> addMember({
    required String userId,
    required WorkspaceRole role,
  }) async {
    final normalized = userId.trim().toLowerCase();
    if (!_validUserId(normalized)) {
      _setMemberError('Enter a valid Supabase user ID.');
      return;
    }
    await _runMemberMutation(() async {
      try {
        await _repository.addMember(
          _selectedWorkspaceId!,
          userId: normalized,
          role: role,
        );
      } on ApiException catch (error) {
        if (error.code != 'already_member') rethrow;
      }
      await loadMembers(refresh: true);
    });
  }

  Future<void> updateMemberRole({
    required String userId,
    required WorkspaceRole role,
  }) {
    return _runMemberMutation(() async {
      await _repository.updateMemberRole(
        _selectedWorkspaceId!,
        userId,
        role: role,
      );
      await loadMembers(refresh: true);
    });
  }

  Future<void> removeMember(String userId) {
    return _runMemberMutation(() async {
      await _repository.removeMember(_selectedWorkspaceId!, userId);
      await loadMembers(refresh: true);
    });
  }

  Future<void> _runMemberMutation(Future<void> Function() operation) async {
    final cache = _cache;
    if (cache == null || cache.members.isMutating) return;
    _replaceCache(
      cache.copyWith(
        members: cache.members.copyWith(isMutating: true, clearError: true),
      ),
    );
    notifyListeners();
    try {
      await operation();
    } catch (error) {
      final current = _cache;
      if (current != null) {
        _replaceCache(
          current.copyWith(
            members: current.members.copyWith(
              isMutating: false,
              error: _messageFor(
                error,
                fallback: 'The membership change could not be completed.',
              ),
              errorRequestId: _requestIdFor(error),
            ),
          ),
        );
      }
    }
    notifyListeners();
  }

  void _setMemberError(String message) {
    final cache = _cache;
    if (cache == null) return;
    _replaceCache(
      cache.copyWith(
        members: cache.members.copyWith(isMutating: false, error: message),
      ),
    );
    notifyListeners();
  }

  Future<void> loadOverview({bool refresh = false}) async {
    final cache = _cache;
    if (cache == null) return;
    final existing = cache.overview;
    _replaceCache(
      cache.copyWith(
        overview: existing.copyWith(
          status: existing.data == null ? LoadStatus.loading : LoadStatus.ready,
          isRefreshing: refresh || existing.data != null,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'overview');
    try {
      final data = await _repository.getOverview(
        cache.workspace.id,
        cache.range,
        cancellationToken: token,
      );
      final isCurrent = _validCache(cache.workspace.id, token);
      if (!isCurrent) return;
      if (data.workspace.id != cache.workspace.id ||
          data.range.preset != cache.range.apiValue) {
        throw const FormatException('Workspace or range mismatch');
      }
      final current = _workspaceCache[cache.workspace.id]!;
      final next = current.overview.copyWith(
        data: data,
        status: LoadStatus.ready,
        isRefreshing: false,
        clearError: true,
      );
      _replaceCache(
        current.copyWith(
          workspace: data.workspace,
          overview: next,
          sync: current.sync.data == null
              ? current.sync.copyWith(data: data.sync)
              : current.sync,
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          overview: current.overview.copyWith(
            status: current.overview.data == null
                ? LoadStatus.failure
                : LoadStatus.ready,
            isRefreshing: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> ensureProducts() async {
    final cache = _cache;
    if (cache == null || cache.catalog.status != LoadStatus.idle) return;
    await refreshProducts(
      query: cache.catalog.query,
      category: cache.catalog.category,
    );
  }

  Future<void> refreshProducts({
    required String query,
    required String category,
  }) async {
    final cache = _cache;
    if (cache == null) return;
    final normalizedQuery = query.trim();
    final normalizedCategory = category.trim();
    final filtersChanged =
        cache.catalog.query != normalizedQuery ||
        cache.catalog.category != normalizedCategory;
    _replaceCache(
      cache.copyWith(
        catalog: cache.catalog.copyWith(
          status: LoadStatus.loading,
          query: normalizedQuery,
          category: normalizedCategory,
          isRefreshing: true,
          isLoadingMore: false,
          clearItems: filtersChanged,
          clearError: true,
          clearCursor: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'catalog');
    try {
      final page = await _repository.listProducts(
        cache.workspace.id,
        query: normalizedQuery,
        category: normalizedCategory,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          catalog: current.catalog.copyWith(
            status: LoadStatus.ready,
            items: page.items,
            nextCursor: page.nextCursor,
            clearCursor: page.nextCursor == null,
            isRefreshing: false,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          catalog: current.catalog.copyWith(
            status: LoadStatus.failure,
            isRefreshing: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> loadMoreProducts() async {
    final cache = _cache;
    final cursor = cache?.catalog.nextCursor;
    if (cache == null ||
        cursor == null ||
        cache.catalog.isLoadingMore ||
        cache.catalog.status == LoadStatus.loading) {
      return;
    }
    _replaceCache(
      cache.copyWith(
        catalog: cache.catalog.copyWith(isLoadingMore: true, clearError: true),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'catalog');
    try {
      final page = await _repository.listProducts(
        cache.workspace.id,
        query: cache.catalog.query,
        category: cache.catalog.category,
        cursor: cursor,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      final current = _workspaceCache[cache.workspace.id]!;
      final ids = {for (final item in current.catalog.items) item.id};
      _replaceCache(
        current.copyWith(
          catalog: current.catalog.copyWith(
            status: LoadStatus.ready,
            items: [
              ...current.catalog.items,
              ...page.items.where((item) => ids.add(item.id)),
            ],
            nextCursor: page.nextCursor,
            clearCursor: page.nextCursor == null,
            isLoadingMore: false,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          catalog: current.catalog.copyWith(
            isLoadingMore: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> ensureCustomers() async {
    final cache = _cache;
    if (cache == null || cache.customers.status != LoadStatus.idle) return;
    await searchCustomers(cache.customers.query);
  }

  Future<void> searchCustomers(String query) async {
    final cache = _cache;
    if (cache == null) return;
    final normalizedQuery = query.trim();
    final queryChanged = cache.customers.query != normalizedQuery;
    _replaceCache(
      cache.copyWith(
        customers: cache.customers.copyWith(
          status: LoadStatus.loading,
          query: normalizedQuery,
          isRefreshing: true,
          isLoadingMore: false,
          clearItems: queryChanged,
          clearError: true,
          clearCursor: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'customers');
    try {
      final page = await _repository.listCustomers(
        cache.workspace.id,
        cache.range,
        query: normalizedQuery,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          customers: current.customers.copyWith(
            status: LoadStatus.ready,
            items: page.items,
            nextCursor: page.nextCursor,
            clearCursor: page.nextCursor == null,
            isRefreshing: false,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          customers: current.customers.copyWith(
            status: LoadStatus.failure,
            isRefreshing: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> loadMoreCustomers() async {
    final cache = _cache;
    final cursor = cache?.customers.nextCursor;
    if (cache == null ||
        cursor == null ||
        cache.customers.isLoadingMore ||
        cache.customers.status == LoadStatus.loading) {
      return;
    }
    _replaceCache(
      cache.copyWith(
        customers: cache.customers.copyWith(
          isLoadingMore: true,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'customers');
    try {
      final page = await _repository.listCustomers(
        cache.workspace.id,
        cache.range,
        query: cache.customers.query,
        cursor: cursor,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      final current = _workspaceCache[cache.workspace.id]!;
      final ids = {for (final item in current.customers.items) item.id};
      _replaceCache(
        current.copyWith(
          customers: current.customers.copyWith(
            status: LoadStatus.ready,
            items: [
              ...current.customers.items,
              ...page.items.where((item) => ids.add(item.id)),
            ],
            nextCursor: page.nextCursor,
            clearCursor: page.nextCursor == null,
            isLoadingMore: false,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          customers: current.customers.copyWith(
            isLoadingMore: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> loadProductDetail(String productId) async {
    final cache = _cache;
    if (cache == null || productId.trim().isEmpty) return;
    _replaceCache(
      cache.copyWith(
        productDetail: cache.productDetail.copyWith(
          status: LoadStatus.loading,
          requestedId: productId,
          clearData: true,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'product-detail');
    try {
      final data = await _repository.getProductDetail(
        cache.workspace.id,
        productId,
        cache.range,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      if (data.product.id != productId) {
        throw const FormatException('Product mismatch');
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          productDetail: current.productDetail.copyWith(
            status: LoadStatus.ready,
            data: data,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          productDetail: current.productDetail.copyWith(
            status: LoadStatus.failure,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> loadCustomerDetail(String customerId) async {
    final cache = _cache;
    if (cache == null || customerId.trim().isEmpty) return;
    _replaceCache(
      cache.copyWith(
        customerDetail: cache.customerDetail.copyWith(
          status: LoadStatus.loading,
          requestedId: customerId,
          clearData: true,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'customer-detail');
    try {
      final data = await _repository.getCustomerDetail(
        cache.workspace.id,
        customerId,
        cache.range,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      if (data.customer.id != customerId) {
        throw const FormatException('Customer mismatch');
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          customerDetail: current.customerDetail.copyWith(
            status: LoadStatus.ready,
            data: data,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          customerDetail: current.customerDetail.copyWith(
            status: LoadStatus.failure,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> loadSync({bool refresh = false}) async {
    final cache = _cache;
    if (cache == null) return;
    _replaceCache(
      cache.copyWith(
        sync: cache.sync.copyWith(
          status: cache.sync.data == null
              ? LoadStatus.loading
              : LoadStatus.ready,
          isRefreshing: refresh || cache.sync.data != null,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'sync');
    try {
      final data = await _repository.getSync(
        cache.workspace.id,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          sync: current.sync.copyWith(
            status: LoadStatus.ready,
            data: data,
            isRefreshing: false,
            clearError: true,
          ),
        ),
      );
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          sync: current.sync.copyWith(
            status: current.sync.data == null
                ? LoadStatus.failure
                : LoadStatus.ready,
            isRefreshing: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
    }
    notifyListeners();
  }

  Future<void> enqueueSync() async {
    final cache = _cache;
    if (cache == null ||
        !cache.workspace.capabilities.canEnqueueSync ||
        cache.sync.isEnqueueing) {
      return;
    }
    _replaceCache(
      cache.copyWith(
        sync: cache.sync.copyWith(
          isEnqueueing: true,
          clearJob: true,
          clearError: true,
        ),
      ),
    );
    notifyListeners();
    final token = _operation(cache.workspace.id, 'sync-poll');
    _pendingSyncIdempotencyKey ??=
        'sync-${cache.workspace.id}-${DateTime.now().microsecondsSinceEpoch}';
    try {
      final queued = await _repository.enqueueSync(
        cache.workspace.id,
        idempotencyKey: _pendingSyncIdempotencyKey,
        cancellationToken: token,
      );
      if (!_validCache(cache.workspace.id, token)) return;
      var current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          sync: current.sync.copyWith(
            status: LoadStatus.loading,
            isEnqueueing: false,
          ),
        ),
      );
      notifyListeners();
      while (_validCache(cache.workspace.id, token)) {
        final job = await _repository.getJob(
          cache.workspace.id,
          queued.jobId,
          cancellationToken: token,
        );
        if (job.workspaceId != cache.workspace.id ||
            job.jobId != queued.jobId) {
          throw const FormatException('Workspace or job mismatch');
        }
        if (!_validCache(cache.workspace.id, token)) return;
        current = _workspaceCache[cache.workspace.id]!;
        _replaceCache(
          current.copyWith(
            sync: current.sync.copyWith(
              job: job,
              status: job.isTerminal ? LoadStatus.ready : LoadStatus.loading,
              isEnqueueing: false,
            ),
          ),
        );
        notifyListeners();
        if (job.isTerminal) {
          _pendingSyncIdempotencyKey = null;
          await loadSync(refresh: true);
          return;
        }
        await _delay(syncPollInterval);
      }
    } catch (error) {
      if (!_validCache(cache.workspace.id, token) || _isCancelled(error)) {
        return;
      }
      final current = _workspaceCache[cache.workspace.id]!;
      _replaceCache(
        current.copyWith(
          sync: current.sync.copyWith(
            status: LoadStatus.ready,
            isEnqueueing: false,
            error: _messageFor(error),
            errorRequestId: _requestIdFor(error),
          ),
        ),
      );
      notifyListeners();
    }
  }

  Future<void> installShop(String value) async {
    final normalized = normalizeShopDomain(value);
    if (normalized == null) {
      _onboardingError = 'Enter a valid store.myshopify.com domain.';
      notifyListeners();
      return;
    }
    final authVersion = _authVersion;
    final accessToken = _accessToken;
    _isOnboarding = true;
    _onboardingError = null;
    notifyListeners();
    try {
      final authorization = await _repository.createShopifyInstall(
        normalized,
        _shopifyMobileReturnUrl,
      );
      if (authVersion != _authVersion || accessToken != _accessToken) return;
      if (authorization.shopDomain != normalized ||
          authorization.returnUrl != _shopifyMobileReturnUrl ||
          authorization.authorizationUrl.host.toLowerCase() != normalized) {
        throw const FormatException('Shopify install response mismatch');
      }
      await _authorizationLauncher.open(authorization.authorizationUrl);
      _onboardingError = null;
    } catch (error) {
      if (authVersion == _authVersion && accessToken == _accessToken) {
        _onboardingError = _messageFor(
          error,
          fallback: 'Shopify authorization could not be started.',
        );
      }
    }
    if (authVersion == _authVersion) {
      _isOnboarding = false;
      notifyListeners();
    }
  }

  Future<void> _loadWorkspaces() async {
    final requestVersion = ++_workspaceRequestVersion;
    _isRefreshingWorkspaces = _workspaceCache.isNotEmpty;
    _status = _workspaceCache.isEmpty ? AppStatus.loadingWorkspaces : _status;
    _workspaceError = null;
    _workspaceErrorRequestId = null;
    notifyListeners();
    _operations.remove('workspaces')?.cancel();
    final token = CancellationToken();
    _operations['workspaces'] = token;
    try {
      final values = await _repository.listWorkspaces(cancellationToken: token);
      if (_disposed ||
          requestVersion != _workspaceRequestVersion ||
          token.isCancelled) {
        return;
      }
      final serverIds = {for (final workspace in values) workspace.id};
      _workspaceCache.removeWhere((id, _) => !serverIds.contains(id));
      for (final workspace in values) {
        final existing = _workspaceCache[workspace.id];
        _workspaceCache[workspace.id] = existing == null
            ? WorkspaceCache(
                workspace: workspace,
                range: existing?.range ?? InsightRange.thirtyDays,
              )
            : existing.copyWith(workspace: workspace);
      }
      _isRefreshingWorkspaces = false;
      if (_workspaceCache.isEmpty) {
        _selectedWorkspaceId = null;
        _status = AppStatus.noWorkspaces;
      } else {
        if (_selectedWorkspaceId == null ||
            !_workspaceCache.containsKey(_selectedWorkspaceId)) {
          _selectedWorkspaceId = values.first.id;
        }
        _status = AppStatus.ready;
        final shouldRefresh =
            _selectedWorkspaceId == values.first.id &&
            _workspaceCache[values.first.id]!.overview.status ==
                LoadStatus.idle;
        if (shouldRefresh) {
          await Future.wait<void>([loadOverview(), loadSync()]);
        }
      }
    } catch (error) {
      if (_disposed ||
          requestVersion != _workspaceRequestVersion ||
          _isCancelled(error)) {
        return;
      }
      _isRefreshingWorkspaces = false;
      _workspaceError = _messageFor(error);
      _workspaceErrorRequestId = _requestIdFor(error);
      if (_workspaceCache.isEmpty) _status = AppStatus.failure;
    }
    notifyListeners();
  }

  Future<void> _handleAuthState(AuthUser? user) async {
    if (_disposed) return;
    if (user == null) {
      _authVersion++;
      _accessToken = null;
      _workspaceRequestVersion++;
      _cancelWorkspaceOperations();
      _workspaceCache.clear();
      _selectedWorkspaceId = null;
      _otpEmail = null;
      _authError = null;
      _authMessage = null;
      _authPhase = AuthPhase.signedOut;
      _status = AppStatus.signedOut;
      notifyListeners();
      return;
    }
    final tokenChanged = _accessToken != user.accessToken;
    if (tokenChanged) _authVersion++;
    _accessToken = user.accessToken;
    _authPhase = AuthPhase.authenticated;
    _authError = null;
    _authMessage = null;
    if (tokenChanged || _workspaceCache.isEmpty) await _loadWorkspaces();
  }

  Future<void> _loadInitialLink() async {
    if (_initialLinkHandled) return;
    _initialLinkHandled = true;
    try {
      final uri = await _deepLinkService.getInitialLink();
      if (uri != null) _handleDeepLink(uri);
    } catch (_) {}
  }

  void _handleDeepLink(Uri uri) {
    if (!_isShopifyInstallReturn(uri) || _accessToken == null) return;
    unawaited(_loadWorkspaces());
  }

  bool _isShopifyInstallReturn(Uri uri) {
    final workspace = uri.queryParameters['workspace'];
    return uri.scheme == _shopifyMobileReturnUrl.scheme &&
        uri.host == _shopifyMobileReturnUrl.host &&
        uri.path == _shopifyMobileReturnUrl.path &&
        uri.userInfo.isEmpty &&
        !uri.hasPort &&
        !uri.hasFragment &&
        uri.queryParameters.length == 2 &&
        workspace != null &&
        workspace.isNotEmpty &&
        uri.queryParameters['installed'] == '1';
  }

  CancellationToken _operation(String workspaceId, String feature) {
    _operations.remove('$workspaceId:$feature')?.cancel();
    final token = CancellationToken();
    _operations['$workspaceId:$feature'] = token;
    return token;
  }

  bool _validCache(String workspaceId, CancellationToken token) {
    return !_disposed &&
        !token.isCancelled &&
        _selectedWorkspaceId == workspaceId &&
        _workspaceCache.containsKey(workspaceId);
  }

  void _replaceCache(WorkspaceCache cache) {
    if (_disposed) return;
    _workspaceCache[cache.workspace.id] = cache;
  }

  void _cancelWorkspaceOperations() {
    for (final entry in _operations.entries.toList()) {
      if (entry.key == 'workspaces' ||
          entry.key.startsWith('$_selectedWorkspaceId:')) {
        entry.value.cancel();
        _operations.remove(entry.key);
      }
    }
  }

  void _cancelAllOperations() {
    for (final token in _operations.values) {
      token.cancel();
    }
    _operations.clear();
  }

  bool _isCancelled(Object error) =>
      error is ApiException && error.kind == ApiErrorKind.cancelled;

  String _messageFor(Object error, {String? fallback}) {
    if (error is ApiException) {
      return switch (error.kind) {
        ApiErrorKind.timeout => 'The service took too long to respond.',
        ApiErrorKind.network => 'The commerce service could not be reached.',
        ApiErrorKind.unauthorized =>
          'Your session is no longer authorized. Sign in again.',
        ApiErrorKind.forbidden => 'Your account cannot access this workspace.',
        ApiErrorKind.notFound => 'The requested record was not found.',
        ApiErrorKind.validation =>
          error.detail?.trim().isNotEmpty == true
              ? '${error.message}: ${error.detail}'
              : error.message,
        ApiErrorKind.server =>
          'The commerce service could not complete the request.',
        ApiErrorKind.malformed =>
          'The service returned data the app could not read.',
        ApiErrorKind.conflict =>
          error.message.trim().isNotEmpty
              ? error.message
              : fallback ?? 'The request could not be completed.',
        ApiErrorKind.configuration ||
        ApiErrorKind.cancelled ||
        ApiErrorKind.unknown =>
          fallback ?? 'The request could not be completed.',
      };
    }
    if (error is FormatException) {
      return 'The service returned data the app could not read.';
    }
    return fallback ?? 'The request could not be completed.';
  }

  String? _requestIdFor(Object error) =>
      error is ApiException ? error.requestId : null;

  @override
  void dispose() {
    _disposed = true;
    _workspaceRequestVersion++;
    _cancelAllOperations();
    unawaited(_authSubscription?.cancel());
    unawaited(_linkSubscription?.cancel());
    super.dispose();
  }
}

String? normalizeShopDomain(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized.length > 253 ||
      normalized.contains('..') ||
      normalized.contains('--') ||
      !normalized.endsWith('.myshopify.com')) {
    return null;
  }
  final label = normalized.substring(
    0,
    normalized.length - '.myshopify.com'.length,
  );
  return RegExp(r'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$').hasMatch(label)
      ? normalized
      : null;
}

bool _validEmail(String value) =>
    RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value) &&
    value.length <= 320;

bool _validUserId(String value) => RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  caseSensitive: false,
).hasMatch(value);
