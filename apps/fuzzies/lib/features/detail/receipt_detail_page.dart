import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/cache/local_cache.dart';
import '../../core/theme/app_theme.dart';
import '../../models/receipt.dart';
import 'widgets/torn_receipt_card.dart';

final _receiptDetailProvider =
    FutureProvider.family<Receipt, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final cache = LocalCache.instance;

  final cached = cache.get<Map<String, dynamic>>(CacheKeys.receipt(id));
  if (cached != null) return Receipt.fromJson(cached);

  final resp = await client.dio
      .get<Map<String, dynamic>>(Endpoints.receipt(id));
  await cache.put(CacheKeys.receipt(id), resp.data!);
  return Receipt.fromJson(resp.data!);
});

class ReceiptDetailPage extends ConsumerWidget {
  const ReceiptDetailPage({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_receiptDetailProvider(id));

    return Scaffold(
      appBar: AppBar(title: const Text('RECEIPT')),
      body: async.when(
        loading: () => const Center(
            child: SizedBox(
                width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (receipt) => _ReceiptBody(receipt: receipt),
      ),
    );
  }
}

class _ReceiptBody extends StatelessWidget {
  const _ReceiptBody({required this.receipt});
  final Receipt receipt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final fields = [
      if (receipt.merchantName != null) ('MERCHANT', receipt.merchantName!),
      if (receipt.receiptDate != null) ('DATE', receipt.receiptDate!),
      if (receipt.total != null)
        ('TOTAL', '${receipt.currency ?? ''} ${receipt.total!}'.trim()),
      if (receipt.subtotal != null) ('SUBTOTAL', receipt.subtotal!),
      if (receipt.tax != null) ('TAX', receipt.tax!),
      if (receipt.tip != null) ('TIP', receipt.tip!),
      if (receipt.category != null) ('CATEGORY', receipt.category!),
      if (receipt.paymentMethod != null) ('PAYMENT', receipt.paymentMethod!),
      if (receipt.receiptNumber != null) ('REF#', receipt.receiptNumber!),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 20, 32),
      children: [
        TornReceiptCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Receipt header
              Center(
                child: Text(
                  receipt.merchantName?.toUpperCase() ?? 'RECEIPT',
                  style: theme.textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 4),
              Center(child: _StatusBadge(status: receipt.status.name.toUpperCase())),
              const ReceiptDivider(),

              // Key/value fields
              ...fields.map((f) => _FieldRow(label: f.$1, value: f.$2)),

              // Line items
              if (receipt.lineItems.isNotEmpty) ...[
                const ReceiptDivider(),
                Text('ITEMS', style: theme.textTheme.labelLarge),
                const SizedBox(height: 8),
                ...receipt.lineItems.map((li) => _LineItemRow(
                      description: li.description ?? '',
                      qty: li.qty,
                      unitPrice: li.unitPrice,
                      total: li.total,
                    )),
              ],

              // Tags
              if (receipt.tags.isNotEmpty) ...[
                const ReceiptDivider(),
                Text('TAGS', style: theme.textTheme.labelLarge),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: receipt.tags
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

              // Notes
              if (receipt.notes != null && receipt.notes!.isNotEmpty) ...[
                const ReceiptDivider(),
                Text('NOTES', style: theme.textTheme.labelLarge),
                const SizedBox(height: 4),
                Text(receipt.notes!, style: theme.textTheme.bodyMedium),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

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

class _LineItemRow extends StatelessWidget {
  const _LineItemRow({
    required this.description,
    this.qty,
    this.unitPrice,
    this.total,
  });
  final String description;
  final String? qty;
  final String? unitPrice;
  final String? total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Container(
      margin: const EdgeInsets.only(bottom: 1),
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        border: Border.all(color: ext.borderSubtle),
      ),
      child: Row(
        children: [
          Expanded(child: Text(description, style: theme.textTheme.bodyMedium)),
          if (qty != null)
            Text('x$qty', style: theme.textTheme.bodySmall),
          const SizedBox(width: 8),
          if (total != null)
            Text(total!, style: theme.textTheme.labelLarge),
        ],
      ),
    );
  }
}

