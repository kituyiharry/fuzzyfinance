import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/theme/app_theme.dart';
import '../../models/sale.dart';

const _lineItemTypes = ['product', 'service'];

class SaleEditPage extends ConsumerStatefulWidget {
  const SaleEditPage({super.key, required this.sale, required this.id});
  final Sale sale;
  final String id;

  @override
  ConsumerState<SaleEditPage> createState() => _SaleEditPageState();
}

class _SaleEditPageState extends ConsumerState<SaleEditPage> {
  late final TextEditingController _documentTitle;
  late final TextEditingController _saleDate;
  late final TextEditingController _totalRevenue;
  late final TextEditingController _totalCost;
  late final TextEditingController _totalMargin;
  late final TextEditingController _currency;
  late final TextEditingController _category;
  late final TextEditingController _notes;
  late final TextEditingController _tags;
  late List<_LineItemState> _lineItems;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final s = widget.sale;
    _documentTitle = TextEditingController(text: s.documentTitle ?? '');
    _saleDate = TextEditingController(text: s.saleDate ?? '');
    _totalRevenue = TextEditingController(text: s.totalRevenue ?? '');
    _totalCost = TextEditingController(text: s.totalCost ?? '');
    _totalMargin = TextEditingController(text: s.totalMargin ?? '');
    _currency = TextEditingController(text: s.currency ?? '');
    _category = TextEditingController(text: s.category ?? '');
    _notes = TextEditingController(text: s.notes ?? '');
    _tags = TextEditingController(text: s.tags.join(', '));
    _lineItems = s.lineItems
        .map((li) => _LineItemState(
              id: li.id,
              description: TextEditingController(text: li.description ?? ''),
              type: li.type ?? 'product',
              unitsSold: TextEditingController(text: li.unitsSold ?? ''),
              buyPrice: TextEditingController(text: li.buyPrice ?? ''),
              sellPrice: TextEditingController(text: li.sellPrice ?? ''),
              total: TextEditingController(text: li.total ?? ''),
            ))
        .toList();
  }

  @override
  void dispose() {
    _documentTitle.dispose();
    _saleDate.dispose();
    _totalRevenue.dispose();
    _totalCost.dispose();
    _totalMargin.dispose();
    _currency.dispose();
    _category.dispose();
    _notes.dispose();
    _tags.dispose();
    for (final li in _lineItems) {
      li.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });

    final tagsRaw = _tags.text.trim();
    final tagsList = tagsRaw.isEmpty
        ? <String>[]
        : tagsRaw.split(',').map((t) => t.trim()).where((t) => t.isNotEmpty).toList();

    final payload = <String, dynamic>{
      if (_documentTitle.text.trim().isNotEmpty)
        'documentTitle': _documentTitle.text.trim(),
      if (_saleDate.text.trim().isNotEmpty) 'saleDate': _saleDate.text.trim(),
      if (_totalRevenue.text.trim().isNotEmpty)
        'totalRevenue': _totalRevenue.text.trim(),
      if (_totalCost.text.trim().isNotEmpty)
        'totalCost': _totalCost.text.trim(),
      if (_totalMargin.text.trim().isNotEmpty)
        'totalMargin': _totalMargin.text.trim(),
      if (_currency.text.trim().isNotEmpty) 'currency': _currency.text.trim(),
      if (_category.text.trim().isNotEmpty) 'category': _category.text.trim(),
      if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      'tags': tagsList,
      'lineItems': _lineItems
          .map((li) => {
                if (li.id != null) 'id': li.id,
                'description': li.description.text.trim(),
                'type': li.type,
                'unitsSold': li.unitsSold.text.trim(),
                'buyPrice': li.buyPrice.text.trim(),
                'sellPrice': li.sellPrice.text.trim(),
                'total': li.total.text.trim(),
              })
          .toList(),
    };

    try {
      final client = ref.read(apiClientProvider);
      await client.dio.patch<void>(Endpoints.sale(widget.id), data: payload);
      if (mounted) Navigator.of(context).pop();
    } on DioException catch (e) {
      setState(() => _error = e.message ?? e.toString());
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    DateTime initial = now;
    final existing = _saleDate.text.trim();
    if (existing.isNotEmpty) {
      final parsed = DateTime.tryParse(existing);
      if (parsed != null) initial = parsed;
    }
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) {
      _saleDate.text =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    }
  }

  void _addLineItem() {
    setState(() {
      _lineItems.add(_LineItemState(
        id: null,
        description: TextEditingController(),
        type: 'product',
        unitsSold: TextEditingController(),
        buyPrice: TextEditingController(),
        sellPrice: TextEditingController(),
        total: TextEditingController(),
      ));
    });
  }

  void _removeLineItem(int index) {
    setState(() {
      _lineItems[index].dispose();
      _lineItems.removeAt(index);
    });
  }

  void _setLineItemType(int index, String type) {
    setState(() => _lineItems[index].type = type);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text('Edit Sale', style: theme.textTheme.titleMedium),
        backgroundColor: theme.scaffoldBackgroundColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: [
          if (_saving)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            TextButton(
              onPressed: _save,
              child: Text('SAVE',
                  style: theme.textTheme.labelLarge
                      ?.copyWith(color: theme.colorScheme.primary)),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              color: ext.dangerColor.withValues(alpha: 0.08),
              child: Text(_error!,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: ext.dangerColor)),
            ),
            const SizedBox(height: 12),
          ],

          _SectionHeader('Details'),
          _EditField(label: 'Document Title', controller: _documentTitle),
          _DateField(
              label: 'Sale Date', controller: _saleDate, onTap: _pickDate),
          _EditField(
              label: 'Total Revenue',
              controller: _totalRevenue,
              keyboardType: TextInputType.number),
          _EditField(
              label: 'Total Cost',
              controller: _totalCost,
              keyboardType: TextInputType.number),
          _EditField(
              label: 'Total Margin',
              controller: _totalMargin,
              keyboardType: TextInputType.number),
          _EditField(label: 'Currency', controller: _currency),
          _EditField(label: 'Category', controller: _category),
          _EditField(label: 'Notes', controller: _notes, maxLines: 3),
          _EditField(
              label: 'Tags',
              controller: _tags,
              hint: 'comma-separated'),

          const SizedBox(height: 20),
          _SectionHeader('Line Items'),
          ..._lineItems.asMap().entries.map((entry) {
            final i = entry.key;
            final li = entry.value;
            return _LineItemEditor(
              index: i,
              state: li,
              onRemove: () => _removeLineItem(i),
              onTypeChanged: (t) => _setLineItemType(i, t),
            );
          }),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _addLineItem,
            icon: const Icon(Icons.add, size: 16),
            label: const Text('ADD LINE ITEM'),
            style: OutlinedButton.styleFrom(
              side: BorderSide(color: ext.border, width: 2),
              shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Line item state holder ────────────────────────────────────────────────────

class _LineItemState {
  _LineItemState({
    required this.id,
    required this.description,
    required this.type,
    required this.unitsSold,
    required this.buyPrice,
    required this.sellPrice,
    required this.total,
  });

  final String? id;
  final TextEditingController description;
  String type;
  final TextEditingController unitsSold;
  final TextEditingController buyPrice;
  final TextEditingController sellPrice;
  final TextEditingController total;

  void dispose() {
    description.dispose();
    unitsSold.dispose();
    buyPrice.dispose();
    sellPrice.dispose();
    total.dispose();
  }
}

// ── Shared form widgets ───────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(fontSize: 11)),
    );
  }
}

class _EditField extends StatelessWidget {
  const _EditField({
    required this.label,
    required this.controller,
    this.hint,
    this.maxLines = 1,
    this.keyboardType,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final int maxLines;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: theme.textTheme.labelLarge
                  ?.copyWith(color: ext.mutedFg, fontSize: 9)),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            maxLines: maxLines,
            keyboardType: keyboardType,
            style: theme.textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle:
                  theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
            ),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.controller,
    required this.onTap,
  });

  final String label;
  final TextEditingController controller;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: theme.textTheme.labelLarge
                  ?.copyWith(color: ext.mutedFg, fontSize: 9)),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            readOnly: true,
            onTap: onTap,
            style: theme.textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: 'YYYY-MM-DD',
              hintStyle:
                  theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
              suffixIcon: Icon(Icons.calendar_today_outlined,
                  size: 16, color: ext.mutedFg),
            ),
          ),
        ],
      ),
    );
  }
}

class _LineItemEditor extends StatelessWidget {
  const _LineItemEditor({
    required this.index,
    required this.state,
    required this.onRemove,
    required this.onTypeChanged,
  });

  final int index;
  final _LineItemState state;
  final VoidCallback onRemove;
  final void Function(String) onTypeChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        border: Border.all(color: ext.border, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('ITEM ${index + 1}',
                  style: theme.textTheme.labelLarge
                      ?.copyWith(color: ext.mutedFg, fontSize: 9)),
              const Spacer(),
              GestureDetector(
                onTap: onRemove,
                child: Icon(Icons.close, size: 16, color: ext.dangerColor),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: state.description,
            style: theme.textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: 'Description',
              hintStyle:
                  theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
            ),
          ),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            initialValue: _lineItemTypes.contains(state.type)
                ? state.type
                : _lineItemTypes.first,
            decoration: InputDecoration(
              labelText: 'TYPE',
              labelStyle: theme.textTheme.labelLarge
                  ?.copyWith(color: ext.mutedFg, fontSize: 9),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
            ),
            items: _lineItemTypes
                .map((t) => DropdownMenuItem(
                      value: t,
                      child: Text(t.toUpperCase(),
                          style: theme.textTheme.bodyMedium),
                    ))
                .toList(),
            onChanged: (v) {
              if (v != null) onTypeChanged(v);
            },
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: state.unitsSold,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    hintText: 'Units sold',
                    hintStyle: theme.textTheme.bodySmall
                        ?.copyWith(color: ext.mutedFg),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: state.buyPrice,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    hintText: 'Buy price',
                    hintStyle: theme.textTheme.bodySmall
                        ?.copyWith(color: ext.mutedFg),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: state.sellPrice,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    hintText: 'Sell price',
                    hintStyle: theme.textTheme.bodySmall
                        ?.copyWith(color: ext.mutedFg),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          TextField(
            controller: state.total,
            keyboardType: TextInputType.number,
            style: theme.textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: 'Total',
              hintStyle:
                  theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
            ),
          ),
        ],
      ),
    );
  }
}
