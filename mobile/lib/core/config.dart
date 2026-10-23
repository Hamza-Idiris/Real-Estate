import 'package:flutter/foundation.dart';

/// Build-time configuration. Nothing secret belongs here (the app ships to user devices).
/// Android emulator reaches the host machine at 10.0.2.2; iOS simulator, desktop and Chrome use localhost.
///   flutter run -d chrome
///   flutter run --dart-define=API_URL=http://10.0.2.2:4000
///   flutter build apk --dart-define=API_URL=https://api.example.com
class Config {
  static const String _configured = String.fromEnvironment('API_URL');
  static String get apiBase {
    if (_configured.isNotEmpty) return _configured;
    // Android emulator cannot access 127.0.0.1 directly, but Chrome/Web and Desktop can.
    if (kIsWeb || defaultTargetPlatform == TargetPlatform.windows || defaultTargetPlatform == TargetPlatform.macOS || defaultTargetPlatform == TargetPlatform.linux || defaultTargetPlatform == TargetPlatform.iOS) {
      return 'http://localhost:4000';
    }
    return 'http://10.0.2.2:4000';
  }

  static const Duration timeout = Duration(seconds: 20);
}
