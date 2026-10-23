import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class PropertyCard extends StatelessWidget {
  const PropertyCard({super.key, required this.p});
  final Property p;

  String get _price => '${money(p.priceMinor, p.currency)}${p.isRent ? ' / ${_freq(p.rentFrequency)}' : ''}';
  static String _freq(String? f) => f == 'quarterly' ? 'qtr' : f == 'yearly' ? 'yr' : 'mo';

  @override
  Widget build(BuildContext context) {
    final where = [p.district, p.city].where((s) => s.isNotEmpty).join(', ');
    return Semantics(
      button: true,
      label: '${p.title}, $_price, $where, ${p.bedrooms} bedrooms, ${p.bathrooms} bathrooms${p.available ? '' : ', currently unavailable'}',
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push('/property/${p.reference}'),
        child: ExcludeSemantics(
          child: Card(
            clipBehavior: Clip.antiAlias,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: Stack(fit: StackFit.expand, children: [
                  if (p.images.isNotEmpty)
                    Image.network(p.images.first, fit: BoxFit.cover, loadingBuilder: (c, w, prog) => prog == null ? w : Container(color: Brand.mutedBg), errorBuilder: (c, e, s) => const _NoPhoto())
                  else
                    const _NoPhoto(),
                  Positioned(left: 10, top: 10, child: _Pill(p.isRent ? 'For rent' : 'For sale')),
                  if (p.verified) const Positioned(right: 10, top: 10, child: _Pill('Verified', green: true)),
                  if (!p.available) const Positioned(left: 0, right: 0, bottom: 0, child: ColoredBox(color: Color(0xCC142B3B), child: Padding(padding: EdgeInsets.all(6), child: Text('Currently unavailable', style: TextStyle(color: Colors.white, fontSize: 12))))),
                ]),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_price, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: Brand.navy)),
                  const SizedBox(height: 2),
                  Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(where, style: const TextStyle(color: Brand.muted, fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(children: [
                    const Icon(Icons.bed_outlined, size: 16, color: Brand.muted), const SizedBox(width: 4), Text('${p.bedrooms}'),
                    const SizedBox(width: 14),
                    const Icon(Icons.bathtub_outlined, size: 16, color: Brand.muted), const SizedBox(width: 4), Text('${p.bathrooms}'),
                    const Spacer(),
                    Text(label(p.type), style: const TextStyle(color: Brand.muted, fontSize: 13)),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _NoPhoto extends StatelessWidget {
  const _NoPhoto();
  @override
  Widget build(BuildContext context) => const ColoredBox(color: Brand.mutedBg, child: Center(child: Icon(Icons.image_not_supported_outlined, color: Brand.muted)));
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {this.green = false});
  final String text;
  final bool green;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: green ? Brand.emeraldSoft : Colors.white, borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: green ? Brand.emeraldHover : Brand.navy)),
      );
}

class DiscoverTab extends StatefulWidget {
  const DiscoverTab({super.key});
  @override
  State<DiscoverTab> createState() => _DiscoverTabState();
}

class _DiscoverTabState extends State<DiscoverTab> {
  final _search = TextEditingController();
  Timer? _debounce;
  final Map<String, String> _filters = {'transaction': 'rent'};
  final List<Property> _items = [];
  int _page = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;
  int _token = 0; // ignore responses from obsolete queries

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading && !reset) return;
    final token = ++_token;
    if (reset) {
      _page = 0;
      _hasMore = true;
    }
    setState(() {
      _loading = true;
      _error = null;
      if (reset) _items.clear();
    });
    try {
      // keys starting with "_" only remember what the user typed in the filter sheet; never send them to the API
      final q = <String, String>{
        for (final e in _filters.entries)
          if (!e.key.startsWith('_')) e.key: e.value,
        if (_search.text.trim().isNotEmpty) 'q': _search.text.trim(),
      };
      final res = await context.read<Repo>().searchProperties(q, page: _page + 1);
      if (!mounted || token != _token) return;
      setState(() {
        _items.addAll(res.items);
        _page = res.page;
        _hasMore = res.hasMore;
      });
    } catch (e) {
      if (mounted && token == _token) setState(() => _error = e);
    } finally {
      if (mounted && token == _token) setState(() => _loading = false);
    }
  }

  int get _activeFilters => _filters.entries.where((e) => !e.key.startsWith('_') && (e.key != 'transaction' || e.value != 'rent')).length;

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<Map<String, String>>(
      context: context, isScrollControlled: true, showDragHandle: true,
      builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom), child: _FilterSheet(initial: _filters)),
    );
    if (result != null) {
      setState(() {
        _filters
          ..clear()
          ..addAll(result);
      });
      _load(reset: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('EstateFlow')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _search, textInputAction: TextInputAction.search,
                decoration: const InputDecoration(hintText: 'Search city, district or keyword', prefixIcon: Icon(Icons.search)),
                onChanged: (_) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 450), () => _load(reset: true));
                },
                onSubmitted: (_) => _load(reset: true),
              ),
            ),
            const SizedBox(width: 8),
            Badge(
              isLabelVisible: _activeFilters > 0, label: Text('$_activeFilters'),
              child: IconButton.outlined(tooltip: 'Filters', onPressed: _openFilters, icon: const Icon(Icons.tune)),
            ),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _load(reset: true),
            child: _body(),
          ),
        ),
      ]),
    );
  }

  Widget _body() {
    if (_error != null && _items.isEmpty) return ListView(children: [SizedBox(height: 360, child: ErrorView(error: _error!, onRetry: () => _load(reset: true)))]);
    if (_loading && _items.isEmpty) return ListView(children: const [SizedBox(height: 360, child: Center(child: CircularProgressIndicator(semanticsLabel: 'Loading properties')))]);
    if (_items.isEmpty) {
      return ListView(children: [
        SizedBox(height: 360, child: EmptyState(icon: Icons.search_off, title: 'No properties match', hint: 'Try removing a filter or searching a nearby district.', action: OutlinedButton(onPressed: () { setState(() { _filters..clear()..['transaction'] = 'rent'; _search.clear(); }); _load(reset: true); }, child: const Text('Reset filters')))),
      ]);
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: _items.length + 1,
      separatorBuilder: (c, i) => const SizedBox(height: 14),
      itemBuilder: (c, i) {
        if (i < _items.length) return PropertyCard(p: _items[i]);
        if (_error != null) return Center(child: OutlinedButton(onPressed: _load, child: const Text('Could not load more — retry')));
        if (_loading) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
        if (_hasMore) return Center(child: OutlinedButton(onPressed: _load, child: const Text('Load more')));
        return const Padding(padding: EdgeInsets.all(16), child: Center(child: Text('You have seen all results', style: TextStyle(color: Brand.muted))));
      },
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});
  final Map<String, String> initial;
  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late Map<String, String> f = {...widget.initial};
  late final TextEditingController city = TextEditingController(text: f['city'] ?? '');
  late final TextEditingController minP = TextEditingController(text: f['_min'] ?? '');
  late final TextEditingController maxP = TextEditingController(text: f['_max'] ?? '');
  static const types = ['apartment', 'house', 'villa', 'office', 'shop', 'land', 'warehouse'];

  @override
  void dispose() {
    city.dispose();
    minP.dispose();
    maxP.dispose();
    super.dispose();
  }

  void _apply() {
    final out = <String, String>{};
    for (final k in ['transaction', 'type', 'bedrooms', 'furnished']) {
      if ((f[k] ?? '').isNotEmpty) out[k] = f[k]!;
    }
    if (city.text.trim().isNotEmpty) out['city'] = city.text.trim();
    final lo = parseMinor(minP.text);
    final hi = parseMinor(maxP.text);
    if (lo != null) {
      out['minPrice'] = '$lo';
      out['_min'] = minP.text.trim();
    }
    if (hi != null) {
      out['maxPrice'] = '$hi';
      out['_max'] = maxP.text.trim();
    }
    Navigator.pop(context, out);
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Filters', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: '', label: Text('All')), ButtonSegment(value: 'rent', label: Text('Rent')), ButtonSegment(value: 'sale', label: Text('Buy'))],
          selected: {f['transaction'] ?? ''}, onSelectionChanged: (s) => setState(() => f['transaction'] = s.first),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: f['type'] ?? '', decoration: const InputDecoration(labelText: 'Property type'),
          items: [const DropdownMenuItem(value: '', child: Text('Any')), ...types.map((t) => DropdownMenuItem(value: t, child: Text(label(t))))],
          onChanged: (v) => setState(() => f['type'] = v ?? ''),
        ),
        const SizedBox(height: 12),
        TextField(controller: city, decoration: const InputDecoration(labelText: 'City')),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: minP, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Min price'))),
          const SizedBox(width: 12),
          Expanded(child: TextField(controller: maxP, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Max price'))),
        ]),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: f['bedrooms'] ?? '', decoration: const InputDecoration(labelText: 'Bedrooms (minimum)'),
          items: ['', '1', '2', '3', '4', '5'].map((b) => DropdownMenuItem(value: b, child: Text(b.isEmpty ? 'Any' : '$b+'))).toList(),
          onChanged: (v) => setState(() => f['bedrooms'] = v ?? ''),
        ),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Furnished only'), value: f['furnished'] == 'true', onChanged: (v) => setState(() => f['furnished'] = v ? 'true' : '')),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context, <String, String>{'transaction': 'rent'}), child: const Text('Reset'))),
          const SizedBox(width: 12),
          Expanded(child: FilledButton(onPressed: _apply, child: const Text('Show results'))),
        ]),
      ]),
    );
  }
}
