import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:threadline/core/commerce_repository.dart';
import 'package:threadline/core/config.dart';
import 'package:threadline/core/models.dart';

/// Exercises the real HttpCommerceRepository against the deployed API with a
/// real Supabase session, so the client DTO contract is checked against live
/// responses rather than fixtures. Credentials come from the environment and
/// are never written into the repository.
void main() {
  final apiBaseUrl = Platform.environment['API_BASE_URL'];
  final supabaseUrl = Platform.environment['SUPABASE_URL'];
  final publishableKey = Platform.environment['SUPABASE_PUBLISHABLE_KEY'];
  final email = Platform.environment['VERIFY_USER_EMAIL'];
  final password = Platform.environment['VERIFY_USER_PASSWORD'];

  if (apiBaseUrl == null ||
      supabaseUrl == null ||
      publishableKey == null ||
      email == null ||
      password == null) {
    test(
      'live client contract is configured',
      () {},
      skip: 'VERIFY_USER_* environment is not set',
    );
    return;
  }

  late String accessToken;
  late CommerceRepository repository;

  setUpAll(() async {
    final response = await http.post(
      Uri.parse('$supabaseUrl/auth/v1/token?grant_type=password'),
      headers: {'apikey': publishableKey, 'content-type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (response.statusCode != 200) {
      fail('supabase sign-in failed with ${response.statusCode}');
    }
    accessToken =
        (jsonDecode(response.body) as Map<String, dynamic>)['access_token']
            as String;

    final config = RuntimeConfig.fromValues(
      apiBaseUrl: apiBaseUrl,
      supabaseUrl: supabaseUrl,
      supabasePublishableKey: publishableKey,
      shopifyMobileReturnUrl: 'threadline://shopify/install',
    );
    expect(
      config.isValid,
      isTrue,
      reason: config.issues
          .map((issue) => '${issue.name}: ${issue.message}')
          .join('; '),
    );
    repository = HttpCommerceRepository(
      client: ApiClient(
        baseUrl: config.apiBaseUrl!,
        accessToken: () async => accessToken,
        clientFactory: http.Client.new,
      ),
    );
  });

  test('lists the workspace created by the live Shopify install', () async {
    final workspaces = await repository.listWorkspaces();
    expect(
      workspaces,
      isNotEmpty,
      reason: 'the install should have created a workspace',
    );
    final workspace = workspaces.first;
    expect(workspace.shopDomain, 'vedant-mahajan-store.myshopify.com');
    expect(workspace.currencyCode, 'INR');
    expect(workspace.role, WorkspaceRole.owner);
    expect(workspace.capabilities.canEnqueueSync, isTrue);
    expect(workspace.capabilities.canChangeOwnerRoles, isTrue);
  });

  test(
    'reads the live overview with a dense trend and a truthful basis',
    () async {
      final workspaces = await repository.listWorkspaces();
      final overview = await repository.getOverview(
        workspaces.first.id,
        InsightRange.thirtyDays,
      );
      expect(overview.metrics.currencyCode, 'INR');
      expect(
        overview.metrics.metricBasis,
        MetricBasis.grossNonCancelledOrderValue,
      );
      expect(
        overview.trend,
        isNotEmpty,
        reason: 'the trend must be dense, not empty',
      );
      for (var index = 1; index < overview.trend.length; index++) {
        final previous = overview.trend[index - 1].date;
        final current = overview.trend[index].date;
        expect(
          current.difference(previous).inDays,
          1,
          reason: 'gap before ${overview.trend[index].date}',
        );
      }
    },
  );

  test('reads the products that synced from the real Admin API', () async {
    final workspaces = await repository.listWorkspaces();
    final page = await repository.listProducts(workspaces.first.id);
    expect(
      page.items,
      isNotEmpty,
      reason: 'the dev store has products that should have synced',
    );
    final titles = page.items.map((product) => product.title).toSet();
    expect(titles, containsAll(['T Shirt', 'Yellow Snowboard']));
    for (final product in page.items) {
      expect(product.status, isNotEmpty);
      expect(
        product.variantsTruncated,
        isFalse,
        reason: 'variants were fully fetched for ${product.title}',
      );
    }
  });

  test('product detail includes variant rows from the live sync', () async {
    final workspaces = await repository.listWorkspaces();
    final products = await repository.listProducts(workspaces.first.id);
    final detail = await repository.getProductDetail(
      workspaces.first.id,
      products.items.first.id,
      InsightRange.thirtyDays,
    );
    expect(detail.product.id, products.items.first.id);
    expect(detail.product.variants, isNotEmpty);
    expect(detail.product.variants.first.price, isNotNull);
  });

  test('empty tenants return empty pages rather than invented rows', () async {
    final workspaces = await repository.listWorkspaces();
    final customers = await repository.listCustomers(
      workspaces.first.id,
      InsightRange.thirtyDays,
    );
    final orders = await repository.listOrders(
      workspaces.first.id,
      InsightRange.thirtyDays,
    );
    expect(
      customers.items,
      isEmpty,
      reason: 'the dev store has no customers yet',
    );
    expect(orders.items, isEmpty, reason: 'the dev store has no orders yet');
    expect(customers.nextCursor, isNull);
    expect(orders.nextCursor, isNull);
  });

  test('server side search filters instead of returning everything', () async {
    final workspaces = await repository.listWorkspaces();
    final hit = await repository.listProducts(
      workspaces.first.id,
      query: 'shirt',
    );
    expect(hit.items, isNotEmpty);
    final miss = await repository.listProducts(
      workspaces.first.id,
      query: 'zzz-no-such-product',
    );
    expect(miss.items, isEmpty);
  });

  test('the owner can read the member roster over the live API', () async {
    final workspaces = await repository.listWorkspaces();
    final members = await repository.listMembers(workspaces.first.id);
    expect(members.items, isNotEmpty);
    expect(
      members.items.any((member) => member.role == WorkspaceRole.owner),
      isTrue,
    );
  });

  test('the live sync state reflects the completed full sync', () async {
    final workspaces = await repository.listWorkspaces();
    final sync = await repository.getSync(workspaces.first.id);
    expect(sync.status, isNot(SyncStatus.idle));
  });

  test(
    'the Shopify install endpoint issues a PKCE challenge on the live API',
    () async {
      final authorization = await repository.createShopifyInstall(
        'vedant-mahajan-store.myshopify.com',
        Uri.parse('threadline://shopify/install'),
      );
      final url = authorization.authorizationUrl;
      expect(url.host, 'vedant-mahajan-store.myshopify.com');
      expect(url.queryParameters['code_challenge'], isNotEmpty);
      expect(url.queryParameters['code_challenge_method'], 'S256');
      expect(
        url.queryParameters['scope'],
        'read_products,read_customers,read_orders',
      );
      expect(
        authorization.returnUrl.toString(),
        'threadline://shopify/install',
      );
    },
  );
}
