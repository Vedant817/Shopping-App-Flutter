import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_widgets.dart';
import '../../core/formatters.dart';
import '../../core/insights_provider.dart';
import '../../core/models.dart';

class CustomersPage extends StatefulWidget {
  const CustomersPage({super.key});

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  final _searchController = TextEditingController();
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<AppController>().ensureCustomers();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.customers;
    if (workspace == null) return const SizedBox.shrink();
    final horizontalPadding = MediaQuery.sizeOf(context).width < 600
        ? 20.0
        : 28.0;
    return RefreshIndicator(
      onRefresh: () => controller.searchCustomers(_searchController.text),
      child: CustomScrollView(
        key: const Key('customers-scroll'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(
              horizontalPadding,
              28,
              horizontalPadding,
              12,
            ),
            sliver: SliverList.list(
              children: [
                const PageIntro(
                  eyebrow: 'Customer intelligence',
                  title: 'Value behind the order.',
                  description:
                      'Search the server index, inspect period metrics, and open recent orders without leaving the active workspace.',
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: controller.searchCustomers,
                  decoration: InputDecoration(
                    hintText: 'Search name, email, company, city, or ID',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _searchController.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear search',
                            onPressed: () {
                              _searchController.clear();
                              controller.searchCustomers('');
                              setState(() {});
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                ),
                const SizedBox(height: 18),
                if (state.error != null)
                  _CustomerNotice(
                    message: state.error!,
                    stale: state.items.isNotEmpty,
                    onRetry: () =>
                        controller.searchCustomers(_searchController.text),
                  ),
                if (state.isRefreshing)
                  const LinearProgressIndicator(minHeight: 2),
                const SizedBox(height: 14),
                SectionHeader(
                  title: '${state.items.length} customers',
                  subtitle: 'Server period metrics · ${workspace.currencyCode}',
                ),
              ],
            ),
          ),
          if (state.status == LoadStatus.loading && state.items.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: WorkspaceLoadingView(),
            )
          else if (state.items.isEmpty)
            SliverToBoxAdapter(
              child: EmptyState(
                title: 'No customers match',
                message: 'Try another search term or clear the query.',
                action: OutlinedButton(
                  onPressed: () {
                    _searchController.clear();
                    setState(() {});
                    controller.searchCustomers('');
                  },
                  child: const Text('Clear search'),
                ),
              ),
            )
          else
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                0,
                horizontalPadding,
                40,
              ),
              sliver: SliverList.separated(
                itemCount:
                    state.items.length + (state.nextCursor == null ? 0 : 1),
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  if (index == state.items.length) {
                    return OutlinedButton.icon(
                      onPressed: state.isLoadingMore
                          ? null
                          : controller.loadMoreCustomers,
                      icon: state.isLoadingMore
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.expand_more_rounded),
                      label: Text(
                        state.isLoadingMore ? 'Loading' : 'Load more',
                      ),
                    );
                  }
                  final customer = state.items[index];
                  return _CustomerCard(
                    customer: customer,
                    currency: workspace.currencyCode,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            CustomerDetailsPage(customerId: customer.id),
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({
    required this.customer,
    required this.currency,
    required this.onTap,
  });

  final CustomerDto customer;
  final String currency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final avatar = Semantics(
      image: true,
      label: 'Profile image for ${customer.displayName}',
      excludeSemantics: true,
      child: CircleAvatar(
        radius: 25,
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
        foregroundImage: customer.avatarUrl == null
            ? null
            : NetworkImage(customer.avatarUrl!),
        child: customer.avatarUrl == null ? Text(customer.initials) : null,
      ),
    );
    final identity = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          customer.displayName,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (customer.email != null) ...[
          const SizedBox(height: 4),
          Text(
            customer.email!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (customer.location.isNotEmpty) ...[
          const SizedBox(height: 3),
          Text(
            customer.location,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
    final metrics = Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          formatNullableCurrency(customer.periodSpend, currency),
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 4),
        Text(
          '${customer.periodOrderCount ?? '—'} orders',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
    return AppSurface(
      padding: const EdgeInsets.all(16),
      onTap: onTap,
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth < 520) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                avatar,
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      identity,
                      const SizedBox(height: 10),
                      Align(alignment: Alignment.centerRight, child: metrics),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right_rounded),
              ],
            );
          }
          return Row(
            children: [
              avatar,
              const SizedBox(width: 14),
              Expanded(child: identity),
              const SizedBox(width: 12),
              metrics,
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right_rounded),
            ],
          );
        },
      ),
    );
  }
}

class CustomerDetailsPage extends StatefulWidget {
  const CustomerDetailsPage({required this.customerId, super.key});

  final String customerId;

  @override
  State<CustomerDetailsPage> createState() => _CustomerDetailsPageState();
}

class _CustomerDetailsPageState extends State<CustomerDetailsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<AppController>().loadCustomerDetail(widget.customerId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.customerDetail;
    final detail = state.requestedId == widget.customerId ? state.data : null;
    return Scaffold(
      appBar: AppBar(
        title: Text('Customer · ${workspace?.name ?? 'Workspace'}'),
      ),
      body: SafeArea(
        child: detail == null
            ? state.status == LoadStatus.failure
                  ? WorkspaceErrorView(
                      message:
                          state.error ?? 'The customer could not be loaded.',
                      onRetry: () =>
                          controller.loadCustomerDetail(widget.customerId),
                    )
                  : const WorkspaceLoadingView()
            : _CustomerDetailBody(
                detail: detail,
                currency: workspace?.currencyCode ?? '',
              ),
      ),
    );
  }
}

class _CustomerDetailBody extends StatelessWidget {
  const _CustomerDetailBody({required this.detail, required this.currency});

  final CustomerDetailDto detail;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final customer = detail.customer;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppSurface(
                child: Wrap(
                  spacing: 18,
                  runSpacing: 16,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    CircleAvatar(
                      radius: 34,
                      backgroundColor: Theme.of(
                        context,
                      ).colorScheme.primaryContainer,
                      foregroundImage: customer.avatarUrl == null
                          ? null
                          : NetworkImage(customer.avatarUrl!),
                      child: customer.avatarUrl == null
                          ? Text(
                              customer.initials,
                              style: Theme.of(context).textTheme.titleLarge,
                            )
                          : null,
                    ),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 520),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            customer.displayName,
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          if (customer.email != null) ...[
                            const SizedBox(height: 6),
                            SelectableText(customer.email!),
                          ],
                          if (customer.location.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(customer.location),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  MetricCard(
                    label: 'Period order value',
                    value: formatNullableCurrency(
                      detail.periodDemand.revenue,
                      detail.periodDemand.currencyCode,
                    ),
                    icon: Icons.account_balance_wallet_outlined,
                  ),
                  MetricCard(
                    label: 'Period orders',
                    value: '${detail.periodDemand.orderCount}',
                    icon: Icons.receipt_long_outlined,
                  ),
                  MetricCard(
                    label: 'Units',
                    value: '${detail.periodDemand.units}',
                    icon: Icons.inventory_2_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Gross non-cancelled orders in ${detail.periodDemand.currencyCode}; refunds are not netted.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),
              const SectionHeader(
                title: 'Profile context',
                subtitle: 'Fields returned by the service',
              ),
              const SizedBox(height: 12),
              AppSurface(
                child: Column(
                  children: [
                    _DetailLine(
                      label: 'Company',
                      value: customer.company ?? 'Not supplied',
                    ),
                    const Divider(height: 24),
                    _DetailLine(label: 'Customer ID', value: customer.id),
                    const Divider(height: 24),
                    _DetailLine(
                      label: 'Location',
                      value: customer.location.isEmpty
                          ? 'Not supplied'
                          : customer.location,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const SectionHeader(
                title: 'Recent orders',
                subtitle: 'Authorized orders returned by the service',
              ),
              const SizedBox(height: 12),
              AppSurface(
                padding: EdgeInsets.zero,
                child: detail.recentOrders.isEmpty
                    ? const EmptyState(
                        title: 'No recent orders',
                        message:
                            'This customer has no linked orders in the selected period.',
                      )
                    : Column(
                        children: [
                          for (
                            var index = 0;
                            index < detail.recentOrders.length;
                            index++
                          ) ...[
                            _OrderRow(order: detail.recentOrders[index]),
                            if (index != detail.recentOrders.length - 1)
                              const Divider(indent: 18, endIndent: 18),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ),
        Expanded(child: SelectableText(value)),
      ],
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order});

  final OrderDto order;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            order.name ?? order.id,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            '${formatShortDate(order.orderedAt)} · ${order.totalUnits} units${order.cancelledAt == null ? '' : ' · cancelled'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              formatCurrency(order.totalPrice, order.currencyCode),
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerNotice extends StatelessWidget {
  const _CustomerNotice({
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
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              stale ? '$message Showing loaded records.' : message,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
