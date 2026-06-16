// Brand theme — mirrors the Tailwind brand-* palette used on the web app.
// brand-600 (#EA580C) is the primary orange; slate-50/900 anchor surfaces.

import 'package:flutter/material.dart';

class BrandColors {
  static const brand50  = Color(0xFFFFF7ED);
  static const brand100 = Color(0xFFFFEDD5);
  static const brand500 = Color(0xFFF97316);
  static const brand600 = Color(0xFFEA580C);
  static const brand700 = Color(0xFFC2410C);

  static const slate50  = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);

  static const emerald600 = Color(0xFF059669);
  static const rose600    = Color(0xFFE11D48);
  static const amber50    = Color(0xFFFFFBEB);
  static const amber700   = Color(0xFFB45309);
}

ThemeData buildTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    colorScheme: ColorScheme.fromSeed(
      seedColor: BrandColors.brand600,
      brightness: Brightness.light,
    ).copyWith(
      primary: BrandColors.brand600,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: BrandColors.slate50,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: BrandColors.slate900,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: BrandColors.slate900,
        fontWeight: FontWeight.w800,
        fontSize: 18,
      ),
    ),
    textTheme: base.textTheme.apply(
      bodyColor: BrandColors.slate800,
      displayColor: BrandColors.slate900,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: BrandColors.brand600,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: BrandColors.slate700,
        side: const BorderSide(color: BrandColors.slate200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: BrandColors.slate200),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: BrandColors.slate200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: BrandColors.brand500, width: 1.5),
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: BrandColors.slate100),
      ),
    ),
  );
}

String rupee(num n) => '₹${n.toStringAsFixed(0)}';
