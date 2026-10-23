import 'package:device_preview/device_preview.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/api_client.dart';
import 'core/repository.dart';
import 'state/auth_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  final repo = Repo(api);
  final auth = AuthState(api, repo);
  runApp(
    DevicePreview(
      enabled: !kReleaseMode,
      builder: (context) => EstateFlowApp(auth: auth, api: api, repo: repo),
    ),
  );
}
