import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/cache/local_cache.dart';
import '../../core/theme/app_theme.dart';
import '../../models/sale.dart';
import '../shared/widgets/torn_item_card.dart';

final _saleDetailProvider =
    FutureProvider.family<Sale, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final cache = LocalCache.instance;

  final cached = cache.get<Map<String, dynamic>>(CacheKeys.sale(id));
  if (cached != null) return Sale.fromJson(cached);

  final resp =
      await client.dio.get<Map<String, dynamic>>(Endpoints.sale(id));
  await cache.put(CacheKeys.sale(id), resp.data!);
  return Sale.fromJson(resp.data!);
});

class SaleDetailPage extends ConsumerWidget {
  const SaleDetailPage({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ext = context.fuzzy;
    final async = ref.watch(_saleDetailProvider(id));

    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: null,
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      body: async.when(
        loading: () => const Center(
          child: SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2)),
        ),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (sale) {
          final amount = sale.totalRevenue != null
              ? '${sale.currency ?? ''} ${sale.totalRevenue}'.trim()
              : null;

          return ListView(
            padding: const EdgeInsets.fromLTRB(0, 4, 4, 32),
            children: [
              Hero(
                tag: itemHeroTag(type: 'sale', id: id),
                flightShuttleBuilder: (_, animation, __, fromCtx, ___) =>
                    AnimatedBuilder(
                      animation: animation,
                      builder: (_, child) =>
                          Material(color: Colors.transparent, child: child),
                      child: fromCtx.widget,
                    ),
                child: TornItemCard(
                  label: sale.displayTitle,
                  badgeLabel: 'SALE',
                  badgeColor: ext.successColor,
                  date: sale.createdAt,
                  amount: amount,
                  status: sale.status.name,
                  showChevron: false,
                  hasTornEdge: true,
                  margin: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 4),
                  autoExpand: true,
                  body: _SaleBodyContent(sale: sale),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ── Body content ──────────────────────────────────────────────────────────────

class _SaleBodyContent extends StatelessWidget {
  const _SaleBodyContent({required this.sale});
  final Sale sale;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final fields = [
      if (sale.documentTitle != null) ('DOCUMENT', sale.documentTitle!),
      if (sale.saleDate != null) ('DATE', sale.saleDate!),
      if (sale.totalRevenue != null)
        ('REVENUE', '${sale.currency ?? ''} ${sale.totalRevenue!}'.trim()),
      if (sale.totalCost != null)
        ('COST', '${sale.currency ?? ''} ${sale.totalCost!}'.trim()),
      if (sale.totalMargin != null) ('MARGIN', sale.totalMargin!),
      if (sale.category != null) ('CATEGORY', sale.category!),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...fields.map((f) => _FieldRow(label: f.$1, value: f.$2)),

        if (sale.lineItems.isNotEmpty) ...[
          const ItemCardDivider(),
          Text('ITEMS', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          ...sale.lineItems.map((li) => _SaleLineItemRow(item: li)),
        ],

        if (sale.tags.isNotEmpty) ...[
          const ItemCardDivider(),
          Text('TAGS', style: theme.textTheme.labelLarge),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: sale.tags
                .map((t) => Chip(
                      label: Text(t.toUpperCase(),
                          style: theme.textTheme.labelLarge
                              ?.copyWith(fontSize: 10)),
                      shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.zero),
                      side: BorderSide(color: ext.border),
                      backgroundColor: ext.muted,
                    ))
                .toList(),
          ),
        ],

        if (sale.notes != null && sale.notes!.isNotEmpty) ...[
          const ItemCardDivider(),
          Text('NOTES', style: theme.textTheme.labelLarge),
          const SizedBox(height: 4),
          Text(sale.notes!, style: theme.textTheme.bodyMedium),
        ],

        const SizedBox(height: 8),
      ],
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final ext = context.fuzzy;
    final color = switch (status.toLowerCase()) {
      'complete' || 'completenosync' => ext.successColor,
      'failed' => ext.dangerColor,
      'staged' => ext.infoColor,
      _ => ext.mutedFg,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      color: color.withValues(alpha: 0.12),
      child: Text(
        status,
        style: Theme.of(context)
            .textTheme
            .labelLarge
            ?.copyWith(color: color, fontSize: 10),
      ),
    );
  }
}

class _FieldRow extends StatelessWidget {
  const _FieldRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(label,
                style: theme.textTheme.labelLarge
                    ?.copyWith(color: ext.mutedFg, fontSize: 10)),
          ),
          Expanded(child: Text(value, style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}

class _SaleLineItemRow extends StatelessWidget {
  const _SaleLineItemRow({required this.item});
  final SaleLineItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Container(
      margin: const EdgeInsets.only(bottom: 1),
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration:
          BoxDecoration(border: Border.all(color: ext.borderSubtle)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (item.description != null)
                  Text(item.description!, style: theme.textTheme.bodyMedium),
                if (item.type != null)
                  Text(item.type!.toUpperCase(),
                      style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          if (item.unitsSold != null)
            Text('x${item.unitsSold}', style: theme.textTheme.bodySmall),
          const SizedBox(width: 8),
          if (item.total != null)
            Text(item.total!, style: theme.textTheme.labelLarge),
        ],
      ),
    );
  }
}
