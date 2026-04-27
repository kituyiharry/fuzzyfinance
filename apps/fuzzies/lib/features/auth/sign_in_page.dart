import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import 'auth_provider.dart';

class SignInPage extends ConsumerWidget {
  const SignInPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final authAsync = ref.watch(authProvider);

    final isLoading = authAsync.isLoading ||
        (authAsync.valueOrNull?.status == AuthStatus.loading);

    final error = authAsync.valueOrNull?.error;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 2),
              Text(
                'FUZZIES',
                style: theme.textTheme.displayLarge,
              ),
              const SizedBox(height: 8),
              Text(
                'YOUR FINANCES,\nCRYSTAL CLEAR.',
                style: theme.textTheme.headlineLarge?.copyWith(
                  color: ext.mutedFg,
                ),
              ),
              const Spacer(flex: 3),
              if (error != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  color: ext.dangerColor.withValues(alpha: 0.1),
                  child: Text(
                    error.toUpperCase(),
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: ext.dangerColor),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: isLoading
                      ? null
                      : () => ref.read(authProvider.notifier).signInWithGoogle(),
                  icon: isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.login, size: 18),
                  label: Text(isLoading ? 'SIGNING IN...' : 'CONTINUE WITH GOOGLE'),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'By continuing you agree to our Terms of Service and Privacy Policy.',
                style: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
