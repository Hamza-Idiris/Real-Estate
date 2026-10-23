# EstateFlow — Flutter mobile app

Property discovery, viewing requests, rental applications and the tenant portal (rent, lease, maintenance, notifications) on the **same API** as the web app. Business rules (availability, status changes, invoice balances, payment outcomes, permissions) live on the server; the app only renders server state.

> Payments are **simulated** ("Demo payment — no real money transferred" everywhere). Notifications are **in-app only**; no push provider is configured.

## ⚠️ Verification status — read first
This app was written **without a Flutter/Dart SDK available** (the build sandbox could not download one). It has **never been compiled, analysed or run**, and the Dart tests below have **not been executed**. Expect to fix some compile errors and API-version differences on first build. Everything else in the repo (API, web) was type-checked and tested; this folder was not.
First steps on your machine: `flutter pub get && flutter analyze && flutter test` — fix what the analyzer reports, then run on a device. Recommended Flutter: stable 3.24–3.27 (Dart ≥ 3.4).

## Set up
```bash
cd mobile
flutter create --platforms=android,ios --project-name estateflow --org com.estateflow .   # generates android/ and ios/ (keeps lib/, pubspec.yaml, test/)
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:4000        # Android emulator -> host machine
# iOS simulator: --dart-define=API_URL=http://localhost:4000 ; real device: your machine's LAN IP or a deployed HTTPS URL
```
Make sure the API's `CORS_ORIGINS` is irrelevant for native apps (CORS is browser-only) but that the API is reachable from the device.

### Platform configuration you must add after `flutter create`
**Android** `android/app/src/main/AndroidManifest.xml` (inside `<manifest>`):
```xml
<uses-permission android:name="android.permission.INTERNET"/>
```
For local **HTTP** development only, add `android:usesCleartextTraffic="true"` to `<application>`; remove it for release and use HTTPS. `flutter_secure_storage` needs `minSdkVersion 23` in `android/app/build.gradle`.
**iOS** `ios/Runner/Info.plist`:
```xml
<key>NSPhotoLibraryUsageDescription</key><string>Attach photos of maintenance issues and application documents.</string>
<key>NSCameraUsageDescription</key><string>Take photos of maintenance issues.</string>
```
Use HTTPS in production (App Transport Security blocks plain HTTP).

### Deep links (optional)
`/property/<REFERENCE>`, `/invoice/<id>`, `/maintenance/<id>` are real routes. To open them from links, register an intent filter (Android) / associated domains (iOS) for your domain, or a custom scheme such as `estateflow://`. go_router resolves the path. Protected routes redirect to sign-in and return afterwards (same-app paths only; no open redirect).

## What's here
| Area | Screens |
|-|-|
| Discover (no account needed) | search with debounce, filter sheet, paged results, property detail with gallery |
| Activity | viewing requests (accept proposed time / cancel), applications (respond to information requests, add document photo, withdraw) |
| Tenant | home summary, invoices + demo payment flow (idempotency key, success/failure/pending, simulated receipts), lease review & accept, maintenance (create with photos, emergency warning, comments, reopen) |
| Alerts | in-app notifications with unread badge and deep links |
| Profile | edit profile, change password, view my data, sign out |

## Architecture
`lib/core` — `api_client.dart` (single HTTP client: bearer auth, **single-flight refresh + one retry**, 20 s timeout, friendly network errors, server error mapping), `models.dart` (typed, defensive), `repository.dart` (all endpoints), `format.dart`, `theme.dart` (brand tokens incl. AA-safe text colours).
`lib/state` — `AuthState`, `NavState` (provider + ChangeNotifier). `lib/screens`, `lib/widgets`. Routing: go_router with auth redirect.

## Security notes
* Refresh token in the platform keystore (`flutter_secure_storage`); access token **in memory only**. A network failure during refresh never signs the user out; a rejected refresh does.
* No secrets in the app; `API_URL` is a build-time define. Release builds must use HTTPS.
* The app never sends a payment status, a property id for maintenance, a company id, or an owner/tenant id — the server derives them from the signed-in user. Do not add such fields.
* Signed document links expire (~10 minutes); they are opened externally, not cached.
* Uploads: the server validates real file content and size (5 MB). The app only offers images from the gallery/camera (PDF picking would need an extra plugin).

## Known version risks
`lib/core/theme.dart` passes `CardTheme` to `ThemeData.cardTheme`; Flutter ≥ 3.29 expects `CardThemeData` (rename it if the analyzer complains). `DropdownButtonFormField(value:)` is deprecated in newer Flutter in favour of `initialValue` (still works, warning only). `ColorScheme.surfaceContainerHighest` needs Flutter ≥ 3.22.

## Known gaps (not hidden)
Push notifications (needs a provider + server support) · offline cache (only pull-to-refresh and retry) · PDF document upload · biometric lock · localisation (English only) · dark theme · staff/owner features (web only) · app icons/splash · Inter font (system font used) · screenshots/golden tests · integration tests on a device.

## Tests (written, not yet run)
`test/core_test.dart` (formatting, defensive models, API client refresh/retry/error mapping, payment idempotency and "no client-side status", deep-link mapping) and `test/login_widget_test.dart` (form validation and failure states).
