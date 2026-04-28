import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../api/api_client.dart';
import '../api/endpoints.dart';

class AuthService {
  AuthService(this._client);
  final ApiClient _client;
  final _storage = const FlutterSecureStorage();

  final _googleSignIn = GoogleSignIn(scopes: ['email', 'profile', 'openid']);

  // Signs in with Google and establishes a better-auth server session.
  // Returns the user's email on success.
  Future<String> signInWithGoogle() async {
    final googleUser = await _googleSignIn.signIn();
    if (googleUser == null) throw Exception('Sign-in cancelled');

    final auth = await googleUser.authentication;
    final idToken = auth.idToken;
    if (idToken == null) throw Exception('No ID token received from Google');

    // Exchange the Google ID token for a better-auth server session.
    // better-auth's social sign-in endpoint accepts the id_token directly.
    final response = await _client.dio.post<Map<String, dynamic>>(
      Endpoints.signInSocial,
      data: {'idToken': idToken},
      options: Options(
        followRedirects: false,
        validateStatus: (s) => s != null && s < 400,
      ),
    );

    // Persist the session cookie and immediately inject it into the live jar
    // so the very next request (home page load) carries it without a restart.
    final setCookie = response.headers.value('set-cookie');
    if (setCookie != null) {
      await _client.persistSession(setCookie);
      await _client.ensureSessionInJar();
    }

    return googleUser.email;
  }

  Future<void> signOut() async {
    try {
      await _client.dio.post<void>(Endpoints.signOut);
    } catch (_) {
      // Best-effort; clear local state regardless
    }
    await _googleSignIn.signOut();
    await _client.clearSession();
  }

  // Returns true if a session cookie is stored locally.
  // The 401 interceptor handles the case where the cookie has since expired.
  Future<bool> hasActiveSession() async {
    final cookie = await _storage.read(key: 'fuzzy_session_cookie');
    return cookie != null;
  }
}
