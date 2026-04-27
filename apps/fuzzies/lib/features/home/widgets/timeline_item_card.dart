import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../models/timeline_item.dart';

class TimelineItemCard extends StatelessWidget {
  const TimelineItemCard({super.key, required this.item});
  final TimelineItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final (label, amount, date, route) = switch (item) {
      ReceiptItem(:final receipt) => (
          receipt.displayTitle,
          receipt.total != null
              ? '${receipt.currency ?? ''} ${receipt.total}'.trim()
              : null,
          receipt.receiptDate,
          '/receipt/${receipt.id}',
        ),
      SaleItem(:final sale) => (
          sale.displayTitle,
          sale.totalRevenue != null
              ? '${sale.currency ?? ''} ${sale.totalRevenue}'.trim()
              : null,
          sale.saleDate,
          '/sale/${sale.id}',
        ),
    };

    final isReceipt = item is ReceiptItem;
    final badgeColor = isReceipt ? ext.infoColor : ext.successColor;
    final badgeLabel = isReceipt ? 'RECEIPT' : 'SALE';

    return InkWell(
      onTap: () => context.push(route),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        decoration: BoxDecoration(
          border: Border.all(color: ext.border, width: 2),
          boxShadow: [ext.cardShadow],
          color: theme.colorScheme.surface,
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 6,
                height: 40,
                color: badgeColor,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          color: badgeColor.withValues(alpha: 0.12),
                          child: Text(
                            badgeLabel,
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: badgeColor,
                              fontSize: 9,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            label,
                            style: theme.textTheme.titleMedium,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (date != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        date,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              if (amount != null) ...[
                const SizedBox(width: 8),
                Text(
                  amount,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
              const SizedBox(width: 4),
              Icon(Icons.chevron_right, size: 16, color: ext.mutedFg),
            ],
          ),
        ),
      ),
    );
  }
}

// Compact version used in search result cards
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
          receipt.receiptDate ?? '',
          receipt.total != null
              ? '${receipt.currency ?? ''} ${receipt.total}'.trim()
              : '',
        ),
      SaleItem(:final sale) => (
          sale.saleDate ?? '',
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
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
            if (sub.isNotEmpty)
              Text(sub, style: theme.textTheme.bodySmall),
            if (amount.isNotEmpty)
              Text(
                amount,
                style: theme.textTheme.labelLarge,
              ),
          ],
        ),
      ),
    );
  }
}
