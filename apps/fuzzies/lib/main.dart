import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/cache/local_cache.dart';
import 'core/theme/app_theme.dart';
import 'router/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LocalCache.init();
  runApp(const ProviderScope(child: FuzziesApp()));
}

class FuzziesApp extends ConsumerWidget {
    const FuzziesApp({super.key});

    @override
    Widget build(BuildContext context, WidgetRef ref) {
        final themeMode = ref.watch(themeProvider);
        final router = ref.watch(routerProvider);

        return MaterialApp.router(
                title: 'Fuzzies',
                debugShowCheckedModeBanner: false,
                theme: buildTheme(AppThemeMode.highContrast),
                darkTheme: buildTheme(AppThemeMode.dark),
                // Custom theme switching via themeProvider overrides the system preference
                themeMode: switch (themeMode) {
                AppThemeMode.dark => ThemeMode.dark,
                _ => ThemeMode.light,
            },
                // For high-contrast vs low-contrast both land on light — override via builder
                builder: (context, child) {
                    if (themeMode != AppThemeMode.dark) {
                    // Wrap with the correct non-dark theme so it overrides MaterialApp's light/dark split
                        return Theme(
                            data: buildTheme(themeMode),
                            child: child!,
                        );
                    }
                    return child!;
                },
                routerConfig: router,
        );
    }
}
