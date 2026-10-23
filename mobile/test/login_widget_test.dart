import 'package:estateflow/core/api_client.dart';
import 'package:estateflow/core/repository.dart';
import 'package:estateflow/screens/auth/auth_screens.dart';
import 'package:estateflow/state/auth_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

Widget _wrap(AuthState auth, Widget child) => ChangeNotifierProvider<AuthState>.value(value: auth, child: MaterialApp(home: child));

AuthState _auth(MockClient client) {
  final api = ApiClient(client: client, store: MemoryTokenStore(), base: 'http://x');
  return AuthState(api, Repo(api));
}

void main() {
  testWidgets('invalid login input shows validation errors and does not call the API', (tester) async {
    var calls = 0;
    await tester.pumpWidget(_wrap(_auth(MockClient((r) async { calls++; return http.Response('{}', 200); })), const LoginScreen()));
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();
    expect(find.text('Enter a valid email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(calls, 0);
  });

  testWidgets('failed login shows the server message in an alert area', (tester) async {
    final client = MockClient((r) async => http.Response('{"error":{"code":"UNAUTHORIZED","message":"Invalid email or password"}}', 401, headers: {'content-type': 'application/json'}));
    await tester.pumpWidget(_wrap(_auth(client), const LoginScreen()));
    await tester.enterText(find.byType(TextFormField).at(0), 'a@b.co');
    await tester.enterText(find.byType(TextFormField).at(1), 'whatever12');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Invalid email or password'), findsOneWidget);
  });

  testWidgets('registration enforces the password policy client-side (server still enforces it)', (tester) async {
    await tester.pumpWidget(_wrap(_auth(MockClient((r) async => http.Response('{}', 200))), const RegisterScreen()));
    await tester.enterText(find.byType(TextFormField).at(0), 'Test User');
    await tester.enterText(find.byType(TextFormField).at(1), 'a@b.co');
    await tester.enterText(find.byType(TextFormField).at(3), 'alllowercase1');
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pump();
    expect(find.text('Use upper and lower case letters and a number'), findsOneWidget);
  });
}
