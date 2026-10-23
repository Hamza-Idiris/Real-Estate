// Typed, defensive models. The server is authoritative: the app never computes statuses, balances or availability.

String _s(dynamic v, [String d = '']) => v is String ? v : (v == null ? d : v.toString());
int _i(dynamic v, [int d = 0]) => v is int ? v : (v is num ? v.toInt() : (v is String ? (int.tryParse(v) ?? d) : d));
bool _b(dynamic v) => v == true;
DateTime? _d(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
Map<String, dynamic> _m(dynamic v) => v is Map<String, dynamic> ? v : <String, dynamic>{};
List<dynamic> _l(dynamic v) => v is List ? v : const <dynamic>[];

class Paged<T> {
  Paged(this.items, {this.page = 1, this.pages = 1, this.total = 0, this.extra = const {}});
  final List<T> items;
  final int page;
  final int pages;
  final int total;
  final Map<String, dynamic> extra; // e.g. unreadCount
  bool get hasMore => page < pages;

  static Paged<T> fromJson<T>(Map<String, dynamic> j, T Function(Map<String, dynamic>) f) {
    final meta = _m(j['meta']);
    return Paged<T>(_l(j['data']).map((e) => f(_m(e))).toList(),
        page: _i(meta['page'], 1), pages: _i(meta['pages'], 1), total: _i(meta['total']), extra: j);
  }
}

class AppUser {
  AppUser({required this.id, required this.email, required this.name, this.phone});
  final String id;
  final String email;
  final String name;
  final String? phone;
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(id: _s(j['id']), email: _s(j['email']), name: _s(j['name']), phone: j['phone'] == null ? null : _s(j['phone']));
}

class Property {
  Property({required this.id, required this.reference, required this.title, required this.description, required this.type, required this.transaction,
      required this.priceMinor, required this.currency, this.rentFrequency, this.depositMinor = 0, this.city = '', this.district = '', this.country = '',
      this.lat, this.lng, this.bedrooms = 0, this.bathrooms = 0, this.sizeSqm, this.furnished = false, this.amenities = const [], this.images = const [],
      this.verified = false, this.available = false, this.companyName = ''});
  final String id, reference, title, description, type, transaction, currency, city, district, country, companyName;
  final int priceMinor, depositMinor, bedrooms, bathrooms;
  final String? rentFrequency;
  final double? lat, lng, sizeSqm;
  final bool furnished, verified, available;
  final List<String> amenities, images;
  bool get isRent => transaction == 'rent';

  factory Property.fromJson(Map<String, dynamic> j) {
    final loc = _m(j['location']);
    return Property(
      id: _s(j['id']), reference: _s(j['reference']), title: _s(j['title']), description: _s(j['description']), type: _s(j['type']), transaction: _s(j['transaction']),
      priceMinor: _i(j['priceMinor']), currency: _s(j['currency'], 'USD'), rentFrequency: j['rentFrequency'] == null ? null : _s(j['rentFrequency']), depositMinor: _i(j['depositMinor']),
      city: _s(loc['city']), district: _s(loc['district']), country: _s(loc['country']), lat: (loc['lat'] as num?)?.toDouble(), lng: (loc['lng'] as num?)?.toDouble(),
      bedrooms: _i(j['bedrooms']), bathrooms: _i(j['bathrooms']), sizeSqm: (j['sizeSqm'] as num?)?.toDouble(), furnished: _b(j['furnished']),
      amenities: _l(j['amenities']).map((e) => _s(e)).toList(), images: _l(j['media']).map((e) => _s(_m(e)['url'])).where((u) => u.isNotEmpty).toList(),
      verified: _b(j['verified']), available: _b(j['available']), companyName: _s(_m(j['company'])['name']),
    );
  }
}

class Booking {
  Booking({required this.id, required this.propertyTitle, required this.propertyRef, required this.status, this.requested = const [], this.confirmedStart, this.proposedStart});
  final String id, propertyTitle, propertyRef, status;
  final List<DateTime> requested;
  final DateTime? confirmedStart, proposedStart;
  bool get canCancel => const ['pending', 'confirmed', 'alternative_proposed'].contains(status);
  factory Booking.fromJson(Map<String, dynamic> j) {
    final p = _m(j['propertyId']);
    return Booking(id: _s(j['_id']), propertyTitle: _s(p['title'], 'Property'), propertyRef: _s(p['reference']), status: _s(j['status']),
        requested: _l(j['requestedSlots']).map((e) => _d(_m(e)['start'])).whereType<DateTime>().toList(), confirmedStart: _d(j['confirmedStart']), proposedStart: _d(j['proposedStart']));
  }
}

class RentalApplication {
  RentalApplication({required this.id, required this.propertyTitle, required this.status, this.createdAt, this.form = const {}, this.infoRequest, this.decisionNote, this.documents = const []});
  final String id, propertyTitle, status;
  final DateTime? createdAt;
  final Map<String, dynamic> form;
  final String? infoRequest, decisionNote;
  final List<String> documents;
  factory RentalApplication.fromJson(Map<String, dynamic> j) {
    final reqs = _l(j['infoRequests']);
    return RentalApplication(id: _s(j['_id']), propertyTitle: _s(_m(j['propertyId'])['title'], 'Property'), status: _s(j['status']), createdAt: _d(j['createdAt']), form: _m(j['form']),
        infoRequest: reqs.isEmpty ? null : _s(_m(reqs.last)['message']), decisionNote: j['decisionNote'] == null ? null : _s(j['decisionNote']),
        documents: _l(j['documents']).map((e) => _s(_m(e)['name'])).toList());
  }
}

class Tenancy {
  Tenancy({required this.id, required this.propertyTitle, required this.status, this.start, this.end, required this.rentMinor, required this.currency, required this.frequency,
      this.dueDay = 1, this.depositMinor = 0, this.fees = const [], this.renewalTerms, this.noticeDays = 0, this.contractRef = '', this.companyAccepted = false, this.tenantAccepted = false});
  final String id, propertyTitle, status, currency, frequency, contractRef;
  final DateTime? start, end;
  final int rentMinor, dueDay, depositMinor, noticeDays;
  final List<MapEntry<String, int>> fees;
  final String? renewalTerms;
  final bool companyAccepted, tenantAccepted;
  factory Tenancy.fromJson(Map<String, dynamic> j) {
    final t = _m(j['terms']);
    final acc = _m(j['acceptance']);
    final cur = _s(t['currency'], 'USD');
    return Tenancy(id: _s(j['_id']), propertyTitle: _s(_m(j['propertyId'])['title'], 'Property'), status: _s(j['status']), start: _d(t['startDate']), end: _d(t['endDate']),
        rentMinor: _i(t['rentMinor']), currency: cur, frequency: _s(t['frequency']), dueDay: _i(t['dueDay'], 1), depositMinor: _i(t['depositMinor']),
        fees: _l(t['fees']).map((f) => MapEntry(_s(_m(f)['name']), _i(_m(f)['amountMinor']))).toList(), renewalTerms: t['renewalTerms'] == null ? null : _s(t['renewalTerms']),
        noticeDays: _i(t['noticeDays']), contractRef: _s(_m(j['contract'])['reference']), companyAccepted: acc['companyAt'] != null, tenantAccepted: acc['tenantAt'] != null);
  }
}

class PaymentTx {
  PaymentTx({required this.id, required this.type, required this.amountMinor, required this.currency, required this.reference, this.createdAt, this.voided = false});
  final String id, type, currency, reference;
  final int amountMinor;
  final DateTime? createdAt;
  final bool voided;
  factory PaymentTx.fromJson(Map<String, dynamic> j) => PaymentTx(id: _s(j['_id']), type: _s(j['type']), amountMinor: _i(j['amountMinor']), currency: _s(j['currency'], 'USD'),
      reference: _s(j['reference']), createdAt: _d(j['createdAt']), voided: _b(j['voided']));
}

class Invoice {
  Invoice({required this.id, required this.number, required this.type, required this.status, this.dueDate, required this.totalMinor, required this.paidMinor,
      required this.outstandingMinor, required this.currency, this.lines = const [], this.transactions = const []});
  final String id, number, type, status, currency;
  final DateTime? dueDate;
  final int totalMinor, paidMinor, outstandingMinor;
  final List<MapEntry<String, int>> lines;
  final List<PaymentTx> transactions;
  bool get payable => (status == 'issued' || status == 'partially_paid' || status == 'overdue') && outstandingMinor > 0;
  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
      id: _s(j['_id']), number: _s(j['number']), type: _s(j['type']), status: _s(j['effectiveStatus'], _s(j['status'])), dueDate: _d(j['dueDate']), totalMinor: _i(j['totalMinor']),
      paidMinor: _i(j['paidMinor']), outstandingMinor: _i(j['outstandingMinor']), currency: _s(j['currency'], 'USD'),
      lines: _l(j['lineItems']).map((e) => MapEntry(_s(_m(e)['description']), _i(_m(e)['amountMinor']))).toList(),
      transactions: _l(j['transactions']).map((e) => PaymentTx.fromJson(_m(e))).toList());
}

class PaymentResult {
  PaymentResult({required this.status, required this.reference, required this.attemptId, this.transaction, this.replayed = false});
  final String status, reference, attemptId;
  final PaymentTx? transaction;
  final bool replayed;
}

class Comment {
  Comment({required this.authorType, required this.message, this.at});
  final String authorType, message;
  final DateTime? at;
}

class MaintenanceRequest {
  MaintenanceRequest({required this.id, required this.title, required this.category, required this.priority, required this.status, this.description = '', this.createdAt,
      this.comments = const [], this.attachments = const [], this.resolution, this.history = const [], this.disclaimer});
  final String id, title, category, priority, status, description;
  final DateTime? createdAt;
  final List<Comment> comments;
  final List<MapEntry<String, String>> attachments; // name -> signed url (expires in ~10 minutes)
  final String? resolution, disclaimer;
  final List<MapEntry<String, DateTime?>> history;
  bool get isEmergency => priority == 'emergency';
  factory MaintenanceRequest.fromJson(Map<String, dynamic> j) => MaintenanceRequest(
      id: _s(j['_id']), title: _s(j['title']), category: _s(j['category']), priority: _s(j['priority'], 'normal'), status: _s(j['status']), description: _s(j['description']), createdAt: _d(j['createdAt']),
      comments: _l(j['comments']).map((e) => Comment(authorType: _s(_m(e)['authorType']), message: _s(_m(e)['message']), at: _d(_m(e)['at']))).toList(),
      attachments: _l(j['attachments']).map((e) => MapEntry(_s(_m(e)['name']), _s(_m(e)['url']))).toList(), resolution: j['resolution'] == null ? null : _s(j['resolution']),
      history: _l(j['history']).map((e) => MapEntry(_s(_m(e)['status']), _d(_m(e)['at']))).toList(), disclaimer: j['emergencyDisclaimer'] == null ? null : _s(j['emergencyDisclaimer']));
}

class AppNotification {
  AppNotification({required this.id, required this.type, required this.title, this.body, this.link, this.priority = 'normal', this.read = false, this.createdAt});
  final String id, type, title, priority;
  final String? body, link;
  final bool read;
  final DateTime? createdAt;
  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(id: _s(j['_id']), type: _s(j['type']), title: _s(j['title']), body: j['body'] == null ? null : _s(j['body']),
      link: j['link'] == null ? null : _s(j['link']), priority: _s(j['priority'], 'normal'), read: j['readAt'] != null, createdAt: _d(j['createdAt']));
}

class TenantHome {
  TenantHome({this.tenancy, this.nextDueDate, this.nextDueMinor, this.nextDueCurrency, this.outstanding = const {}, this.overdueCount = 0, this.recent = const [], this.openMaintenance = 0, this.unread = 0});
  final Tenancy? tenancy;
  final DateTime? nextDueDate;
  final int? nextDueMinor;
  final String? nextDueCurrency;
  final Map<String, int> outstanding;
  final int overdueCount, openMaintenance, unread;
  final List<PaymentTx> recent;
  factory TenantHome.fromJson(Map<String, dynamic> j) {
    final d = _m(j['data']);
    final nd = d['nextDue'] is Map<String, dynamic> ? _m(d['nextDue']) : null;
    return TenantHome(
      tenancy: d['activeTenancy'] is Map<String, dynamic> ? Tenancy.fromJson(_m(d['activeTenancy'])) : null,
      nextDueDate: nd == null ? null : _d(nd['dueDate']), nextDueMinor: nd == null ? null : _i(nd['outstandingMinor']), nextDueCurrency: nd == null ? null : _s(nd['currency']),
      outstanding: _m(d['outstanding']).map((k, v) => MapEntry(k, _i(v))), overdueCount: _i(d['overdueCount']), recent: _l(d['recentPayments']).map((e) => PaymentTx.fromJson(_m(e))).toList(),
      openMaintenance: _i(d['openMaintenanceRequests']), unread: _i(d['unreadNotifications']));
  }
}

// Public helpers for code outside this library (e.g. the repository).
Map<String, dynamic> asMap(dynamic v) => _m(v);
List<dynamic> asList(dynamic v) => _l(v);
String asStr(dynamic v, [String d = '']) => _s(v, d);
int asInt(dynamic v, [int d = 0]) => _i(v, d);
