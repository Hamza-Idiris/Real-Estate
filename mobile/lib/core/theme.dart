import 'package:flutter/material.dart';

/// Brand tokens from the design brief. Text variants are the AA-safe ones verified in the web contrast tests.
class Brand {
  static const Color bg = Color(0xFFF8F9F6);
  static const Color surface = Colors.white;
  static const Color navy = Color(0xFF142B3B);
  static const Color navy2 = Color(0xFF233F50);
  static const Color emerald = Color(0xFF16856B);
  static const Color emeraldHover = Color(0xFF116B56);
  static const Color emeraldSoft = Color(0xFFE8F5EF);
  static const Color emeraldText = Color(0xFF127560);
  static const Color ink = Color(0xFF17212B);
  static const Color muted = Color(0xFF5F6A7D);
  static const Color line = Color(0xFFE4E8E5);
  static const Color mutedBg = Color(0xFFF0F3F1);
  static const Color warn = Color(0xFFB7791F);
  static const Color warnText = Color(0xFF8A5A12);
  static const Color warnBg = Color(0xFFFFF5DD);
  static const Color danger = Color(0xFFC43D4B);
  static const Color dangerText = Color(0xFFB3303E);
  static const Color dangerBg = Color(0xFFFDEBED);
  static const Color info = Color(0xFF3469B8);
}

ThemeData buildTheme() {
  const scheme = ColorScheme.light(
    primary: Brand.emerald, onPrimary: Colors.white, secondary: Brand.navy2, onSecondary: Colors.white,
    surface: Brand.surface, onSurface: Brand.ink, error: Brand.danger, onError: Colors.white,
    outline: Brand.line, surfaceContainerHighest: Brand.mutedBg,
  );
  final radius = BorderRadius.circular(10);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.bg,
    appBarTheme: const AppBarTheme(backgroundColor: Brand.bg, foregroundColor: Brand.navy, elevation: 0, scrolledUnderElevation: 0, centerTitle: false),
    cardTheme: CardThemeData(color: Brand.surface, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Brand.line))),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Brand.surface, border: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.line)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.line)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.emerald, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.danger)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(48, 48), shape: RoundedRectangleBorder(borderRadius: radius))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: Brand.navy, side: const BorderSide(color: Brand.line), shape: RoundedRectangleBorder(borderRadius: radius))),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: Brand.emeraldText)),
    navigationBarTheme: const NavigationBarThemeData(backgroundColor: Brand.surface, indicatorColor: Brand.emeraldSoft, height: 68),
    dividerTheme: const DividerThemeData(color: Brand.line, space: 1),
  );
}
