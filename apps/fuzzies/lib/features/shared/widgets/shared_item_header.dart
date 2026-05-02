import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Centralized Hero tag — used in both the list card (source) and the detail
/// page (destination). Type prefix prevents collisions between receipts and
/// sales that coexist on the same screen.
String itemHeroTag({required String type, required String id}) =>
    '$type-header-$id';

/// The card header widget shared between [TimelineItemCard] and the detail
/// pages. Being pixel-identical in both places is what makes the Hero
/// transition look seamless.
class SharedItemHeader extends StatelessWidget {
  const SharedItemHeader({
    super.key,
    required this.label,
    required this.badgeLabel,
    required this.badgeColor,
    this.date,
    this.amount,
    this.showChevron = true,
    this.margin = const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
  });

  final String label;
  final String badgeLabel;
  final Color badgeColor;
  final String? date;
  final String? amount;
  final bool showChevron;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    return Container(
      margin: margin,
      decoration: BoxDecoration(
        border: Border.all(color: ext.border, width: 2),
        boxShadow: [ext.cardShadow],
        color: theme.colorScheme.surface,
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(width: 6, height: 40, color: badgeColor),
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
                    Text(date!, style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
            if (amount != null) ...[
              const SizedBox(width: 8),
              Text(
                amount!,
                style: theme.textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
            const SizedBox(width: 4),
            if (showChevron)
              Icon(Icons.chevron_right, size: 16, color: ext.mutedFg),
          ],
        ),
      ),
    );
  }
}
