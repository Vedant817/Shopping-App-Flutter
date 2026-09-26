import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:threadline/core/commerce_repository.dart';
import 'package:threadline/core/config.dart';
import 'package:threadline/core/models.dart';

void main() {
  group('RuntimeConfig', () {
    test('requires explicit valid production values', () {
      final config = RuntimeConfig.fromValues(
        apiBaseUrl: '',
        supabaseUrl: 'http://project.supabase.co',
        supabasePublishableKey: 'sb_secret_',
        shopifyMobileReturnUrl: 'https://example.com/callback',
      );

      expect(config.isValid, isFalse);
      // The OAuth redirect is deliberately excluded: a native build derives one
      // from the return URL, so demanding it would break every existing build
      // for no gain.
      expect(
        config.issues.map((issue) => issue.name),
        containsAll(RuntimeConfig.requiredDefineNames),
      );
      expect(
        config.issues.map((issue) => issue.name),
        isNot(contains(RuntimeConfig.authRedirectUrlName)),
      );
    });

    test(
      'accepts an OAuth redirect over HTTPS and rejects an unusable one',
      () {
        final good = RuntimeConfig.fromValues(
          apiBaseUrl: 'https://api.example.com',
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example-key',
          shopifyMobileReturnUrl: 'threadline://shopify/install',
          authRedirectUrl: 'https://app.example.com/auth/callback',
        );
        expect(good.isValid, isTrue);
        expect(
          good.authRedirectUrl.toString(),
          'https://app.example.com/auth/callback',
        );

        // A present but unroutable redirect is an error, not a silent fallback:
        // the user would be stranded on the provider's page with no way back.
        final bad = RuntimeConfig.fromValues(
          apiBaseUrl: 'https://api.example.com',
          supabaseUrl: 'https://project.supabase.co',
          supabasePublishableKey: 'sb_publishable_example-key',
          shopifyMobileReturnUrl: 'threadline://shopify/install',
          authRedirectUrl: 'http://app.example.com/auth',
        );
        expect(bad.isValid, isFalse);
        expect(
          bad.issues.map((issue) => issue.name),
          contains(RuntimeConfig.authRedirectUrlName),
        );
      },
    );

    test('accepts HTTPS services, publishable auth, and the native return', () {
      final config = RuntimeConfig.fromValues(
        apiBaseUrl: 'https://api.example.com',
        supabaseUrl: 'https://project.supabase.co/',
        supabasePublishableKey: 'sb_publishable_example-key',
        shopifyMobileReturnUrl: 'threadline://shopify/install',
      );

      expect(config.isValid, isTrue);
      expect(config.apiBaseUrl.toString(), 'https://api.example.com/');
      expect(config.issues, isEmpty);
    });

    test('allows plain HTTP only on loopback for local development', () {
      final local = RuntimeConfig.fromValues(
        apiBaseUrl: 'http://127.0.0.1:4599',
        supabaseUrl: 'http://localhost:54321',
        supabasePublishableKey: 'sb_publishable_example-key',
        shopifyMobileReturnUrl: 'threadline://shopify/install',
      );

      expect(local.isValid, isTrue);
      expect(local.apiBaseUrl.toString(), 'http://127.0.0.1:4599/');
    });

    test('still refuses plain HTTP against a remote host', () {
      final remote = RuntimeConfig.fromValues(
        apiBaseUrl: 'http://api.example.com',
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'sb_publishable_example-key',
        shopifyMobileReturnUrl: 'threadline://shopify/install',
      );

      expect(remote.isValid, isFalse);
      expect(
        remote.issues.map((issue) => issue.name),
        contains(RuntimeConfig.apiBaseUrlName),
      );
    });
  });

  group('HttpCommerceRepository', () {
    test('uses bearer auth, typed workspaces, and request IDs', () async {
      late http.Request captured;
      final mock = MockClient((request) async {
        captured = request;
        return http.Response(
          jsonEncode({
            'items': [
              {
                'id': 'workspace-1',
                'shopDomain': 'store.myshopify.com',
                'name': 'Store',
                'currencyCode': 'USD',
                'timeZone': 'UTC',
                'role': 'owner',
                'capabilities': {
                  'canEnqueueSync': true,
                  'canManageMembers': true,
                  'canChangeOwnerRoles': true,
                },
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final repository = HttpCommerceRepository(client: _apiClient(mock));

      final workspaces = await repository.listWorkspaces();

      expect(workspaces.single.id, 'workspace-1');
      expect(captured.url.path, '/v1/workspaces');
      expect(captured.headers['authorization'], 'Bearer access-token');
      expect(captured.headers['x-request-id'], startsWith('flutter-'));
    });

    test('maps RFC7807 errors without discarding request context', () async {
      final mock = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'type': 'about:blank',
            'title': 'Workspace not found',
            'status': 404,
            'detail': 'The workspace does not exist or is not accessible.',
            'instance': request.url.path,
            'requestId': 'body-request-id',
            'code': 'not_found',
          }),
          404,
          headers: {
            'content-type': 'application/problem+json',
            'x-request-id': 'server-request-id',
          },
        );
      });
      final repository = HttpCommerceRepository(client: _apiClient(mock));

      expect(
        () => repository.getOverview('missing', InsightRange.thirtyDays),
        throwsA(
          isA<ApiException>()
              .having((error) => error.kind, 'kind', ApiErrorKind.notFound)
              .having((error) => error.code, 'code', 'not_found')
              .having(
                (error) => error.requestId,
                'requestId',
                'body-request-id',
              ),
        ),
      );
    });

    test('sends server-side search filters and cursor pagination', () async {
      late Uri captured;
      final mock = MockClient((request) async {
        captured = request.url;
        return http.Response(
          jsonEncode({'items': <Object>[], 'nextCursor': null}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final repository = HttpCommerceRepository(client: _apiClient(mock));

      await repository.listProducts(
        'workspace-1',
        query: 'lamp',
        category: 'Lighting',
        cursor: 'opaque-cursor',
      );

      expect(captured.queryParameters['q'], 'lamp');
      expect(captured.queryParameters['category'], 'Lighting');
      expect(captured.queryParameters['cursor'], 'opaque-cursor');
      expect(captured.queryParameters['limit'], '20');
    });

    test('uses workspace-scoped membership endpoints', () async {
      final requests = <http.Request>[];
      final mock = MockClient((request) async {
        requests.add(request);
        if (request.method == 'GET') {
          return http.Response(
            jsonEncode({
              'items': [
                {
                  'userId': 'user-1',
                  'role': 'owner',
                  'email': 'owner@example.com',
                  'createdAt': '2026-09-25T00:00:00.000Z',
                  'updatedAt': '2026-09-25T00:00:00.000Z',
                },
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'DELETE') {
          return http.Response('', 204);
        }
        final body = jsonDecode(request.body) as Map<String, Object?>;
        final userId = body['userId'] ?? request.url.pathSegments.last;
        return http.Response(
          jsonEncode({
            'userId': userId,
            'role': body['role'],
            'status': 'active',
          }),
          body['userId'] == 'user-2' ? 201 : 200,
          headers: {'content-type': 'application/json'},
        );
      });
      final repository = HttpCommerceRepository(client: _apiClient(mock));

      final members = await repository.listMembers('workspace-1');
      await repository.addMember(
        'workspace-1',
        userId: 'user-2',
        role: WorkspaceRole.member,
      );
      await repository.updateMemberRole(
        'workspace-1',
        'user-2',
        role: WorkspaceRole.admin,
      );
      await repository.removeMember('workspace-1', 'user-2');

      expect(members.items.single.role, WorkspaceRole.owner);
      expect(
        requests.map((request) => '${request.method} ${request.url.path}'),
        [
          'GET /v1/workspaces/workspace-1/members',
          'POST /v1/workspaces/workspace-1/members',
          'PATCH /v1/workspaces/workspace-1/members/user-2',
          'DELETE /v1/workspaces/workspace-1/members/user-2',
        ],
      );
      expect(jsonDecode(requests[1].body), {
        'userId': 'user-2',
        'role': 'member',
      });
      expect(jsonDecode(requests[2].body), {'role': 'admin'});
    });

    test(
      'binds Shopify installation to the configured native return URL',
      () async {
        late http.Request captured;
        final mock = MockClient((request) async {
          captured = request;
          return http.Response(
            jsonEncode({
              'authorizationUrl':
                  'https://store.myshopify.com/admin/oauth/authorize?client_id=test',
              'shopDomain': 'store.myshopify.com',
              'returnUrl': 'threadline://shopify/install',
            }),
            201,
            headers: {'content-type': 'application/json'},
          );
        });
        final repository = HttpCommerceRepository(client: _apiClient(mock));

        final result = await repository.createShopifyInstall(
          'store.myshopify.com',
          Uri.parse('threadline://shopify/install'),
        );

        expect(result.authorizationUrl.host, 'store.myshopify.com');
        expect(jsonDecode(captured.body), {
          'shop': 'store.myshopify.com',
          'returnUrl': 'threadline://shopify/install',
        });
      },
    );
  });
}

ApiClient _apiClient(http.Client client) {
  return ApiClient(
    baseUrl: Uri.parse('https://api.example.com/'),
    accessToken: () async => 'access-token',
    clientFactory: () => client,
  );
}
