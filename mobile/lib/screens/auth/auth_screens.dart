import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';

class _AuthScaffold extends StatelessWidget {
  const _AuthScaffold({required this.title, required this.subtitle, required this.child});
  final String title, subtitle;
  final Widget child;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(leading: IconButton(tooltip: 'Back to browsing', icon: const Icon(Icons.close), onPressed: () => context.canPop() ? context.pop() : context.go('/'))),
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: [
            Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(subtitle),
            const SizedBox(height: 24),
            child,
          ]),
        ),
      );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.from});
  final String? from;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AuthState>().login(_email.text, _password.text);
      // The router redirect sends the user on (to `from` or home) once signed in.
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e)); // generic server message; no account hints
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final from = widget.from == null ? '' : '?from=${Uri.encodeComponent(widget.from!)}';
    return _AuthScaffold(
      title: 'Welcome back',
      subtitle: 'Sign in to manage viewings, applications and your tenancy.',
      child: Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_error != null) ...[Notice(_error!, tone: 'danger'), const SizedBox(height: 16)],
          TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email'), validator: emailField),
          const SizedBox(height: 16),
          TextFormField(
            controller: _password, obscureText: _hide, autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: 'Password', suffixIcon: IconButton(tooltip: _hide ? 'Show password' : 'Hide password', icon: Icon(_hide ? Icons.visibility : Icons.visibility_off), onPressed: () => setState(() => _hide = !_hide))),
            validator: (v) => requiredField(v, 'Enter your password'), onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _busy ? null : _submit, child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in')),
          const SizedBox(height: 8),
          TextButton(onPressed: () => context.push('/register$from'), child: const Text('New here? Create an account')),
        ]),
      ),
    );
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.from});
  final String? from;
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AuthState>().register(name: _name.text, email: _email.text, password: _password.text, phone: _phone.text);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthScaffold(
        title: 'Create your account',
        subtitle: 'Book viewings, apply for rentals and track everything in one place.',
        child: Form(
          key: _form,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (_error != null) ...[Notice(_error!, tone: 'danger'), const SizedBox(height: 16)],
            TextFormField(controller: _name, textCapitalization: TextCapitalization.words, autofillHints: const [AutofillHints.name], decoration: const InputDecoration(labelText: 'Full name'), validator: (v) => requiredField(v, 'Enter your name')),
            const SizedBox(height: 16),
            TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email'), validator: emailField),
            const SizedBox(height: 16),
            TextFormField(controller: _phone, keyboardType: TextInputType.phone, autofillHints: const [AutofillHints.telephoneNumber], decoration: const InputDecoration(labelText: 'Phone (optional)')),
            const SizedBox(height: 16),
            TextFormField(controller: _password, obscureText: true, autofillHints: const [AutofillHints.newPassword], decoration: const InputDecoration(labelText: 'Password', helperText: 'At least 10 characters with upper case, lower case and a number.'), validator: passwordField),
            const SizedBox(height: 24),
            FilledButton(onPressed: _busy ? null : _submit, child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Create account')),
          ]),
        ),
      );
}
