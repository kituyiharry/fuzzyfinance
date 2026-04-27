import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_provider.dart';
import '../features/auth/sign_in_page.dart';
import '../features/detail/receipt_detail_page.dart';
import '../features/detail/sale_detail_page.dart';
import '../features/home/home_page.dart';
import '../features/settings/settings_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authListenable = _AuthListenable(ref);

  return GoRouter(
    refreshListenable: authListenable,
    initialLocation: '/home',
    redirect: (context, state) {
      final authState = ref.read(authProvider).valueOrNull;
      final isSignedIn = authState?.status == AuthStatus.signedIn;
      final isLoading = ref.read(authProvider).isLoading ||
          authState?.status == AuthStatus.loading;

      if (isLoading) return null;

      final onSignIn = state.matchedLocation == '/sign-in';
      if (!isSignedIn && !onSignIn) return '/sign-in';
      if (isSignedIn && onSignIn) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/sign-in', builder: (ctx, st) => const SignInPage()),
      GoRoute(path: '/home', builder: (ctx, st) => const HomePage()),
      GoRoute(
        path: '/receipt/:id',
        builder: (_, state) =>
            ReceiptDetailPage(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/sale/:id',
        builder: (_, state) =>
            SaleDetailPage(id: state.pathParameters['id']!),
      ),
      GoRoute(path: '/settings', builder: (ctx, st) => const SettingsPage()),
    ],
  );
});

// Bridges Riverpod auth state changes into a Listenable for go_router
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen(authProvider, (prev, next) => notifyListeners());
  }
  final Ref _ref;
}
