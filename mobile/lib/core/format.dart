import 'package:intl/intl.dart';

/// Money arrives as integer minor units + currency code and is only formatted here.
String money(int? minor, [String currency = 'USD']) {
  if (minor == null) return '—';
  try {
    return NumberFormat.simpleCurrency(name: currency).format(minor / 100);
  } catch (_) {
    return '$currency ${(minor / 100).toStringAsFixed(2)}';
  }
}

/// Parses user input like "1,250.50" into minor units without float drift issues for normal amounts.
int? parseMinor(String input) {
  final cleaned = input.trim().replaceAll(',', '');
  final v = double.tryParse(cleaned);
  if (v == null || v < 0) return null;
  return (v * 100).round();
}

String fmtDate(DateTime? d) => d == null ? '—' : DateFormat.yMMMd().format(d);
String fmtDateTime(DateTime? d) => d == null ? '—' : DateFormat.yMMMd().add_jm().format(d);

String label(String s) {
  final t = s.replaceAll('_', ' ');
  return t.isEmpty ? t : t[0].toUpperCase() + t.substring(1);
}

String ago(DateTime d, {DateTime? now}) {
  final s = (now ?? DateTime.now()).difference(d).inSeconds;
  if (s < 60) return 'just now';
  if (s < 3600) return '${s ~/ 60} min ago';
  if (s < 86400) return '${s ~/ 3600} h ago';
  return '${s ~/ 86400} d ago';
}
