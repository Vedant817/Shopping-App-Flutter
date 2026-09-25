import 'package:decimal/decimal.dart';

String formatCurrency(Decimal value, String? currency) {
  final code = currency?.trim().toUpperCase() ?? '';
  final fractionDigits = _currencyFractionDigits(code);
  final absolute = value.abs().toStringAsFixed(fractionDigits);
  final parts = absolute.split('.');
  final whole = parts.first.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (match) => ',',
  );
  final fraction = parts.length == 1 ? '' : '.${parts.last}';
  final sign = value < Decimal.zero ? '-' : '';
  return '$sign${_currencyPrefix(code)}$whole$fraction';
}

String formatNullableCurrency(Decimal? value, String? currency) =>
    value == null ? 'Not available' : formatCurrency(value, currency);

String formatCompactCurrency(Decimal value, String? currency) {
  final absolute = value.abs();
  final code = currency?.trim().toUpperCase() ?? '';
  if (absolute >= Decimal.fromInt(1000000)) {
    return '${_currencyPrefix(code)}${_compact((absolute / Decimal.fromInt(1000000)).toDecimal(scaleOnInfinitePrecision: 1))}m';
  }
  if (absolute >= Decimal.fromInt(1000)) {
    return '${_currencyPrefix(code)}${_compact((absolute / Decimal.fromInt(1000)).toDecimal(scaleOnInfinitePrecision: 1))}k';
  }
  return formatCurrency(value, currency);
}

String formatCompactNumber(num value) {
  final absolute = value.abs();
  if (absolute >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}m';
  if (absolute >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
  return value.toStringAsFixed(0);
}

String formatPercent(Decimal value, {int decimals = 1}) {
  final percent = (value * Decimal.fromInt(100)).toStringAsFixed(decimals);
  return '$percent%';
}

String formatShortDate(DateTime date) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final utc = date.toUtc();
  return '${months[utc.month - 1]} ${utc.day}';
}

String formatUtcDateTime(DateTime value) {
  return '${value.toUtc().toIso8601String().replaceFirst('Z', '')} UTC';
}

String formatSyncAge(DateTime fetchedAt, DateTime now) {
  final difference = now.toUtc().difference(fetchedAt.toUtc());
  if (difference.isNegative || difference.inSeconds < 60) return 'just now';
  if (difference.inMinutes < 60) return '${difference.inMinutes}m ago';
  if (difference.inHours < 24) return '${difference.inHours}h ago';
  return '${difference.inDays}d ago';
}

String _currencyPrefix(String code) {
  if (code.isEmpty) return 'UNKNOWN ';
  return switch (code) {
    'USD' => r'$',
    'CAD' => r'CA$',
    'AUD' => r'A$',
    'NZD' => r'NZ$',
    'GBP' => '£',
    'EUR' => '€',
    'JPY' => '¥',
    _ => '$code ',
  };
}

String _compact(Decimal value) {
  final text = value.toStringAsFixed(1);
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}

int _currencyFractionDigits(String code) {
  if (_zeroDecimalCurrencies.contains(code)) return 0;
  if (_threeDecimalCurrencies.contains(code)) return 3;
  if (_fourDecimalCurrencies.contains(code)) return 4;
  return 2;
}

const _zeroDecimalCurrencies = <String>{
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
};

const _threeDecimalCurrencies = <String>{
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
};

const _fourDecimalCurrencies = <String>{'CLF', 'UYW'};
