import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_service.dart';
import '../../models/server_capabilities.dart';
import '../home/home_provider.dart';

// ── Auth state ────────────────────────────────────────────────────────────────

enum AuthStatus { loading, signedIn, signedOut }

class AuthState {
  const AuthState({required this.status, this.email, this.error});
  final AuthStatus status;
  final String? email;
  final String? error;
}

// ── Auth notifier ─────────────────────────────────────────────────────────────

class AuthNotifier extends AsyncNotifier<AuthState> {
  @override
  Future<AuthState> build() async {
    final client = ref.watch(apiClientProvider);
    final service = AuthService(client);

    // Wire the 401 hook so any expired session triggers sign-out
    client.onUnauthorized = () {
      if (state.hasValue && state.value?.status == AuthStatus.signedIn) {
        state = const AsyncData(AuthState(status: AuthStatus.signedOut));
      }
    };

    final active = await service.hasActiveSession();
    return AuthState(status: active ? AuthStatus.signedIn : AuthStatus.signedOut);
  }

  Future<void> signInWithGoogle() async {
    state = const AsyncLoading();
    final client = ref.read(apiClientProvider);
    final service = AuthService(client);
    try {
      final email = await service.signInWithGoogle();
      // Kick off capability discovery after sign-in
      ref.invalidate(capabilitiesProvider);
      state = AsyncData(AuthState(status: AuthStatus.signedIn, email: email));
    } catch (e) {
      state = AsyncData(
        AuthState(status: AuthStatus.signedOut, error: e.toString()),
      );
    }
  }

  Future<void> signOut() async {
    final client = ref.read(apiClientProvider);
    final service = AuthService(client);
    await service.signOut();
    // Invalidate cached data on sign-out
    ref.invalidate(timelineProvider);
    state = const AsyncData(AuthState(status: AuthStatus.signedOut));
  }
}

final authProvider = AsyncNotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

// ── Server capabilities ───────────────────────────────────────────────────────

final capabilitiesProvider = FutureProvider<ServerCapabilities>((ref) async {
  final client = ref.watch(apiClientProvider);
  try {
    final resp = await client.dio.get<Map<String, dynamic>>(
      '/api/health',
    );
    if (resp.data != null) {
      return ServerCapabilities.fromJson(resp.data!);
    }
  } catch (_) {
    // Old server without /api/health — use safe defaults
  }
  return ServerCapabilities.defaults;
});
