import 'dart:convert';

import 'package:estateflow/core/api_client.dart';
import 'package:estateflow/core/format.dart';
import 'package:estateflow/core/models.dart';
import 'package:estateflow/core/repository.dart';
import 'package:estateflow/screens/more/more_tabs.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response jsonRes(int status, Object body) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  group('format', () {
    test('money is formatted from integer minor units', () {
      expect(money(123456, 'USD'), r'$1,234.56');
      expect(money(null), '—');
    });
    test('parseMinor handles commas/decimals and rejects junk or negatives', () {
      expect(parseMinor('1,250.50'), 125050);
      expect(parseMinor('19.99'), 1999);
      expect(parseMinor('abc'), isNull);
      expect(parseMinor('-5'), isNull);
    });
    test('label and ago', () {
      expect(label('waiting_for_parts'), 'Waiting for parts');
      final now = DateTime(2026, 1, 1, 12);
      expect(ago(now.subtract(const Duration(minutes: 5)), now: now), '5 min ago');
      expect(ago(now.subtract(const Duration(days: 2)), now: now), '2 d ago');
    });
  });

  group('models are defensive', () {
    test('Property tolerates missing fields and hides nothing it was not given', () {
      final p = Property.fromJson({'id': 'a', 'reference': 'EF-1', 'title': 'T', 'priceMinor': 5000, 'currency': 'USD', 'transaction': 'rent', 'location': {'city': 'Mogadishu'}, 'media': [{'url': 'http://x/1.jpg'}, {}], 'available': true});
      expect(p.city, 'Mogadishu');
      expect(p.images, ['http://x/1.jpg']);
      expect(p.available, isTrue);
      expect(p.isRent, isTrue);
      expect(Property.fromJson(<String, dynamic>{}).title, '');
    });
    test('Invoice prefers server effectiveStatus and payable follows server balance', () {
      final i = Invoice.fromJson({'_id': '1', 'number': 'INV', 'type': 'rent', 'status': 'issued', 'effectiveStatus': 'overdue', 'totalMinor': 100, 'paidMinor': 0, 'outstandingMinor': 100, 'currency': 'USD'});
      expect(i.status, 'overdue');
      expect(i.payable, isTrue);
      expect(Invoice.fromJson({'status': 'paid', 'outstandingMinor': 0}).payable, isFalse);
    });
    test('Paged and TenantHome parse', () {
      final pg = Paged.fromJson<AppNotification>({'data': [{'_id': 'n', 'type': 't', 'title': 'x', 'readAt': '2026-01-01T00:00:00Z'}], 'meta': {'page': 1, 'pages': 3, 'total': 25}}, AppNotification.fromJson);
      expect(pg.items.single.read, isTrue);
      expect(pg.hasMore, isTrue);
      final h = TenantHome.fromJson({'data': {'activeTenancy': null, 'nextDue': {'dueDate': '2026-02-01T00:00:00Z', 'outstandingMinor': 500, 'currency': 'USD'}, 'outstanding': {'USD': 500}, 'overdueCount': 1, 'openMaintenanceRequests': 2, 'unreadNotifications': 3}});
      expect(h.tenancy, isNull);
      expect(h.nextDueMinor, 500);
      expect(h.outstanding['USD'], 500);
      expect(h.openMaintenance, 2);
    });
    test('Tenancy acceptance flags and fees', () {
      final t = Tenancy.fromJson({'_id': 't', 'status': 'pending', 'terms': {'rentMinor': 1000, 'currency': 'USD', 'frequency': 'monthly', 'fees': [{'name': 'Admin', 'amountMinor': 200}]}, 'acceptance': {'companyAt': '2026-01-01T00:00:00Z'}});
      expect(t.companyAccepted, isTrue);
      expect(t.tenantAccepted, isFalse);
      expect(t.fees.single.value, 200);
    });
  });

  group('deep links', () {
    test('notification links map to in-app routes; staff links are ignored', () {
      const id = '507f1f77bcf86cd799439011';
      expect(appRouteForLink('/tenant/invoices/$id'), '/invoice/$id');
      expect(appRouteForLink('/tenant/maintenance/$id'), '/maintenance/$id');
      expect(appRouteForLink('/tenant/leases/$id'), 'tab:2');
      expect(appRouteForLink('/account/bookings/$id'), 'tab:1');
      expect(appRouteForLink('/dashboard/bookings/$id'), isNull);
      expect(appRouteForLink('/tenant/invoices/not-an-id'), 'tab:2');
      expect(appRouteForLink(null), isNull);
    });
  });

  group('ApiClient', () {
    test('maps server error objects and never exposes raw bodies', () async {
      final api = ApiClient(client: MockClient((r) async => jsonRes(409, {'error': {'code': 'SLOT_CONFLICT', 'message': 'Slot taken', 'requestId': 'r1'}})), store: MemoryTokenStore(), base: 'http://x');
      expect(() => api.get('/x'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'SLOT_CONFLICT').having((e) => e.message, 'message', 'Slot taken').having((e) => e.status, 'status', 409)));
    });

    test('network failure becomes a friendly NETWORK error', () async {
      final api = ApiClient(client: MockClient((r) async => throw http.ClientException('down')), store: MemoryTokenStore(), base: 'http://x');
      expect(() => api.get('/x'), throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true)));
    });

    test('sends bearer + Idempotency-Key and skips empty query values', () async {
      final seen = <http.Request>[];
      final api = ApiClient(client: MockClient((r) async { seen.add(r); return jsonRes(200, {'data': 1}); }), store: MemoryTokenStore(), base: 'http://x');
      await api.setSession({'accessToken': 'AT', 'refreshToken': 'RT'});
      await api.post('/pay', {'a': 1}, 'key-12345678');
      expect(seen.first.headers['Authorization'], 'Bearer AT');
      expect(seen.first.headers['Idempotency-Key'], 'key-12345678');
      await api.get('/list', query: {'q': '', 'page': '2', 'x': null});
      expect(seen.last.url.toString(), 'http://x/api/v1/list?page=2');
    });

    test('401 triggers ONE shared refresh and a retry with the new token', () async {
      var refreshCalls = 0;
      final store = MemoryTokenStore();
      final api = ApiClient(
        store: store, base: 'http://x',
        client: MockClient((r) async {
          if (r.url.path.endsWith('/auth/refresh')) {
            refreshCalls++;
            return jsonRes(200, {'data': {'accessToken': 'NEW', 'refreshToken': 'RT2'}});
          }
          return r.headers['Authorization'] == 'Bearer NEW' ? jsonRes(200, {'data': 'ok'}) : jsonRes(401, {'error': {'code': 'UNAUTHORIZED', 'message': 'x'}});
        }),
      );
      await api.setSession({'accessToken': 'OLD', 'refreshToken': 'RT1'});
      final results = await Future.wait([api.get('/me/a'), api.get('/me/b')]);
      expect(results.map((e) => e['data']), ['ok', 'ok']);
      expect(refreshCalls, 1);
      expect(await store.read(), 'RT2');
    });

    test('a rejected refresh clears the session and signals session loss', () async {
      var lost = false;
      final store = MemoryTokenStore();
      final api = ApiClient(store: store, base: 'http://x', client: MockClient((r) async => r.url.path.endsWith('/auth/refresh') ? jsonRes(401, {}) : jsonRes(401, {'error': {'code': 'UNAUTHORIZED', 'message': 'no'}})));
      api.onSessionLost = () => lost = true;
      await api.setSession({'accessToken': 'OLD', 'refreshToken': 'RT1'});
      await expectLater(api.get('/me/a'), throwsA(isA<ApiException>()));
      expect(lost, isTrue);
      expect(await store.read(), isNull);
    });

    test('a network blip during refresh does NOT sign the user out', () async {
      var lost = false;
      final store = MemoryTokenStore();
      final api = ApiClient(store: store, base: 'http://x', client: MockClient((r) async => r.url.path.endsWith('/auth/refresh') ? throw http.ClientException('down') : jsonRes(401, {'error': {'code': 'UNAUTHORIZED', 'message': 'no'}})));
      api.onSessionLost = () => lost = true;
      await api.setSession({'accessToken': 'OLD', 'refreshToken': 'RT1'});
      await expectLater(api.get('/me/a'), throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true)));
      expect(lost, isFalse);
      expect(await store.read(), 'RT1');
    });
  });

  group('Repo', () {
    test('payInvoice sends an Idempotency-Key and NEVER a client-side paid status', () async {
      final seen = <http.Request>[];
      final api = ApiClient(store: MemoryTokenStore(), base: 'http://x', client: MockClient((r) async {
        seen.add(r);
        if (r.url.path.endsWith('/payments')) return jsonRes(201, {'data': {'_id': 'att1', 'status': 'initiated'}});
        return jsonRes(200, {'data': {'attempt': {'_id': 'att1', 'status': 'succeeded', 'reference': 'MOCK-1'}, 'transaction': {'_id': 'tx1', 'type': 'payment', 'amountMinor': 100, 'currency': 'USD', 'reference': 'MOCK-TX-1'}, 'replayed': false}});
      }));
      final res = await Repo(api).payInvoice('inv1', scenario: 'success', amountMinor: 100);
      expect(res.status, 'succeeded');
      expect(res.transaction?.amountMinor, 100);
      final init = seen.first;
      expect(init.headers['Idempotency-Key'], isNotNull);
      expect(init.headers['Idempotency-Key']!.length, greaterThanOrEqualTo(8));
      final body = jsonDecode(init.body) as Map<String, dynamic>;
      expect(body.containsKey('status'), isFalse);
      expect(body['scenario'], 'success');
    });

    test('createMaintenance never sends a property id (server derives it from the tenancy)', () async {
      late http.Request req;
      final api = ApiClient(store: MemoryTokenStore(), base: 'http://x', client: MockClient((r) async { req = r; return jsonRes(201, {'data': {'_id': 'm1', 'title': 'Leak', 'category': 'plumbing', 'priority': 'normal', 'status': 'submitted'}}); }));
      await Repo(api).createMaintenance(tenancyId: 't1', category: 'plumbing', title: 'Leak', description: 'Tap leaks', priority: 'normal');
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      expect(body.containsKey('propertyId'), isFalse);
      expect(body['tenancyId'], 't1');
    });
  });

  test('idempotency keys are unique and well-formed', () {
    final a = newIdempotencyKey(), b = newIdempotencyKey();
    expect(a, isNot(b));
    expect(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$').hasMatch(a), isTrue);
  });
}
