import 'package:decimal/decimal.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_widgets.dart';
import '../../core/formatters.dart';
import '../../core/insights_provider.dart';
import '../../core/models.dart';

/// Recoverable value from checkouts the shopper started but never completed.
///
/// The service ingested these from the beginning but exposed no way to read
/// them, so a merchant saw the resource listed in their sync progress and had
/// nowhere to open it. This is that surface.
class CheckoutsPage extends StatefulWidget {
  const CheckoutsPage({super.key});

  @override
  State<CheckoutsPage> createState() => _CheckoutsPageState();
}

class _CheckoutsPageState extends State<CheckoutsPage> {
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final controller = context.read<AppController>();
      if (controller.checkouts.status == LoadStatus.idle) {
        controller.loadCheckouts();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.checkouts;
    if (workspace == null) return const SizedBox.shrink();

    final horizontalPadding = MediaQuery.sizeOf(context).width < 600
        ? 20.0
        : 28.0;
    final page = state.page;
    final items = page?.items ?? const <CheckoutDto>[];
    final currency = (page?.currencyCode.isNotEmpty ?? false)
        ? page!.currencyCode
        : workspace.currencyCode;

    return RefreshIndicator(
      onRefresh: () => controller.loadCheckouts(refresh: true),
      child: ListView(
        key: const Key('checkouts-scroll'),
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
                  eyebrow: 'Checkout recovery',
                  title: 'Money left on the table.',
                  description:
                      'Checkouts ${workspace.name} collected but never completed. A checkout that later became an order is excluded, so nothing here is double counted as revenue.',
                ),
                const SizedBox(height: 24),
                if (state.status == LoadStatus.loading)
                  const LinearProgressIndicator(minHeight: 2),
                if (state.error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: _ErrorNotice(
                      message: state.error!,
                      onRetry: () => controller.loadCheckouts(refresh: true),
                    ),
                  ),
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    MetricCard(
                      label: 'Recoverable value',
                      value: page == null
                          ? '—'
                          : formatCurrency(page.recoveredValue, currency),
                      contextLabel:
                          '${items.length} abandoned ${items.length == 1 ? 'checkout' : 'checkouts'} in this window',
                      icon: Icons.savings_outlined,
                      tone: items.isEmpty
                          ? StatusTone.neutral
                          : StatusTone.positive,
                    ),
                    MetricCard(
                      label: 'Average basket',
                      value: page == null || items.isEmpty
                          ? '—'
                          : formatCurrency(
                              (page.recoveredValue /
                                      Decimal.fromInt(items.length))
                                  .toDecimal(),
                              currency,
                            ),
                      contextLabel: 'Across the abandoned checkouts',
                      icon: Icons.shopping_basket_outlined,
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                SectionHeader(
                  title: 'Abandoned checkouts',
                  subtitle: state.isRefreshing
                      ? 'Refreshing'
                      : 'Newest first, in ${controller.range.label}',
                ),
                const SizedBox(height: 12),
                if (state.status == LoadStatus.loading && page == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (items.isEmpty)
                  const EmptyState(
                    icon: Icons.shopping_cart_outlined,
                    title: 'No abandoned checkouts',
                    message:
                        'Nothing started and abandoned in this window. That is the outcome you want.',
                  )
                else
                  ...items.map((checkout) => _CheckoutRow(checkout: checkout)),
                if ((page?.nextCursor?.isNotEmpty ?? false))
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(
                      'More abandoned checkouts exist beyond this page.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CheckoutRow extends StatelessWidget {
  const _CheckoutRow({required this.checkout});

  final CheckoutDto checkout;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppSurface(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    checkout.email ?? 'Guest checkout',
                    style: Theme.of(context).textTheme.titleSmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${checkout.totalUnits} ${checkout.totalUnits == 1 ? 'unit' : 'units'} · started ${formatShortDate(checkout.createdAt)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatCurrency(checkout.totalPrice, checkout.currencyCode),
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 4),
                Text(
                  formatShortDate(checkout.updatedAt),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorNotice extends StatelessWidget {
  const _ErrorNotice({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Expanded(
            child: Text(message, style: Theme.of(context).textTheme.bodyMedium),
          ),
          const SizedBox(width: 12),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
