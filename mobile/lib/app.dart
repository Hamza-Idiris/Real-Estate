import 'package:device_preview/device_preview.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/repository.dart';
import 'core/theme.dart';
import 'screens/activity/activity_tab.dart';
import 'screens/auth/auth_screens.dart';
import 'screens/discover/discover_tab.dart';
import 'screens/discover/property_screen.dart';
import 'screens/more/more_tabs.dart';
import 'screens/tenant/maintenance_screens.dart';
import 'screens/tenant/tenant_tab.dart';
import 'state/auth_state.dart';

GoRouter buildRouter(AuthState auth) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: auth,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final needsAuth = loc.startsWith('/invoice') || loc.startsWith('/maintenance');
      if (!auth.signedIn && needsAuth) return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
      if (auth.signedIn && (loc == '/login' || loc == '/register')) {
        final from = state.uri.queryParameters['from'];
        return (from != null && from.startsWith('/')) ? from : '/'; // only same-app paths: no open redirects
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (c, s) => const HomeShell()),
      GoRoute(path: '/login', builder: (c, s) => LoginScreen(from: s.uri.queryParameters['from'])),
      GoRoute(path: '/register', builder: (c, s) => RegisterScreen(from: s.uri.queryParameters['from'])),
      GoRoute(path: '/property/:ref', builder: (c, s) => PropertyScreen(reference: s.pathParameters['ref'] ?? '')),
      GoRoute(path: '/invoice/:id', builder: (c, s) => InvoiceScreen(id: s.pathParameters['id'] ?? '')),
      GoRoute(path: '/maintenance/new', builder: (c, s) => const MaintenanceCreateScreen()),
      GoRoute(path: '/maintenance/:id', builder: (c, s) => MaintenanceDetailScreen(id: s.pathParameters['id'] ?? '')),
    ],
  );
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _unread = 0;

  Future<void> _refreshUnread() async {
    final auth = context.read<AuthState>();
    if (!auth.signedIn) {
      if (_unread != 0) setState(() => _unread = 0);
      return;
    }
    try {
      final n = await context.read<Repo>().unreadCount();
      if (mounted) setState(() => _unread = n);
    } catch (_) {/* badge is best-effort */}
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshUnread());
  }

  @override
  Widget build(BuildContext context) {
    final nav = context.watch<NavState>();
    context.watch<AuthState>(); // rebuild tabs on sign-in/out
    const tabs = [DiscoverTab(), ActivityTab(), TenantTab(), NotificationsTab(), ProfileTab()];
    return Scaffold(
      body: IndexedStack(index: nav.tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: nav.tab,
        onDestinationSelected: (i) {
          context.read<NavState>().go(i);
          _refreshUnread();
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.search), label: 'Discover'),
          const NavigationDestination(icon: Icon(Icons.event_note_outlined), selectedIcon: Icon(Icons.event_note), label: 'Activity'),
          const NavigationDestination(icon: Icon(Icons.home_work_outlined), selectedIcon: Icon(Icons.home_work), label: 'Tenant'),
          NavigationDestination(icon: Badge(isLabelVisible: _unread > 0, label: Text(_unread > 9 ? '9+' : '$_unread'), child: const Icon(Icons.notifications_none)), label: 'Alerts'),
          const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

class EstateFlowApp extends StatefulWidget {
  const EstateFlowApp({super.key, required this.auth, required this.api, required this.repo});
  final AuthState auth;
  final ApiClient api;
  final Repo repo;
  @override
  State<EstateFlowApp> createState() => _EstateFlowAppState();
}

class _EstateFlowAppState extends State<EstateFlowApp> {
  late final GoRouter _router = buildRouter(widget.auth);

  @override
  void initState() {
    super.initState();
    widget.auth.bootstrap();
  }

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: widget.api),
        Provider<Repo>.value(value: widget.repo),
        ChangeNotifierProvider<AuthState>.value(value: widget.auth),
        ChangeNotifierProvider<NavState>(create: (_) => NavState()),
      ],
      child: Consumer<AuthState>(
        builder: (context, auth, _) {
          if (!auth.ready) {
            return MaterialApp(
              locale: DevicePreview.locale(context),
              builder: DevicePreview.appBuilder,
              theme: buildTheme(),
              debugShowCheckedModeBanner: false,
              home: const Scaffold(body: Center(child: CircularProgressIndicator(semanticsLabel: 'Starting'))),
            );
          }
          return MaterialApp.router(
            locale: DevicePreview.locale(context),
            builder: DevicePreview.appBuilder,
            title: 'EstateFlow',
            theme: buildTheme(),
            debugShowCheckedModeBanner: false,
            routerConfig: _router,
          );
        },
      ),
    );
  }
}
