import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/fuzzy_date.dart';
import '../../../features/shared/widgets/torn_item_card.dart';
import '../../../models/timeline_item.dart';

class TimelineItemCard extends StatelessWidget {
  const TimelineItemCard({super.key, required this.item});
  final TimelineItem item;

  @override
  Widget build(BuildContext context) {
    final ext = context.fuzzy;

    final isReceipt = item is ReceiptItem;
    final badgeColor = isReceipt ? ext.infoColor : ext.successColor;
    final badgeLabel = isReceipt ? 'RECEIPT' : 'SALE';

    final (label, amount, date, status, route) = switch (item) {
      ReceiptItem(:final receipt) => (
          receipt.displayTitle,
          receipt.total != null
              ? '${receipt.currency ?? ''} ${receipt.total}'.trim()
              : null,
          receipt.createdAt,
          receipt.status.name,
          '/receipt/${receipt.id}',
        ),
      SaleItem(:final sale) => (
          sale.displayTitle,
          sale.totalRevenue != null
              ? '${sale.currency ?? ''} ${sale.totalRevenue}'.trim()
              : null,
          sale.createdAt,
          sale.status.name,
          '/sale/${sale.id}',
        ),
    };

    final tag = itemHeroTag(
      type: isReceipt ? 'receipt' : 'sale',
      id: item.id,
    );

    return InkWell(
      onTap: () => context.push(route),
      child: Hero(
        tag: tag,
        // Transparent Material prevents Raleway text rendering with yellow
        // underlines when the widget is in the Navigator Overlay during flight.
        flightShuttleBuilder: (_, animation, __, fromCtx, ___) =>
            AnimatedBuilder(
              animation: animation,
              builder: (_, child) =>
                  Material(color: Colors.transparent, child: child),
              child: fromCtx.widget,
            ),
        child: TornItemCard(
          label: label,
          badgeLabel: badgeLabel,
          badgeColor: badgeColor,
          date: date,
          amount: amount,
          status: status,
          showChevron: true,
          hasTornEdge: false,
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        ),
      ),
    );
  }
}

// Compact version used in search result cards (unchanged).
class SearchResultCard extends StatelessWidget {
  const SearchResultCard({super.key, required this.item, required this.onTap});
  final TimelineItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final isReceipt = item is ReceiptItem;
    final badgeColor = isReceipt ? ext.infoColor : ext.successColor;

    final (sub, amount) = switch (item) {
      ReceiptItem(:final receipt) => (
          fuzzyDate(receipt.createdAt),
          receipt.total != null
              ? '${receipt.currency ?? ''} ${receipt.total}'.trim()
              : '',
        ),
      SaleItem(:final sale) => (
          fuzzyDate(sale.createdAt),
          sale.totalRevenue != null
              ? '${sale.currency ?? ''} ${sale.totalRevenue}'.trim()
              : '',
        ),
    };

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 160,
        margin: const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          border: Border.all(color: ext.border, width: 2),
          boxShadow: [ext.cardShadow],
          color: theme.colorScheme.surface,
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              color: badgeColor.withValues(alpha: 0.12),
              child: Text(
                isReceipt ? 'RECEIPT' : 'SALE',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: badgeColor,
                  fontSize: 9,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              item.displayTitle,
              style: theme.textTheme.titleMedium,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const Spacer(),
            if (sub.isNotEmpty) Text(sub, style: theme.textTheme.bodySmall),
            if (amount.isNotEmpty)
              Text(amount, style: theme.textTheme.labelLarge),
          ],
        ),
      ),
    );
  }
}
