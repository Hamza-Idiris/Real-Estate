/// Build-time configuration. Nothing secret belongs here (the app ships to user devices).
/// Android emulator reaches the host machine at 10.0.2.2; iOS simulator can use localhost.
///   flutter run --dart-define=API_URL=http://10.0.2.2:4000
///   flutter build apk --dart-define=API_URL=https://api.example.com
class Config {
  static const String apiBase = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
  static const Duration timeout = Duration(seconds: 20);
}
