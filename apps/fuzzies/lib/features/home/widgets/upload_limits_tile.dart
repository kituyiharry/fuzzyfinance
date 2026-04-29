import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../home_provider.dart';

class UploadLimitsTile extends ConsumerWidget {
  const UploadLimitsTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final limits = ref.watch(uploadLimitsProvider);
    final theme = Theme.of(context);
    //final ext = context.fuzzy;

    return Theme(
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: Column(
        // tilePadding: const EdgeInsets.symmetric(horizontal: 16),
        // childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        // enabled: true,
        // title: Text(
        //   'UPLOAD LIMITS',
        //   style: theme.textTheme.labelLarge?.copyWith(color: ext.mutedFg),
        // ),
        // trailing: Icon(
        //   Icons.expand_more,
        //   size: 16,
        //   color: ext.mutedFg,
        // ),
        children: [
          _LimitRow(
            label: 'Receipts today',
            used: limits.receiptsToday,
            total: limits.dailyLimit,
            nearLimit: limits.receiptsNearLimit,
          ),
          const SizedBox(height: 4),
          _LimitRow(
            label: 'Sales today',
            used: limits.salesToday,
            total: limits.dailyLimit,
            nearLimit: limits.salesNearLimit,
          ),
        ],
      ),
    );
  }
}

class _LimitRow extends StatelessWidget {
  const _LimitRow({
    required this.label,
    required this.used,
    required this.total,
    required this.nearLimit,
  });
  final String label;
  final int used;
  final int total;
  final bool nearLimit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final color = nearLimit ? ext.warningColor : ext.mutedFg;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg)),
        Text(
          '$used / $total',
          style: theme.textTheme.bodySmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}
