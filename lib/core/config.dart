import 'dart:convert';

class RuntimeConfig {
  const RuntimeConfig._({
    required this.apiBaseUrl,
    required this.supabaseUrl,
    required this.supabasePublishableKey,
    required this.shopifyMobileReturnUrl,
    required this.authRedirectUrl,
    required this.issues,
  });

  factory RuntimeConfig.fromEnvironment() {
    return RuntimeConfig.fromValues(
      apiBaseUrl: const String.fromEnvironment('API_BASE_URL'),
      supabaseUrl: const String.fromEnvironment('SUPABASE_URL'),
      supabasePublishableKey: const String.fromEnvironment(
        'SUPABASE_PUBLISHABLE_KEY',
      ),
      shopifyMobileReturnUrl: const String.fromEnvironment(
        'SHOPIFY_MOBILE_RETURN_URL',
      ),
      authRedirectUrl: const String.fromEnvironment('AUTH_REDIRECT_URL'),
    );
  }

  factory RuntimeConfig.fromValues({
    required String apiBaseUrl,
    required String supabaseUrl,
    required String supabasePublishableKey,
    required String shopifyMobileReturnUrl,
    String? authRedirectUrl,
  }) {
    final issues = <ConfigIssue>[];
    final api = _httpsBaseUrl(apiBaseUrl, apiBaseUrlName, issues);
    final supabase = _httpsBaseUrl(supabaseUrl, supabaseUrlName, issues);
    final key = supabasePublishableKey.trim();
    if (!_validSupabaseKey(key)) {
      issues.add(
        const ConfigIssue(
          name: supabasePublishableKeyName,
          message:
              'Use a Supabase publishable or legacy anon key, never a secret key.',
        ),
      );
    }
    final mobileReturn = _mobileReturnUrl(shopifyMobileReturnUrl, issues);
    return RuntimeConfig._(
      apiBaseUrl: api,
      supabaseUrl: supabase,
      supabasePublishableKey: key,
      shopifyMobileReturnUrl: mobileReturn,
      authRedirectUrl: _optionalRedirect(
        authRedirectUrl,
        authRedirectUrlName,
        issues,
      ),
      issues: List.unmodifiable(issues),
    );
  }

  static const apiBaseUrlName = 'API_BASE_URL';
  static const supabaseUrlName = 'SUPABASE_URL';
  static const supabasePublishableKeyName = 'SUPABASE_PUBLISHABLE_KEY';
  static const shopifyMobileReturnUrlName = 'SHOPIFY_MOBILE_RETURN_URL';
  static const authRedirectUrlName = 'AUTH_REDIRECT_URL';
  static const expectedShopifyMobileReturnUrl = 'threadline://shopify/install';

  /// Names that must be supplied for the app to run at all.
  static const requiredDefineNames = <String>[
    apiBaseUrlName,
    supabaseUrlName,
    supabasePublishableKeyName,
    shopifyMobileReturnUrlName,
  ];

  /// Every name the build understands, required or not.
  static const defineNames = <String>[
    ...requiredDefineNames,
    authRedirectUrlName,
  ];

  final Uri? apiBaseUrl;
  final Uri? supabaseUrl;
  final String supabasePublishableKey;
  final Uri? shopifyMobileReturnUrl;

  /// Where an OAuth provider returns the user after Google sign-in.
  ///
  /// Optional, because a native build can reuse the scheme the platform already
  /// routes back into the app. A web build cannot: a browser has no way to open
  /// `threadline://`, so the deployed origin has to be supplied and registered
  /// as an allowed redirect URL in Supabase.
  final Uri? authRedirectUrl;

  final List<ConfigIssue> issues;

  bool get isValid =>
      issues.isEmpty &&
      apiBaseUrl != null &&
      supabaseUrl != null &&
      shopifyMobileReturnUrl != null;

  /// Parses an optional redirect target.
  ///
  /// Absent is valid and means "derive one from the mobile return URL". A value
  /// that is present but unusable is an error rather than a silent fallback,
  /// because a redirect the platform cannot route back would strand the user on
  /// the provider's page with no way to return.
  static Uri? _optionalRedirect(
    String? value,
    String name,
    List<ConfigIssue> issues,
  ) {
    final normalized = value?.trim() ?? '';
    if (normalized.isEmpty) return null;
    final uri = Uri.tryParse(normalized);
    if (uri == null || uri.scheme.isEmpty) {
      issues.add(ConfigIssue(name: name, message: 'Expected an absolute URI.'));
      return null;
    }
    final loopbackHttp =
        uri.scheme == 'http' && _loopbackHosts.contains(uri.host);
    if (uri.scheme != 'https' && !loopbackHttp) {
      issues.add(
        ConfigIssue(
          name: name,
          message:
              'Use HTTPS, or plain HTTP on loopback for local development.',
        ),
      );
      return null;
    }
    return uri;
  }

  static Uri? _httpsBaseUrl(
    String value,
    String name,
    List<ConfigIssue> issues,
  ) {
    final normalized = value.trim();
    final uri = Uri.tryParse(normalized);
    if (normalized.isEmpty) {
      issues.add(ConfigIssue(name: name, message: 'A value is required.'));
      return null;
    }
    final loopbackHttp =
        uri != null &&
        uri.scheme == 'http' &&
        _loopbackHosts.contains(uri.host);
    if (uri == null ||
        (uri.scheme != 'https' && !loopbackHttp) ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      issues.add(
        ConfigIssue(
          name: name,
          message:
              'Use an absolute HTTPS URL without credentials, query, or fragment. '
              'Plain HTTP is only allowed on loopback for local development.',
        ),
      );
      return null;
    }
    final path = uri.path.endsWith('/') ? uri.path : '${uri.path}/';
    return uri.replace(path: path);
  }

  static const _loopbackHosts = {'127.0.0.1', 'localhost', '::1'};

  static Uri? _mobileReturnUrl(String value, List<ConfigIssue> issues) {
    final uri = Uri.tryParse(value);
    if (value != value.trim() ||
        uri == null ||
        uri.toString() != expectedShopifyMobileReturnUrl ||
        uri.scheme != 'threadline' ||
        uri.host != 'shopify' ||
        uri.path != '/install' ||
        uri.userInfo.isNotEmpty ||
        uri.hasPort ||
        uri.hasQuery ||
        uri.hasFragment) {
      issues.add(
        const ConfigIssue(
          name: shopifyMobileReturnUrlName,
          message: 'Use exactly $expectedShopifyMobileReturnUrl.',
        ),
      );
      return null;
    }
    return uri;
  }

  static bool _validSupabaseKey(String value) {
    if (value.isEmpty || value.startsWith('sb_secret_')) return false;
    if (value.startsWith('sb_publishable_')) {
      return RegExp(r'^sb_publishable_[A-Za-z0-9_-]+$').hasMatch(value);
    }
    final segments = value.split('.');
    if (segments.length != 3 || segments.any((segment) => segment.isEmpty)) {
      return false;
    }
    try {
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(segments[1]))),
      );
      return payload is Map && payload['role'] == 'anon';
    } on FormatException {
      return false;
    }
  }
}

class ConfigIssue {
  const ConfigIssue({required this.name, required this.message});

  final String name;
  final String message;
}
