import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';

/// Maps a server-issued web link (e.g. /tenant/invoices/<id>) to an in-app route. Staff-only links are ignored on mobile.
String? appRouteForLink(String? link) {
  if (link == null || link.isEmpty) return null;
  final inv = RegExp(r'^/tenant/invoices/([a-f0-9]{24})$').firstMatch(link);
  if (inv != null) return '/invoice/${inv.group(1)}';
  final mnt = RegExp(r'^/tenant/maintenance/([a-f0-9]{24})$').firstMatch(link);
  if (mnt != null) return '/maintenance/${mnt.group(1)}';
  if (link.startsWith('/tenant')) return 'tab:2';
  if (link.startsWith('/account')) return 'tab:1';
  return null;
}

class NotificationsTab extends StatefulWidget {
  const NotificationsTab({super.key});
  @override
  State<NotificationsTab> createState() => _NotificationsTabState();
}

class _NotificationsTabState extends State<NotificationsTab> {
  int _v = 0;
  bool _unreadOnly = false;

  Future<void> _open(AppNotification n) async {
    final repo = context.read<Repo>();
    final nav = context.read<NavState>();
    final router = GoRouter.of(context);
    if (!n.read) {
      try {
        await repo.markRead(n.id);
      } catch (_) {/* not critical */}
    }
    final target = appRouteForLink(n.link);
    if (target == null) {
      if (mounted) setState(() => _v++);
    } else if (target.startsWith('tab:')) {
      nav.go(int.parse(target.substring(4)));
    } else {
      router.push(target);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!context.watch<AuthState>().signedIn) {
      return Scaffold(appBar: AppBar(title: const Text('Alerts')), body: SignInPrompt(what: 'see your notifications', onSignIn: () => context.push('/login')));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Alerts'), actions: [
        IconButton(tooltip: _unreadOnly ? 'Show all' : 'Show unread only', icon: Icon(_unreadOnly ? Icons.filter_alt : Icons.filter_alt_outlined), onPressed: () => setState(() => _unreadOnly = !_unreadOnly)),
        IconButton(
          tooltip: 'Mark all as read', icon: const Icon(Icons.done_all),
          onPressed: () async {
            await run(context, () => context.read<Repo>().markAllRead(), success: 'All marked as read');
            if (mounted) setState(() => _v++);
          },
        ),
      ]),
      body: Loader<Paged<AppNotification>>(
        key: ValueKey('$_v$_unreadOnly'),
        load: () => context.read<Repo>().notifications(unreadOnly: _unreadOnly),
        builder: (context, page, reload) => RefreshIndicator(
          onRefresh: reload,
          child: page.items.isEmpty
              ? ListView(children: const [SizedBox(height: 380, child: EmptyState(icon: Icons.notifications_none, title: "You're all caught up", hint: 'Updates about viewings, applications, rent and maintenance appear here. (In-app only: email and push are not configured.)'))])
              : ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(), itemCount: page.items.length, separatorBuilder: (c, i) => const Divider(),
                  itemBuilder: (c, i) {
                    final n = page.items[i];
                    return ListTile(
                      tileColor: n.read ? null : Brand.emeraldSoft,
                      leading: n.priority == 'emergency' ? const Icon(Icons.warning_amber_rounded, color: Brand.dangerText, semanticLabel: 'Emergency') : Icon(n.read ? Icons.notifications_none : Icons.notifications_active, semanticLabel: n.read ? 'Read' : 'Unread'),
                      title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w400 : FontWeight.w700)),
                      subtitle: n.body == null ? null : Text(n.body!, maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: Text(n.createdAt == null ? '' : ago(n.createdAt!), style: const TextStyle(color: Brand.muted, fontSize: 12)),
                      onTap: () => _open(n),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});
  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    if (!auth.signedIn) {
      return Scaffold(appBar: AppBar(title: const Text('Profile')), body: SignInPrompt(what: 'manage your profile', onSignIn: () => context.push('/login')));
    }
    final u = auth.user!;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Section(title: 'Account', child: Column(children: [KV('Name', u.name), KV('Email', u.email), KV('Phone', u.phone ?? '—')])),
        const SizedBox(height: 12),
        Section(title: 'Security & privacy', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.edit_outlined), title: const Text('Edit profile'), onTap: () => _editProfile(context)),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.lock_outline), title: const Text('Change password'), onTap: () => _changePassword(context)),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.download_outlined), title: const Text('View my data'), subtitle: const Text('Profile, viewings and applications we hold about you'), onTap: () => _viewData(context)),
        ])),
        const SizedBox(height: 12),
        const Notice('Payments in this app are simulated. Notifications are in-app only.', tone: 'warn', title: 'Demo environment'),
        const SizedBox(height: 16),
        OutlinedButton.icon(icon: const Icon(Icons.logout), label: const Text('Sign out'), onPressed: () async { await context.read<AuthState>().logout(); }),
      ]),
    );
  }

  Future<void> _editProfile(BuildContext context) async {
    final auth = context.read<AuthState>();
    final repo = context.read<Repo>();
    final name = TextEditingController(text: auth.user?.name);
    final phone = TextEditingController(text: auth.user?.phone);
    final save = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Edit profile'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')), const SizedBox(height: 12), TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone'))]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Save'))],
      ),
    );
    if (save == true && name.text.trim().length >= 2) {
      try {
        await repo.updateProfile(name: name.text.trim(), phone: phone.text.trim());
        await auth.reloadUser();
        if (context.mounted) toast(context, 'Profile updated');
      } catch (e) {
        if (context.mounted) toast(context, errorMessage(e), error: true);
      }
    }
    name.dispose();
    phone.dispose();
  }

  Future<void> _changePassword(BuildContext context) async {
    final repo = context.read<Repo>();
    final cur = TextEditingController();
    final next = TextEditingController();
    final go = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Change password'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: cur, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
          const SizedBox(height: 12),
          TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: '10+ characters, upper, lower, number')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Change'))],
      ),
    );
    if (go == true) {
      final problem = passwordField(next.text);
      if (problem != null) {
        if (context.mounted) toast(context, problem, error: true);
      } else {
        try {
          await repo.changePassword(cur.text, next.text);
          if (context.mounted) toast(context, 'Password changed. Other sessions were signed out.');
        } catch (e) {
          if (context.mounted) toast(context, errorMessage(e), error: true);
        }
      }
    }
    cur.dispose();
    next.dispose();
  }

  Future<void> _viewData(BuildContext context) async {
    final repo = context.read<Repo>();
    try {
      final d = await repo.dataExport();
      if (!context.mounted) return;
      showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Your data'),
          content: Text('Profile: ${asMap(d['profile'])['email']}\nViewing requests: ${asList(d['bookings']).length}\nApplications: ${asList(d['applications']).length}\n\nFor a full machine-readable export use the web app (Account → Profile & privacy).'),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
        ),
      );
    } catch (e) {
      if (context.mounted) toast(context, errorMessage(e), error: true);
    }
  }
}
