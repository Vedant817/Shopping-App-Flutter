import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:threadline/core/models.dart';

void main() {
  group('production DTO parsing', () {
    test('parses string identifiers, decimal strings, and UTC timestamps', () {
      final product = ProductDto.fromJson({
        'id': 'gid://shopify/Product/42',
        'title': 'Task Lamp',
        'handle': 'task-lamp',
        'description': 'Focused light',
        'category': 'Lighting',
        'vendor': 'North Workshop',
        'sku': 'NW-42',
        'skus': ['NW-42'],
        'productType': 'Lighting',
        'status': 'ACTIVE',
        'tags': ['desk'],
        'thumbnail': null,
        'priceMin': '84.10',
        'priceMax': '96.20',
        'inventoryQuantity': 12,
        'variantCount': 1,
        'variantsTruncated': false,
        'variants': [],
        'updatedAt': '2026-01-31T12:00:00.000Z',
      });

      expect(product.id, 'gid://shopify/Product/42');
      expect(product.priceMin, Decimal.parse('84.10'));
      expect(product.updatedAt.isUtc, isTrue);
    });

    test('defaults the optional owner-role capability to false', () {
      final capabilities = WorkspaceCapabilitiesDto.fromJson({
        'canEnqueueSync': true,
        'canManageMembers': true,
      });

      expect(capabilities.canChangeOwnerRoles, isFalse);
    });

    test('rejects missing or invalid required source fields', () {
      expect(
        () => WorkspaceDto.fromJson({'id': 'workspace'}),
        throwsFormatException,
      );
      expect(
        () => ProductDto.fromJson({
          'id': 'gid://shopify/Product/1',
          'title': 'Product',
          'status': 'UNKNOWN_STATUS',
          'updatedAt': '2026-01-31T12:00:00.000Z',
        }),
        throwsFormatException,
      );
    });

    test('accepts the dense workspace-local trend from the service', () {
      final overview = OverviewDto.fromJson({
        'workspace': {
          'id': 'workspace',
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
        'range': {
          'from': '2026-01-29T00:00:00.000Z',
          'to': '2026-01-32T00:00:00.000Z',
          'preset': 'custom',
        },
        'generatedAt': '2026-02-01T00:00:00.000Z',
        'metrics': {
          'revenue': '300.00',
          'averageOrderValue': '150.00',
          'orderCount': 2,
          'customerCount': 2,
          'units': 3,
          'discountRate': '0.1000',
          'currencyCode': 'USD',
          'metricBasis': 'gross_non_cancelled_order_value',
        },
        'trend': [
          {'date': '2026-01-29', 'revenue': '0'},
          {'date': '2026-01-30', 'revenue': '200.00'},
          {'date': '2026-01-31', 'revenue': '0'},
        ],
        'topCustomers': [],
        'decisions': [],
        'dataQuality': {
          'productMediaCoverage': '1.0000',
          'customerMediaCoverage': '1.0000',
          'customerEmailCoverage': '1.0000',
          'stockCoverage': '1.0000',
          'linkedOrderCustomerRate': '1.0000',
          'linkedOrderCustomers': 2,
          'orderCount': 2,
        },
        'sync': {
          'jobId': null,
          'status': 'idle',
          'resource': null,
          'attempts': 0,
          'maxAttempts': 5,
          'startedAt': null,
          'completedAt': null,
          'cursor': null,
          'watermark': null,
          'lastSyncedAt': null,
          'error': null,
          'resources': [],
        },
        'currencyCode': 'USD',
        'metricBasis': 'gross_non_cancelled_order_value',
      });

      expect(overview.trend, hasLength(3));
      expect(overview.trend[0].revenue, Decimal.zero);
      expect(overview.trend[1].revenue, Decimal.fromInt(200));
      expect(overview.trend[2].revenue, Decimal.zero);
    });

    test('maps product variant completeness honestly', () {
      final product = ProductDto.fromJson({
        'id': 'gid://shopify/Product/1',
        'title': 'Product',
        'handle': null,
        'description': null,
        'category': null,
        'vendor': null,
        'sku': null,
        'skus': <String>[],
        'productType': null,
        'status': 'ACTIVE',
        'tags': <String>[],
        'thumbnail': null,
        'priceMin': null,
        'priceMax': null,
        'inventoryQuantity': null,
        'variantCount': 500,
        'variantsTruncated': true,
        'variants': <Object>[],
        'updatedAt': '2026-01-31T12:00:00.000Z',
      });

      expect(product.variantCount, 500);
      expect(product.variantsTruncated, isTrue);
    });
  });
}
