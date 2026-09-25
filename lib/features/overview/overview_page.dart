import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_widgets.dart';
import '../../core/formatters.dart';
import '../../core/insights_provider.dart';
import '../../core/models.dart';
import '../customers/customers_page.dart';

class OverviewPage extends StatelessWidget {
  const OverviewPage({required this.onOpenCatalog, super.key});

  final VoidCallback onOpenCatalog;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.overview;
    final data = state.data;
    if (workspace == null) return const SizedBox.shrink();
    if (data == null && state.status == LoadStatus.failure) {
      return WorkspaceErrorView(
        message: state.error ?? 'The overview could not be loaded.',
        onRetry: controller.loadOverview,
      );
    }
    final horizontalPadding = MediaQuery.sizeOf(context).width < 600
        ? 20.0
        : 28.0;
    return RefreshIndicator(
      onRefresh: controller.refreshAll,
      child: CustomScrollView(
        key: const Key('overview-scroll'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              28,
              horizontalPadding,
              40,
            ),
            sliver: SliverList.list(
              children: [
                PageIntro(
                  eyebrow: workspace.shopDomain,
                  title: 'Commerce, with context.',
                  description:
                      'A connected view of product demand, customer value, and data freshness for ${workspace.name}.',
                  trailing: _RangeSelector(
                    selected: controller.range,
                    onChanged: controller.setRange,
                  ),
                ),
                const SizedBox(height: 24),
                if (state.error != null && data != null)
                  _InlineNotice(
                    message:
                        '${state.error} Showing the last available response.',
                  ),
                if (state.isRefreshing)
                  const LinearProgressIndicator(minHeight: 2),
                if (data == null)
                  const Padding(
                    padding: EdgeInsets.only(top: 80),
                    child: WorkspaceLoadingView(),
                  )
                else ...[
                  const SizedBox(height: 18),
                  _OverviewContent(
                    data: data,
                    currency: data.metrics.currencyCode,
                    onOpenCatalog: onOpenCatalog,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OverviewContent extends StatelessWidget {
  const _OverviewContent({
    required this.data,
    required this.currency,
    required this.onOpenCatalog,
  });

  final OverviewDto data;
  final String currency;
  final VoidCallback onOpenCatalog;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppSurface(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Gross non-cancelled order value',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 10),
              Text(
                formatCurrency(data.metrics.revenue, currency),
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 4),
              Text(
                '${data.metrics.orderCount} orders · ${data.metrics.units} units in ${data.metrics.currencyCode}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Cancelled orders and other currencies are excluded. Refunds are not netted.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${formatUtcDateTime(data.range.from)} – ${formatUtcDateTime(data.range.to)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Service snapshot ${formatUtcDateTime(data.generatedAt)}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),
              RevenueChart(points: data.trend, currency: currency),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _MetricGrid(metrics: data.metrics, currency: currency),
        const SizedBox(height: 16),
        _DataQualityRail(quality: data.dataQuality),
        const SizedBox(height: 16),
        _DataTrustSummary(sync: data.sync),
        const SizedBox(height: 28),
        LayoutBuilder(
          builder: (context, constraints) {
            final customers = _TopCustomers(
              data: data.topCustomers,
              currency: currency,
            );
            final decisions = _DecisionList(decisions: data.decisions);
            if (constraints.maxWidth < 900) {
              return Column(
                children: [customers, const SizedBox(height: 16), decisions],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 5, child: customers),
                const SizedBox(width: 16),
                Expanded(flex: 6, child: decisions),
              ],
            );
          },
        ),
        const SizedBox(height: 16),
        AppSurface(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Wrap(
            spacing: 20,
            runSpacing: 14,
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 620),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Continue with the source records',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Search the live catalog and inspect product demand, availability, and variant completeness.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: onOpenCatalog,
                icon: const Icon(Icons.arrow_forward_rounded),
                label: const Text('Open catalog'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RangeSelector extends StatelessWidget {
  const _RangeSelector({required this.selected, required this.onChanged});

  final InsightRange selected;
  final ValueChanged<InsightRange> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: InsightRange.values
          .map(
            (range) => ChoiceChip(
              label: Text(range.label),
              selected: range == selected,
              onSelected: (_) => onChanged(range),
            ),
          )
          .toList(growable: false),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid({required this.metrics, required this.currency});

  final OverviewMetricsDto metrics;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 980
            ? 4
            : constraints.maxWidth >= 540
            ? 2
            : 1;
        const spacing = 12.0;
        final width =
            (constraints.maxWidth - spacing * (columns - 1)) / columns;
        final cards = [
          MetricCard(
            label: 'Customers',
            value: formatCompactNumber(metrics.customerCount),
            contextLabel: 'profiles in period',
            icon: Icons.people_alt_outlined,
            tone: StatusTone.information,
          ),
          MetricCard(
            label: 'Orders',
            value: formatCompactNumber(metrics.orderCount),
            contextLabel: '${formatCompactNumber(metrics.units)} units',
            icon: Icons.receipt_long_outlined,
          ),
          MetricCard(
            label: 'Average order',
            value: formatCurrency(metrics.averageOrderValue, currency),
            contextLabel: 'selected period',
            icon: Icons.payments_outlined,
            tone: StatusTone.positive,
          ),
          MetricCard(
            label: 'Discount rate',
            value: formatPercent(metrics.discountRate),
            contextLabel: 'selected period',
            icon: Icons.sell_outlined,
          ),
        ];
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: cards
              .map((card) => SizedBox(width: width, child: card))
              .toList(growable: false),
        );
      },
    );
  }
}

class _DataQualityRail extends StatelessWidget {
  const _DataQualityRail({required this.quality});

  final DataQualityDto quality;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      child: Wrap(
        spacing: 24,
        runSpacing: 18,
        children: [
          _QualityItem(
            label: 'Product media',
            value: formatPercent(quality.productMediaCoverage),
          ),
          _QualityItem(
            label: 'Customer media',
            value: formatPercent(quality.customerMediaCoverage),
          ),
          _QualityItem(
            label: 'Customer email',
            value: formatPercent(quality.customerEmailCoverage),
          ),
          _QualityItem(
            label: 'Stock values',
            value: formatPercent(quality.stockCoverage),
          ),
          _QualityItem(
            label: 'Linked orders',
            value: formatPercent(quality.linkedOrderCustomerRate),
          ),
          _QualityItem(
            label: 'Linked customers',
            value: '${quality.linkedOrderCustomers} of ${quality.orderCount}',
          ),
        ],
      ),
    );
  }
}

class _DataTrustSummary extends StatelessWidget {
  const _DataTrustSummary({required this.sync});

  final SyncDto sync;

  @override
  Widget build(BuildContext context) {
    final tone = switch (sync.status) {
      SyncStatus.succeeded => StatusTone.positive,
      SyncStatus.failed || SyncStatus.dead => StatusTone.warning,
      SyncStatus.running || SyncStatus.queued => StatusTone.information,
      SyncStatus.idle => StatusTone.neutral,
    };
    return AppSurface(
      child: Wrap(
        spacing: 24,
        runSpacing: 16,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          StatusPill(label: 'Sync ${sync.status.name}', tone: tone),
          _QualityItem(
            label: 'Last synced',
            value: sync.lastSyncedAt == null
                ? 'Not recorded'
                : formatUtcDateTime(sync.lastSyncedAt!),
          ),
          _QualityItem(
            label: 'Watermark',
            value: sync.watermark == null
                ? 'Not recorded'
                : formatUtcDateTime(sync.watermark!),
          ),
          if (sync.error != null)
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Text(
                sync.error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
        ],
      ),
    );
  }
}

class _QualityItem extends StatelessWidget {
  const _QualityItem({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 130),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

class _TopCustomers extends StatelessWidget {
  const _TopCustomers({required this.data, required this.currency});

  final List<TopCustomerDto> data;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'Customer value',
          subtitle: 'Top linked customers in this period',
        ),
        const SizedBox(height: 12),
        AppSurface(
          padding: EdgeInsets.zero,
          child: data.isEmpty
              ? const EmptyState(
                  title: 'No customer value yet',
                  message: 'The selected period has no linked customer orders.',
                )
              : Column(
                  children: [
                    for (var index = 0; index < data.length; index++) ...[
                      _CustomerRankRow(data: data[index], currency: currency),
                      if (index != data.length - 1)
                        const Divider(indent: 68, endIndent: 20),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _CustomerRankRow extends StatelessWidget {
  const _CustomerRankRow({required this.data, required this.currency});

  final TopCustomerDto data;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final customer = data.customer;
    return InkWell(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => CustomerDetailsPage(customerId: customer.id),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final avatar = Semantics(
              image: true,
              label: 'Profile image for ${customer.displayName}',
              excludeSemantics: true,
              child: CircleAvatar(
                backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                foregroundImage: customer.avatarUrl == null
                    ? null
                    : NetworkImage(customer.avatarUrl!),
                child: customer.avatarUrl == null
                    ? Text(customer.initials)
                    : null,
              ),
            );
            final summary = Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  customer.displayName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 3),
                Text(
                  '${data.orderCount} orders · ${data.units} units',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            );
            final spend = Text(
              formatCurrency(data.spend, currency),
              style: Theme.of(context).textTheme.titleSmall,
            );
            final compact =
                constraints.maxWidth < 340 ||
                MediaQuery.textScalerOf(context).scale(1) > 1.3;
            if (compact) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      avatar,
                      const SizedBox(width: 14),
                      Expanded(child: summary),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Align(alignment: Alignment.centerRight, child: spend),
                ],
              );
            }
            return Row(
              children: [
                avatar,
                const SizedBox(width: 14),
                Expanded(child: summary),
                const SizedBox(width: 12),
                spend,
              ],
            );
          },
        ),
      ),
    );
  }
}

class _DecisionList extends StatelessWidget {
  const _DecisionList({required this.decisions});

  final List<DecisionDto> decisions;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(
          title: 'Decision queue',
          subtitle: 'Signals calculated by the commerce service',
        ),
        const SizedBox(height: 12),
        AppSurface(
          padding: EdgeInsets.zero,
          child: decisions.isEmpty
              ? const EmptyState(
                  title: 'No decisions available',
                  message:
                      'The service has not produced a decision for this period.',
                )
              : Column(
                  children: [
                    for (var index = 0; index < decisions.length; index++) ...[
                      _DecisionRow(decision: decisions[index]),
                      if (index != decisions.length - 1)
                        const Divider(indent: 64, endIndent: 20),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _DecisionRow extends StatelessWidget {
  const _DecisionRow({required this.decision});

  final DecisionDto decision;

  @override
  Widget build(BuildContext context) {
    final tone = switch (decision.priority) {
      DecisionPriority.positive => (
        StatusTone.positive,
        Icons.check_circle_outline_rounded,
      ),
      DecisionPriority.attention => (
        StatusTone.warning,
        Icons.error_outline_rounded,
      ),
      DecisionPriority.information => (
        StatusTone.information,
        Icons.insights_outlined,
      ),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(tone.$2, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      decision.title,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    StatusPill(label: decision.priority.name, tone: tone.$1),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  decision.description,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineNotice extends StatelessWidget {
  const _InlineNotice({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}
