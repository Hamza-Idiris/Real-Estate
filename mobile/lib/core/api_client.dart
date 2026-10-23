import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.code, this.message, {this.details, this.requestId});
  final int status;
  final String code;
  final String message;
  final Object? details;
  final String? requestId;
  bool get isNetwork => status == 0;
  bool get isDenied => status == 403 || status == 404;
  @override
  String toString() => message;
}

String errorMessage(Object e) => e is ApiException ? e.message : 'Something went wrong';

/// Refresh token storage. The access token is kept in memory only.
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

/// Keychain (iOS) / EncryptedSharedPreferences-backed keystore (Android).
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const String _key = 'ef.refresh';
  @override
  Future<String?> read() => _s.read(key: _key);
  @override
  Future<void> write(String token) => _s.write(key: _key, value: token);
  @override
  Future<void> clear() => _s.delete(key: _key);
}

class MemoryTokenStore implements TokenStore {
  String? _v;
  @override
  Future<String?> read() async => _v;
  @override
  Future<void> write(String token) async => _v = token;
  @override
  Future<void> clear() async => _v = null;
}

/// Random v4-style id used as Idempotency-Key for payments (one per user intent).
String newIdempotencyKey() {
  final r = Random.secure();
  String h(int n) => List<String>.generate(n, (_) => r.nextInt(16).toRadixString(16)).join();
  return '${h(8)}-${h(4)}-4${h(3)}-${h(4)}-${h(12)}';
}

/// Single, centralised HTTP client: bearer auth, single-flight token refresh + one retry,
/// timeouts, friendly network errors, and server error-object mapping. No business rules live in the app.
class ApiClient {
  ApiClient({http.Client? client, TokenStore? store, String? base})
      : _http = client ?? http.Client(),
        store = store ?? SecureTokenStore(),
        _base = base ?? Config.apiBase;

  final http.Client _http;
  final TokenStore store;
  final String _base;
  String? _access;
  Future<bool>? _refreshing;
  bool _refreshNetworkFail = false;

  /// Called when the refresh token is rejected (session truly lost).
  void Function()? onSessionLost;

  bool get hasAccessToken => _access != null;

  Future<void> setSession(Map<String, dynamic> d) async {
    _access = d['accessToken'] as String;
    await store.write(d['refreshToken'] as String);
  }

  Future<void> clearSession() async {
    _access = null;
    await store.clear();
  }

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final q = <String, String>{};
    query?.forEach((k, v) {
      if (v != null && v.toString().isNotEmpty) q[k] = v.toString();
    });
    return Uri.parse('$_base/api/v1$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Future<bool> refreshSession() {
    return _refreshing ??= _doRefresh().whenComplete(() {
      _refreshing = null;
    });
  }

  Future<bool> _doRefresh() async {
    _refreshNetworkFail = false;
    final rt = await store.read();
    if (rt == null) return false;
    try {
      final res = await _http
          .post(_uri('/auth/refresh'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refreshToken': rt}))
          .timeout(Config.timeout);
      if (res.statusCode != 200) {
        await clearSession();
        return false;
      }
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      await setSession(body['data'] as Map<String, dynamic>);
      return true;
    } catch (_) {
      _refreshNetworkFail = true; // do not sign the user out because of a network blip
      return false;
    }
  }

  Future<Map<String, dynamic>> _exec(http.BaseRequest Function() build, {bool auth = true, bool retried = false}) async {
    http.Response res;
    try {
      final req = build();
      if (auth && _access != null) req.headers['Authorization'] = 'Bearer $_access';
      final streamed = await _http.send(req).timeout(Config.timeout);
      res = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException(0, 'NETWORK', 'The request timed out. Check your connection and retry.');
    } catch (_) {
      throw ApiException(0, 'NETWORK', 'Cannot reach the server. Check your connection and retry.');
    }

    if (res.statusCode == 401 && auth && !retried && (await store.read()) != null) {
      final ok = await refreshSession();
      if (ok) return _exec(build, auth: auth, retried: true);
      if (_refreshNetworkFail) throw ApiException(0, 'NETWORK', 'Cannot reach the server. Check your connection and retry.');
      onSessionLost?.call();
    }

    Map<String, dynamic> json = <String, dynamic>{};
    if (res.bodyBytes.isNotEmpty) {
      try {
        final d = jsonDecode(utf8.decode(res.bodyBytes));
        if (d is Map<String, dynamic>) json = d;
      } catch (_) {/* non-JSON body */}
    }
    if (res.statusCode >= 400) {
      final e = json['error'];
      final m = e is Map<String, dynamic> ? e : <String, dynamic>{};
      throw ApiException(res.statusCode, (m['code'] ?? 'ERROR').toString(), (m['message'] ?? 'Something went wrong').toString(),
          details: m['details'], requestId: m['requestId']?.toString());
    }
    return json;
  }

  Future<Map<String, dynamic>> request(String method, String path,
      {Map<String, dynamic>? query, Object? body, String? idempotencyKey, bool auth = true}) {
    return _exec(() {
      final req = http.Request(method, _uri(path, query));
      req.headers['Accept'] = 'application/json';
      if (body != null) {
        req.headers['Content-Type'] = 'application/json';
        req.body = jsonEncode(body);
      }
      if (idempotencyKey != null) req.headers['Idempotency-Key'] = idempotencyKey;
      return req;
    }, auth: auth);
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) => request('GET', path, query: query);
  Future<Map<String, dynamic>> post(String path, [Object? body, String? idempotencyKey, bool auth = true]) =>
      request('POST', path, body: body ?? <String, dynamic>{}, idempotencyKey: idempotencyKey, auth: auth);
  Future<Map<String, dynamic>> patch(String path, Object body) => request('PATCH', path, body: body);

  /// Multipart upload (field name "file"). The server validates real content type and size (5 MB).
  Future<Map<String, dynamic>> upload(String path, Uint8List bytes, String filename, {Map<String, String>? fields}) {
    return _exec(() {
      final req = http.MultipartRequest('POST', _uri(path));
      req.headers['Accept'] = 'application/json';
      if (fields != null) req.fields.addAll(fields);
      req.files.add(http.MultipartFile.fromBytes('file', bytes, filename: filename));
      return req;
    });
  }
}
