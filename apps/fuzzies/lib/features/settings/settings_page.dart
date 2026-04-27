import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final currentTheme = ref.watch(themeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('SETTINGS')),
      body: ListView(
        children: [
          // ── Theme ───────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
            child: Text('APPEARANCE', style: theme.textTheme.labelLarge?.copyWith(color: ext.mutedFg)),
          ),
          ...AppThemeMode.values.map((mode) {
            final label = switch (mode) {
              AppThemeMode.highContrast => 'HIGH CONTRAST',
              AppThemeMode.dark => 'DARK',
              AppThemeMode.lowContrast => 'LOW CONTRAST',
            };
            return ListTile(
              title: Text(label, style: theme.textTheme.bodyMedium),
              trailing: currentTheme == mode
                  ? Icon(Icons.check, size: 18, color: ext.successColor)
                  : null,
              onTap: () => ref.read(themeProvider.notifier).setTheme(mode),
            );
          }),

          Divider(color: ext.borderSubtle),

          // ── Account ─────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text('ACCOUNT', style: theme.textTheme.labelLarge?.copyWith(color: ext.mutedFg)),
          ),
          ListTile(
            title: Text('SIGN OUT', style: theme.textTheme.bodyMedium),
            trailing: Icon(Icons.logout, size: 18, color: ext.dangerColor),
            onTap: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.zero),
                  title: Text('SIGN OUT', style: theme.textTheme.titleMedium),
                  content: const Text('Are you sure?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(false),
                      child: const Text('CANCEL'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.of(ctx).pop(true),
                      child: Text('SIGN OUT',
                          style: TextStyle(color: ext.dangerColor)),
                    ),
                  ],
                ),
              );
              if (confirm == true) {
                await ref.read(authProvider.notifier).signOut();
              }
            },
          ),
        ],
      ),
    );
  }
}
