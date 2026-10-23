import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/repository.dart';

class AuthState extends ChangeNotifier {
  AuthState(this.api, this.repo) {
    api.onSessionLost = _sessionLost;
  }
  final ApiClient api;
  final Repo repo;
  AppUser? user;
  bool ready = false;
  bool get signedIn => user != null;

  Future<void> bootstrap() async {
    try {
      if ((await api.store.read()) != null && await api.refreshSession()) {
        user = await repo.profile();
      }
    } catch (_) {/* stay signed out; the user can sign in again */}
    ready = true;
    notifyListeners();
  }

  Future<void> _finish(Map<String, dynamic> response) async {
    final data = asMap(response['data']);
    await api.setSession(data);
    user = AppUser.fromJson(asMap(data['user']));
    notifyListeners();
  }

  Future<void> login(String email, String password) async => _finish(await api.post('/auth/login', {'email': email.trim(), 'password': password}, null, false));

  Future<void> register({required String name, required String email, required String password, String? phone}) async => _finish(await api.post(
      '/auth/register', {'name': name.trim(), 'email': email.trim(), 'password': password, if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim()}, null, false));

  Future<void> logout() async {
    final rt = await api.store.read();
    try {
      if (rt != null) await api.post('/auth/logout', {'refreshToken': rt});
    } catch (_) {/* best effort */}
    await api.clearSession();
    user = null;
    notifyListeners();
  }

  Future<void> reloadUser() async {
    user = await repo.profile();
    notifyListeners();
  }

  void _sessionLost() {
    user = null;
    notifyListeners();
  }
}

/// Which bottom tab is visible (lets notifications switch tabs).
class NavState extends ChangeNotifier {
  int tab = 0;
  void go(int t) {
    if (t == tab) return;
    tab = t;
    notifyListeners();
  }
}
