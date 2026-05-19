import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/constants/expense_categories.dart';
import '../../core/theme/app_theme.dart';
import '../../models/receipt.dart';

class ReceiptEditPage extends ConsumerStatefulWidget {
  const ReceiptEditPage({super.key, required this.receipt, required this.id});
  final Receipt receipt;
  final String id;

  @override
  ConsumerState<ReceiptEditPage> createState() => _ReceiptEditPageState();
}

class _ReceiptEditPageState extends ConsumerState<ReceiptEditPage> {
  late final TextEditingController _merchantName;
  late final TextEditingController _receiptDate;
  late final TextEditingController _total;
  late final TextEditingController _subtotal;
  late final TextEditingController _tax;
  late final TextEditingController _tip;
  late final TextEditingController _currency;
  late final TextEditingController _paymentMethod;
  late final TextEditingController _receiptNumber;
  late final TextEditingController _category;
  late final TextEditingController _notes;
  late final TextEditingController _tags;
  late List<_LineItemState> _lineItems;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final r = widget.receipt;
    _merchantName = TextEditingController(text: r.merchantName ?? '');
    _receiptDate = TextEditingController(text: r.receiptDate ?? '');
    _total = TextEditingController(text: r.total ?? '');
    _subtotal = TextEditingController(text: r.subtotal ?? '');
    _tax = TextEditingController(text: r.tax ?? '');
    _tip = TextEditingController(text: r.tip ?? '');
    _currency = TextEditingController(text: r.currency ?? '');
    _paymentMethod = TextEditingController(text: r.paymentMethod ?? '');
    _receiptNumber = TextEditingController(text: r.receiptNumber ?? '');
    _category = TextEditingController(text: r.category ?? '');
    _notes = TextEditingController(text: r.notes ?? '');
    _tags = TextEditingController(text: r.tags.join(', '));
    _lineItems = r.lineItems.map((li) {
      final validSecondary = li.secondaryCategory?.isNotEmpty == true &&
              secondaryOptionsFor(li.primaryCategory).contains(li.secondaryCategory)
          ? li.secondaryCategory
          : null;
      return _LineItemState(
        id: li.id,
        description: TextEditingController(text: li.description ?? ''),
        qty: TextEditingController(text: li.qty ?? ''),
        unitPrice: TextEditingController(text: li.unitPrice ?? ''),
        total: TextEditingController(text: li.total ?? ''),
        primaryCategory:
            li.primaryCategory?.isNotEmpty == true ? li.primaryCategory : null,
        secondaryCategory: validSecondary,
      );
    }).toList();
  }

  @override
  void dispose() {
    _merchantName.dispose();
    _receiptDate.dispose();
    _total.dispose();
    _subtotal.dispose();
    _tax.dispose();
    _tip.dispose();
    _currency.dispose();
    _paymentMethod.dispose();
    _receiptNumber.dispose();
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
      if (_merchantName.text.trim().isNotEmpty)
        'merchantName': _merchantName.text.trim(),
      if (_receiptDate.text.trim().isNotEmpty)
        'receiptDate': _receiptDate.text.trim(),
      if (_total.text.trim().isNotEmpty) 'total': _total.text.trim(),
      if (_subtotal.text.trim().isNotEmpty) 'subtotal': _subtotal.text.trim(),
      if (_tax.text.trim().isNotEmpty) 'tax': _tax.text.trim(),
      if (_tip.text.trim().isNotEmpty) 'tip': _tip.text.trim(),
      if (_currency.text.trim().isNotEmpty) 'currency': _currency.text.trim(),
      if (_paymentMethod.text.trim().isNotEmpty)
        'paymentMethod': _paymentMethod.text.trim(),
      if (_receiptNumber.text.trim().isNotEmpty)
        'receiptNumber': _receiptNumber.text.trim(),
      if (_category.text.trim().isNotEmpty) 'category': _category.text.trim(),
      if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      'tags': tagsList,
      'lineItems': _lineItems
          .map((li) => {
                if (li.id != null) 'id': li.id,
                'description': li.description.text.trim(),
                'qty': li.qty.text.trim(),
                'unitPrice': li.unitPrice.text.trim(),
                'total': li.total.text.trim(),
                if (li.primaryCategory != null)
                  'primaryCategory': li.primaryCategory,
                if (li.secondaryCategory != null)
                  'secondaryCategory': li.secondaryCategory,
              })
          .toList(),
    };

    try {
      final client = ref.read(apiClientProvider);
      await client.dio.patch<void>(Endpoints.receipt(widget.id), data: payload);
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
    final existing = _receiptDate.text.trim();
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
      _receiptDate.text =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    }
  }

  void _addLineItem() {
    setState(() {
      _lineItems.add(_LineItemState(
        id: null,
        description: TextEditingController(),
        qty: TextEditingController(),
        unitPrice: TextEditingController(),
        total: TextEditingController(),
        primaryCategory: null,
        secondaryCategory: null,
      ));
    });
  }

  void _removeLineItem(int index) {
    setState(() {
      _lineItems[index].dispose();
      _lineItems.removeAt(index);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text('Edit Receipt', style: theme.textTheme.titleMedium),
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
          _EditField(label: 'Merchant', controller: _merchantName),
          _DateField(
              label: 'Date', controller: _receiptDate, onTap: _pickDate),
          _EditField(label: 'Total', controller: _total, keyboardType: TextInputType.number),
          _EditField(label: 'Subtotal', controller: _subtotal, keyboardType: TextInputType.number),
          _EditField(label: 'Tax', controller: _tax, keyboardType: TextInputType.number),
          _EditField(label: 'Tip', controller: _tip, keyboardType: TextInputType.number),
          _EditField(label: 'Currency', controller: _currency),
          _EditField(label: 'Payment Method', controller: _paymentMethod),
          _EditField(label: 'Receipt #', controller: _receiptNumber),
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
    required this.qty,
    required this.unitPrice,
    required this.total,
    this.primaryCategory,
    this.secondaryCategory,
  });

  final String? id;
  final TextEditingController description;
  final TextEditingController qty;
  final TextEditingController unitPrice;
  final TextEditingController total;
  String? primaryCategory;
  String? secondaryCategory;

  void dispose() {
    description.dispose();
    qty.dispose();
    unitPrice.dispose();
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

class _LineItemEditor extends StatefulWidget {
  const _LineItemEditor({
    required this.index,
    required this.state,
    required this.onRemove,
  });

  final int index;
  final _LineItemState state;
  final VoidCallback onRemove;

  @override
  State<_LineItemEditor> createState() => _LineItemEditorState();
}

class _LineItemEditorState extends State<_LineItemEditor> {
  late String? _primary;
  late String? _secondary;

  @override
  void initState() {
    super.initState();
    _primary = widget.state.primaryCategory;
    _secondary = widget.state.secondaryCategory;
  }

  void _onPrimaryChanged(String? val) {
    setState(() {
      _primary = val;
      _secondary = null;
      widget.state.primaryCategory = val;
      widget.state.secondaryCategory = null;
    });
  }

  void _onSecondaryChanged(String? val) {
    setState(() {
      _secondary = val;
      widget.state.secondaryCategory = val;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final secondaryOpts = secondaryOptionsFor(_primary);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(border: Border.all(color: ext.border, width: 1)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('ITEM ${widget.index + 1}',
                  style: theme.textTheme.labelLarge
                      ?.copyWith(color: ext.mutedFg, fontSize: 9)),
              const Spacer(),
              GestureDetector(
                onTap: widget.onRemove,
                child: Icon(Icons.close, size: 16, color: ext.dangerColor),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: widget.state.description,
            style: theme.textTheme.bodyMedium,
            decoration: InputDecoration(
              hintText: 'Description',
              hintStyle: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
              contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              isDense: true,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: widget.state.qty,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    hintText: 'Qty',
                    hintStyle: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: widget.state.unitPrice,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    hintText: 'Unit price',
                    hintStyle: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: widget.state.total,
                  keyboardType: TextInputType.number,
                  style: theme.textTheme.bodyMedium,
                  decoration: InputDecoration(
                    hintText: 'Total',
                    hintStyle: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    isDense: true,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Primary category
          _DropdownField(
            label: 'Primary Category',
            value: _primary,
            items: const ['General', ...kPrimaryCategories],
            hint: '— Select —',
            onChanged: _onPrimaryChanged,
          ),
          const SizedBox(height: 6),
          // Secondary category
          if (secondaryOpts.isNotEmpty)
            _DropdownField(
              label: 'Secondary Category',
              value: _secondary,
              items: secondaryOpts,
              hint: '— Select —',
              onChanged: _onSecondaryChanged,
            )
          else
            _DisabledDropdownField(label: 'Secondary Category'),
        ],
      ),
    );
  }
}

// ── Dropdown form fields ──────────────────────────────────────────────────────

class _DropdownField extends StatelessWidget {
  const _DropdownField({
    required this.label,
    required this.value,
    required this.items,
    required this.hint,
    required this.onChanged,
  });

  final String label;
  final String? value;
  final List<String> items;
  final String hint;
  final void Function(String?) onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: theme.textTheme.labelLarge
                ?.copyWith(color: ext.mutedFg, fontSize: 9)),
        const SizedBox(height: 4),
        DropdownButtonFormField<String>(
          value: value,
          isExpanded: true,
          style: theme.textTheme.bodyMedium,
          decoration: InputDecoration(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            isDense: true,
          ),
          hint: Text(hint,
              style: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg)),
          items: items
              .map((item) => DropdownMenuItem(
                    value: item,
                    child: Text(item, style: theme.textTheme.bodyMedium,
                        overflow: TextOverflow.ellipsis),
                  ))
              .toList(),
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _DisabledDropdownField extends StatelessWidget {
  const _DisabledDropdownField({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: theme.textTheme.labelLarge
                ?.copyWith(color: ext.mutedFg, fontSize: 9)),
        const SizedBox(height: 4),
        DropdownButtonFormField<String>(
          value: null,
          isExpanded: true,
          decoration: InputDecoration(
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            isDense: true,
          ),
          hint: Text('— N/A —',
              style: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg)),
          items: const [],
          onChanged: null,
        ),
      ],
    );
  }
}
