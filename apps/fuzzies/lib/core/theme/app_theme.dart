import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_colors.dart';

enum AppThemeMode { highContrast, dark, lowContrast }

// ── Notifier ──────────────────────────────────────────────────────────────────

class ThemeNotifier extends Notifier<AppThemeMode> {
  static const _prefKey = 'app_theme';

  @override
  AppThemeMode build() {
    _loadSaved();
    return AppThemeMode.highContrast;
  }

  Future<void> _loadSaved() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefKey);
    if (saved != null) {
      final mode = AppThemeMode.values.where((e) => e.name == saved).firstOrNull;
      if (mode != null && mode != state) state = mode;
    }
  }

  Future<void> setTheme(AppThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, mode.name);
  }
}

final themeProvider = NotifierProvider<ThemeNotifier, AppThemeMode>(ThemeNotifier.new);

// ── ThemeData factories ───────────────────────────────────────────────────────

ThemeData buildTheme(AppThemeMode mode) {
  final isDark = mode == AppThemeMode.dark;

  final (bg, fg, border, borderSubtle, muted, mutedFg, shadow) = switch (mode) {
    AppThemeMode.highContrast => (
        AppColors.lightBg,
        AppColors.lightFg,
        AppColors.lightBorder,
        AppColors.lightBorderSubtle,
        AppColors.lightMuted,
        AppColors.lightMutedFg,
        AppColors.lightCardShadow,
      ),
    AppThemeMode.dark => (
        AppColors.darkBg,
        AppColors.darkFg,
        AppColors.darkBorder,
        AppColors.darkBorderSubtle,
        AppColors.darkMuted,
        AppColors.darkMutedFg,
        AppColors.darkCardShadow,
      ),
    AppThemeMode.lowContrast => (
        AppColors.lcBg,
        AppColors.lcFg,
        AppColors.lcBorder,
        AppColors.lcBorderSubtle,
        AppColors.lcMuted,
        AppColors.lcMutedFg,
        AppColors.lcCardShadow,
      ),
  };

  final bodyTextStyle = GoogleFonts.raleway(color: fg);
  final headingStyle = GoogleFonts.raleway(
    fontWeight: FontWeight.w900,
    letterSpacing: -0.01,
    color: fg,
  );

  // Hard offset shadow — 4px x 4px, no blur (matches web `--shadow-sm`)
  final cardShadow = BoxShadow(
    color: shadow,
    offset: const Offset(4, 4),
    blurRadius: 0,
  );

  return ThemeData(
    brightness: isDark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: bg,
    primaryColor: fg,
    colorScheme: ColorScheme(
      brightness: isDark ? Brightness.dark : Brightness.light,
      primary: fg,
      onPrimary: bg,
      secondary: fg,
      onSecondary: bg,
      error: isDark ? AppColors.dangerDark : AppColors.danger,
      onError: bg,
      surface: bg,
      onSurface: fg,
    ),
    textTheme: TextTheme(
      displayLarge: headingStyle.copyWith(fontSize: 32),
      displayMedium: headingStyle.copyWith(fontSize: 24),
      headlineLarge: headingStyle.copyWith(fontSize: 20),
      headlineMedium: headingStyle.copyWith(fontSize: 18),
      titleLarge: headingStyle.copyWith(fontSize: 16),
      titleMedium: headingStyle.copyWith(fontSize: 14),
      bodyLarge: bodyTextStyle.copyWith(fontSize: 16),
      bodyMedium: bodyTextStyle.copyWith(fontSize: 14),
      bodySmall: bodyTextStyle.copyWith(fontSize: 12, color: mutedFg),
      labelLarge: bodyTextStyle.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.08,
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      foregroundColor: fg,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: headingStyle.copyWith(fontSize: 18),
      iconTheme: IconThemeData(color: fg),
      shape: Border(bottom: BorderSide(color: border, width: 2)),
    ),
    cardTheme: CardThemeData(
      color: bg,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: border, width: 2),
        borderRadius: BorderRadius.zero,
      ),
      shadowColor: shadow,
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: bg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(
        borderSide: BorderSide(color: border, width: 2),
        borderRadius: BorderRadius.zero,
      ),
      enabledBorder: OutlineInputBorder(
        borderSide: BorderSide(color: border, width: 2),
        borderRadius: BorderRadius.zero,
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: fg, width: 2),
        borderRadius: BorderRadius.zero,
      ),
      hintStyle: bodyTextStyle.copyWith(color: mutedFg),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: fg,
        foregroundColor: bg,
        elevation: 0,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        textStyle: bodyTextStyle.copyWith(
          fontWeight: FontWeight.w700,
          fontSize: 12,
          letterSpacing: 0.08,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: fg,
        side: BorderSide(color: border, width: 2),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
        textStyle: bodyTextStyle.copyWith(
          fontWeight: FontWeight.w700,
          fontSize: 12,
          letterSpacing: 0.08,
        ),
      ),
    ),
    dividerTheme: DividerThemeData(color: borderSubtle, thickness: 1, space: 0),
    listTileTheme: ListTileThemeData(
      tileColor: bg,
      textColor: fg,
      iconColor: fg,
      shape: Border(bottom: BorderSide(color: borderSubtle)),
    ),
    extensions: [
      FuzzyThemeExtension(
        border: border,
        borderSubtle: borderSubtle,
        muted: muted,
        mutedFg: mutedFg,
        cardShadow: cardShadow,
        successColor: isDark ? AppColors.successDark : AppColors.success,
        warningColor: isDark ? AppColors.warningDark : AppColors.warning,
        dangerColor: isDark ? AppColors.dangerDark : AppColors.danger,
        infoColor: isDark ? AppColors.infoDark : AppColors.info,
      ),
    ],
  );
}

// ── Theme extension to expose custom tokens ───────────────────────────────────

@immutable
class FuzzyThemeExtension extends ThemeExtension<FuzzyThemeExtension> {
  const FuzzyThemeExtension({
    required this.border,
    required this.borderSubtle,
    required this.muted,
    required this.mutedFg,
    required this.cardShadow,
    required this.successColor,
    required this.warningColor,
    required this.dangerColor,
    required this.infoColor,
  });

  final Color border;
  final Color borderSubtle;
  final Color muted;
  final Color mutedFg;
  final BoxShadow cardShadow;
  final Color successColor;
  final Color warningColor;
  final Color dangerColor;
  final Color infoColor;

  @override
  FuzzyThemeExtension copyWith({
    Color? border,
    Color? borderSubtle,
    Color? muted,
    Color? mutedFg,
    BoxShadow? cardShadow,
    Color? successColor,
    Color? warningColor,
    Color? dangerColor,
    Color? infoColor,
  }) => FuzzyThemeExtension(
    border: border ?? this.border,
    borderSubtle: borderSubtle ?? this.borderSubtle,
    muted: muted ?? this.muted,
    mutedFg: mutedFg ?? this.mutedFg,
    cardShadow: cardShadow ?? this.cardShadow,
    successColor: successColor ?? this.successColor,
    warningColor: warningColor ?? this.warningColor,
    dangerColor: dangerColor ?? this.dangerColor,
    infoColor: infoColor ?? this.infoColor,
  );

  @override
  FuzzyThemeExtension lerp(FuzzyThemeExtension? other, double t) {
    if (other == null) return this;
    return FuzzyThemeExtension(
      border: Color.lerp(border, other.border, t)!,
      borderSubtle: Color.lerp(borderSubtle, other.borderSubtle, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      mutedFg: Color.lerp(mutedFg, other.mutedFg, t)!,
      cardShadow: cardShadow,
      successColor: Color.lerp(successColor, other.successColor, t)!,
      warningColor: Color.lerp(warningColor, other.warningColor, t)!,
      dangerColor: Color.lerp(dangerColor, other.dangerColor, t)!,
      infoColor: Color.lerp(infoColor, other.infoColor, t)!,
    );
  }
}

extension FuzzyThemeX on BuildContext {
  FuzzyThemeExtension get fuzzy =>
      Theme.of(this).extension<FuzzyThemeExtension>()!;
}
