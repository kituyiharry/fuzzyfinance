import 'package:flutter/material.dart';

// Mirrors the web app's CSS design tokens (layout.css)
class AppColors {
  // ── High Contrast Light (default) ────────────────────────────────────────
  static const lightBg = Color(0xFFFFFFFF);
  static const lightFg = Color(0xFF000000);
  static const lightBorder = Color(0xFF000000);
  static const lightBorderSubtle = Color(0xFFD1D5DB);
  static const lightMuted = Color(0xFFF3F4F6);
  static const lightMutedFg = Color(0xFF6B7280);
  static const lightCardShadow = Color(0xFF000000);

  // ── Dark ─────────────────────────────────────────────────────────────────
  static const darkBg = Color(0xFF0A0A0A);
  static const darkFg = Color(0xFFF0F0F0);
  static const darkBorder = Color(0xFFE0E0E0);
  static const darkBorderSubtle = Color(0xFF374151);
  static const darkMuted = Color(0xFF111111);
  static const darkMutedFg = Color(0xFF9CA3AF);
  static const darkCardShadow = Color(0x26FFFFFF);

  // ── Low Contrast ─────────────────────────────────────────────────────────
  static const lcBg = Color(0xFFFDFCF0);
  static const lcFg = Color(0xFF3A3A3A);
  static const lcBorder = Color(0xFFC0B8A8);
  static const lcBorderSubtle = Color(0xFFD8D0C0);
  static const lcMuted = Color(0xFFF5F0E8);
  static const lcMutedFg = Color(0xFF7A7060);
  static const lcCardShadow = Color(0x14000000);

  // ── Semantic status (same across themes) ─────────────────────────────────
  static const success = Color(0xFF15803D);
  static const successMuted = Color(0xFFF0FDF4);
  static const successBorder = Color(0xFF16A34A);
  static const warning = Color(0xFFB45309);
  static const warningMuted = Color(0xFFFEFCE8);
  static const warningBorder = Color(0xFFD97706);
  static const danger = Color(0xFFB91C1C);
  static const dangerMuted = Color(0xFFFEF2F2);
  static const dangerBorder = Color(0xFFDC2626);
  static const info = Color(0xFF1D4ED8);
  static const infoMuted = Color(0xFFEFF6FF);
  static const infoBorder = Color(0xFF2563EB);

  // Dark variants of semantic colors
  static const successDark = Color(0xFF4ADE80);
  static const warningDark = Color(0xFFFBBF24);
  static const dangerDark = Color(0xFFF87171);
  static const infoDark = Color(0xFF60A5FA);
}
