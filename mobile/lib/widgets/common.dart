import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';

/// Loads async data and renders the loading / error(+retry) / content states every screen needs.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late Future<T> _future;
  @override
  void initState() {
    super.initState();
    _future = widget.load();
  }

  Future<void> _reload() async {
    final f = widget.load();
    setState(() => _future = f);
    try {
      await f;
    } catch (_) {/* shown by the builder */}
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator(semanticsLabel: 'Loading'));
        }
        if (snap.hasError) return ErrorView(error: snap.error!, onRetry: _reload);
        return widget.builder(context, snap.data as T, _reload);
      },
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) {
    final denied = error is ApiException && (error as ApiException).isDenied;
    final msg = error is ApiException && (error as ApiException).status == 403 ? "You don't have permission to view this." : errorMessage(error);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline, color: Brand.dangerText, size: 32),
          const SizedBox(height: 12),
          Text(msg, textAlign: TextAlign.center),
          if (onRetry != null && !denied) ...[const SizedBox(height: 16), OutlinedButton(onPressed: onRetry, child: const Text('Try again'))],
        ]),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, this.hint, this.icon = Icons.inbox_outlined, this.action});
  final String title;
  final String? hint;
  final IconData icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 40, color: Brand.muted),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            if (hint != null) ...[const SizedBox(height: 6), Text(hint!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted))],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ]),
        ),
      );
}

class SignInPrompt extends StatelessWidget {
  const SignInPrompt({super.key, required this.onSignIn, this.what = 'continue'});
  final VoidCallback onSignIn;
  final String what;
  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Icons.lock_outline, title: 'Sign in to $what', hint: 'Browsing is open to everyone. Viewings, applications and your tenancy need an account.',
        action: FilledButton(onPressed: onSignIn, child: const Text('Sign in')));
}

Color _statusBg(String s) {
  if (const ['paid', 'active', 'confirmed', 'approved', 'completed', 'resolved', 'available', 'succeeded'].contains(s)) return Brand.emeraldSoft;
  if (const ['overdue', 'rejected', 'no_show', 'failed', 'terminated', 'emergency'].contains(s)) return Brand.dangerBg;
  if (const ['pending', 'submitted', 'under_review', 'information_required', 'alternative_proposed', 'partially_paid', 'waiting_for_parts', 'reopened', 'high'].contains(s)) return Brand.warnBg;
  return Brand.mutedBg;
}

Color _statusFg(String s) {
  if (const ['paid', 'active', 'confirmed', 'approved', 'completed', 'resolved', 'available', 'succeeded'].contains(s)) return Brand.emeraldHover;
  if (const ['overdue', 'rejected', 'no_show', 'failed', 'terminated', 'emergency'].contains(s)) return Brand.dangerText;
  if (const ['pending', 'submitted', 'under_review', 'information_required', 'alternative_proposed', 'partially_paid', 'waiting_for_parts', 'reopened', 'high'].contains(s)) return Brand.warnText;
  return Brand.muted;
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Status: ${label(status)}',
        child: ExcludeSemantics(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(color: _statusBg(status), borderRadius: BorderRadius.circular(99)),
            child: Text(label(status), style: TextStyle(color: _statusFg(status), fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        ),
      );
}

class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.tone = 'info', this.title});
  final String text;
  final String? title;
  final String tone; // info | warn | danger | success
  @override
  Widget build(BuildContext context) {
    final bg = tone == 'warn' ? Brand.warnBg : tone == 'danger' ? Brand.dangerBg : tone == 'success' ? Brand.emeraldSoft : const Color(0xFFEFF6FF);
    final fg = tone == 'warn' ? Brand.warnText : tone == 'danger' ? Brand.dangerText : tone == 'success' ? Brand.emeraldHover : Brand.info;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (title != null) Text(title!, style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
        Text(text, style: TextStyle(color: fg)),
      ]),
    );
  }
}

class MockBanner extends StatelessWidget {
  const MockBanner({super.key});
  @override
  Widget build(BuildContext context) => const Notice('All payments in this app are simulated for demonstration.', tone: 'warn', title: 'Demo payment — no real money transferred');
}

class Section extends StatelessWidget {
  const Section({super.key, required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: Brand.navy))), if (trailing != null) trailing!]),
            const SizedBox(height: 10),
            child,
          ]),
        ),
      );
}

class KV extends StatelessWidget {
  const KV(this.k, this.v, {super.key});
  final String k;
  final String v;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 130, child: Text(k, style: const TextStyle(color: Brand.muted))),
          Expanded(child: Text(v, style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]))),
        ]),
      );
}

void toast(BuildContext context, String message, {bool error = false}) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? Brand.danger : Brand.navy, behavior: SnackBarBehavior.floating));
}

/// Runs an action with toast feedback. Returns true on success; on failure the error is shown and false is returned.
Future<bool> run(BuildContext context, Future<void> Function() fn, {String? success}) async {
  try {
    await fn();
    if (success != null) toast(context, success);
    return true;
  } catch (e) {
    toast(context, errorMessage(e), error: true);
    return false;
  }
}

Future<bool> confirm(BuildContext context, String title, String body, {String ok = 'Confirm', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
        FilledButton(style: danger ? FilledButton.styleFrom(backgroundColor: Brand.danger) : null, onPressed: () => Navigator.pop(c, true), child: Text(ok)),
      ],
    ),
  );
  return r == true;
}

String? requiredField(String? v, [String msg = 'Required']) => (v == null || v.trim().isEmpty) ? msg : null;
String? emailField(String? v) => (v == null || !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim())) ? 'Enter a valid email' : null;
String? passwordField(String? v) {
  if (v == null || v.length < 10) return 'Use at least 10 characters';
  if (!RegExp(r'[a-z]').hasMatch(v) || !RegExp(r'[A-Z]').hasMatch(v) || !RegExp(r'\d').hasMatch(v)) return 'Use upper and lower case letters and a number';
  return null;
}
