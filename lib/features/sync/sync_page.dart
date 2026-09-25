import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_theme.dart';
import '../../app/app_widgets.dart';
import '../../core/formatters.dart';
import '../../core/insights_provider.dart';
import '../../core/models.dart';

class SyncPage extends StatefulWidget {
  const SyncPage({super.key});

  @override
  State<SyncPage> createState() => _SyncPageState();
}

class _SyncPageState extends State<SyncPage> {
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        final controller = context.read<AppController>();
        if (controller.sync.status == LoadStatus.idle) controller.loadSync();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.sync;
    if (workspace == null) return const SizedBox.shrink();
    final status = state.job?.status ?? state.data?.status;
    final canRetry =
        status == JobStatus.failed ||
        status == JobStatus.dead ||
        status == SyncStatus.failed ||
        status == SyncStatus.dead;
    final horizontalPadding = MediaQuery.sizeOf(context).width < 600
        ? 20.0
        : 28.0;
    return RefreshIndicator(
      onRefresh: controller.loadSync,
      child: ListView(
        key: const Key('sync-scroll'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          horizontalPadding,
          28,
          horizontalPadding,
          40,
        ),
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1040),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                PageIntro(
                  eyebrow: 'Ingestion control',
                  title: 'Know what is current.',
                  description:
                      'Inspect the service job, resource progress, cursor state, watermark, and errors for ${workspace.name}.',
                  trailing: workspace.capabilities.canEnqueueSync
                      ? FilledButton.icon(
                          onPressed: state.isEnqueueing
                              ? null
                              : controller.enqueueSync,
                          icon: state.isEnqueueing
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.sync_rounded),
                          label: Text(
                            state.isEnqueueing
                                ? 'Queueing'
                                : canRetry
                                ? 'Retry sync'
                                : 'Sync now',
                          ),
                        )
                      : const StatusPill(
                          label: 'Read-only sync access',
                          icon: Icons.lock_outline_rounded,
                          tone: StatusTone.neutral,
                        ),
                ),
                const SizedBox(height: 24),
                if (state.error != null)
                  _SyncNotice(
                    message: state.error!,
                    stale: state.data != null,
                    onRetry: controller.loadSync,
                  ),
                if (state.isRefreshing || state.isPolling)
                  const LinearProgressIndicator(minHeight: 2),
                const SizedBox(height: 16),
                if (state.data == null && state.status == LoadStatus.failure)
                  WorkspaceErrorView(
                    message: state.error ?? 'Sync status could not be loaded.',
                    onRetry: controller.loadSync,
                  )
                else if (state.data == null)
                  const WorkspaceLoadingView()
                else ...[
                  _SyncStatusCard(data: state.data!, job: state.job),
                  const SizedBox(height: 24),
                  const SectionHeader(
                    title: 'Resource progress',
                    subtitle: 'Values reported by the service job',
                  ),
                  const SizedBox(height: 12),
                  _ResourceList(
                    resources: state.job?.resources ?? state.data!.resources,
                  ),
                  if (state.job?.error != null) ...[
                    const SizedBox(height: 18),
                    AppSurface(
                      color: context.appColors.warningContainer,
                      child: Text(state.job!.error!),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SyncStatusCard extends StatelessWidget {
  const _SyncStatusCard({required this.data, required this.job});

  final SyncDto data;
  final IngestionJobDto? job;

  @override
  Widget build(BuildContext context) {
    final tone = job == null
        ? switch (data.status) {
            SyncStatus.succeeded => StatusTone.positive,
            SyncStatus.failed || SyncStatus.dead => StatusTone.warning,
            SyncStatus.running || SyncStatus.queued => StatusTone.information,
            SyncStatus.idle => StatusTone.neutral,
          }
        : switch (job!.status) {
            JobStatus.succeeded => StatusTone.positive,
            JobStatus.failed || JobStatus.dead => StatusTone.warning,
            JobStatus.running || JobStatus.queued => StatusTone.information,
          };
    final statusLabel = job?.status.name ?? data.status.name;
    final attempts = job?.attempts ?? data.attempts;
    final maxAttempts = job?.maxAttempts ?? data.maxAttempts;
    final resource = job?.resource ?? data.resource;
    final error = job?.error ?? data.error;
    return AppSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                _statusIcon(statusLabel),
                size: 32,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _statusLabel(statusLabel),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$attempts of $maxAttempts attempts${resource == null ? '' : ' · $resource'}',
                    ),
                  ],
                ),
              ),
              StatusPill(label: statusLabel, tone: tone),
            ],
          ),
          const SizedBox(height: 20),
          Wrap(
            spacing: 24,
            runSpacing: 16,
            children: [
              _SyncFact(
                label: 'Last synced',
                value: data.lastSyncedAt == null
                    ? 'Not recorded'
                    : formatUtcDateTime(data.lastSyncedAt!),
              ),
              _SyncFact(
                label: 'Watermark',
                value: data.watermark == null
                    ? 'Not recorded'
                    : formatUtcDateTime(data.watermark!),
              ),
              _SyncFact(label: 'Cursor', value: data.cursor ?? 'Cleared'),
              _SyncFact(
                label: 'Job',
                value: data.jobId ?? job?.jobId ?? 'No active job',
              ),
            ],
          ),
          if (error != null) ...[
            const SizedBox(height: 16),
            Text(
              error,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

class _SyncFact extends StatelessWidget {
  const _SyncFact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 135),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.titleSmall),
        ],
      ),
    );
  }
}

class _ResourceList extends StatelessWidget {
  const _ResourceList({required this.resources});

  final List<JobResourceDto> resources;

  @override
  Widget build(BuildContext context) {
    if (resources.isEmpty) {
      return const AppSurface(
        child: EmptyState(
          title: 'No resource progress yet',
          message: 'Queue a sync to start a service job.',
        ),
      );
    }
    return AppSurface(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var index = 0; index < resources.length; index++) ...[
            _ResourceRow(resource: resources[index]),
            if (index != resources.length - 1)
              const Divider(indent: 18, endIndent: 18),
          ],
        ],
      ),
    );
  }
}

class _ResourceRow extends StatelessWidget {
  const _ResourceRow({required this.resource});

  final JobResourceDto resource;

  @override
  Widget build(BuildContext context) {
    final tone = switch (resource.status) {
      JobStatus.succeeded => StatusTone.positive,
      JobStatus.failed || JobStatus.dead => StatusTone.warning,
      JobStatus.running || JobStatus.queued => StatusTone.information,
    };
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  resource.resource,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              StatusPill(label: resource.status.name, tone: tone),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '${resource.recordsRead} read · ${resource.recordsWritten} written',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (resource.cursorFrom != null || resource.cursorTo != null) ...[
            const SizedBox(height: 4),
            Text(
              'Cursor ${resource.cursorTo ?? resource.cursorFrom}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          if (resource.variantsTruncated) ...[
            const SizedBox(height: 8),
            const StatusPill(
              label: 'Variant list incomplete',
              tone: StatusTone.warning,
            ),
          ],
          if (resource.error != null) ...[
            const SizedBox(height: 8),
            Text(
              resource.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

class _SyncNotice extends StatelessWidget {
  const _SyncNotice({
    required this.message,
    required this.stale,
    required this.onRetry,
  });

  final String message;
  final bool stale;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          Expanded(
            child: Text(
              stale ? '$message Showing the last sync response.' : message,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

String _statusLabel(String status) => switch (status) {
  'idle' => 'No sync recorded',
  'queued' => 'Sync queued',
  'running' => 'Sync running',
  'succeeded' => 'Sync completed',
  'failed' => 'Sync failed or awaiting retry',
  'dead' => 'Sync stopped',
  _ => 'Sync state unavailable',
};

IconData _statusIcon(String status) => switch (status) {
  'idle' => Icons.schedule_rounded,
  'queued' => Icons.hourglass_top_rounded,
  'running' => Icons.sync_rounded,
  'succeeded' => Icons.check_circle_outline_rounded,
  'failed' => Icons.schedule_rounded,
  'dead' => Icons.error_outline_rounded,
  _ => Icons.help_outline_rounded,
};
