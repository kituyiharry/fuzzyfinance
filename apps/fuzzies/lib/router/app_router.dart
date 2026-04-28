import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_provider.dart';
import '../features/auth/sign_in_page.dart';
import '../features/detail/receipt_detail_page.dart';
import '../features/detail/sale_detail_page.dart';
import '../features/home/home_page.dart';
import '../features/permissions/camera_permission_page.dart';
import '../features/settings/settings_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authListenable = _AuthListenable(ref);

  return GoRouter(
    refreshListenable: authListenable,
    initialLocation: '/home',
    redirect: (context, state) {
      final authAsync = ref.read(authProvider);
      final authState = authAsync.valueOrNull;
      final isSignedIn = authState?.status == AuthStatus.signedIn;
      final isLoading = authAsync.isLoading ||
          authState?.status == AuthStatus.loading;

      if (isLoading) return null;

      final loc = state.matchedLocation;

      if (!isSignedIn) {
        return loc == '/sign-in' ? null : '/sign-in';
      }

      // Signed in — check camera permission.
      // valueOrNull is null while the FutureProvider is still resolving;
      // treat null as "not yet known" and don't redirect until we know.
      final cameraGranted =
          ref.read(cameraPermissionProvider).valueOrNull;

      if (loc == '/sign-in') {
        // Just signed in: go to permissions page if not granted, else home.
        if (cameraGranted == false) return '/permissions';
        if (cameraGranted == true) return '/home';
        // Still resolving — wait for the next refresh triggered by the provider.
        return null;
      }

      return null;
    },
    routes: [
      GoRoute(path: '/sign-in', builder: (ctx, st) => const SignInPage()),
      GoRoute(path: '/permissions', builder: (ctx, st) => const CameraPermissionPage()),
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

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen(authProvider, (_, __) => notifyListeners());
    _ref.listen(cameraPermissionProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
}
