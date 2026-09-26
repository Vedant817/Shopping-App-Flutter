import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/insights_provider.dart';
import '../core/models.dart';
import '../features/catalog/catalog_page.dart';
import '../features/customers/customers_page.dart';
import '../features/customers/workspace_members_page.dart';
import '../features/overview/overview_page.dart';
import '../features/checkouts/checkouts_page.dart';
import '../features/sync/sync_page.dart';
import 'app_theme.dart';
import 'app_widgets.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    switch (controller.status) {
      case AppStatus.initializing:
      case AppStatus.loadingWorkspaces:
        return const Scaffold(body: SafeArea(child: WorkspaceLoadingView()));
      case AppStatus.signedOut:
        return const Scaffold(body: SafeArea(child: AuthView()));
      case AppStatus.noWorkspaces:
        return const Scaffold(body: SafeArea(child: OnboardingView()));
      case AppStatus.failure:
        return Scaffold(
          body: SafeArea(
            child: WorkspaceErrorView(
              message:
                  controller.workspaceError ??
                  'The workspace list could not be loaded.',
              onRetry: controller.refreshWorkspaces,
            ),
          ),
        );
      case AppStatus.ready:
        return _AuthenticatedShell(
          selectedIndex: _selectedIndex,
          onDestinationSelected: (index) =>
              setState(() => _selectedIndex = index),
          onOpenCatalog: () => setState(() => _selectedIndex = 1),
        );
    }
  }
}

class _AuthenticatedShell extends StatelessWidget {
  const _AuthenticatedShell({
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.onOpenCatalog,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final VoidCallback onOpenCatalog;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspaceKey = controller.selectedWorkspaceId ?? 'no-workspace';
    final pages = [
      OverviewPage(
        key: ValueKey('overview-$workspaceKey'),
        onOpenCatalog: onOpenCatalog,
      ),
      CatalogPage(key: ValueKey('catalog-$workspaceKey')),
      CustomersPage(key: ValueKey('customers-$workspaceKey')),
      CheckoutsPage(key: ValueKey('checkouts-$workspaceKey')),
      SyncPage(key: ValueKey('sync-$workspaceKey')),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final useRail = constraints.maxWidth >= 860;
        final content = Column(
          children: [
            if (controller.isRefreshingWorkspaces)
              const LinearProgressIndicator(minHeight: 2),
            if (controller.workspaceError != null &&
                controller.selectedWorkspace != null)
              _StaleBanner(
                message: controller.workspaceError!,
                onRetry: controller.refreshWorkspaces,
              ),
            Expanded(
              child: IndexedStack(index: selectedIndex, children: pages),
            ),
          ],
        );
        if (useRail) {
          final extended = constraints.maxWidth >= 1180;
          return Scaffold(
            appBar: _WorkspaceAppBar(
              extended: extended,
              onWorkspacePressed: () => _showWorkspaceSwitcher(context),
            ),
            body: SafeArea(
              top: false,
              child: Row(
                children: [
                  _WorkspaceRail(
                    selectedIndex: selectedIndex,
                    extended: extended,
                    onDestinationSelected: onDestinationSelected,
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: content),
                ],
              ),
            ),
          );
        }
        return Scaffold(
          appBar: _WorkspaceAppBar(
            extended: false,
            onWorkspacePressed: () => _showWorkspaceSwitcher(context),
          ),
          body: SafeArea(top: false, bottom: false, child: content),
          bottomNavigationBar: NavigationBar(
            selectedIndex: selectedIndex,
            onDestinationSelected: onDestinationSelected,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.space_dashboard_outlined),
                selectedIcon: Icon(Icons.space_dashboard_rounded),
                label: 'Overview',
              ),
              NavigationDestination(
                icon: Icon(Icons.inventory_2_outlined),
                selectedIcon: Icon(Icons.inventory_2_rounded),
                label: 'Catalog',
              ),
              NavigationDestination(
                icon: Icon(Icons.people_outline_rounded),
                selectedIcon: Icon(Icons.people_rounded),
                label: 'Customers',
              ),
              NavigationDestination(
                icon: Icon(Icons.shopping_cart_checkout_outlined),
                selectedIcon: Icon(Icons.shopping_cart_checkout_rounded),
                label: 'Recovery',
              ),
              NavigationDestination(
                icon: Icon(Icons.sync_outlined),
                selectedIcon: Icon(Icons.sync_rounded),
                label: 'Sync',
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _showWorkspaceSwitcher(BuildContext context) async {
    final controller = context.read<AppController>();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) {
        return _WorkspaceSwitcher(
          workspaces: controller.workspaces,
          selected: controller.selectedWorkspace,
          onSelected: (workspace) {
            Navigator.of(sheetContext).pop();
            controller.selectWorkspace(workspace.id);
          },
        );
      },
    );
  }
}

class _WorkspaceAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _WorkspaceAppBar({
    required this.extended,
    required this.onWorkspacePressed,
  });

  final bool extended;
  final VoidCallback onWorkspacePressed;

  @override
  Size get preferredSize => const Size.fromHeight(68);

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    return AppBar(
      toolbarHeight: 68,
      titleSpacing: 20,
      title: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(
              Icons.hub_rounded,
              size: 20,
              color: Theme.of(context).colorScheme.onPrimary,
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              'Threadline',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          if (extended && workspace != null) ...[
            const SizedBox(width: 14),
            Flexible(
              child: Text(
                workspace.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ],
      ),
      actions: [
        if (workspace?.capabilities.canManageMembers ?? false)
          IconButton(
            tooltip: 'Manage workspace members',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const WorkspaceMembersPage(),
              ),
            ),
            icon: const Icon(Icons.group_outlined),
          ),
        IconButton(
          tooltip: 'Switch workspace',
          onPressed: onWorkspacePressed,
          icon: const Icon(Icons.storefront_outlined),
        ),
        IconButton(
          tooltip: 'Sign out',
          onPressed: controller.signOut,
          icon: const Icon(Icons.logout_rounded),
        ),
        const SizedBox(width: 8),
      ],
    );
  }
}

class _WorkspaceRail extends StatelessWidget {
  const _WorkspaceRail({
    required this.selectedIndex,
    required this.extended,
    required this.onDestinationSelected,
  });

  final int selectedIndex;
  final bool extended;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    return NavigationRail(
      extended: extended,
      minExtendedWidth: 218,
      selectedIndex: selectedIndex,
      onDestinationSelected: onDestinationSelected,
      leading: Padding(
        padding: const EdgeInsets.fromLTRB(12, 18, 12, 22),
        child: extended
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.hub_rounded,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Threadline',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ],
              )
            : Icon(
                Icons.hub_rounded,
                color: Theme.of(context).colorScheme.primary,
              ),
      ),
      destinations: const [
        NavigationRailDestination(
          icon: Icon(Icons.space_dashboard_outlined),
          selectedIcon: Icon(Icons.space_dashboard_rounded),
          label: Text('Overview'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.inventory_2_outlined),
          selectedIcon: Icon(Icons.inventory_2_rounded),
          label: Text('Catalog'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.people_outline_rounded),
          selectedIcon: Icon(Icons.people_rounded),
          label: Text('Customers'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.shopping_cart_checkout_outlined),
          selectedIcon: Icon(Icons.shopping_cart_checkout_rounded),
          label: Text('Recovery'),
        ),
        NavigationRailDestination(
          icon: Icon(Icons.sync_outlined),
          selectedIcon: Icon(Icons.sync_rounded),
          label: Text('Sync'),
        ),
      ],
    );
  }
}

class AuthView extends StatefulWidget {
  const AuthView({super.key});

  @override
  State<AuthView> createState() => _AuthViewState();
}

class _AuthViewState extends State<AuthView> {
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final sending = controller.authPhase == AuthPhase.sendingCode;
    final verifying = controller.authPhase == AuthPhase.verifyingCode;
    final codeSent = controller.authPhase == AuthPhase.codeSent;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: AppSurface(
            child: AutofillGroup(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Sign in to Threadline',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Use your email address. We will send a one-time verification code when the address can receive Threadline email.',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 24),
                  if (codeSent) ...[
                    TextField(
                      controller: _codeController,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      maxLength: 6,
                      decoration: const InputDecoration(
                        labelText: 'Verification code',
                        prefixIcon: Icon(Icons.mark_email_read_outlined),
                      ),
                      onSubmitted: (_) =>
                          controller.verifyOtp(_codeController.text),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: verifying
                          ? null
                          : () => controller.verifyOtp(_codeController.text),
                      child: verifying
                          ? const _ButtonProgress(label: 'Verifying')
                          : const Text('Verify code'),
                    ),
                    TextButton(
                      onPressed: verifying ? null : controller.editEmail,
                      child: const Text('Use another email'),
                    ),
                  ] else ...[
                    TextField(
                      controller: _emailController,
                      autofocus: true,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.email],
                      decoration: const InputDecoration(
                        labelText: 'Email address',
                        prefixIcon: Icon(Icons.mail_outline_rounded),
                      ),
                      onSubmitted: sending
                          ? null
                          : (_) => controller.sendOtp(_emailController.text),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: sending
                          ? null
                          : () => controller.sendOtp(_emailController.text),
                      child: sending
                          ? const _ButtonProgress(label: 'Sending code')
                          : const Text('Send verification code'),
                    ),
                  ],
                  if (controller.authError != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      controller.authError!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                  if (controller.authMessage != null) ...[
                    const SizedBox(height: 16),
                    Text(controller.authMessage!),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ButtonProgress extends StatelessWidget {
  const _ButtonProgress({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox.square(
          dimension: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        const SizedBox(width: 10),
        Text(label),
      ],
    );
  }
}

class OnboardingView extends StatefulWidget {
  const OnboardingView({super.key});

  @override
  State<OnboardingView> createState() => _OnboardingViewState();
}

class _OnboardingViewState extends State<OnboardingView> {
  final _shopController = TextEditingController();

  @override
  void dispose() {
    _shopController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: AppSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connect a Shopify store',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(
                  'Enter the store domain exactly as it appears in Shopify. Authorization continues in the browser and returns to this app when complete.',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _shopController,
                  keyboardType: TextInputType.url,
                  textInputAction: TextInputAction.done,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'store.myshopify.com',
                    hintText: 'example-store.myshopify.com',
                    prefixIcon: Icon(Icons.storefront_outlined),
                  ),
                  onSubmitted: controller.isOnboarding
                      ? null
                      : (_) => controller.installShop(_shopController.text),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: controller.isOnboarding
                      ? null
                      : () => controller.installShop(_shopController.text),
                  icon: controller.isOnboarding
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.open_in_new_rounded),
                  label: Text(
                    controller.isOnboarding
                        ? 'Opening Shopify'
                        : 'Continue with Shopify',
                  ),
                ),
                if (controller.onboardingError != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    controller.onboardingError!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 22),
                TextButton.icon(
                  onPressed: controller.signOut,
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Sign out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StaleBanner extends StatelessWidget {
  const _StaleBanner({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.appColors.warningContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 8, 8),
        child: Row(
          children: [
            Icon(
              Icons.sync_problem_rounded,
              size: 20,
              color: context.appColors.warning,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text('$message Showing the last available response.'),
            ),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

class _WorkspaceSwitcher extends StatelessWidget {
  const _WorkspaceSwitcher({
    required this.workspaces,
    required this.selected,
    required this.onSelected,
  });

  final List<WorkspaceDto> workspaces;
  final WorkspaceDto? selected;
  final ValueChanged<WorkspaceDto> onSelected;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Switch workspace',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),
              for (final workspace in workspaces)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    workspace.id == selected?.id
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                  ),
                  title: Text(workspace.name),
                  subtitle: Text(workspace.shopDomain),
                  onTap: () => onSelected(workspace),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
