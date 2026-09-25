import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

abstract interface class AuthService {
  AuthUser? get currentUser;
  Stream<AuthUser?> get authStateChanges;
  Future<void> sendEmailOtp(String email);
  Future<void> verifyEmailOtp({required String email, required String token});
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
  Future<void> signOut() => _supabase.client.auth.signOut();

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
