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

class TenantTab extends StatelessWidget {
  const TenantTab({super.key});
  @override
  Widget build(BuildContext context) {
    if (!context.watch<AuthState>().signedIn) {
      return Scaffold(appBar: AppBar(title: const Text('Tenant')), body: SignInPrompt(what: 'open your tenant portal', onSignIn: () => context.push('/login')));
    }
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(title: const Text('Tenant portal'), bottom: const TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: [Tab(text: 'Home'), Tab(text: 'Rent'), Tab(text: 'Lease'), Tab(text: 'Maintenance')])),
        body: const TabBarView(children: [_HomeView(), _InvoicesView(), LeaseView(), _MaintenanceListView()]),
      ),
    );
  }
}

class _HomeView extends StatelessWidget {
  const _HomeView();
  @override
  Widget build(BuildContext context) {
    return Loader<TenantHome>(
      load: () => context.read<Repo>().tenantHome(),
      builder: (context, h, reload) {
        final t = h.tenancy;
        if (t == null) {
          return RefreshIndicator(onRefresh: reload, child: ListView(children: const [SizedBox(height: 380, child: EmptyState(icon: Icons.key_off_outlined, title: 'No active tenancy yet', hint: 'Your portal activates once a lease is accepted by both sides and activated by the company. Check the Lease tab for pending leases.'))]));
        }
        final out = h.outstanding.entries.map((e) => money(e.value, e.key)).join(' · ');
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), children: [
            Text(t.propertyTitle, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Section(title: 'Rent', child: Column(children: [
              KV('Next due', h.nextDueDate == null ? '—' : '${fmtDate(h.nextDueDate)} · ${money(h.nextDueMinor, h.nextDueCurrency ?? t.currency)}'),
              KV('Outstanding', out.isEmpty ? money(0, t.currency) : out),
              if (h.overdueCount > 0) Padding(padding: const EdgeInsets.only(top: 8), child: Notice('${h.overdueCount} overdue invoice(s).', tone: 'danger')),
              KV('Rent', '${money(t.rentMinor, t.currency)} / ${t.frequency}'),
              KV('Lease ends', fmtDate(t.end)),
            ])),
            const SizedBox(height: 12),
            Section(title: 'Recent payments (demo)', child: h.recent.isEmpty ? const Text('No payments recorded yet.', style: TextStyle(color: Brand.muted)) : Column(children: h.recent.map((p) => KV(fmtDate(p.createdAt), money(p.amountMinor, p.currency))).toList())),
            const SizedBox(height: 12),
            Section(title: 'Open maintenance requests', child: Text('${h.openMaintenance}', style: Theme.of(context).textTheme.headlineSmall)),
          ]),
        );
      },
    );
  }
}

class _InvoicesView extends StatelessWidget {
  const _InvoicesView();
  @override
  Widget build(BuildContext context) {
    return Loader<Paged<Invoice>>(
      load: () => context.read<Repo>().invoices(),
      builder: (context, page, reload) {
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), itemCount: page.items.isEmpty ? 2 : page.items.length + 1, separatorBuilder: (c, i) => const SizedBox(height: 10),
            itemBuilder: (c, i) {
              if (i == 0) return const MockBanner();
              if (page.items.isEmpty) return const SizedBox(height: 280, child: EmptyState(icon: Icons.receipt_long_outlined, title: 'No invoices yet', hint: 'Invoices are generated when your tenancy is activated.'));
              final inv = page.items[i - 1];
              return Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(14),
                  title: Text('${label(inv.type)} · ${inv.number}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Padding(padding: const EdgeInsets.only(top: 4), child: Text('Due ${fmtDate(inv.dueDate)}\nOutstanding ${money(inv.outstandingMinor, inv.currency)}')),
                  isThreeLine: true,
                  trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [Text(money(inv.totalMinor, inv.currency), style: const TextStyle(fontWeight: FontWeight.w700)), const SizedBox(height: 4), StatusChip(inv.status)]),
                  onTap: () async {
                    await context.push('/invoice/${inv.id}');
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

class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.id});
  final String id;
  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  int _v = 0;
  String? _pendingAttempt; // a simulated payment left "pending" that can be completed later

  Future<void> _pay(Invoice inv) async {
    final r = await showModalBottomSheet<_PayChoice>(context: context, isScrollControlled: true, showDragHandle: true, builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom), child: _PaySheet(inv: inv)));
    if (r == null || !mounted) return;
    final repo = context.read<Repo>();
    try {
      final res = await repo.payInvoice(inv.id, scenario: r.scenario, amountMinor: r.amountMinor);
      if (!mounted) return;
      _afterPayment(res);
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
  }

  void _afterPayment(PaymentResult res) {
    setState(() {
      _v++;
      _pendingAttempt = res.status == 'pending' ? res.attemptId : null;
    });
    final tone = res.status == 'succeeded' ? 'success' : res.status == 'pending' ? 'warn' : 'danger';
    showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Simulated payment ${res.status}'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Notice('Reference ${res.reference}. No real money moved.', tone: tone, title: 'Demo payment — no real money transferred'),
          if (res.status == 'pending') const Padding(padding: EdgeInsets.only(top: 8), child: Text('Tap "Complete pending payment" on the invoice to settle it.')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: Loader<Invoice>(
        key: ValueKey(_v),
        load: () => context.read<Repo>().invoice(widget.id),
        builder: (context, inv, reload) => ListView(padding: const EdgeInsets.all(16), children: [
          const MockBanner(),
          const SizedBox(height: 12),
          Section(title: inv.number, trailing: StatusChip(inv.status), child: Column(children: [
            ...inv.lines.map((l) => KV(l.key, money(l.value, inv.currency))),
            const Divider(),
            KV('Due date', fmtDate(inv.dueDate)),
            KV('Total', money(inv.totalMinor, inv.currency)),
            KV('Paid', money(inv.paidMinor, inv.currency)),
            KV('Outstanding', money(inv.outstandingMinor, inv.currency)),
          ])),
          const SizedBox(height: 12),
          Section(title: 'Payments (demo)', child: inv.transactions.isEmpty ? const Text('None yet.', style: TextStyle(color: Brand.muted)) : Column(children: inv.transactions.map((t) => ListTile(
                contentPadding: EdgeInsets.zero, dense: true,
                title: Text('${t.type == 'reversal' ? 'Reversal' : 'Payment'} · ${money(t.amountMinor, t.currency)}'), subtitle: Text('${fmtDateTime(t.createdAt)}\n${t.reference}'), isThreeLine: true,
                trailing: t.type == 'payment' && !t.voided ? TextButton(onPressed: () => _receipt(t.id), child: const Text('Receipt')) : null)).toList())),
          const SizedBox(height: 16),
          if (_pendingAttempt != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: OutlinedButton(onPressed: () async {
            final repo = context.read<Repo>();
            try {
              final res = await repo.completePayment(_pendingAttempt!);
              if (mounted) _afterPayment(res);
            } catch (e) {
              if (mounted) toast(context, errorMessage(e), error: true);
            }
          }, child: const Text('Complete pending payment'))),
          if (inv.payable) FilledButton.icon(onPressed: () => _pay(inv), icon: const Icon(Icons.credit_card), label: const Text('Pay (demo)')),
        ]),
      ),
    );
  }

  Future<void> _receipt(String txId) async {
    final repo = context.read<Repo>();
    try {
      final r = await repo.receipt(txId);
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('${r['watermark'] ?? 'SIMULATED RECEIPT'}'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Notice('${r['notice'] ?? 'Demo payment — no real money transferred'}', tone: 'warn'),
            const SizedBox(height: 8),
            KV('Invoice', '${r['invoiceNumber'] ?? ''}'), KV('Amount', money(asInt(r['amountMinor']), '${r['currency'] ?? 'USD'}')), KV('Reference', '${r['receiptFor'] ?? ''}'),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Close'))],
        ),
      );
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    }
  }
}

class _PayChoice {
  _PayChoice(this.scenario, this.amountMinor);
  final String scenario;
  final int? amountMinor;
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({required this.inv});
  final Invoice inv;
  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  final _amount = TextEditingController();
  String _scenario = 'success';
  String? _err;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inv = widget.inv;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Pay invoice (demo)', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        const MockBanner(),
        const SizedBox(height: 12),
        TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: 'Amount (${inv.currency}) — leave empty for the full balance', helperText: 'Outstanding: ${money(inv.outstandingMinor, inv.currency)}', errorText: _err)),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _scenario, decoration: const InputDecoration(labelText: 'Simulated outcome (demo only)'),
          items: const [DropdownMenuItem(value: 'success', child: Text('Succeeds')), DropdownMenuItem(value: 'failure', child: Text('Fails')), DropdownMenuItem(value: 'pending', child: Text('Stays pending, then settles'))],
          onChanged: (v) => setState(() => _scenario = v ?? 'success'),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () {
            int? minor;
            if (_amount.text.trim().isNotEmpty) {
              minor = parseMinor(_amount.text);
              if (minor == null || minor <= 0 || minor > inv.outstandingMinor) {
                setState(() => _err = 'Enter an amount between 0.01 and the outstanding balance');
                return;
              }
            }
            Navigator.pop(context, _PayChoice(_scenario, minor));
          },
          child: const Text('Simulate payment'),
        ),
      ]),
    );
  }
}

class LeaseView extends StatelessWidget {
  const LeaseView({super.key});
  @override
  Widget build(BuildContext context) {
    return Loader<List<Tenancy>>(
      load: () => context.read<Repo>().tenancies(),
      builder: (context, list, reload) {
        if (list.isEmpty) {
          return RefreshIndicator(onRefresh: reload, child: ListView(children: const [SizedBox(height: 380, child: EmptyState(icon: Icons.description_outlined, title: 'No lease yet', hint: 'When a company approves your application and prepares a lease, it will appear here for your review.'))]));
        }
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), itemCount: list.length, separatorBuilder: (c, i) => const SizedBox(height: 12),
            itemBuilder: (c, i) {
              final t = list[i];
              return Section(
                title: t.propertyTitle, trailing: StatusChip(t.status),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  KV('Contract', t.contractRef), KV('Start', fmtDate(t.start)), KV('End', fmtDate(t.end)),
                  KV('Rent', '${money(t.rentMinor, t.currency)} / ${t.frequency}'), KV('Due day', 'Day ${t.dueDay}'), KV('Deposit', money(t.depositMinor, t.currency)), KV('Notice period', '${t.noticeDays} days'),
                  if (t.fees.isNotEmpty) KV('Agreed fees', t.fees.map((f) => '${f.key} ${money(f.value, t.currency)}').join(', ')),
                  if (t.renewalTerms != null && t.renewalTerms!.isNotEmpty) KV('Renewal terms', t.renewalTerms!),
                  if (t.status == 'pending') ...[
                    const SizedBox(height: 12),
                    if (!t.companyAccepted) const Notice('The company is still finalising this lease. You will be notified when it is ready to accept.')
                    else if (t.tenantAccepted) const Notice('You accepted this lease. Awaiting activation by the company. Any deposit invoice is under the Rent tab.', tone: 'success')
                    else ...[
                      const Notice('Accepting records your agreement to these terms. Your tenancy only starts once the company activates it.', tone: 'warn'),
                      const SizedBox(height: 8),
                      FilledButton(
                        onPressed: () async {
                          if (!await confirm(context, 'Accept this lease?', 'You confirm you have read the rent, duration, deposit, due date, fees and conditions.', ok: 'I accept')) return;
                          if (!context.mounted) return;
                          await run(context, () => context.read<Repo>().acceptLease(t.id), success: 'Lease accepted');
                          if (context.mounted) reload();
                        },
                        child: const Text('Review & accept lease'),
                      ),
                    ],
                  ],
                ]),
              );
            },
          ),
        );
      },
    );
  }
}

class _MaintenanceListView extends StatelessWidget {
  const _MaintenanceListView();
  @override
  Widget build(BuildContext context) {
    return Loader<Paged<MaintenanceRequest>>(
      load: () => context.read<Repo>().maintenance(),
      builder: (context, page, reload) => Scaffold(
        backgroundColor: Colors.transparent,
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () async {
            await context.push('/maintenance/new');
            reload();
          },
          icon: const Icon(Icons.add), label: const Text('New request'),
        ),
        body: page.items.isEmpty
            ? RefreshIndicator(onRefresh: reload, child: ListView(children: const [SizedBox(height: 380, child: EmptyState(icon: Icons.handyman_outlined, title: 'No requests', hint: 'Report plumbing, electrical or other issues and track progress here.'))]))
            : RefreshIndicator(
                onRefresh: reload,
                child: ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 16, 16, 96), itemCount: page.items.length, separatorBuilder: (c, i) => const SizedBox(height: 10),
                  itemBuilder: (c, i) {
                    final m = page.items[i];
                    return Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(14),
                        leading: m.isEmergency ? const Icon(Icons.warning_amber_rounded, color: Brand.dangerText, semanticLabel: 'Emergency') : const Icon(Icons.build_outlined),
                        title: Text(m.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${label(m.category)} · ${fmtDate(m.createdAt)}'),
                        trailing: StatusChip(m.status),
                        onTap: () async {
                          await context.push('/maintenance/${m.id}');
                          reload();
                        },
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
