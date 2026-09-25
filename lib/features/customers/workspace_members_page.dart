import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_theme.dart';
import '../../app/app_widgets.dart';
import '../../core/insights_provider.dart';
import '../../core/models.dart';

class WorkspaceMembersPage extends StatefulWidget {
  const WorkspaceMembersPage({super.key});

  @override
  State<WorkspaceMembersPage> createState() => _WorkspaceMembersPageState();
}

class _WorkspaceMembersPageState extends State<WorkspaceMembersPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<AppController>().ensureMembers();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.members;
    if (workspace == null) return const SizedBox.shrink();
    return Scaffold(
      appBar: AppBar(title: const Text('Workspace access')),
      body: SafeArea(
        child: state.status == LoadStatus.loading && state.items.isEmpty
            ? const WorkspaceLoadingView()
            : RefreshIndicator(
                onRefresh: controller.loadMembers,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
                  children: [
                    Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 880),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            PageIntro(
                              eyebrow: workspace.shopDomain,
                              title: 'People and permissions.',
                              description:
                                  'Manage who can view this workspace, run synchronization, and administer access.',
                              trailing: FilledButton.icon(
                                onPressed: state.isMutating
                                    ? null
                                    : () => _showAddMember(context),
                                icon: const Icon(
                                  Icons.person_add_alt_1_rounded,
                                ),
                                label: const Text('Add member'),
                              ),
                            ),
                            if (state.error != null) ...[
                              const SizedBox(height: 18),
                              _MemberNotice(
                                message: state.error!,
                                requestId: state.errorRequestId,
                                onRetry: controller.loadMembers,
                              ),
                            ],
                            if (state.isMutating) ...[
                              const SizedBox(height: 18),
                              const LinearProgressIndicator(minHeight: 2),
                            ],
                            const SizedBox(height: 22),
                            SectionHeader(
                              title: '${state.items.length} members',
                              subtitle:
                                  'Your role: ${workspace.role.name} · capabilities verified by the service',
                            ),
                            const SizedBox(height: 12),
                            if (state.items.isEmpty &&
                                state.status != LoadStatus.loading)
                              const AppSurface(
                                child: EmptyState(
                                  title: 'No members returned',
                                  message:
                                      'The service did not return workspace members.',
                                ),
                              )
                            else
                              AppSurface(
                                padding: EdgeInsets.zero,
                                child: Column(
                                  children: [
                                    for (
                                      var index = 0;
                                      index < state.items.length;
                                      index++
                                    ) ...[
                                      _MemberRow(
                                        member: state.items[index],
                                        canChangeOwnerRoles: workspace
                                            .capabilities
                                            .canChangeOwnerRoles,
                                        enabled:
                                            !state.isMutating &&
                                            (workspace
                                                    .capabilities
                                                    .canChangeOwnerRoles ||
                                                state.items[index].role !=
                                                    WorkspaceRole.owner),
                                        onRoleChanged: (role) =>
                                            controller.updateMemberRole(
                                              userId: state.items[index].userId,
                                              role: role,
                                            ),
                                        onRemove: () => _removeMember(
                                          context,
                                          state.items[index],
                                        ),
                                      ),
                                      if (index != state.items.length - 1)
                                        const Divider(
                                          indent: 18,
                                          endIndent: 18,
                                        ),
                                    ],
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Future<void> _showAddMember(BuildContext context) async {
    final controller = context.read<AppController>();
    final userIdController = TextEditingController();
    var role = WorkspaceRole.member;
    final roles = controller.selectedWorkspace!.capabilities.canChangeOwnerRoles
        ? WorkspaceRole.values
        : WorkspaceRole.values.where((value) => value != WorkspaceRole.owner);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setState) {
            return Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                4,
                20,
                24 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Add an existing user',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Enter the user ID from their authenticated Threadline account.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 18),
                    TextField(
                      controller: userIdController,
                      autocorrect: false,
                      keyboardType: TextInputType.text,
                      decoration: const InputDecoration(
                        labelText: 'Supabase user ID',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<WorkspaceRole>(
                      initialValue: role,
                      decoration: const InputDecoration(
                        labelText: 'Role',
                        prefixIcon: Icon(Icons.admin_panel_settings_outlined),
                      ),
                      items: roles
                          .map(
                            (value) => DropdownMenuItem(
                              value: value,
                              child: Text(value.name),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) {
                        if (value != null) setState(() => role = value);
                      },
                    ),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      onPressed: () async {
                        Navigator.of(sheetContext).pop();
                        await controller.addMember(
                          userId: userIdController.text,
                          role: role,
                        );
                      },
                      icon: const Icon(Icons.person_add_alt_1_rounded),
                      label: const Text('Add member'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    userIdController.dispose();
  }

  Future<void> _removeMember(
    BuildContext context,
    WorkspaceMemberDto member,
  ) async {
    final controller = context.read<AppController>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove workspace member?'),
        content: Text(
          'Remove ${member.email ?? member.userId} from this workspace?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Remove member'),
          ),
        ],
      ),
    );
    if (confirmed == true) await controller.removeMember(member.userId);
  }
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.member,
    required this.canChangeOwnerRoles,
    required this.enabled,
    required this.onRoleChanged,
    required this.onRemove,
  });

  final WorkspaceMemberDto member;
  final bool canChangeOwnerRoles;
  final bool enabled;
  final ValueChanged<WorkspaceRole> onRoleChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final tone = switch (member.role) {
      WorkspaceRole.owner || WorkspaceRole.admin => StatusTone.positive,
      WorkspaceRole.member => StatusTone.information,
      WorkspaceRole.viewer => StatusTone.neutral,
    };
    final roles = canChangeOwnerRoles
        ? WorkspaceRole.values
        : WorkspaceRole.values.where((value) => value != WorkspaceRole.owner);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      child: Wrap(
        spacing: 14,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Row(
              children: [
                CircleAvatar(
                  child: Icon(
                    member.role == WorkspaceRole.owner
                        ? Icons.shield_outlined
                        : Icons.person_outline_rounded,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        member.email ?? 'Authenticated user',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 3),
                      SelectableText(
                        member.userId,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusPill(label: member.role.name, tone: tone),
              PopupMenuButton<WorkspaceRole>(
                tooltip: 'Change role',
                enabled: enabled,
                initialValue: member.role,
                onSelected: onRoleChanged,
                itemBuilder: (context) => roles
                    .map(
                      (role) =>
                          PopupMenuItem(value: role, child: Text(role.name)),
                    )
                    .toList(growable: false),
                icon: const Icon(Icons.manage_accounts_outlined),
              ),
              IconButton(
                tooltip: 'Remove member',
                onPressed: enabled ? onRemove : null,
                icon: const Icon(Icons.person_remove_outlined),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MemberNotice extends StatelessWidget {
  const _MemberNotice({
    required this.message,
    required this.requestId,
    required this.onRetry,
  });

  final String message;
  final String? requestId;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      color: context.appColors.warningContainer,
      child: Wrap(
        spacing: 16,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.spaceBetween,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(message),
                if (requestId != null) ...[
                  const SizedBox(height: 4),
                  SelectableText(
                    'Request ID: $requestId',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
