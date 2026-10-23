import 'dart:typed_data';

import 'api_client.dart';
import 'models.dart';

/// All server calls in one place. Business rules (availability, status transitions, payment outcomes) stay on the server.
class Repo {
  Repo(this.api);
  final ApiClient api;

  Map<String, dynamic> _data(Map<String, dynamic> j) => asMap(j['data']);

  // ---- account ----
  Future<AppUser> profile() async => AppUser.fromJson(_data(await api.get('/me/profile')));
  Future<AppUser> updateProfile({String? name, String? phone}) async =>
      AppUser.fromJson(_data(await api.patch('/me/profile', {if (name != null) 'name': name, if (phone != null && phone.isNotEmpty) 'phone': phone})));
  Future<void> changePassword(String current, String next) async {
    await api.post('/auth/change-password', {'currentPassword': current, 'newPassword': next});
  }

  // ---- marketplace ----
  Future<Paged<Property>> searchProperties(Map<String, String> filters, {int page = 1}) async {
    final j = await api.get('/public/properties', query: {...filters, 'page': '$page', 'limit': '10'});
    return Paged.fromJson<Property>(j, Property.fromJson);
  }

  Future<Property> property(String ref) async => Property.fromJson(_data(await api.get('/public/properties/$ref')));

  // ---- viewings ----
  Future<void> createBooking({required String propertyId, required List<DateTime> slots, required String name, required String phone, String? email, String? message}) async {
    await api.post('/me/bookings', {
      'propertyId': propertyId,
      'slots': slots.map((d) => d.toUtc().toIso8601String()).toList(),
      'contact': {'name': name, 'phone': phone, if (email != null && email.isNotEmpty) 'email': email},
      if (message != null && message.isNotEmpty) 'message': message,
    });
  }

  Future<Paged<Booking>> myBookings() async => Paged.fromJson<Booking>(await api.get('/me/bookings', query: {'limit': '50'}), Booking.fromJson);
  Future<void> respondBooking(String id, String action) async {
    await api.post('/me/bookings/$id/respond', {'action': action});
  }

  // ---- applications ----
  Future<void> createApplication({required String propertyId, required Map<String, dynamic> form}) async {
    await api.post('/me/applications', {'propertyId': propertyId, 'form': form, 'submit': true});
  }

  Future<Paged<RentalApplication>> myApplications() async =>
      Paged.fromJson<RentalApplication>(await api.get('/me/applications', query: {'limit': '50'}), RentalApplication.fromJson);
  Future<RentalApplication> application(String id) async => RentalApplication.fromJson(_data(await api.get('/me/applications/$id')));
  Future<void> withdrawApplication(String id) async {
    await api.post('/me/applications/$id/withdraw');
  }

  Future<void> respondToInfoRequest(String id, String message) async {
    await api.post('/me/applications/$id/respond', {'message': message});
  }

  Future<void> uploadApplicationDocument(String id, Uint8List bytes, String filename) async {
    await api.upload('/me/applications/$id/documents', bytes, filename);
  }

  // ---- tenancy ----
  Future<List<Tenancy>> tenancies() async => asList((await api.get('/me/tenancies'))['data']).map((e) => Tenancy.fromJson(asMap(e))).toList();
  Future<TenantHome> tenantHome() async => TenantHome.fromJson(await api.get('/me/tenancies/home'));
  Future<void> acceptLease(String id) async {
    await api.post('/me/tenancies/$id/accept');
  }

  // ---- invoices & MOCK payments ----
  Future<Paged<Invoice>> invoices({int page = 1}) async =>
      Paged.fromJson<Invoice>(await api.get('/me/invoices', query: {'page': '$page', 'limit': '20'}), Invoice.fromJson);
  Future<Invoice> invoice(String id) async => Invoice.fromJson(_data(await api.get('/me/invoices/$id')));

  /// One Idempotency-Key per user intent: a double tap / retry reuses the same server-side attempt.
  /// The outcome is decided by the BACKEND; the client never sends a "paid" status.
  Future<PaymentResult> payInvoice(String invoiceId, {required String scenario, int? amountMinor}) async {
    final attempt = _data(await api.post('/me/invoices/$invoiceId/payments', {'scenario': scenario, if (amountMinor != null) 'amountMinor': amountMinor}, newIdempotencyKey()));
    return completePayment(asStr(attempt['_id']));
  }

  Future<PaymentResult> completePayment(String attemptId) async {
    final d = _data(await api.post('/me/payments/attempts/$attemptId/complete'));
    final a = asMap(d['attempt']);
    final tx = d['transaction'] is Map<String, dynamic> ? PaymentTx.fromJson(asMap(d['transaction'])) : null;
    return PaymentResult(status: asStr(a['status']), reference: asStr(a['reference']), attemptId: asStr(a['_id'], attemptId), transaction: tx, replayed: d['replayed'] == true);
  }

  Future<Map<String, dynamic>> receipt(String txId) async => _data(await api.get('/me/payments/transactions/$txId/receipt'));

  // ---- maintenance ----
  Future<Paged<MaintenanceRequest>> maintenance() async =>
      Paged.fromJson<MaintenanceRequest>(await api.get('/me/maintenance', query: {'limit': '50'}), MaintenanceRequest.fromJson);
  Future<MaintenanceRequest> maintenanceDetail(String id) async => MaintenanceRequest.fromJson(_data(await api.get('/me/maintenance/$id')));

  /// Property is derived by the server from the tenant's own active tenancy; the app never sends a property id.
  Future<MaintenanceRequest> createMaintenance({required String tenancyId, required String category, required String title, required String description, required String priority}) async =>
      MaintenanceRequest.fromJson(_data(await api.post('/me/maintenance', {'tenancyId': tenancyId, 'category': category, 'title': title, 'description': description, 'priority': priority})));
  Future<void> uploadMaintenanceAttachment(String id, Uint8List bytes, String filename) async {
    await api.upload('/me/maintenance/$id/attachments', bytes, filename);
  }

  Future<void> commentMaintenance(String id, String message) async {
    await api.post('/me/maintenance/$id/comments', {'message': message});
  }

  Future<void> reopenMaintenance(String id, String message) async {
    await api.post('/me/maintenance/$id/reopen', {'message': message});
  }

  // ---- notifications (in-app only; no push provider configured) ----
  Future<Paged<AppNotification>> notifications({bool unreadOnly = false}) async =>
      Paged.fromJson<AppNotification>(await api.get('/notifications', query: {'limit': '50', if (unreadOnly) 'unread': 'true'}), AppNotification.fromJson);
  Future<int> unreadCount() async => asInt(_data(await api.get('/notifications/unread-count'))['unread']);
  Future<void> markRead(String id) async {
    await api.post('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await api.post('/notifications/read-all');
  }

  Future<Map<String, dynamic>> dataExport() async => _data(await api.get('/me/data-export'));
}
