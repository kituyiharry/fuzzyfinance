import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';

// Session cookie key used for persistence
const _sessionKey = 'fuzzy_session_cookie';

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient();
  ref.onDispose(client.dispose);
  return client;
});

class ApiClient {
  ApiClient() {
    _cookieJar = CookieJar();
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'X-App-Version': AppConfig.appVersion,
          'X-App-Env':     AppConfig.env,
          'Accept':       '*/*',
        },
      ),
    );
    _dio.interceptors.addAll([
      CookieManager(_cookieJar),
      _AuthInterceptor(this),
      if (AppConfig.isDev) LogInterceptor(responseBody: true, requestBody: true),
    ]);
    sessionReady = _restoreSession();
  }

  late final Dio _dio;
  late final CookieJar _cookieJar;
  final _storage = const FlutterSecureStorage();

  // Resolves once the persisted session cookie has been loaded into the jar.
  // Await this before making authenticated requests on cold start.
  late final Future<void> sessionReady;

  // Callback set by auth layer to trigger sign-out on 401
  void Function()? onUnauthorized;

  Dio get dio => _dio;

  Future<void> _restoreSession() async {
    final cookie = await _storage.read(key: _sessionKey);
    if (cookie != null) {
      // Re-inject persisted cookie into jar so it's sent on first request
      await _cookieJar.saveFromResponse(
        Uri.parse(AppConfig.baseUrl),
        [Cookie.fromSetCookieValue(cookie)],
      );
    }
  }

  Future<void> persistSession(String rawCookie) async {
    await _storage.write(key: _sessionKey, value: rawCookie);
  }

  /// Re-injects the stored session cookie into the live jar at the base URL.
  /// Call this after persistSession() so the very next request carries the cookie.
  Future<void> ensureSessionInJar() async {
    final cookie = await _storage.read(key: _sessionKey);
    if (cookie != null) {
      await _cookieJar.saveFromResponse(
        Uri.parse(AppConfig.baseUrl),
        [Cookie.fromSetCookieValue(cookie)],
      );
    }
  }

  Future<void> clearSession() async {
    await _storage.delete(key: _sessionKey);
    _cookieJar.deleteAll();
  }

  void dispose() {
    _dio.close();
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._client);
  final ApiClient _client;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      _client.onUnauthorized?.call();
    }
    handler.next(err);
  }
}
