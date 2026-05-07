import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/cache/local_cache.dart';
import '../../core/theme/app_theme.dart';
import '../../models/ledger.dart';
import '../../models/sale.dart';
import '../home/home_provider.dart';
import '../shared/widgets/fuzzy_dialog.dart';
import '../shared/widgets/torn_item_card.dart';
import 'sale_edit_page.dart';

final saleDetailProvider =
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

class SaleDetailPage extends ConsumerStatefulWidget {
  const SaleDetailPage({super.key, required this.id});
  final String id;

  @override
  ConsumerState<SaleDetailPage> createState() => _SaleDetailPageState();
}

class _SaleDetailPageState extends ConsumerState<SaleDetailPage> {
  bool _committing = false;
  bool _aborting = false;
  bool _deleting = false;
  Sale? _sale;

  Future<void> _invalidateListCache() async {
    await LocalCache.instance.invalidate(CacheKeys.sales);
    ref.read(salesNotifier.notifier).refresh();
  }

  Future<void> _commit() async {
    if (!await showFuzzyConfirmDialog(
      context,
      message: 'Commit this sale to cloud storage? This cannot be undone.',
      confirmLabel: 'COMMIT',
    )) return;
    if (!mounted) return;
    setState(() => _committing = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(Endpoints.saleCommit(widget.id));
      await LocalCache.instance.invalidate(CacheKeys.sale(widget.id));
      ref.invalidate(saleDetailProvider(widget.id));
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
      message: 'Discard this sale? It will be permanently deleted.',
      confirmLabel: 'DISCARD',
      isDanger: true,
    )) return;
    if (!mounted) return;
    setState(() => _aborting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(Endpoints.saleAbort(widget.id));
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
      message: 'Delete this sale? This cannot be undone.',
      confirmLabel: 'DELETE',
      isDanger: true,
    )) return;
    if (!mounted) return;
    setState(() => _deleting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.delete<void>(Endpoints.sale(widget.id));
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

  void _openEdit(Sale sale) {
    Navigator.of(context)
        .push(MaterialPageRoute(
          builder: (_) => SaleEditPage(sale: sale, id: widget.id),
        ))
        .then((_) async {
      await LocalCache.instance.invalidate(CacheKeys.sale(widget.id));
      ref.invalidate(saleDetailProvider(widget.id));
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
    final async = ref.watch(saleDetailProvider(widget.id));

    if (async.hasValue) _sale = async.value;
    final sale = _sale;

    final isStaged = sale?.status == SaleStatus.staged;

    final List<Widget> actions = sale == null
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
                  onPressed: () => _openEdit(sale),
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
      appBar: AppBar(
        leading: const BackButton(),
        title: null,
        backgroundColor: theme.scaffoldBackgroundColor,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: actions,
      ),
      body: sale == null
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
          : _buildContent(context, sale),
    );
  }

  Widget _spinner() => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 12),
        child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2)),
      );

  Widget _buildContent(BuildContext context, Sale sale) {
    final ext = context.fuzzy;
    final amount = sale.totalRevenue != null
        ? '${sale.currency ?? ''} ${sale.totalRevenue}'.trim()
        : null;
    final isAuthError =
        sale.errorMessage?.startsWith('AUTH_REQUIRED:') ?? false;

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 4, 4, 32),
      children: [
        if (isAuthError)
          _AuthRequiredBanner(margin: const EdgeInsets.fromLTRB(16, 4, 16, 0)),
        Hero(
          tag: itemHeroTag(type: 'sale', id: widget.id),
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
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            autoExpand: true,
            bodyPadding: EdgeInsets.zero,
            body: _TabbedSaleBody(sale: sale),
          ),
        ),
      ],
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

// ── Tabbed body ───────────────────────────────────────────────────────────────

class _TabbedSaleBody extends ConsumerStatefulWidget {
  const _TabbedSaleBody({required this.sale});
  final Sale sale;

  @override
  ConsumerState<_TabbedSaleBody> createState() => _TabbedSaleBodyState();
}

class _TabbedSaleBodyState extends ConsumerState<_TabbedSaleBody> {
  int _tab = 0;
  bool _receivableLoaded = false;

  Receivable? _receivable;
  bool _receivableLoading = false;
  String? _receivableError;

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

  Future<void> _loadReceivable() async {
    setState(() {
      _receivableLoading = true;
      _receivableError = null;
    });
    try {
      final client = ref.read(apiClientProvider);
      final resp = await client.dio.get<Map<String, dynamic>>(
          Endpoints.saleReceivable(widget.sale.id));
      setState(() {
        _receivable =
            resp.data != null ? Receivable.fromJson(resp.data!) : null;
        _receivableLoading = false;
      });
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 404) {
        setState(() {
          _receivable = null;
          _receivableLoading = false;
        });
      } else {
        setState(() {
          _receivableError = e.message ?? 'Network error';
          _receivableLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _receivableError = e.toString();
        _receivableLoading = false;
      });
    }
  }

  Future<void> _openReceivable() async {
    setState(() => _opening = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(
        Endpoints.saleReceivable(widget.sale.id),
        data: {'note': _openingNoteCtrl.text.trim()},
      );
      _openingNoteCtrl.clear();
      await _loadReceivable();
    } catch (e) {
      setState(() => _receivableError = e.toString());
    } finally {
      setState(() => _opening = false);
    }
  }

  Future<void> _addUpdate() async {
    setState(() => _addingUpdate = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.post<void>(
        Endpoints.saleReceivableUpdates(widget.sale.id),
        data: {'note': _updateNoteCtrl.text.trim()},
      );
      _updateNoteCtrl.clear();
      setState(() => _showAddUpdate = false);
      await _loadReceivable();
    } catch (e) {
      setState(() => _receivableError = e.toString());
    } finally {
      setState(() => _addingUpdate = false);
    }
  }

  Future<void> _closeReceivable() async {
    setState(() => _closing = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio.patch<void>(
        Endpoints.saleReceivable(widget.sale.id),
        data: {'note': _closingNoteCtrl.text.trim()},
      );
      _closingNoteCtrl.clear();
      setState(() => _showCloseForm = false);
      await _loadReceivable();
    } catch (e) {
      setState(() => _receivableError = e.toString());
    } finally {
      setState(() => _closing = false);
    }
  }

  Future<void> _deleteReceivable() async {
    final confirmed = await showFuzzyConfirmDialog(
      context,
      message: 'Remove this receivable? All updates will be deleted.',
      confirmLabel: 'REMOVE',
      isDanger: true,
    );
    if (!confirmed || !mounted) return;
    setState(() => _deleting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.dio
          .delete<void>(Endpoints.saleReceivable(widget.sale.id));
      await _loadReceivable();
    } catch (e) {
      setState(() => _receivableError = e.toString());
    } finally {
      setState(() => _deleting = false);
    }
  }

  void _onTabTap(int index) {
    setState(() => _tab = index);
    if (index == 2 && !_receivableLoaded) {
      _receivableLoaded = true;
      _loadReceivable();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;

    final tabs = ['INFO', 'LINE ITEMS', 'RECEIVABLE'];

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
        // ── Tab content ─────────────────────────────────────────────────────
        if (_tab == 0) _InfoTab(sale: widget.sale),
        if (_tab == 1) _LineItemsTab(sale: widget.sale),
        if (_tab == 2)
          _ReceivableTab(
            receivable: _receivable,
            loading: _receivableLoading,
            error: _receivableError,
            showAddUpdate: _showAddUpdate,
            showCloseForm: _showCloseForm,
            openingNoteCtrl: _openingNoteCtrl,
            updateNoteCtrl: _updateNoteCtrl,
            closingNoteCtrl: _closingNoteCtrl,
            opening: _opening,
            addingUpdate: _addingUpdate,
            closing: _closing,
            deleting: _deleting,
            onOpen: _openReceivable,
            onAddUpdate: _addUpdate,
            onClose: _closeReceivable,
            onDelete: _deleteReceivable,
            onToggleAddUpdate: (v) => setState(() => _showAddUpdate = v),
            onToggleCloseForm: (v) => setState(() => _showCloseForm = v),
          ),
      ],
    );
  }
}

// ── INFO tab ──────────────────────────────────────────────────────────────────

class _InfoTab extends StatelessWidget {
  const _InfoTab({required this.sale});
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

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...fields.map((f) => _FieldRow(label: f.$1, value: f.$2)),
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
      ),
    );
  }
}

// ── LINE ITEMS tab ────────────────────────────────────────────────────────────

class _LineItemsTab extends StatelessWidget {
  const _LineItemsTab({required this.sale});
  final Sale sale;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (sale.lineItems.isEmpty) {
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
        children: sale.lineItems.map((li) => _SaleLineItemRow(item: li)).toList(),
      ),
    );
  }
}

// ── RECEIVABLE tab ────────────────────────────────────────────────────────────

class _ReceivableTab extends StatelessWidget {
  const _ReceivableTab({
    required this.receivable,
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

  final Receivable? receivable;
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
                style:
                    theme.textTheme.bodySmall?.copyWith(color: ext.dangerColor)),
            const SizedBox(height: 8),
          ],

          if (receivable == null) ...[
            Text('No receivable tracked for this sale.',
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
                    : const Text('OPEN RECEIVABLE'),
              ),
            ),
          ] else ...[
            _TimelineEntry(
              theme: theme,
              ext: ext,
              label: 'OPENED',
              note: receivable!.updates.isNotEmpty
                  ? receivable!.updates.first.note
                  : null,
              date: receivable!.openedAt,
              showLine: receivable!.updates.isNotEmpty ||
                  receivable!.closedAt != null,
              dotFilled: true,
              dotColor: theme.colorScheme.onSurface,
            ),
            ...List.generate(receivable!.updates.length, (i) {
              final u = receivable!.updates[i];
              final isLast = i == receivable!.updates.length - 1;
              final isClosed = receivable!.closedAt != null;
              return _TimelineEntry(
                theme: theme,
                ext: ext,
                label: 'UPDATE',
                note: u.note.isNotEmpty ? u.note : null,
                date: u.createdAt,
                showLine: !isLast || isClosed,
                dotFilled: isLast && isClosed,
                dotColor: theme.colorScheme.onSurface,
              );
            }),
            if (receivable!.closedAt != null)
              _TimelineEntry(
                theme: theme,
                ext: ext,
                label: 'CLOSED',
                note: null,
                date: receivable!.closedAt!,
                showLine: false,
                dotFilled: true,
                dotColor: ext.successColor,
              ),

            const SizedBox(height: 12),

            if (receivable!.isOpen) ...[
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
                        ? const SizedBox(
                            width: 14, height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
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
                  child: const Text('CLOSE RECEIVABLE'),
                )
              else ...[
                _NoteField(controller: closingNoteCtrl, hint: 'Closing note (optional)'),
                const SizedBox(height: 8),
                Row(children: [
                  OutlinedButton(
                    onPressed: closing ? null : onClose,
                    child: closing
                        ? const SizedBox(
                            width: 14, height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
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
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: ext.dangerColor))
                  : const Text('REMOVE'),
            ),
          ],

          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(10),
            color: ext.muted,
            child: Text(
              'This tool is for reference tracking only and is not intended '
              'for use in accounting.',
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
            child: Column(
              children: [
                const SizedBox(height: 3),
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: dotFilled ? dotColor : Colors.transparent,
                    border: Border.all(color: dotColor, width: 1.5),
                  ),
                ),
                if (showLine)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      color: ext.border,
                      margin: const EdgeInsets.symmetric(vertical: 2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(label,
                          style: theme.textTheme.labelLarge
                              ?.copyWith(fontSize: 10)),
                      const SizedBox(width: 8),
                      Text(_fmtDateTime(date),
                          style: theme.textTheme.bodySmall?.copyWith(
                              color: ext.mutedFg, fontSize: 10)),
                    ],
                  ),
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
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  final h = dt.hour > 12
      ? dt.hour - 12
      : dt.hour == 0
          ? 12
          : dt.hour;
  final m = dt.minute.toString().padLeft(2, '0');
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  return '${months[dt.month - 1]} ${dt.day} · $h:$m $ampm';
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

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
