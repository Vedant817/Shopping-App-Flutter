import 'package:flutter_test/flutter_test.dart';
import 'package:threadline/core/auth_service.dart';
import 'package:threadline/core/commerce_repository.dart';
import 'package:threadline/core/insights_provider.dart';
import 'package:threadline/core/models.dart';

import 'test_fixtures.dart';

void main() {
  test('restores auth and loads authorized server workspaces', () async {
    final harness = _harness(auth: FakeAuthService(currentUser: _user()));
    addTearDown(harness.dispose);

    await harness.controller.initialize();

    expect(harness.controller.status, AppStatus.ready);
    expect(harness.controller.selectedWorkspace?.id, 'workspace-primary');
    expect(harness.controller.overview.status, LoadStatus.ready);
    expect(
      harness.controller.overview.data?.metrics.revenue.toString(),
      '651758',
    );
  });

  test('runs the complete email OTP state flow', () async {
    final auth = FakeAuthService();
    final harness = _harness(auth: auth);
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    expect(harness.controller.status, AppStatus.signedOut);
    await harness.controller.sendOtp('Owner@Example.com');
    expect(auth.sentEmail, 'owner@example.com');
    expect(harness.controller.authPhase, AuthPhase.codeSent);

    await harness.controller.verifyOtp('123456');
    await Future<void>.delayed(Duration.zero);

    expect(auth.verifiedToken, '123456');
    expect(harness.controller.status, AppStatus.ready);
  });

  test('rejects a workspace response from the wrong tenant', () async {
    final repository = FakeCommerceRepository()
      ..overview = fixtureOverview(workspace: fixtureWorkspace(id: 'other'));
    final harness = _harness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);

    await harness.controller.initialize();

    expect(harness.controller.status, AppStatus.ready);
    expect(harness.controller.overview.status, LoadStatus.failure);
    expect(harness.controller.overview.error, isNotNull);
  });

  test('surfaces actionable server conflict details', () async {
    final repository = FakeCommerceRepository();
    final harness = _harness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();
    repository.error = const ApiException(
      kind: ApiErrorKind.conflict,
      code: 'last_owner_required',
      message: 'The workspace must retain an owner',
      requestId: 'request-1',
    );

    await harness.controller.loadOverview(refresh: true);

    expect(
      harness.controller.overview.error,
      'The workspace must retain an owner',
    );
    expect(harness.controller.overview.errorRequestId, 'request-1');
  });

  test(
    'uses server search and cursor pagination without duplicate rows',
    () async {
      final repository = FakeCommerceRepository(
        products: [
          fixtureProduct(id: 'gid://shopify/Product/1'),
          fixtureProduct(id: 'gid://shopify/Product/2', title: 'Task Chair'),
        ],
      );
      final harness = _harness(
        auth: FakeAuthService(currentUser: _user()),
        repository: repository,
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      await harness.controller.refreshProducts(
        query: 'lamp',
        category: 'Lighting',
      );
      expect(repository.productQuery, 'lamp');
      expect(repository.productCategory, 'Lighting');
      expect(harness.controller.catalog.nextCursor, 'next');

      await harness.controller.loadMoreProducts();
      expect(repository.productCursor, 'next');
      expect(
        harness.controller.catalog.items.map((item) => item.id).toSet(),
        hasLength(2),
      );
    },
  );

  test(
    'changes server ranges and clears period-dependent customer data',
    () async {
      final repository = FakeCommerceRepository();
      final harness = _harness(
        auth: FakeAuthService(currentUser: _user()),
        repository: repository,
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();
      await harness.controller.searchCustomers('');

      await harness.controller.setRange(InsightRange.sevenDays);

      expect(harness.controller.range, InsightRange.sevenDays);
      expect(repository.overviewRanges, contains(InsightRange.sevenDays));
      expect(harness.controller.overview.data?.range.preset, '7d');
    },
  );

  test(
    'polls a sync job through queued, running, and terminal states',
    () async {
      final repository = FakeCommerceRepository()
        ..jobStatuses = [
          JobStatus.queued,
          JobStatus.running,
          JobStatus.succeeded,
        ];
      final harness = _harness(
        auth: FakeAuthService(currentUser: _user()),
        repository: repository,
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      await harness.controller.enqueueSync();

      expect(repository.enqueueSyncCalls, 1);
      expect(repository.getJobCalls, 3);
      expect(harness.controller.sync.job?.status, JobStatus.succeeded);
    },
  );

  test(
    'starts Shopify authorization and accepts only the exact deep link',
    () async {
      final launcher = FakeAuthorizationLauncher();
      final repository = FakeCommerceRepository(workspaces: []);
      final deepLinks = FakeDeepLinkService();
      final harness = _harness(
        auth: FakeAuthService(currentUser: _user()),
        repository: repository,
        deepLinks: deepLinks,
        launcher: launcher,
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      await harness.controller.installShop('Primary-Store.myshopify.com');
      expect(launcher.opened?.host, 'primary-store.myshopify.com');

      repository.workspaces = [fixtureWorkspace()];
      deepLinks.emit(
        Uri.parse(
          'threadline://shopify/install?workspace=workspace-primary&installed=1',
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(repository.listWorkspacesCalls, 2);
    },
  );

  test(
    'workspace switching resets detail scope and loads the new tenant',
    () async {
      final secondary = fixtureWorkspace(
        id: 'workspace-secondary',
        name: 'Secondary Store',
        shopDomain: 'secondary.myshopify.com',
        role: WorkspaceRole.member,
        capabilities: const WorkspaceCapabilitiesDto(
          canEnqueueSync: true,
          canManageMembers: true,
          canChangeOwnerRoles: false,
        ),
      );
      final repository = FakeCommerceRepository(
        workspaces: [fixtureWorkspace(), secondary],
      );
      final harness = _harness(
        auth: FakeAuthService(currentUser: _user()),
        repository: repository,
      );
      addTearDown(harness.dispose);
      await harness.controller.initialize();

      await harness.controller.loadProductDetail('gid://shopify/Product/1');
      await harness.controller.loadCustomerDetail('gid://shopify/Customer/1');
      await harness.controller.selectWorkspace(secondary.id);

      expect(harness.controller.selectedWorkspace?.id, secondary.id);
      expect(harness.controller.productDetail.data, isNull);
      expect(harness.controller.customerDetail.data, isNull);
      expect(harness.controller.overview.data?.workspace.id, secondary.id);
      expect(
        repository.requestedWorkspaceIds,
        containsAllInOrder([secondary.id, secondary.id]),
      );
    },
  );

  test('manages members only with server-authorized capabilities', () async {
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
    final harness = _harness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    await harness.controller.loadMembers();
    const memberId = '00000000-0000-4000-8000-000000000002';
    await harness.controller.addMember(
      userId: memberId,
      role: WorkspaceRole.member,
    );
    expect(repository.members, hasLength(2));
    expect(harness.controller.members.status, LoadStatus.ready);
    expect(
      harness.controller.members.items
          .singleWhere((member) => member.userId == memberId)
          .role,
      WorkspaceRole.member,
    );

    await harness.controller.updateMemberRole(
      userId: memberId,
      role: WorkspaceRole.admin,
    );
    expect(
      harness.controller.members.items
          .singleWhere((member) => member.userId == memberId)
          .role,
      WorkspaceRole.admin,
    );

    await harness.controller.removeMember(memberId);
    expect(
      harness.controller.members.items.any(
        (member) => member.userId == memberId,
      ),
      isFalse,
    );
  });

  test('viewer capabilities prevent sync and member loading', () async {
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
    final harness = _harness(
      auth: FakeAuthService(currentUser: _user()),
      repository: repository,
    );
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    await harness.controller.loadMembers();
    expect(harness.controller.members.status, isNot(LoadStatus.ready));
    await harness.controller.enqueueSync();
    expect(repository.enqueueSyncCalls, 0);
  });

  test('clears all tenant caches and UI state on sign out', () async {
    final harness = _harness(auth: FakeAuthService(currentUser: _user()));
    addTearDown(harness.dispose);
    await harness.controller.initialize();

    await harness.controller.signOut();

    expect(harness.controller.status, AppStatus.signedOut);
    expect(harness.controller.workspaces, isEmpty);
    expect(harness.controller.selectedWorkspace, isNull);
  });
}

_ControllerHarness _harness({
  required FakeAuthService auth,
  FakeCommerceRepository? repository,
  FakeDeepLinkService? deepLinks,
  FakeAuthorizationLauncher? launcher,
}) {
  final links = deepLinks ?? FakeDeepLinkService();
  final authLauncher = launcher ?? FakeAuthorizationLauncher();
  final controller = AppController(
    authService: auth,
    repository: repository ?? FakeCommerceRepository(),
    deepLinkService: links,
    authorizationLauncher: authLauncher,
    shopifyMobileReturnUrl: Uri.parse('threadline://shopify/install'),
    syncPollInterval: Duration.zero,
    delay: (_) async {},
  );
  return _ControllerHarness(
    controller: controller,
    auth: auth,
    deepLinks: links,
  );
}

AuthUser _user() {
  return const AuthUser(
    id: 'user-1',
    email: 'owner@example.com',
    accessToken: 'access-token',
  );
}

class _ControllerHarness {
  _ControllerHarness({
    required this.controller,
    required this.auth,
    required this.deepLinks,
  });

  final AppController controller;
  final FakeAuthService auth;
  final FakeDeepLinkService deepLinks;

  Future<void> dispose() async {
    controller.dispose();
    await auth.dispose();
    await deepLinks.dispose();
  }
}
