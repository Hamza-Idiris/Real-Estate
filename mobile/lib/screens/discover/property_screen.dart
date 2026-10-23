import 'dart:ui' show FontFeature;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../state/auth_state.dart';
import '../../widgets/common.dart';

class PropertyScreen extends StatelessWidget {
  const PropertyScreen({super.key, required this.reference});
  final String reference;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(reference)),
      body: Loader<Property>(
        load: () => context.read<Repo>().property(reference),
        builder: (context, p, reload) => _PropertyBody(p: p),
      ),
    );
  }
}

class _PropertyBody extends StatefulWidget {
  const _PropertyBody({required this.p});
  final Property p;
  @override
  State<_PropertyBody> createState() => _PropertyBodyState();
}

class _PropertyBodyState extends State<_PropertyBody> {
  int _page = 0;

  void _needLogin() => context.push('/login?from=${Uri.encodeComponent('/property/${widget.p.reference}')}');

  Future<void> _open(Widget sheet) async {
    await showModalBottomSheet<void>(
      context: context, isScrollControlled: true, showDragHandle: true,
      builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom), child: sheet),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final signedIn = context.watch<AuthState>().signedIn;
    final price = '${money(p.priceMinor, p.currency)}${p.isRent ? ' / ${p.rentFrequency == 'quarterly' ? 'quarter' : p.rentFrequency == 'yearly' ? 'year' : 'month'}' : ''}';
    return ListView(padding: const EdgeInsets.only(bottom: 32), children: [
      AspectRatio(
        aspectRatio: 16 / 10,
        child: p.images.isEmpty
            ? const ColoredBox(color: Brand.mutedBg, child: Center(child: Icon(Icons.image_not_supported_outlined, size: 40, color: Brand.muted)))
            : Stack(children: [
                PageView.builder(
                  itemCount: p.images.length, onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (c, i) => Semantics(
                    image: true, label: 'Photo ${i + 1} of ${p.images.length}',
                    child: Image.network(p.images[i], fit: BoxFit.cover, errorBuilder: (c, e, s) => const ColoredBox(color: Brand.mutedBg, child: Center(child: Icon(Icons.broken_image_outlined)))),
                  ),
                ),
                Positioned(right: 12, bottom: 12, child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: const Color(0xCC142B3B), borderRadius: BorderRadius.circular(99)), child: Text('${_page + 1} / ${p.images.length}', style: const TextStyle(color: Colors.white, fontSize: 12)))),
              ]),
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 8, runSpacing: 6, children: [
            StatusChip(p.available ? 'available' : 'unavailable'),
            if (p.verified) const StatusChip('approved'),
          ]),
          const SizedBox(height: 8),
          Text(p.title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text([p.district, p.city, p.country].where((s) => s.isNotEmpty).join(', '), style: const TextStyle(color: Brand.muted)),
          const SizedBox(height: 12),
          Text(price, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700, color: Brand.navy)),
          if (p.isRent && p.depositMinor > 0) Text('Deposit ${money(p.depositMinor, p.currency)} (refundable)', style: const TextStyle(color: Brand.muted)),
          const SizedBox(height: 16),
          Row(children: [
            _Fact(Icons.bed_outlined, '${p.bedrooms}', 'Bedrooms'),
            _Fact(Icons.bathtub_outlined, '${p.bathrooms}', 'Bathrooms'),
            _Fact(Icons.square_foot, p.sizeSqm == null ? '—' : '${p.sizeSqm!.toStringAsFixed(0)} m²', 'Size'),
            _Fact(Icons.chair_outlined, p.furnished ? 'Yes' : 'No', 'Furnished'),
          ]),
          const SizedBox(height: 16),
          if (!p.available) const Notice('This property is not currently available. Availability is confirmed by the company when you act.', tone: 'warn'),
          if (!p.available) const SizedBox(height: 12),
          Text('About this property', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(p.description.isEmpty ? 'No description provided.' : p.description),
          if (p.amenities.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Amenities', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 8, children: p.amenities.map((a) => Chip(label: Text(label(a)))).toList()),
          ],
          const SizedBox(height: 8),
          const Text('The exact address is shared when your viewing is confirmed.', style: TextStyle(color: Brand.muted, fontSize: 13)),
          if (p.companyName.isNotEmpty) Text('Listed by ${p.companyName}', style: const TextStyle(color: Brand.muted, fontSize: 13)),
          const SizedBox(height: 20),
          const Notice('A viewing is only a visit and does not reserve the property. A rental application is separate.'),
          const SizedBox(height: 12),
          FilledButton.icon(
            icon: const Icon(Icons.event_available), label: Text(signedIn ? 'Schedule a viewing' : 'Sign in to schedule a viewing'),
            onPressed: p.available ? (signedIn ? () => _open(_ViewingForm(p: p)) : _needLogin) : null,
          ),
          if (p.isRent) ...[
            const SizedBox(height: 10),
            OutlinedButton.icon(
              icon: const Icon(Icons.assignment_outlined), label: Text(signedIn ? 'Apply to rent' : 'Sign in to apply'),
              onPressed: p.available ? (signedIn ? () => _open(_ApplicationForm(p: p)) : _needLogin) : null,
            ),
          ],
        ]),
      ),
    ]);
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.icon, this.value, this.label);
  final IconData icon;
  final String value, label;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Semantics(
          label: '$label: $value',
          child: ExcludeSemantics(child: Column(children: [Icon(icon, color: Brand.navy2), const SizedBox(height: 4), Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()])), Text(label, style: const TextStyle(color: Brand.muted, fontSize: 12))])),
        ),
      );
}

const List<String> _times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];

class _SlotPicker extends StatelessWidget {
  const _SlotPicker({required this.title, required this.date, required this.time, required this.onDate, required this.onTime});
  final String title;
  final DateTime? date;
  final String time;
  final ValueChanged<DateTime> onDate;
  final ValueChanged<String> onTime;
  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          flex: 3,
          child: OutlinedButton.icon(
            icon: const Icon(Icons.calendar_today, size: 18),
            label: Text(date == null ? title : DateFormat.yMMMd().format(date!)),
            onPressed: () async {
              final now = DateTime.now();
              final d = await showDatePicker(context: context, initialDate: date ?? now.add(const Duration(days: 1)), firstDate: now.add(const Duration(days: 1)), lastDate: now.add(const Duration(days: 59)));
              if (d != null) onDate(d);
            },
          ),
        ),
        const SizedBox(width: 8),
        Expanded(flex: 2, child: DropdownButtonFormField<String>(value: time, decoration: const InputDecoration(labelText: 'Time'), items: _times.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(), onChanged: (v) => onTime(v ?? time))),
      ]);
}

DateTime _combine(DateTime d, String t) => DateTime(d.year, d.month, d.day, int.parse(t.substring(0, 2)), int.parse(t.substring(3)));

class _ViewingForm extends StatefulWidget {
  const _ViewingForm({required this.p});
  final Property p;
  @override
  State<_ViewingForm> createState() => _ViewingFormState();
}

class _ViewingFormState extends State<_ViewingForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: context.read<AuthState>().user?.name);
  late final TextEditingController _phone = TextEditingController(text: context.read<AuthState>().user?.phone);
  late final TextEditingController _email = TextEditingController(text: context.read<AuthState>().user?.email);
  final _msg = TextEditingController();
  DateTime? _d1;
  DateTime? _d2;
  String _t1 = '10:00';
  String _t2 = '10:00';
  bool _busy = false;
  String? _slotError;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _msg.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final ok = _form.currentState!.validate();
    if (_d1 == null) setState(() => _slotError = 'Choose a date for your first choice');
    if (!ok || _d1 == null) return;
    setState(() {
      _busy = true;
      _slotError = null;
    });
    final slots = [_combine(_d1!, _t1), if (_d2 != null) _combine(_d2!, _t2)];
    final repo = context.read<Repo>();
    final nav = Navigator.of(context);
    try {
      await repo.createBooking(propertyId: widget.p.id, slots: slots, name: _name.text.trim(), phone: _phone.text.trim(), email: _email.text.trim(), message: _msg.text.trim());
      if (!mounted) return;
      toast(context, 'Viewing requested. We will notify you when staff respond.');
      nav.pop();
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true); // e.g. SLOT/NOT_AVAILABLE decided by the server
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Schedule a viewing', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Notice('A viewing is only a visit and does not reserve the property. Times use your phone\'s timezone.'),
          const SizedBox(height: 12),
          TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Full name'), validator: (v) => requiredField(v, 'Enter your name')),
          const SizedBox(height: 12),
          TextFormField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone'), validator: (v) => (v == null || v.trim().length < 5) ? 'Enter a phone number' : null),
          const SizedBox(height: 12),
          TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email (optional)'), validator: (v) => (v == null || v.trim().isEmpty) ? null : emailField(v)),
          const SizedBox(height: 16),
          const Text('Preferred times', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          _SlotPicker(title: 'First choice date', date: _d1, time: _t1, onDate: (d) => setState(() => _d1 = d), onTime: (t) => setState(() => _t1 = t)),
          if (_slotError != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_slotError!, style: const TextStyle(color: Brand.dangerText, fontSize: 12))),
          const SizedBox(height: 8),
          _SlotPicker(title: 'Second choice (optional)', date: _d2, time: _t2, onDate: (d) => setState(() => _d2 = d), onTime: (t) => setState(() => _t2 = t)),
          const SizedBox(height: 12),
          TextFormField(controller: _msg, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Message (optional)')),
          const SizedBox(height: 8),
          FilledButton(onPressed: _busy ? null : _submit, child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Request viewing')),
        ]),
      ),
    );
  }
}

class _ApplicationForm extends StatefulWidget {
  const _ApplicationForm({required this.p});
  final Property p;
  @override
  State<_ApplicationForm> createState() => _ApplicationFormState();
}

class _ApplicationFormState extends State<_ApplicationForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: context.read<AuthState>().user?.name);
  late final TextEditingController _phone = TextEditingController(text: context.read<AuthState>().user?.phone);
  late final TextEditingController _email = TextEditingController(text: context.read<AuthState>().user?.email);
  final _occupants = TextEditingController(text: '1');
  final _term = TextEditingController(text: '12');
  final _notes = TextEditingController();
  String _employment = 'employed';
  DateTime? _moveIn;
  bool _busy = false;
  String? _dateError;

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _occupants, _term, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final ok = _form.currentState!.validate();
    if (_moveIn == null) setState(() => _dateError = 'Choose a move-in date');
    if (!ok || _moveIn == null) return;
    setState(() {
      _busy = true;
      _dateError = null;
    });
    final repo = context.read<Repo>();
    final nav = Navigator.of(context);
    try {
      await repo.createApplication(propertyId: widget.p.id, form: {
        'fullName': _name.text.trim(), 'phone': _phone.text.trim(), 'email': _email.text.trim(), 'occupants': int.parse(_occupants.text), 'employmentStatus': _employment,
        'desiredMoveIn': DateTime(_moveIn!.year, _moveIn!.month, _moveIn!.day).toUtc().toIso8601String(), 'desiredTermMonths': int.parse(_term.text), if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      });
      if (!mounted) return;
      toast(context, 'Application submitted. Track it under Activity.');
      nav.pop();
    } catch (e) {
      if (mounted) toast(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    String? intIn(String? v, int min, int max) {
      final n = int.tryParse(v ?? '');
      return (n == null || n < min || n > max) ? 'Enter $min–$max' : null;
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Rental application', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Notice('We only ask for what is needed to assess your application. You can add supporting documents afterwards under Activity.'),
          const SizedBox(height: 12),
          TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Full name'), validator: (v) => requiredField(v, 'Enter your name')),
          const SizedBox(height: 12),
          TextFormField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone'), validator: (v) => (v == null || v.trim().length < 5) ? 'Enter a phone number' : null),
          const SizedBox(height: 12),
          TextFormField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email'), validator: emailField),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextFormField(controller: _occupants, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Occupants'), validator: (v) => intIn(v, 1, 20))),
            const SizedBox(width: 12),
            Expanded(child: TextFormField(controller: _term, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Lease (months)'), validator: (v) => intIn(v, 1, 60))),
          ]),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _employment, decoration: const InputDecoration(labelText: 'Employment status'),
            items: const [DropdownMenuItem(value: 'employed', child: Text('Employed')), DropdownMenuItem(value: 'self_employed', child: Text('Self-employed')), DropdownMenuItem(value: 'student', child: Text('Student')), DropdownMenuItem(value: 'other', child: Text('Other'))],
            onChanged: (v) => setState(() => _employment = v ?? 'employed'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.calendar_today, size: 18), label: Text(_moveIn == null ? 'Desired move-in date' : DateFormat.yMMMd().format(_moveIn!)),
            onPressed: () async {
              final now = DateTime.now();
              final d = await showDatePicker(context: context, initialDate: _moveIn ?? now.add(const Duration(days: 7)), firstDate: now, lastDate: now.add(const Duration(days: 365)));
              if (d != null) setState(() => _moveIn = d);
            },
          ),
          if (_dateError != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_dateError!, style: const TextStyle(color: Brand.dangerText, fontSize: 12))),
          const SizedBox(height: 12),
          TextFormField(controller: _notes, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Notes (optional)')),
          const SizedBox(height: 8),
          FilledButton(onPressed: _busy ? null : _submit, child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Submit application')),
        ]),
      ),
    );
  }
}
