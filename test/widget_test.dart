import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:threadline/core/auth_service.dart';
import 'package:threadline/core/config.dart';
import 'package:threadline/core/insights_provider.dart';
import 'package:threadline/core/models.dart';
import 'package:threadline/main.dart';

import 'test_fixtures.dart';

void main() {
  testWidgets('missing runtime configuration never shows demo data', (
    tester,
  ) async {
    final config = RuntimeConfig.fromValues(
      apiBaseUrl: '',
      supabaseUrl: '',
      supabasePublishableKey: '',
      shopifyMobileReturnUrl: '',
    );

    await tester.pumpWidget(ConfigSetupApp(config: config));

    expect(find.text('Threadline needs runtime configuration'), findsOneWidget);
    for (final name in RuntimeConfig.defineNames) {
      expect(find.text('--dart-define=$name=<value>'), findsOneWidget);
    }
    expect(find.text('Commerce, with context.'), findsNothing);
  });

  testWidgets('email OTP signs in and restores the secure session flow', (
    tester,
  ) async {
    final auth = FakeAuthService();
    final harness = _WidgetHarness(auth: auth);
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    expect(find.text('Sign in to Threadline'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'Email address'),
      'owner@example.com',
    );
    await tester.tap(find.text('Send verification code'));
    await tester.pumpAndSettle();

    expect(auth.sentEmail, 'owner@example.com');
    expect(
      find.textContaining('verification code is on its way'),
      findsOneWidget,
    );

    await tester.enterText(
      find.widgetWithText(TextField, 'Verification code'),
      '123456',
    );
    await tester.tap(find.text('Verify code'));
    await tester.pumpAndSettle();

    expect(auth.verifiedToken, '123456');
    expect(find.text('Commerce, with context.'), findsOneWidget);
  });

  testWidgets('an authenticated user without a store gets real onboarding', (
    tester,
  ) async {
    final repository = FakeCommerceRepository(workspaces: []);
    final launcher = FakeAuthorizationLauncher();
    final harness = _WidgetHarness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
      launcher: launcher,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    expect(find.text('Connect a Shopify store'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'store.myshopify.com'),
      'primary-store.myshopify.com',
    );
    await tester.tap(find.text('Continue with Shopify'));
    await tester.pumpAndSettle();

    expect(launcher.opened?.host, 'primary-store.myshopify.com');
  });

  testWidgets('phone dashboard uses server data and server search', (
    tester,
  ) async {
    _configurePhone(tester);
    final repository = FakeCommerceRepository();
    final harness = _WidgetHarness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    expect(find.text('Threadline'), findsOneWidget);
    expect(find.text('Commerce, with context.'), findsOneWidget);
    expect(find.text('Gross non-cancelled order value'), findsOneWidget);
    expect(find.textContaining(r'$651,758'), findsOneWidget);

    await tester.tap(find.text('Catalog'));
    await tester.pumpAndSettle();
    expect(find.text('Products, not pages.'), findsOneWidget);

    tester.view.viewInsets = const FakeViewPadding(bottom: 840);
    await tester.pump();
    final search = find.byType(TextField).hitTestable();
    expect(search, findsOneWidget);
    await tester.enterText(search, 'lamp');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(repository.productQuery, 'lamp');
    await tester.scrollUntilVisible(
      find.text('Task Lamp'),
      300,
      scrollable: _scrollableFor('catalog-scroll'),
    );
    expect(find.text('Task Lamp'), findsOneWidget);
  });

  testWidgets('server pagination and product detail preserve tenant scope', (
    tester,
  ) async {
    _configurePhone(tester);
    final repository = FakeCommerceRepository(
      products: [
        fixtureProduct(id: 'gid://shopify/Product/1'),
        fixtureProduct(
          id: 'gid://shopify/Product/2',
          title: 'Task Chair',
          category: 'Furniture',
        ),
      ],
    );
    final harness = _WidgetHarness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Catalog'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Load more'),
      300,
      scrollable: _scrollableFor('catalog-scroll'),
    );
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(repository.productCursor, 'next');
    expect(find.text('Task Chair'), findsOneWidget);

    await tester.ensureVisible(find.text('Task Lamp'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Task Lamp'));
    await tester.pumpAndSettle();
    expect(find.text('Task Lamp'), findsWidgets);
    expect(find.text('Period revenue'), findsOneWidget);
    expect(repository.pendingProductId, 'gid://shopify/Product/1');
  });

  testWidgets(
    'customer period details and recent orders come from the server',
    (tester) async {
      _configurePhone(tester);
      final repository = FakeCommerceRepository();
      final harness = _WidgetHarness(
        auth: FakeAuthService(currentUser: _user()),
        repository: repository,
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();
      await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Customers'),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Value behind the order.'), findsOneWidget);
      expect(find.text('Ari Stone'), findsOneWidget);
      await tester.tap(find.text('Ari Stone'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Customer · Primary Store'), findsOneWidget);
      expect(find.text('Recent orders'), findsOneWidget);
      expect(find.text('#1001'), findsOneWidget);
      expect(repository.pendingCustomerId, 'gid://shopify/Customer/1');
    },
  );

  testWidgets('dark mode uses the production color system', (tester) async {
    _configurePhone(tester);
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    final harness = _WidgetHarness(auth: FakeAuthService(currentUser: _user()));
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    final context = tester.element(find.text('Threadline'));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(Theme.of(context).colorScheme.primary, isNot(Colors.white));
  });

  testWidgets('viewer UI cannot start sync or manage members', (tester) async {
    _configurePhone(tester);
    final repository = FakeCommerceRepository(
      workspaces: [
        fixtureWorkspace(
          role: WorkspaceRole.viewer,
          capabilities: const WorkspaceCapabilitiesDto(
            canEnqueueSync: false,
            canManageMembers: false,
            canChangeOwnerRoles: false,
          ),
        ),
      ],
    );
    final harness = _WidgetHarness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Manage workspace members'), findsNothing);
    await tester.tap(_destination('Sync'));
    await tester.pumpAndSettle();

    expect(find.text('Sync now'), findsNothing);
    expect(find.text('Read-only sync access'), findsOneWidget);
  });

  testWidgets('owner can open real workspace member management', (
    tester,
  ) async {
    _configurePhone(tester);
    final repository = FakeCommerceRepository(
      members: [
        WorkspaceMemberDto(
          userId: 'user-1',
          role: WorkspaceRole.owner,
          email: 'owner@example.com',
          createdAt: fixtureNow,
          updatedAt: fixtureNow,
        ),
      ],
    );
    final harness = _WidgetHarness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Manage workspace members'));
    await tester.pumpAndSettle();

    expect(find.text('Workspace access'), findsOneWidget);
    expect(find.text('owner@example.com'), findsOneWidget);
    expect(find.text('Add member'), findsOneWidget);
    expect(find.text('owner'), findsOneWidget);
  });

  testWidgets('all production tabs stay safe at 320 pixels and 2x text', (
    tester,
  ) async {
    _configurePhone(tester, size: const Size(320, 760), textScale: 2);
    final harness = _WidgetHarness(auth: FakeAuthService(currentUser: _user()));
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    await tester.pumpWidget(ThreadlineApp(controller: harness.controller));
    await tester.pumpAndSettle();

    const scrollTargets = {
      'Overview': 'overview-scroll',
      'Catalog': 'catalog-scroll',
      'Customers': 'customers-scroll',
      'Sync': 'sync-scroll',
    };
    for (final entry in scrollTargets.entries) {
      await tester.tap(_destination(entry.key));
      await tester.pumpAndSettle();
      await tester.fling(
        _scrollableFor(entry.value),
        const Offset(0, -1200),
        1200,
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: entry.key);
    }
  });
}

Finder _destination(String label) {
  return find.descendant(
    of: find.byType(NavigationBar),
    matching: find.text(label),
  );
}

Finder _scrollableFor(String key) {
  return find
      .descendant(of: find.byKey(Key(key)), matching: find.byType(Scrollable))
      .first;
}

void _configurePhone(
  WidgetTester tester, {
  Size size = const Size(390, 844),
  double textScale = 1,
}) {
  const devicePixelRatio = 2.5;
  const topPadding = 44 * devicePixelRatio;
  const bottomPadding = 24 * devicePixelRatio;
  tester.view.devicePixelRatio = devicePixelRatio;
  tester.view.physicalSize = Size(
    size.width * devicePixelRatio,
    size.height * devicePixelRatio,
  );
  tester.view.padding = const FakeViewPadding(
    top: topPadding,
    bottom: bottomPadding,
  );
  tester.view.viewPadding = const FakeViewPadding(
    top: topPadding,
    bottom: bottomPadding,
  );
  tester.view.systemGestureInsets = const FakeViewPadding(
    bottom: bottomPadding,
  );
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetPadding);
  addTearDown(tester.view.resetViewPadding);
  addTearDown(tester.view.resetSystemGestureInsets);
  addTearDown(tester.view.resetViewInsets);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

AuthUser _user() {
  return const AuthUser(
    id: 'user-1',
    email: 'owner@example.com',
    accessToken: 'access-token',
  );
}

class _WidgetHarness {
  _WidgetHarness({
    required this.auth,
    FakeCommerceRepository? repository,
    FakeDeepLinkService? deepLinks,
    FakeAuthorizationLauncher? launcher,
  }) : deepLinks = deepLinks ?? FakeDeepLinkService(),
       launcher = launcher ?? FakeAuthorizationLauncher() {
    controller = AppController(
      authService: auth,
      repository: repository ?? FakeCommerceRepository(),
      deepLinkService: this.deepLinks,
      authorizationLauncher: this.launcher,
      shopifyMobileReturnUrl: Uri.parse('threadline://shopify/install'),
      syncPollInterval: Duration.zero,
      delay: (_) async {},
    );
  }

  final FakeAuthService auth;
  final FakeDeepLinkService deepLinks;
  final FakeAuthorizationLauncher launcher;
  late final AppController controller;

  Future<void> dispose() async {
    controller.dispose();
    await auth.dispose();
    await deepLinks.dispose();
  }
}
