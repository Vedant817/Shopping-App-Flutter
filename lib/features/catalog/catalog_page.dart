import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_widgets.dart';
import '../../core/formatters.dart';
import '../../core/insights_provider.dart';
import '../../core/models.dart';

class CatalogPage extends StatefulWidget {
  const CatalogPage({super.key});

  @override
  State<CatalogPage> createState() => _CatalogPageState();
}

class _CatalogPageState extends State<CatalogPage> {
  final _searchController = TextEditingController();
  final _knownCategories = <String>{};
  String? _categoryWorkspaceId;
  String _category = '';
  bool _requested = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_requested) return;
    _requested = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<AppController>().ensureProducts();
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
    final state = controller.catalog;
    if (workspace == null) return const SizedBox.shrink();
    if (_categoryWorkspaceId != workspace.id) {
      _categoryWorkspaceId = workspace.id;
      _knownCategories.clear();
      _category = '';
    }
    for (final product in state.items) {
      final category = product.category;
      if (category != null && category.isNotEmpty) {
        _knownCategories.add(category);
      }
    }
    final categories = _knownCategories.toList(growable: false)..sort();
    final horizontalPadding = MediaQuery.sizeOf(context).width < 600
        ? 20.0
        : 28.0;
    return RefreshIndicator(
      onRefresh: () => controller.refreshProducts(
        query: _searchController.text,
        category: _category,
      ),
      child: CustomScrollView(
        key: const Key('catalog-scroll'),
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
                  eyebrow: 'Catalog intelligence',
                  title: 'Products, not pages.',
                  description:
                      'Search live product records, inspect availability, and open a product for its complete server detail.',
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _searchController,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (value) => controller.refreshProducts(
                    query: value,
                    category: _category,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Search title, handle, vendor, category, or SKU',
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _searchController.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Clear search',
                            onPressed: () {
                              _searchController.clear();
                              controller.refreshProducts(
                                query: '',
                                category: _category,
                              );
                              setState(() {});
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('All'),
                      selected: _category.isEmpty,
                      onSelected: (_) {
                        setState(() => _category = '');
                        controller.refreshProducts(
                          query: _searchController.text,
                          category: '',
                        );
                      },
                    ),
                    for (final category in categories)
                      ChoiceChip(
                        label: Text(category),
                        selected: _category == category,
                        onSelected: (_) {
                          setState(() => _category = category);
                          controller.refreshProducts(
                            query: _searchController.text,
                            category: category,
                          );
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                if (state.error != null)
                  _CatalogNotice(
                    message: state.error!,
                    stale: state.items.isNotEmpty,
                    onRetry: () => controller.refreshProducts(
                      query: _searchController.text,
                      category: _category,
                    ),
                  ),
                if (state.isRefreshing)
                  const LinearProgressIndicator(minHeight: 2),
                const SizedBox(height: 14),
                SectionHeader(
                  title: '${state.items.length} products',
                  subtitle:
                      'Server search · cursor pagination · ${workspace.currencyCode}',
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
                title: 'No products match',
                message: state.error == null
                    ? 'Try another search or clear the category filter.'
                    : 'The service did not return products for this request.',
                action: OutlinedButton(
                  onPressed: () {
                    _searchController.clear();
                    setState(() => _category = '');
                    controller.refreshProducts(query: '', category: '');
                  },
                  child: const Text('Clear filters'),
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
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  if (index == state.items.length) {
                    return OutlinedButton.icon(
                      onPressed: state.isLoadingMore
                          ? null
                          : controller.loadMoreProducts,
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
                  final product = state.items[index];
                  return _ProductCard(
                    product: product,
                    currency: workspace.currencyCode,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            ProductDetailsPage(productId: product.id),
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

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.currency,
    required this.onTap,
  });

  final ProductDto product;
  final String currency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      padding: EdgeInsets.zero,
      onTap: onTap,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 520;
          final image = AspectRatio(
            aspectRatio: compact ? 16 / 9 : 4 / 3,
            child: RemoteImage(
              url: product.thumbnail ?? '',
              semanticLabel: 'Image of ${product.title}',
              width: double.infinity,
              height: double.infinity,
              borderRadius: BorderRadius.zero,
            ),
          );
          final details = Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (product.category != null)
                      StatusPill(
                        label: product.category!,
                        tone: StatusTone.information,
                      ),
                    StatusPill(label: product.status),
                    if (product.variantsTruncated)
                      const StatusPill(
                        label: 'Variants incomplete',
                        tone: StatusTone.warning,
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  product.title,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  [product.vendor, product.sku]
                      .whereType<String>()
                      .where((value) => value.isNotEmpty)
                      .join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 16),
                Builder(
                  builder: (context) {
                    final price = Text(
                      formatNullableCurrency(
                        product.priceMin ?? product.priceMax,
                        currency,
                      ),
                      style: Theme.of(context).textTheme.titleLarge,
                    );
                    final stock = Text(
                      '${product.inventoryQuantity ?? '—'} in stock',
                      style: Theme.of(context).textTheme.bodySmall,
                    );
                    if (MediaQuery.textScalerOf(context).scale(1) > 1.3) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [price, const SizedBox(height: 6), stock],
                      );
                    }
                    return Row(
                      children: [
                        Expanded(child: price),
                        stock,
                      ],
                    );
                  },
                ),
              ],
            ),
          );
          if (compact) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [image, details],
            );
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 180, child: image),
              Expanded(child: details),
            ],
          );
        },
      ),
    );
  }
}

class ProductDetailsPage extends StatefulWidget {
  const ProductDetailsPage({required this.productId, super.key});

  final String productId;

  @override
  State<ProductDetailsPage> createState() => _ProductDetailsPageState();
}

class _ProductDetailsPageState extends State<ProductDetailsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        context.read<AppController>().loadProductDetail(widget.productId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final workspace = controller.selectedWorkspace;
    final state = controller.productDetail;
    final detail = state.requestedId == widget.productId ? state.data : null;
    return Scaffold(
      appBar: AppBar(
        title: Text('Product · ${workspace?.name ?? 'Workspace'}'),
      ),
      body: SafeArea(
        child: detail == null
            ? state.status == LoadStatus.failure
                  ? WorkspaceErrorView(
                      message:
                          state.error ?? 'The product could not be loaded.',
                      onRetry: () =>
                          controller.loadProductDetail(widget.productId),
                    )
                  : const WorkspaceLoadingView()
            : _ProductDetailBody(
                detail: detail,
                currency: workspace?.currencyCode ?? '',
              ),
      ),
    );
  }
}

class _ProductDetailBody extends StatelessWidget {
  const _ProductDetailBody({required this.detail, required this.currency});

  final ProductDetailDto detail;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final product = detail.product;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: RemoteImage(
                    url: product.thumbnail ?? '',
                    semanticLabel: 'Image of ${product.title}',
                    width: double.infinity,
                    height: double.infinity,
                    borderRadius: BorderRadius.zero,
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (product.category != null)
                    StatusPill(
                      label: product.category!,
                      tone: StatusTone.information,
                    ),
                  StatusPill(label: product.status),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                product.title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                product.description ??
                    'No description was supplied by the source.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 22),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  MetricCard(
                    label: 'Price range',
                    value: formatNullableCurrency(product.priceMin, currency),
                    icon: Icons.sell_outlined,
                  ),
                  MetricCard(
                    label: 'Inventory',
                    value: '${product.inventoryQuantity ?? '—'}',
                    icon: Icons.inventory_2_outlined,
                  ),
                  MetricCard(
                    label: 'Period revenue',
                    value: formatCurrency(
                      detail.periodDemand.revenue,
                      detail.periodDemand.currencyCode,
                    ),
                    icon: Icons.insights_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 24),
              SectionHeader(
                title: 'Variants',
                subtitle: product.variantsTruncated
                    ? 'The service marked this list incomplete'
                    : 'All variants returned by the service',
              ),
              const SizedBox(height: 12),
              AppSurface(
                padding: EdgeInsets.zero,
                child: product.variants.isEmpty
                    ? const EmptyState(
                        title: 'No variants returned',
                        message:
                            'The service returned no variant records for this product.',
                      )
                    : Column(
                        children: [
                          for (
                            var index = 0;
                            index < product.variants.length;
                            index++
                          ) ...[
                            _VariantRow(
                              variant: product.variants[index],
                              currency: currency,
                            ),
                            if (index != product.variants.length - 1)
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

class _VariantRow extends StatelessWidget {
  const _VariantRow({required this.variant, required this.currency});

  final ProductVariantDto variant;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(variant.title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            [
              variant.sku,
              variant.inventoryQuantity == null
                  ? null
                  : '${variant.inventoryQuantity} available',
            ].whereType<String>().join(' · '),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              formatCurrency(variant.price, currency),
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _CatalogNotice extends StatelessWidget {
  const _CatalogNotice({
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
