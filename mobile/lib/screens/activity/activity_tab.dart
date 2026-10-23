import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';

class ActivityTab extends StatelessWidget {
  const ActivityTab({super.key});
  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AuthState>().signedIn;
    if (!signedIn) {
      return Scaffold(appBar: AppBar(title: const Text('Activity')), body: SignInPrompt(what: 'see your viewings and applications', onSignIn: () => context.push('/login')));
    }
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: const Text('Activity'), bottom: const TabBar(tabs: [Tab(text: 'Viewings'), Tab(text: 'Applications')])),
        body: const TabBarView(children: [_ViewingsList(), _ApplicationsList()]),
      ),
    );
  }
}

class _ViewingsList extends StatelessWidget {
  const _ViewingsList();
  @override
  Widget build(BuildContext context) {
    return Loader<Paged<Booking>>(
      load: () => context.read<Repo>().myBookings(),
      builder: (context, page, reload) {
        if (page.items.isEmpty) {
          return RefreshIndicator(onRefresh: reload, child: ListView(children: const [SizedBox(height: 360, child: EmptyState(icon: Icons.event_busy, title: 'No viewing requests yet', hint: 'Find a property and request a viewing.'))]));
        }
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), itemCount: page.items.length, separatorBuilder: (c, i) => const SizedBox(height: 12),
            itemBuilder: (c, i) {
              final b = page.items[i];
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [Expanded(child: Text(b.propertyTitle, style: const TextStyle(fontWeight: FontWeight.w700))), StatusChip(b.status)]),
                    const SizedBox(height: 8),
                    if (b.status == 'alternative_proposed') Text('Proposed new time: ${fmtDateTime(b.proposedStart)}')
                    else if (b.confirmedStart != null) Text('When: ${fmtDateTime(b.confirmedStart)}')
                    else Text('Requested: ${b.requested.map(fmtDateTime).join('  ·  ')}', style: const TextStyle(color: Brand.muted)),
                    if (b.status == 'alternative_proposed' || b.canCancel) const SizedBox(height: 12),
                    Wrap(spacing: 8, children: [
                      if (b.status == 'alternative_proposed')
                        FilledButton(onPressed: () async { await run(context, () => context.read<Repo>().respondBooking(b.id, 'accept_alternative'), success: 'Viewing confirmed'); if (context.mounted) reload(); }, child: const Text('Accept new time')),
                      if (b.canCancel)
                        OutlinedButton(
                          onPressed: () async {
                            if (!await confirm(context, 'Cancel this viewing?', 'The agent will be notified.', ok: 'Cancel viewing', danger: true)) return;
                            if (!context.mounted) return;
                            await run(context, () => context.read<Repo>().respondBooking(b.id, 'cancel'), success: 'Viewing cancelled');
                            reload();
                          },
                          child: const Text('Cancel'),
                        ),
                    ]),
                  ]),
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _ApplicationsList extends StatelessWidget {
  const _ApplicationsList();
  @override
  Widget build(BuildContext context) {
    return Loader<Paged<RentalApplication>>(
      load: () => context.read<Repo>().myApplications(),
      builder: (context, page, reload) {
        if (page.items.isEmpty) {
          return RefreshIndicator(onRefresh: reload, child: ListView(children: const [SizedBox(height: 360, child: EmptyState(icon: Icons.assignment_outlined, title: 'No applications yet', hint: 'Applying is separate from viewing. Open a property and choose Apply to rent.'))]));
        }
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), itemCount: page.items.length, separatorBuilder: (c, i) => const SizedBox(height: 12),
            itemBuilder: (c, i) {
              final a = page.items[i];
              return Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(16),
                  title: Text(a.propertyTitle, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Padding(padding: const EdgeInsets.only(top: 6), child: Text('Submitted ${fmtDate(a.createdAt)}')),
                  trailing: StatusChip(a.status),
                  onTap: () async {
                    await showModalBottomSheet<void>(context: context, isScrollControlled: true, showDragHandle: true, builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom), child: _ApplicationSheet(id: a.id)));
                    reload();
                  },
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _ApplicationSheet extends StatefulWidget {
  const _ApplicationSheet({required this.id});
  final String id;
  @override
  State<_ApplicationSheet> createState() => _ApplicationSheetState();
}

class _ApplicationSheetState extends State<_ApplicationSheet> {
  final _reply = TextEditingController();
  int _version = 0; // bump to reload

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  bool _open(String s) => const ['draft', 'submitted', 'under_review', 'information_required'].contains(s);

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Loader<RentalApplication>(
        key: ValueKey(_version),
        load: () => context.read<Repo>().application(widget.id),
        builder: (context, a, reload) => ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
          Row(children: [Expanded(child: Text(a.propertyTitle, style: Theme.of(context).textTheme.titleLarge)), StatusChip(a.status)]),
          const SizedBox(height: 12),
          if (a.status == 'information_required') ...[
            Notice(a.infoRequest ?? 'The company needs more information.', tone: 'warn', title: 'More information needed'),
            const SizedBox(height: 8),
            TextField(controller: _reply, maxLines: 3, decoration: const InputDecoration(labelText: 'Your response')),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () async {
                if (_reply.text.trim().isEmpty) return;
                final repo = context.read<Repo>();
                try {
                  await repo.respondToInfoRequest(a.id, _reply.text.trim());
                  if (!mounted) return;
                  toast(context, 'Response sent');
                  _reply.clear();
                  setState(() => _version++);
                } catch (e) {
                  if (mounted) toast(context, errorMessage(e), error: true);
                }
              },
              child: const Text('Send response'),
            ),
            const SizedBox(height: 12),
          ],
          if (a.status == 'approved') const Notice('Approved. The company will prepare your lease; you will be notified to review and accept it.', tone: 'success'),
          if (a.decisionNote != null && a.decisionNote!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Note: ${a.decisionNote}')),
          const SizedBox(height: 12),
          ...a.form.entries.map((e) => KV(label(e.key), e.key == 'desiredMoveIn' ? fmtDate(DateTime.tryParse('${e.value}')?.toLocal()) : '${e.value}')),
          const SizedBox(height: 12),
          Text('Supporting documents', style: Theme.of(context).textTheme.titleMedium),
          if (a.documents.isEmpty) const Text('None uploaded.', style: TextStyle(color: Brand.muted)) else ...a.documents.map((d) => Text('• $d')),
          if (_open(a.status)) Padding(
            padding: const EdgeInsets.only(top: 8),
            child: OutlinedButton.icon(
              icon: const Icon(Icons.upload_file),
              label: const Text('Add a photo of a document'),
              onPressed: () async {
                final repo = context.read<Repo>();
                final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2000, imageQuality: 85);
                if (x == null) return;
                try {
                  await repo.uploadApplicationDocument(a.id, await x.readAsBytes(), x.name);
                  if (!mounted) return;
                  toast(context, 'Document uploaded');
                  setState(() => _version++);
                } catch (e) {
                  if (mounted) toast(context, errorMessage(e), error: true);
                }
              },
            ),
          ),
          if (_open(a.status)) Padding(
            padding: const EdgeInsets.only(top: 16),
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(foregroundColor: Brand.dangerText),
              onPressed: () async {
                if (!await confirm(context, 'Withdraw application?', 'This closes your application.', ok: 'Withdraw', danger: true)) return;
                if (!context.mounted) return;
                final repo = context.read<Repo>();
                final nav = Navigator.of(context);
                try {
                  await repo.withdrawApplication(a.id);
                  nav.pop();
                } catch (e) {
                  if (mounted) toast(context, errorMessage(e), error: true);
                }
              },
              child: const Text('Withdraw application'),
            ),
          ),
        ]),
      ),
    );
  }
}
