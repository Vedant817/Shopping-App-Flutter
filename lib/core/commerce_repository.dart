import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'models.dart';

abstract interface class CommerceRepository {
  Future<List<WorkspaceDto>> listWorkspaces({
    CancellationToken? cancellationToken,
  });
  Future<WorkspaceDto> getWorkspace(
    String workspaceId, {
    CancellationToken? cancellationToken,
  });
  Future<OverviewDto> getOverview(
    String workspaceId,
    InsightRange range, {
    CancellationToken? cancellationToken,
  });
  Future<ProductPageDto> listProducts(
    String workspaceId, {
    String? query,
    String? category,
    String? cursor,
    CancellationToken? cancellationToken,
  });
  Future<ProductDetailDto> getProductDetail(
    String workspaceId,
    String productId,
    InsightRange range, {
    CancellationToken? cancellationToken,
  });
  Future<CustomerPageDto> listCustomers(
    String workspaceId,
    InsightRange range, {
    String? query,
    String? cursor,
    CancellationToken? cancellationToken,
  });
  Future<CustomerDetailDto> getCustomerDetail(
    String workspaceId,
    String customerId,
    InsightRange range, {
    bool includeCancelled = false,
    CancellationToken? cancellationToken,
  });
  Future<OrderPageDto> listOrders(
    String workspaceId,
    InsightRange range, {
    String? customerId,
    bool includeCancelled = false,
    String? cursor,
    CancellationToken? cancellationToken,
  });
  Future<SyncDto> getSync(
    String workspaceId, {
    CancellationToken? cancellationToken,
  });
  Future<IngestionJobDto> getJob(
    String workspaceId,
    String jobId, {
    CancellationToken? cancellationToken,
  });
  Future<SyncEnqueueDto> enqueueSync(
    String workspaceId, {
    List<String> resources = const [
      'products',
      'customers',
      'orders',
      'carts',
      'checkouts',
    ],
    String? idempotencyKey,
    CancellationToken? cancellationToken,
  });
  Future<WorkspaceMemberPageDto> listMembers(
    String workspaceId, {
    CancellationToken? cancellationToken,
  });
  Future<MembershipMutationDto> addMember(
    String workspaceId, {
    required String userId,
    required WorkspaceRole role,
    CancellationToken? cancellationToken,
  });
  Future<MembershipMutationDto> updateMemberRole(
    String workspaceId,
    String userId, {
    required WorkspaceRole role,
    CancellationToken? cancellationToken,
  });
  Future<void> removeMember(
    String workspaceId,
    String userId, {
    CancellationToken? cancellationToken,
  });
  Future<ShopifyInstallAuthorizationDto> createShopifyInstall(
    String shopDomain,
    Uri mobileReturnUrl, {
    CancellationToken? cancellationToken,
  });
}

class HttpCommerceRepository implements CommerceRepository {
  HttpCommerceRepository({required ApiClient client, this.pageSize = 20})
    : _client = client;

  final ApiClient _client;
  final int pageSize;

  @override
  Future<List<WorkspaceDto>> listWorkspaces({
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<List<WorkspaceDto>>(
      const ['v1', 'workspaces'],
      decode: (json) => _list(
        json,
        'items',
      ).map(WorkspaceDto.fromJson).toList(growable: false),
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<WorkspaceDto> getWorkspace(
    String workspaceId, {
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<WorkspaceDto>(
      ['v1', 'workspaces', workspaceId],
      decode: WorkspaceDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<OverviewDto> getOverview(
    String workspaceId,
    InsightRange range, {
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<OverviewDto>(
      ['v1', 'workspaces', workspaceId, 'overview'],
      query: {'preset': range.apiValue},
      decode: OverviewDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<ProductPageDto> listProducts(
    String workspaceId, {
    String? query,
    String? category,
    String? cursor,
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<ProductPageDto>(
      ['v1', 'workspaces', workspaceId, 'products'],
      query: {
        'limit': '$pageSize',
        if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
        if (category != null && category.trim().isNotEmpty)
          'category': category.trim(),
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
      decode: ProductPageDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<ProductDetailDto> getProductDetail(
    String workspaceId,
    String productId,
    InsightRange range, {
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<ProductDetailDto>(
      ['v1', 'workspaces', workspaceId, 'products', productId],
      query: {'preset': range.apiValue},
      decode: ProductDetailDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<CustomerPageDto> listCustomers(
    String workspaceId,
    InsightRange range, {
    String? query,
    String? cursor,
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<CustomerPageDto>(
      ['v1', 'workspaces', workspaceId, 'customers'],
      query: {
        'limit': '$pageSize',
        'preset': range.apiValue,
        if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
      decode: CustomerPageDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<CustomerDetailDto> getCustomerDetail(
    String workspaceId,
    String customerId,
    InsightRange range, {
    bool includeCancelled = false,
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<CustomerDetailDto>(
      ['v1', 'workspaces', workspaceId, 'customers', customerId],
      query: {
        'preset': range.apiValue,
        'includeCancelled': '$includeCancelled',
      },
      decode: CustomerDetailDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<OrderPageDto> listOrders(
    String workspaceId,
    InsightRange range, {
    String? customerId,
    bool includeCancelled = false,
    String? cursor,
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<OrderPageDto>(
      ['v1', 'workspaces', workspaceId, 'orders'],
      query: {
        'limit': '$pageSize',
        'preset': range.apiValue,
        'includeCancelled': '$includeCancelled',
        if (customerId != null && customerId.isNotEmpty)
          'customerId': customerId,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
      decode: OrderPageDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<SyncDto> getSync(
    String workspaceId, {
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<SyncDto>(
      ['v1', 'workspaces', workspaceId, 'sync'],
      decode: SyncDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<IngestionJobDto> getJob(
    String workspaceId,
    String jobId, {
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<IngestionJobDto>(
      ['v1', 'workspaces', workspaceId, 'jobs', jobId],
      decode: IngestionJobDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<SyncEnqueueDto> enqueueSync(
    String workspaceId, {
    List<String> resources = const [
      'products',
      'customers',
      'orders',
      'carts',
      'checkouts',
    ],
    String? idempotencyKey,
    CancellationToken? cancellationToken,
  }) {
    return _client.postObject<SyncEnqueueDto>(
      ['v1', 'workspaces', workspaceId, 'sync'],
      body: {'resources': resources},
      headers: idempotencyKey == null
          ? null
          : {'Idempotency-Key': idempotencyKey},
      decode: SyncEnqueueDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<WorkspaceMemberPageDto> listMembers(
    String workspaceId, {
    CancellationToken? cancellationToken,
  }) {
    return _client.getObject<WorkspaceMemberPageDto>(
      ['v1', 'workspaces', workspaceId, 'members'],
      decode: WorkspaceMemberPageDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<MembershipMutationDto> addMember(
    String workspaceId, {
    required String userId,
    required WorkspaceRole role,
    CancellationToken? cancellationToken,
  }) {
    return _client.postObject<MembershipMutationDto>(
      ['v1', 'workspaces', workspaceId, 'members'],
      body: {'userId': userId, 'role': role.name},
      decode: MembershipMutationDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<MembershipMutationDto> updateMemberRole(
    String workspaceId,
    String userId, {
    required WorkspaceRole role,
    CancellationToken? cancellationToken,
  }) {
    return _client.patchObject<MembershipMutationDto>(
      ['v1', 'workspaces', workspaceId, 'members', userId],
      body: {'role': role.name},
      decode: MembershipMutationDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }

  @override
  Future<void> removeMember(
    String workspaceId,
    String userId, {
    CancellationToken? cancellationToken,
  }) {
    return _client.delete([
      'v1',
      'workspaces',
      workspaceId,
      'members',
      userId,
    ], cancellationToken: cancellationToken);
  }

  @override
  Future<ShopifyInstallAuthorizationDto> createShopifyInstall(
    String shopDomain,
    Uri mobileReturnUrl, {
    CancellationToken? cancellationToken,
  }) {
    return _client.postObject<ShopifyInstallAuthorizationDto>(
      const ['v1', 'auth', 'shopify', 'install'],
      body: {'shop': shopDomain, 'returnUrl': mobileReturnUrl.toString()},
      decode: ShopifyInstallAuthorizationDto.fromJson,
      cancellationToken: cancellationToken,
    );
  }
}

class ApiClient {
  ApiClient({
    required Uri baseUrl,
    required Future<String?> Function() accessToken,
    http.Client Function()? clientFactory,
    this.timeout = const Duration(seconds: 20),
    Random? random,
  }) : _baseUrl = baseUrl,
       _accessToken = accessToken,
       _clientFactory = clientFactory ?? http.Client.new,
       _random = random ?? Random.secure();

  final Uri _baseUrl;
  final Future<String?> Function() _accessToken;
  final http.Client Function() _clientFactory;
  final Random _random;
  final Duration timeout;

  Future<T> getObject<T>(
    List<String> path, {
    required T Function(Map<String, dynamic> json) decode,
    Map<String, String>? query,
    CancellationToken? cancellationToken,
  }) async {
    final response = await _send(
      method: 'GET',
      path: path,
      query: query,
      cancellationToken: cancellationToken,
    );
    return _decodeObject(response, decode);
  }

  Future<T> postObject<T>(
    List<String> path, {
    required Map<String, Object?> body,
    required T Function(Map<String, dynamic> json) decode,
    Map<String, String>? query,
    Map<String, String>? headers,
    CancellationToken? cancellationToken,
  }) async {
    final response = await _send(
      method: 'POST',
      path: path,
      query: query,
      headers: headers,
      body: body,
      cancellationToken: cancellationToken,
    );
    return _decodeObject(response, decode);
  }

  Future<T> patchObject<T>(
    List<String> path, {
    required Map<String, Object?> body,
    required T Function(Map<String, dynamic> json) decode,
    Map<String, String>? query,
    Map<String, String>? headers,
    CancellationToken? cancellationToken,
  }) async {
    final response = await _send(
      method: 'PATCH',
      path: path,
      query: query,
      headers: headers,
      body: body,
      cancellationToken: cancellationToken,
    );
    return _decodeObject(response, decode);
  }

  Future<void> delete(
    List<String> path, {
    Map<String, String>? query,
    Map<String, String>? headers,
    CancellationToken? cancellationToken,
  }) async {
    await _send(
      method: 'DELETE',
      path: path,
      query: query,
      headers: headers,
      cancellationToken: cancellationToken,
    );
  }

  Future<_ApiResponse> _send({
    required String method,
    required List<String> path,
    Map<String, String>? query,
    Map<String, String>? headers,
    Map<String, Object?>? body,
    CancellationToken? cancellationToken,
  }) async {
    final token = cancellationToken ?? CancellationToken();
    token.throwIfCancelled();
    final uri = _buildUri(path, query);
    if (uri.scheme != 'https' || uri.origin != _baseUrl.origin) {
      throw const ApiException(
        kind: ApiErrorKind.configuration,
        code: 'insecure_api_url',
        message: 'The API request did not target the configured HTTPS service.',
        requestId: 'not-sent',
      );
    }
    final accessToken = await _accessToken();
    token.throwIfCancelled();
    if (accessToken == null || accessToken.isEmpty) {
      throw const ApiException(
        kind: ApiErrorKind.unauthorized,
        code: 'authentication_required',
        message: 'Sign in is required to continue.',
        requestId: 'not-sent',
      );
    }
    final requestId = _requestId();
    final client = _clientFactory();
    token.bind(client);
    try {
      final request = http.Request(method, uri)
        ..headers.addAll({
          'accept': 'application/json, application/problem+json',
          'authorization': 'Bearer $accessToken',
          'x-request-id': requestId,
          if (body != null) 'content-type': 'application/json',
          ...?headers,
        });
      if (body != null) request.body = jsonEncode(body);
      final streamed = await client.send(request).timeout(timeout);
      token.throwIfCancelled();
      final bytes = await streamed.stream.toBytes().timeout(timeout);
      token.throwIfCancelled();
      final response = _ApiResponse(
        statusCode: streamed.statusCode,
        headers: streamed.headers,
        body: bytes,
        requestId: streamed.headers['x-request-id'] ?? requestId,
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw _problem(response);
      }
      return response;
    } on TimeoutException {
      throw ApiException(
        kind: ApiErrorKind.timeout,
        code: 'request_timeout',
        message: 'The service took too long to respond.',
        requestId: requestId,
      );
    } on ApiException {
      rethrow;
    } on http.ClientException {
      if (token.isCancelled) {
        throw ApiException(
          kind: ApiErrorKind.cancelled,
          code: 'request_cancelled',
          message: 'The request was cancelled.',
          requestId: requestId,
        );
      }
      throw ApiException(
        kind: ApiErrorKind.network,
        code: 'service_unreachable',
        message: 'The commerce service could not be reached.',
        requestId: requestId,
      );
    } catch (_) {
      if (token.isCancelled) {
        throw ApiException(
          kind: ApiErrorKind.cancelled,
          code: 'request_cancelled',
          message: 'The request was cancelled.',
          requestId: requestId,
        );
      }
      throw ApiException(
        kind: ApiErrorKind.network,
        code: 'service_unreachable',
        message: 'The commerce service could not be reached.',
        requestId: requestId,
      );
    } finally {
      token.unbind();
      client.close();
    }
  }

  Uri _buildUri(List<String> path, Map<String, String>? query) {
    final baseSegments = _baseUrl.pathSegments.where((part) => part.isNotEmpty);
    return _baseUrl.replace(
      pathSegments: [...baseSegments, ...path],
      queryParameters: query == null || query.isEmpty ? null : query,
    );
  }

  String _requestId() {
    final values = List.generate(
      16,
      (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    return 'flutter-$values';
  }

  static T _decodeObject<T>(
    _ApiResponse response,
    T Function(Map<String, dynamic> json) decode,
  ) {
    try {
      final decoded = jsonDecode(utf8.decode(response.body));
      if (decoded is! Map) {
        throw const FormatException('Expected a JSON object');
      }
      return decode(decoded.map((key, value) => MapEntry('$key', value)));
    } on FormatException {
      throw ApiException(
        kind: ApiErrorKind.malformed,
        code: 'invalid_response',
        message: 'The service returned an invalid response.',
        requestId: response.requestId,
      );
    } on TypeError {
      throw ApiException(
        kind: ApiErrorKind.malformed,
        code: 'invalid_response',
        message: 'The service returned an invalid response.',
        requestId: response.requestId,
      );
    }
  }

  static ApiException _problem(_ApiResponse response) {
    Map<String, dynamic>? problem;
    try {
      final decoded = jsonDecode(utf8.decode(response.body));
      if (decoded is Map) {
        problem = decoded.map((key, value) => MapEntry('$key', value));
      }
    } on FormatException {
      problem = null;
    }
    final status = response.statusCode;
    final kind = switch (status) {
      401 => ApiErrorKind.unauthorized,
      403 => ApiErrorKind.forbidden,
      404 => ApiErrorKind.notFound,
      409 => ApiErrorKind.conflict,
      400 || 422 => ApiErrorKind.validation,
      >= 500 => ApiErrorKind.server,
      _ => ApiErrorKind.unknown,
    };
    final title = problem?['title'];
    final detail = problem?['detail'];
    final code = problem?['code'];
    final type = problem?['type'];
    final instance = problem?['instance'];
    final bodyRequestId = problem?['requestId'];
    final extensions = problem?['extensions'];
    return ApiException(
      kind: kind,
      code: code is String && code.isNotEmpty
          ? code
          : status == 409 && problem?['status'] == 'already_member'
          ? 'already_member'
          : 'http_$status',
      message: title is String && title.isNotEmpty
          ? title
          : 'The service could not complete the request.',
      detail: detail is String && detail.isNotEmpty ? detail : null,
      type: type is String && type.isNotEmpty ? type : null,
      instance: instance is String && instance.isNotEmpty ? instance : null,
      extensions: extensions is Map
          ? extensions.map((key, value) => MapEntry(key, value))
          : null,
      requestId: bodyRequestId is String && bodyRequestId.isNotEmpty
          ? bodyRequestId
          : response.requestId,
      statusCode: status,
    );
  }
}

class ApiException implements Exception {
  const ApiException({
    required this.kind,
    required this.code,
    required this.message,
    required this.requestId,
    this.detail,
    this.type,
    this.instance,
    this.extensions,
    this.statusCode,
  });

  final ApiErrorKind kind;
  final String code;
  final String message;
  final String? detail;
  final String? type;
  final String? instance;
  final Map<String, dynamic>? extensions;
  final String requestId;
  final int? statusCode;

  @override
  String toString() => 'ApiException($code, $requestId)';
}

enum ApiErrorKind {
  configuration,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
  server,
  timeout,
  cancelled,
  network,
  malformed,
  unknown,
}

class CancellationToken {
  bool _cancelled = false;
  http.Client? _client;

  bool get isCancelled => _cancelled;

  void cancel() {
    if (_cancelled) return;
    _cancelled = true;
    _client?.close();
  }

  void throwIfCancelled() {
    if (_cancelled) {
      throw const ApiException(
        kind: ApiErrorKind.cancelled,
        code: 'request_cancelled',
        message: 'The request was cancelled.',
        requestId: 'cancelled',
      );
    }
  }

  void bind(http.Client client) {
    if (_cancelled) {
      client.close();
      throw const ApiException(
        kind: ApiErrorKind.cancelled,
        code: 'request_cancelled',
        message: 'The request was cancelled.',
        requestId: 'cancelled',
      );
    }
    _client = client;
  }

  void unbind() {
    _client = null;
  }
}

class _ApiResponse {
  const _ApiResponse({
    required this.statusCode,
    required this.headers,
    required this.body,
    required this.requestId,
  });

  final int statusCode;
  final Map<String, String> headers;
  final List<int> body;
  final String requestId;
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
