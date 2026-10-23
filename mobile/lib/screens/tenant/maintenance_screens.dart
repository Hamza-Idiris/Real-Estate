import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

const List<String> kCategories = ['plumbing', 'electrical', 'structural', 'doors_locks', 'appliances', 'cleaning', 'other'];
const String kEmergencyDisclaimer = 'This app does not replace emergency services and does not guarantee an immediate human response. If anyone is in danger, call your local emergency number now.';

class MaintenanceCreateScreen extends StatelessWidget {
  const MaintenanceCreateScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report an issue')),
      body: Loader<List<Tenancy>>(
        load: () => context.read<Repo>().tenancies(),
        builder: (context, list, reload) {
          final active = list.where((t) => t.status == 'active').toList();
          if (active.isEmpty) return const EmptyState(icon: Icons.key_off_outlined, title: 'No active tenancy', hint: 'You need an active tenancy to submit maintenance requests.');
          return _CreateForm(tenancyId: active.first.id);
        },
      ),
    );
  }
}

class _CreateForm extends StatefulWidget {
  const _CreateForm({required this.tenancyId});
  final String tenancyId;
  @override
  State<_CreateForm> createState() => _CreateFormState();
}

class _CreateFormState extends State<_CreateForm> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _desc = TextEditingController();
  String _category = 'plumbing';
  String _priority = 'normal';
  final List<XFile> _photos = [];
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await ImagePicker().pickMultiImage(maxWidth: 2000, imageQuality: 85);
    if (picked.isEmpty) return;
    setState(() {
      _photos.addAll(picked);
      if (_photos.length > 8) _photos.removeRange(8, _photos.length);
    });
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final repo = context.read<Repo>();
    final nav = GoRouter.of(context);
    try {
      final req = await repo.createMaintenance(tenancyId: widget.tenancyId, category: _category, title: _title.text.trim(), description: _desc.text.trim(), priority: _priority);
      var failed = 0;
      for (final x in _photos) {
        try {
          final Uint8List bytes = await x.readAsBytes();
          await repo.uploadMaintenanceAttachment(req.id, bytes, x.name);
        } catch (_) {
          failed++;
        }
      }
      if (!mounted) return;
      toast(context, failed > 0 ? 'Request sent, but $failed photo(s) failed to upload. You can add them later.' : (_priority == 'emergency' ? 'Emergency report sent to staff' : 'Request submitted'));
      nav.pop();
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final emergency = _priority == 'emergency';
    return Form(
      key: _form,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (emergency) ...[const Notice(kEmergencyDisclaimer, tone: 'danger', title: 'Emergency reports are flagged to staff immediately'), const SizedBox(height: 12)],
        DropdownButtonFormField<String>(value: _category, decoration: const InputDecoration(labelText: 'Category'), items: kCategories.map((c) => DropdownMenuItem(value: c, child: Text(label(c)))).toList(), onChanged: (v) => setState(() => _category = v ?? 'plumbing')),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _priority, decoration: const InputDecoration(labelText: 'Urgency'),
          items: const [DropdownMenuItem(value: 'low', child: Text('Low')), DropdownMenuItem(value: 'normal', child: Text('Normal')), DropdownMenuItem(value: 'high', child: Text('High')), DropdownMenuItem(value: 'emergency', child: Text('Emergency'))],
          onChanged: (v) => setState(() => _priority = v ?? 'normal'),
        ),
        const SizedBox(height: 12),
        TextFormField(controller: _title, maxLength: 140, decoration: const InputDecoration(labelText: 'Short title'), validator: (v) => (v == null || v.trim().length < 3) ? 'At least 3 characters' : null),
        const SizedBox(height: 4),
        TextFormField(controller: _desc, maxLines: 5, maxLength: 3000, decoration: const InputDecoration(labelText: 'Describe the issue'), validator: (v) => (v == null || v.trim().length < 5) ? 'Please describe the issue' : null),
        const SizedBox(height: 8),
        OutlinedButton.icon(onPressed: _photos.length >= 8 ? null : _pick, icon: const Icon(Icons.photo_camera_outlined), label: Text('Attach photos (${_photos.length}/8)')),
        if (_photos.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_photos.map((p) => p.name).join(', '), style: const TextStyle(color: Brand.muted, fontSize: 12))),
        const SizedBox(height: 20),
        FilledButton(
          style: emergency ? FilledButton.styleFrom(backgroundColor: Brand.danger) : null,
          onPressed: _busy ? null : _submit,
          child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(emergency ? 'Send emergency report' : 'Submit request'),
        ),
      ]),
    );
  }
}

class MaintenanceDetailScreen extends StatefulWidget {
  const MaintenanceDetailScreen({super.key, required this.id});
  final String id;
  @override
  State<MaintenanceDetailScreen> createState() => _MaintenanceDetailScreenState();
}

class _MaintenanceDetailScreenState extends State<MaintenanceDetailScreen> {
  final _msg = TextEditingController();
  int _v = 0;

  @override
  void dispose() {
    _msg.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Maintenance request')),
      body: Loader<MaintenanceRequest>(
        key: ValueKey(_v),
        load: () => context.read<Repo>().maintenanceDetail(widget.id),
        builder: (context, m, reload) => ListView(padding: const EdgeInsets.all(16), children: [
          Row(children: [Expanded(child: Text(m.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700))), StatusChip(m.status)]),
          const SizedBox(height: 4),
          Text('${label(m.category)} · ${fmtDateTime(m.createdAt)}', style: const TextStyle(color: Brand.muted)),
          const SizedBox(height: 12),
          if (m.isEmergency) ...[Notice(m.disclaimer ?? kEmergencyDisclaimer, tone: 'danger', title: 'Emergency report'), const SizedBox(height: 12)],
          Text(m.description),
          if (m.attachments.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: m.attachments.map((a) => ActionChip(avatar: const Icon(Icons.attachment, size: 16), label: Text(a.key), onPressed: () => launchUrl(Uri.parse(a.value), mode: LaunchMode.externalApplication))).toList()),
          ],
          if (m.resolution != null && m.resolution!.isNotEmpty) ...[const SizedBox(height: 12), Notice(m.resolution!, tone: 'success', title: 'Resolution')],
          const SizedBox(height: 16),
          Section(title: 'Progress', child: Column(children: m.history.reversed.map((h) => KV(label(h.key), fmtDateTime(h.value))).toList())),
          const SizedBox(height: 12),
          Section(title: 'Conversation', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (m.comments.isEmpty) const Text('No messages yet.', style: TextStyle(color: Brand.muted)),
            ...m.comments.map((c) => Container(
                  width: double.infinity, margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: c.authorType == 'staff' ? Brand.emeraldSoft : Brand.mutedBg, borderRadius: BorderRadius.circular(10)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${c.authorType == 'staff' ? 'Staff' : 'You'} · ${fmtDateTime(c.at)}', style: const TextStyle(color: Brand.muted, fontSize: 12)), Text(c.message)]),
                )),
            if (m.status != 'closed') Row(children: [
              Expanded(child: TextField(controller: _msg, decoration: const InputDecoration(hintText: 'Add follow-up information'))),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Send message', icon: const Icon(Icons.send),
                onPressed: () async {
                  final text = _msg.text.trim();
                  if (text.isEmpty) return;
                  final ok = await run(context, () => context.read<Repo>().commentMaintenance(m.id, text));
                  if (ok && mounted) {
                    _msg.clear();
                    setState(() => _v++);
                  }
                },
              ),
            ]),
          ])),
          if (m.status == 'resolved' || m.status == 'closed') Padding(
            padding: const EdgeInsets.only(top: 12),
            child: OutlinedButton(
              onPressed: () async {
                final ok = await run(context, () => context.read<Repo>().reopenMaintenance(m.id, 'The problem is not resolved.'), success: 'Request reopened');
                if (ok && mounted) setState(() => _v++);
              },
              child: const Text('Reopen — problem persists'),
            ),
          ),
        ]),
      ),
    );
  }
}
