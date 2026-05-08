import 'dart:ui';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/cache/local_cache.dart';
import '../../core/theme/app_theme.dart';
import '../../models/ledger.dart';
import '../../models/receipt.dart';
import '../home/home_provider.dart';
import '../shared/widgets/fuzzy_dialog.dart';
import '../shared/widgets/torn_item_card.dart';
import 'receipt_edit_page.dart';

final receiptDetailProvider =
    FutureProvider.family<Receipt, String>((ref, id) async {
  final client = ref.watch(apiClientProvider);
  final cache = LocalCache.instance;

  final cached = cache.get<Map<String, dynamic>>(CacheKeys.receipt(id));
  if (cached != null) return Receipt.fromJson(cached);

  final resp =
      await client.dio.get<Map<String, dynamic>>(Endpoints.receipt(id));
  await cache.put(CacheKeys.receipt(id), resp.data!);
  return Receipt.fromJson(resp.data!);
});

class ReceiptDetailPage extends ConsumerStatefulWidget {
  const ReceiptDetailPage({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ReceiptDetailPage> createState() => _ReceiptDetailPageState();
}

class _ReceiptDetailPageState extends ConsumerState<ReceiptDetailPage> {
  bool _committing = false;
  bool _aborting = false;
  bool _deleting = false;
  Receipt? _receipt;

  Future<void> _invalidateListCache() async {
    await LocalCache.instance.invalidate(CacheKeys.receipts);
    ref.read(receiptsNotifier.notifier).refresh();
  }

  Future<void> _commit() async {
    if (!await showFuzzyConfirmDialog(
      context,
      message: 'Commit this receipt to cloud storage? This cannot be undone.',
      confirmLabel: 'COMMIT',
    )) return;
    if (!mounted) return;
    setState(() => _committing = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(Endpoints.receiptCommit(widget.id));
      await LocalCache.instance.invalidate(CacheKeys.receipt(widget.id));
      ref.invalidate(receiptDetailProvider(widget.id));
      await _invalidateListCache();
    } on DioException catch (e) {
      if (mounted) _showError('Commit failed: ${e.message ?? e.toString()}');
    } catch (e) {
      if (mounted) _showError('Commit failed: $e');
    } finally {
      if (mounted) setState(() => _committing = false);
    }
  }

  Future<void> _abort() async {
    if (!await showFuzzyConfirmDialog(
      context,
      message: 'Discard this receipt? It will be permanently deleted.',
      confirmLabel: 'DISCARD',
      isDanger: true,
    )) return;
    if (!mounted) return;
    setState(() => _aborting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(Endpoints.receiptAbort(widget.id));
      await _invalidateListCache();
      if (mounted) Navigator.of(context).pop();
    } on DioException catch (e) {
      if (mounted) _showError('Abort failed: ${e.message ?? e.toString()}');
    } catch (e) {
      if (mounted) _showError('Abort failed: $e');
    } finally {
      if (mounted) setState(() => _aborting = false);
    }
  }

  Future<void> _delete() async {
    if (!await showFuzzyConfirmDialog(
      context,
      message: 'Delete this receipt? This cannot be undone.',
      confirmLabel: 'DELETE',
      isDanger: true,
    )) return;
    if (!mounted) return;
    setState(() => _deleting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.delete<void>(Endpoints.receipt(widget.id));
      await _invalidateListCache();
      if (mounted) Navigator.of(context).pop();
    } on DioException catch (e) {
      if (mounted) _showError('Delete failed: ${e.message ?? e.toString()}');
    } catch (e) {
      if (mounted) _showError('Delete failed: $e');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  void _openEdit(Receipt receipt) {
    Navigator.of(context)
        .push(MaterialPageRoute(
          builder: (_) => ReceiptEditPage(receipt: receipt, id: widget.id),
        ))
        .then((_) async {
      await LocalCache.instance.invalidate(CacheKeys.receipt(widget.id));
      ref.invalidate(receiptDetailProvider(widget.id));
      await _invalidateListCache();
    });
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final async = ref.watch(receiptDetailProvider(widget.id));

    if (async.hasValue) _receipt = async.value;
    final receipt = _receipt;

    final isStaged = receipt?.status == ReceiptStatus.staged;

    final List<Widget> actions = receipt == null
        ? []
        : isStaged
            ? [
                if (_committing)
                  _spinner()
                else
                  IconButton(
                    icon: const Icon(Icons.check_circle_outline),
                    tooltip: 'Commit',
                    onPressed: _commit,
                  ),
                if (_aborting)
                  _spinner()
                else
                  IconButton(
                    icon: const Icon(Icons.cancel_outlined),
                    tooltip: 'Abort',
                    onPressed: _abort,
                  ),
                IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  tooltip: 'Edit',
                  onPressed: () => _openEdit(receipt),
                ),
              ]
            : [
                if (_deleting)
                  _spinner()
                else
                  IconButton(
                    icon: Icon(Icons.delete_outline, color: ext.dangerColor),
                    tooltip: 'Delete',
                    onPressed: _delete,
                  ),
              ];

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        leading: const BackButton(),
        title: null,
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: actions,
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            child: ColoredBox(
              color: theme.scaffoldBackgroundColor.withValues(alpha: 0.22),
            ),
          ),
          receipt == null
              ? async.when(
                  loading: () => const Center(
                    child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2)),
                  ),
                  error: (e, _) => Center(child: Text('Error: $e')),
                  data: (_) => const SizedBox(),
                )
              : _buildContent(context, receipt),
        ],
      ),
    );
  }

  Widget _spinner() => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12),
        child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2)),
      );

  Widget _buildContent(BuildContext context, Receipt receipt) {
    final ext = context.fuzzy;
    final amount = receipt.total != null
        ? '${receipt.currency ?? ''} ${receipt.total}'.trim()
        : null;
    final isAuthError =
        receipt.errorMessage?.startsWith('AUTH_REQUIRED:') ?? false;

    return ListView(
      physics: ClampingScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        0,
        MediaQuery.of(context).padding.top + kToolbarHeight + 4,
        4,
        32,
      ),
      children: [
        if (isAuthError)
          _AuthRequiredBanner(margin: const EdgeInsets.fromLTRB(16, 4, 16, 0)),
        Hero(
          tag: itemHeroTag(type: 'receipt', id: widget.id),
          flightShuttleBuilder: (_, animation, __, fromCtx, ___) =>
              AnimatedBuilder(
                animation: animation,
                builder: (_, child) =>
                    Material(color: Colors.transparent, child: child),
                child: fromCtx.widget,
              ),
          child: TornItemCard(
            label: receipt.displayTitle,
            badgeLabel: 'RECEIPT',
            badgeColor: ext.infoColor,
            date: receipt.createdAt,
            amount: amount,
            status: receipt.status.name,
            hasTornEdge: true,
            showChevron: false,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            autoExpand: true,
            bodyPadding: EdgeInsets.zero,
            body: _TabbedReceiptBody(receipt: receipt),
          ),
        ),
      ],
    );
  }
}

// ── Tabbed body ───────────────────────────────────────────────────────────────

class _TabbedReceiptBody extends ConsumerStatefulWidget {
  const _TabbedReceiptBody({required this.receipt});
  final Receipt receipt;

  @override
  ConsumerState<_TabbedReceiptBody> createState() => _TabbedReceiptBodyState();
}

class _TabbedReceiptBodyState extends ConsumerState<_TabbedReceiptBody> {
  int _tab = 0; // 0=INFO, 1=LINE ITEMS, 2=PAYABLE
  bool _payableLoaded = false;

  Payable? _payable;
  bool _payableLoading = false;
  String? _payableError;

  // Form state
  bool _showAddUpdate = false;
  bool _showCloseForm = false;
  final _openingNoteCtrl = TextEditingController();
  final _updateNoteCtrl = TextEditingController();
  final _closingNoteCtrl = TextEditingController();
  bool _opening = false;
  bool _addingUpdate = false;
  bool _closing = false;
  bool _deleting = false;

  @override
  void dispose() {
    _openingNoteCtrl.dispose();
    _updateNoteCtrl.dispose();
    _closingNoteCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPayable() async {
    setState(() {
      _payableLoading = true;
      _payableError = null;
    });
    try {
      final client = ref.read(apiClientProvider);
      final resp = await client.dio.get<Map<String, dynamic>>(
          Endpoints.receiptPayable(widget.receipt.id));
      setState(() {
        _payable = resp.data != null ? Payable.fromJson(resp.data!) : null;
        _payableLoading = false;
      });
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        setState(() {
          _payable = null;
          _payableLoading = false;
        });
      } else {
        setState(() {
          _payableError = e.message ?? 'Network error';
          _payableLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _payableError = e.toString();
        _payableLoading = false;
      });
    }
  }

  Future<void> _openPayable() async {
    setState(() => _opening = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(
        Endpoints.receiptPayable(widget.receipt.id),
        data: {'note': _openingNoteCtrl.text.trim()},
      );
      _openingNoteCtrl.clear();
      await _loadPayable();
    } catch (e) {
      setState(() => _payableError = e.toString());
    } finally {
      setState(() => _opening = false);
    }
  }

  Future<void> _addUpdate() async {
    setState(() => _addingUpdate = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(
        Endpoints.receiptPayableUpdates(widget.receipt.id),
        data: {'note': _updateNoteCtrl.text.trim()},
      );
      _updateNoteCtrl.clear();
      setState(() => _showAddUpdate = false);
      await _loadPayable();
    } catch (e) {
      setState(() => _payableError = e.toString());
    } finally {
      setState(() => _addingUpdate = false);
    }
  }

  Future<void> _closePayable() async {
    setState(() => _closing = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.patch<void>(
        Endpoints.receiptPayable(widget.receipt.id),
        data: {'note': _closingNoteCtrl.text.trim()},
      );
      _closingNoteCtrl.clear();
      setState(() => _showCloseForm = false);
      await _loadPayable();
    } catch (e) {
      setState(() => _payableError = e.toString());
    } finally {
      setState(() => _closing = false);
    }
  }

  Future<void> _deletePayable() async {
    final confirmed = await showFuzzyConfirmDialog(
      context,
      message: 'Remove this payable? All updates will be deleted.',
      confirmLabel: 'REMOVE',
      isDanger: true,
    );
    if (!confirmed || !mounted) return;
    setState(() => _deleting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio
          .delete<void>(Endpoints.receiptPayable(widget.receipt.id));
      await _loadPayable();
    } catch (e) {
      setState(() => _payableError = e.toString());
    } finally {
      setState(() => _deleting = false);
    }
  }

  void _onTabTap(int index) {
    setState(() => _tab = index);
    if (index == 2 && !_payableLoaded) {
      _payableLoaded = true;
      _loadPayable();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final tabs = ['INFO', 'LINE ITEMS', 'PAYABLE'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Tab bar ─────────────────────────────────────────────────────────
        Container(
          decoration: BoxDecoration(
            border: Border(
                bottom: BorderSide(color: ext.border, width: 2)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: List.generate(tabs.length, (i) {
              final active = _tab == i;
              return GestureDetector(
                onTap: () => _onTabTap(i),
                child: Container(
                  // why ??
                  //margin: const EdgeInsets.only(bottom: -2),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 10),
                  decoration: active
                      ? BoxDecoration(
                          border: Border(
                              bottom: BorderSide(
                                  color: theme.colorScheme.onSurface,
                                  width: 2)))
                      : null,
                  child: Text(
                    tabs[i],
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontSize: 10,
                      color: active
                          ? theme.colorScheme.onSurface
                          : ext.mutedFg,
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
        if (_tab == 0) _InfoTab(receipt: widget.receipt),
        if (_tab == 1) _LineItemsTab(receipt: widget.receipt),
        if (_tab == 2)
          _PayableTab(
            payable: _payable,
            loading: _payableLoading,
            error: _payableError,
            showAddUpdate: _showAddUpdate,
            showCloseForm: _showCloseForm,
            openingNoteCtrl: _openingNoteCtrl,
            updateNoteCtrl: _updateNoteCtrl,
            closingNoteCtrl: _closingNoteCtrl,
            opening: _opening,
            addingUpdate: _addingUpdate,
            closing: _closing,
            deleting: _deleting,
            onOpen: _openPayable,
            onAddUpdate: _addUpdate,
            onClose: _closePayable,
            onDelete: _deletePayable,
            onToggleAddUpdate: (v) => setState(() => _showAddUpdate = v),
            onToggleCloseForm: (v) => setState(() => _showCloseForm = v),
          ),
      ],
    );
  }
}

// ── INFO tab ──────────────────────────────────────────────────────────────────

class _InfoTab extends StatelessWidget {
  const _InfoTab({required this.receipt});
  final Receipt receipt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...fields.map((f) => _FieldRow(label: f.$1, value: f.$2)),
          if (receipt.tags.isNotEmpty) ...[
            const ItemCardDivider(),
            Text('TAGS', style: theme.textTheme.labelLarge),
            const SizedBox(height: 6),
            _TagsWrap(tags: receipt.tags),
          ],
          if (receipt.notes != null && receipt.notes!.isNotEmpty) ...[
            const ItemCardDivider(),
            Text('NOTES', style: theme.textTheme.labelLarge),
            const SizedBox(height: 4),
            Text(receipt.notes!, style: theme.textTheme.bodyMedium),
          ],
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

// ── LINE ITEMS tab ────────────────────────────────────────────────────────────

class _LineItemsTab extends StatelessWidget {
  const _LineItemsTab({required this.receipt});
  final Receipt receipt;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (receipt.lineItems.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
        child: Text('No line items.',
            style: theme.textTheme.bodyMedium
                ?.copyWith(color: context.fuzzy.mutedFg)),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        children: receipt.lineItems
            .map((li) => _LineItemRow(
                  description: li.description ?? '',
                  qty: li.qty,
                  unitPrice: li.unitPrice,
                  total: li.total,
                ))
            .toList(),
      ),
    );
  }
}

// ── PAYABLE tab ───────────────────────────────────────────────────────────────

class _PayableTab extends StatelessWidget {
  const _PayableTab({
    required this.payable,
    required this.loading,
    required this.error,
    required this.showAddUpdate,
    required this.showCloseForm,
    required this.openingNoteCtrl,
    required this.updateNoteCtrl,
    required this.closingNoteCtrl,
    required this.opening,
    required this.addingUpdate,
    required this.closing,
    required this.deleting,
    required this.onOpen,
    required this.onAddUpdate,
    required this.onClose,
    required this.onDelete,
    required this.onToggleAddUpdate,
    required this.onToggleCloseForm,
  });

  final Payable? payable;
  final bool loading;
  final String? error;
  final bool showAddUpdate;
  final bool showCloseForm;
  final TextEditingController openingNoteCtrl;
  final TextEditingController updateNoteCtrl;
  final TextEditingController closingNoteCtrl;
  final bool opening;
  final bool addingUpdate;
  final bool closing;
  final bool deleting;
  final VoidCallback onOpen;
  final VoidCallback onAddUpdate;
  final VoidCallback onClose;
  final VoidCallback onDelete;
  final void Function(bool) onToggleAddUpdate;
  final void Function(bool) onToggleCloseForm;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    if (loading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(
            child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (error != null) ...[
            Text('Error: $error',
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: ext.dangerColor)),
            const SizedBox(height: 8),
          ],
          if (payable == null) ...[
            Text('No payable tracked for this receipt.',
                style: theme.textTheme.bodyMedium),
            const SizedBox(height: 12),
            _NoteField(controller: openingNoteCtrl, hint: 'Opening note (optional)'),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: opening ? null : onOpen,
                child: opening
                    ? const SizedBox(
                        width: 14, height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('OPEN PAYABLE'),
              ),
            ),
          ] else ...[
            _TimelineEntry(
              theme: theme, ext: ext,
              label: 'OPENED',
              note: payable!.updates.isNotEmpty ? payable!.updates.first.note : null,
              date: payable!.openedAt,
              showLine: payable!.updates.isNotEmpty || payable!.closedAt != null,
              dotFilled: true,
              dotColor: theme.colorScheme.onSurface,
            ),
            ...List.generate(payable!.updates.length, (i) {
              final u = payable!.updates[i];
              final isLast = i == payable!.updates.length - 1;
              final isClosed = payable!.closedAt != null;
              return _TimelineEntry(
                theme: theme, ext: ext,
                label: 'UPDATE',
                note: u.note.isNotEmpty ? u.note : null,
                date: u.createdAt,
                showLine: !isLast || isClosed,
                dotFilled: isLast && isClosed,
                dotColor: theme.colorScheme.onSurface,
              );
            }),
            if (payable!.closedAt != null)
              _TimelineEntry(
                theme: theme, ext: ext,
                label: 'CLOSED', note: null,
                date: payable!.closedAt!,
                showLine: false, dotFilled: true,
                dotColor: ext.successColor,
              ),
            const SizedBox(height: 12),
            if (payable!.isOpen) ...[
              if (!showAddUpdate)
                OutlinedButton(
                  onPressed: () => onToggleAddUpdate(true),
                  child: const Text('+ ADD UPDATE'),
                )
              else ...[
                _NoteField(controller: updateNoteCtrl, hint: 'Update note'),
                const SizedBox(height: 8),
                Row(children: [
                  OutlinedButton(
                    onPressed: addingUpdate ? null : onAddUpdate,
                    child: addingUpdate
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('SAVE'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () => onToggleAddUpdate(false),
                    child: const Text('CANCEL'),
                  ),
                ]),
              ],
              const SizedBox(height: 8),
              if (!showCloseForm)
                OutlinedButton(
                  onPressed: () => onToggleCloseForm(true),
                  child: const Text('CLOSE PAYABLE'),
                )
              else ...[
                _NoteField(controller: closingNoteCtrl, hint: 'Closing note (optional)'),
                const SizedBox(height: 8),
                Row(children: [
                  OutlinedButton(
                    onPressed: closing ? null : onClose,
                    child: closing
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('CONFIRM CLOSE'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: () => onToggleCloseForm(false),
                    child: const Text('CANCEL'),
                  ),
                ]),
              ],
            ],
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: deleting ? null : onDelete,
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: ext.dangerColor, width: 2),
                foregroundColor: ext.dangerColor,
              ),
              child: deleting
                  ? SizedBox(
                      width: 14, height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2, color: ext.dangerColor))
                  : const Text('REMOVE'),
            ),
          ],
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(10),
            color: ext.muted,
            child: Text(
              'This tool is for reference tracking only and is not intended for use in accounting.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: ext.mutedFg, fontSize: 10),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Timeline entry ────────────────────────────────────────────────────────────

class _TimelineEntry extends StatelessWidget {
  const _TimelineEntry({
    required this.theme,
    required this.ext,
    required this.label,
    required this.note,
    required this.date,
    required this.showLine,
    required this.dotFilled,
    required this.dotColor,
  });

  final ThemeData theme;
  final FuzzyThemeExtension ext;
  final String label;
  final String? note;
  final DateTime date;
  final bool showLine;
  final bool dotFilled;
  final Color dotColor;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 20,
            child: Column(children: [
              const SizedBox(height: 3),
              Container(
                width: 10, height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: dotFilled ? dotColor : Colors.transparent,
                  border: Border.all(color: dotColor, width: 1.5),
                ),
              ),
              if (showLine)
                Expanded(
                  child: Container(
                    width: 1.5, color: ext.border,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                  ),
                ),
            ]),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text(label,
                        style: theme.textTheme.labelLarge?.copyWith(fontSize: 10)),
                    const SizedBox(width: 8),
                    Text(_fmtDateTime(date),
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: ext.mutedFg, fontSize: 10)),
                  ]),
                  if (note != null && note!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(note!, style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _fmtDateTime(DateTime dt) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  final h = dt.hour > 12 ? dt.hour - 12 : dt.hour == 0 ? 12 : dt.hour;
  final m = dt.minute.toString().padLeft(2, '0');
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  return '${months[dt.month - 1]} ${dt.day} · $h:$m $ampm';
}

// ── Shared sub-widgets ────────────────────────────────────────────────────────

class _NoteField extends StatelessWidget {
  const _NoteField({required this.controller, required this.hint});
  final TextEditingController controller;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return TextField(
      controller: controller,
      maxLines: 2,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
        contentPadding: const EdgeInsets.all(10),
        isDense: true,
      ),
      style: theme.textTheme.bodyMedium,
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

class _TagsWrap extends StatelessWidget {
  const _TagsWrap({required this.tags});
  final List<String> tags;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Wrap(
      spacing: 6, runSpacing: 4,
      children: tags
          .map((t) => Chip(
                label: Text(t.toUpperCase(),
                    style: theme.textTheme.labelLarge?.copyWith(fontSize: 10)),
                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
                side: BorderSide(color: ext.border),
                backgroundColor: ext.muted,
              ))
          .toList(),
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
      decoration: BoxDecoration(border: Border.all(color: ext.borderSubtle)),
      child: Row(
        children: [
          Expanded(child: Text(description, style: theme.textTheme.bodyMedium)),
          if (qty != null) Text('x$qty', style: theme.textTheme.bodySmall),
          const SizedBox(width: 8),
          if (total != null) Text(total!, style: theme.textTheme.labelLarge),
        ],
      ),
    );
  }
}

// ── Auth-required banner ──────────────────────────────────────────────────────

class _AuthRequiredBanner extends StatelessWidget {
  const _AuthRequiredBanner({required this.margin});
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Container(
      margin: margin,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ext.warningColor.withValues(alpha: 0.08),
        border: Border.all(color: ext.warningColor, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
                width: 8, height: 8,
                decoration: BoxDecoration(
                    shape: BoxShape.circle, color: ext.warningColor)),
            const SizedBox(width: 8),
            Text('CLOUD SYNC FAILED — RE-AUTHORISATION REQUIRED',
                style: theme.textTheme.labelLarge?.copyWith(
                    color: ext.warningColor, fontSize: 9)),
          ]),
          const SizedBox(height: 6),
          Text(
            'Your Google or Microsoft connection has expired or been revoked. '
            'Open the web app, go to Settings → Integrations, and reconnect your account. '
            'Then retry the sync.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: ext.warningColor, fontSize: 10),
          ),
        ],
      ),
    );
  }
}
