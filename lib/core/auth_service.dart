import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

abstract interface class AuthService {
  AuthUser? get currentUser;
  Stream<AuthUser?> get authStateChanges;
  Future<void> sendEmailOtp(String email);
  Future<void> verifyEmailOtp({required String email, required String token});

  /// Starts a Google sign-in and returns the authorization URL to open in a
  /// browser. The flow completes out of process: Google redirects to Supabase,
  /// Supabase redirects back to this app, and [consumeAuthRedirect] turns that
  /// return trip into a session.
  Future<Uri> beginGoogleSignIn({required Uri redirectTo});

  /// Applies an OAuth redirect that carried the session back to the app.
  ///
  /// Returns true when the redirect produced a signed-in session. A redirect
  /// that carries an OAuth error, or none at all, returns false rather than
  /// throwing, because the same entry point also sees unrelated deep links such
  /// as the Shopify install callback.
  Future<bool> consumeAuthRedirect(Uri uri);

  Future<void> signOut();
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.accessToken,
  });

  final String id;
  final String email;
  final String accessToken;
}

class SupabaseAuthService implements AuthService {
  SupabaseAuthService._(this._supabase);

  static Future<SupabaseAuthService> initialize(RuntimeConfig config) async {
    if (!config.isValid || config.supabaseUrl == null) {
      throw const FormatException('Runtime configuration is incomplete');
    }
    final supabase = await Supabase.initialize(
      url: config.supabaseUrl.toString(),
      publishableKey: config.supabasePublishableKey,
      debug: false,
      authOptions: const FlutterAuthClientOptions(
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUri: false,
        localStorage: SecureAuthLocalStorage(),
        pkceAsyncStorage: SecurePkceStorage(),
      ),
    );
    return SupabaseAuthService._(supabase);
  }

  final Supabase _supabase;

  @override
  AuthUser? get currentUser => _map(_supabase.client.auth.currentSession);

  @override
  Stream<AuthUser?> get authStateChanges => _supabase
      .client
      .auth
      .onAuthStateChange
      .map((state) => _map(state.session));

  @override
  Future<void> sendEmailOtp(String email) {
    return _supabase.client.auth.signInWithOtp(
      email: email.trim().toLowerCase(),
      shouldCreateUser: true,
    );
  }

  @override
  Future<void> verifyEmailOtp({
    required String email,
    required String token,
  }) async {
    final response = await _supabase.client.auth.verifyOTP(
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: OtpType.email,
    );
    if (response.session == null) {
      throw const AuthException('The verification code was not accepted');
    }
  }

  @override
  Future<Uri> beginGoogleSignIn({required Uri redirectTo}) async {
    // getOAuthSignInUrl rather than signInWithOAuth: the extension launches the
    // browser itself, which would bypass the injected AuthorizationLauncher and
    // make the whole hand-off untestable. The URL is opened by the controller.
    final response = await _supabase.client.auth.getOAuthSignInUrl(
      provider: OAuthProvider.google,
      redirectTo: redirectTo.toString(),
      scopes: 'openid email profile',
    );
    return Uri.parse(response.url);
  }

  @override
  Future<bool> consumeAuthRedirect(Uri uri) async {
    final fragment = uri.fragment;
    final query = uri.queryParameters;
    final carriesError = query['error'] != null || fragment.contains('error=');
    final carriesSession =
        query.containsKey('code') ||
        fragment.contains('access_token=') ||
        fragment.contains('refresh_token=');
    if (!carriesError && !carriesSession) {
      // Not an auth redirect. The same deep link listener also receives the
      // Shopify install callback and any threadline:// link, so this must
      // decline rather than assume.
      return false;
    }
    if (carriesError) {
      throw AuthException(_describeOAuthError(uri));
    }
    // Handles both the PKCE code query and the implicit fragment form, and
    // persists the session through the secure storage this service configured.
    await _supabase.client.auth.getSessionFromUrl(uri, storeSession: true);
    return true;
  }

  @override
  Future<void> signOut() => _supabase.client.auth.signOut();

  static String _describeOAuthError(Uri uri) {
    final raw =
        uri.queryParameters['error_description'] ??
        uri.queryParameters['error'] ??
        (uri.fragment.contains('error_description=')
            ? uri.fragment.split('error_description=').last.split('&').first
            : 'access_denied');
    return raw.replaceAll('+', ' ').replaceAll('%20', ' ').replaceAll('_', ' ');
  }

  static AuthUser? _map(Session? session) {
    if (session == null) return null;
    return AuthUser(
      id: session.user.id,
      email: session.user.email ?? '',
      accessToken: session.accessToken,
    );
  }
}

class SecureAuthLocalStorage extends LocalStorage {
  const SecureAuthLocalStorage();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(storageNamespace: 'threadline_auth'),
    iOptions: IOSOptions(
      accountName: 'com.threadline.app.auth',
      accessibility: KeychainAccessibility.unlocked_this_device,
      synchronizable: false,
    ),
    mOptions: MacOsOptions(
      accountName: 'com.threadline.app.auth',
      usesDataProtectionKeychain: false,
    ),
    lOptions: LinuxOptions(),
    wOptions: WindowsOptions(),
  );
  static const _key = 'threadline.supabase.session';

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() => _storage.containsKey(key: _key);

  @override
  Future<String?> accessToken() => _storage.read(key: _key);

  @override
  Future<void> removePersistedSession() => _storage.delete(key: _key);

  @override
  Future<void> persistSession(String persistSessionString) {
    return _storage.write(key: _key, value: persistSessionString);
  }
}

class SecurePkceStorage extends GotrueAsyncStorage {
  const SecurePkceStorage();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(storageNamespace: 'threadline_pkce'),
    iOptions: IOSOptions(accountName: 'com.threadline.app.pkce'),
    mOptions: MacOsOptions(accountName: 'com.threadline.app.pkce'),
    lOptions: LinuxOptions(),
    wOptions: WindowsOptions(),
  );

  @override
  Future<String?> getItem({required String key}) => _storage.read(key: key);

  @override
  Future<void> setItem({required String key, required String value}) {
    return _storage.write(key: key, value: value);
  }

  @override
  Future<void> removeItem({required String key}) => _storage.delete(key: key);
}
