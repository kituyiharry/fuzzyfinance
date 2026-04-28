import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/theme/app_theme.dart';

// For setting up permissions see: https://stackoverflow.com/a/78054559

// Checked each time the provider is (re)read so the router always reflects
// the current OS grant state.
final cameraPermissionProvider = FutureProvider<bool>((ref) async {
  final status = await Permission.camera.status;
  return status.isGranted;
});

class CameraPermissionPage extends ConsumerWidget {
  const CameraPermissionPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 2),
              Icon(Icons.camera_alt_outlined, size: 56, color: ext.mutedFg),
              const SizedBox(height: 24),
              Text('CAMERA ACCESS', style: theme.textTheme.displayMedium),
              const SizedBox(height: 12),
              Text(
                'Fuzzies needs camera access to capture receipts and sales documents. '
                'Without it you can still upload files from your device.',
                style: theme.textTheme.bodyMedium?.copyWith(color: ext.mutedFg),
              ),
              const Spacer(flex: 3),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    final status = await Permission.camera.request();
                    // Invalidate so the router re-evaluates with the new status.
                    ref.invalidate(cameraPermissionProvider);
                    if (context.mounted) {
                      if (status.isGranted) {
                        context.go('/home');
                      } else if (status.isPermanentlyDenied) {
                        // User ticked "Don't ask again" — send them to Settings.
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'CAMERA PERMISSION DENIED — OPEN SETTINGS TO ENABLE IT',
                            ),
                            duration: Duration(seconds: 5),
                          ),
                        );
                        await openAppSettings();
                      } else {
                        // Denied but not permanently — let them continue without it.
                        context.go('/home');
                      }
                    }
                  },
                  child: const Text('ALLOW CAMERA ACCESS'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => context.go('/home'),
                  child: Text(
                    'NOT NOW',
                    style: TextStyle(color: ext.mutedFg),
                  ),
                ),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
