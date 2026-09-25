import 'package:decimal/decimal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:threadline/core/formatters.dart';

void main() {
  test('formats currency without binary floating-point conversion', () {
    expect(formatCurrency(Decimal.parse('651758.90'), 'USD'), r'$651,758.90');
    expect(formatCurrency(Decimal.parse('1234.40'), 'USD'), r'$1,234.40');
    expect(formatCurrency(Decimal.parse('72.25'), 'GBP'), '£72.25');
    expect(formatCurrency(Decimal.fromInt(1200), 'JPY'), '¥1,200');
  });

  test('respects three-decimal currencies', () {
    expect(formatCurrency(Decimal.parse('12.3456'), 'KWD'), 'KWD 12.346');
    expect(formatCurrency(Decimal.parse('0.001'), 'BHD'), 'BHD 0.001');
  });

  test('never labels an unknown currency as dollars', () {
    expect(formatCurrency(Decimal.fromInt(72), 'SEK'), 'SEK 72.00');
    expect(formatCurrency(Decimal.fromInt(72), null), 'UNKNOWN 72.00');
  });

  test('formats compact values and ratios', () {
    expect(formatCompactCurrency(Decimal.fromInt(1250000), 'USD'), r'$1.3m');
    expect(formatCompactNumber(1250), '1.3k');
    expect(formatPercent(Decimal.parse('0.125')), '12.5%');
  });

  test('normalizes sync timestamps to UTC', () {
    final fetched = DateTime.utc(2026, 1, 31, 11, 55);
    final now = DateTime.utc(2026, 1, 31, 12);
    expect(formatSyncAge(fetched, now), '5m ago');
    expect(formatShortDate(fetched), 'Jan 31');
  });
}
