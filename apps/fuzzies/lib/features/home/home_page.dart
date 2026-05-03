import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fuzzies/features/home/widgets/animated_tile_info.dart';
import 'package:fuzzies/features/home/widgets/animated_upload_limit.dart';
import 'package:fuzzies/features/home/widgets/spline.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import 'home_provider.dart';
import 'widgets/animated_fab.dart';
import 'widgets/date_header_delegate.dart';
import 'widgets/fuzzy_search_bar.dart';
import 'widgets/search_results_row.dart';
import 'widgets/timeline_item_card.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class HomePageSearchHeader extends SliverPersistentHeaderDelegate {

    //static const double _kElevationOnMinShrinkOffset = 0.0;
    //static const double _kElevationOnOtherShrinkOffset = 2.0;
    static const double _kMaxExtent = 320.0;
    static const double _kMinExtent = 167.0;
    //static const double _kHorizontalCardPadding = 16.0;
    //static const double _kVerticalCardPadding = 8.0;
    Function(bool) callback;

    HomePageSearchHeader(this.callback);

    Widget _buildLeftPanel(double metrHeight, double remHeight) {
        return SizedBox(
            height: metrHeight - 4.0,
            child: Column(
                children: [
                    Expanded(
                        child: remHeight > 64.0
                            ? AnimatedTileInfo(
                                metrHeight: metrHeight,
                                child: _SyncStatusTile(height: (metrHeight / 2)),
                              )
                            : const SizedBox.shrink(),
                    ),
                    Expanded(
                        child: remHeight > 148.0
                            ? AnimatedTileInfo(
                                metrHeight: metrHeight,
                                child: const _StorageTile(),
                              )
                            : const SizedBox.shrink(),
                    ),
                ],
            ),
        );
    }

    Widget _buildRightPanel(double metrHeight, double remHeight) {
        return remHeight > 64.0
            ? AnimatedTileInfo(
                metrHeight: metrHeight,
                child: const _ActivityGraphTile(),
              )
            : const SizedBox.shrink();
    }

    List<Widget> _buildPanels(double metrHeight, double remHeight, double remMetrHeight) {
        return [ 
            Row(
                children: [ 
                    Expanded(
                        child: Padding(
                            padding: const EdgeInsets.fromLTRB(
                                10.0, 2.0, 4.0, 4.0
                            ),
                            child: _buildLeftPanel(metrHeight, remHeight),
                        ),
                    ),
                    Expanded(
                        child: Padding(
                            padding: const EdgeInsets.fromLTRB( 
                                2.0, 4.0, 10.0, 4.0
                            ),
                            child: _buildRightPanel(metrHeight, remHeight),
                        ),
                    ),
                ],
            ),
            Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12.0),
                child: AnimatedUploadLimit(remHeight: remMetrHeight),
            ),
        ];
    }

    @override
    Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
        double remHeight = (_kMaxExtent - shrinkOffset - 64.0).clamp(8.0, _kMaxExtent-8.0);
        // double width     = context.findRenderObject()?.semanticBounds.width ?? 200.0;
        // double metrWidth = width / 2;
        ThemeData theme = Theme.of(context);
        double metrHeight = remHeight * 2/3;
        double remMetrHeight= remHeight * 1/3;
        return Container(
            color: theme.scaffoldBackgroundColor,
            child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                    Opacity(
                        opacity: (remHeight / _kMaxExtent),
                        child: Container(
                            height: remHeight,
                            decoration: BoxDecoration(color: theme.colorScheme.surface),
                            // Buffer some height to avoid overflows
                            child: Column(
                                children: _buildPanels(metrHeight, remHeight, remMetrHeight),
                            ),
                        ),
                    ),
                    FuzzySearchBar(
                        onActiveChanged: (active) => callback(active),
                    ),
                ],
            ),
        );
    }

    @override
    double get maxExtent => _kMaxExtent;

    @override
    double get minExtent => _kMinExtent;

    @override
    bool shouldRebuild(covariant SliverPersistentHeaderDelegate oldDelegate) {
        return oldDelegate != this;
    }
}

class _HomePageState extends ConsumerState<HomePage> {
  bool _searchActive = false;
  bool _ready = false;
  late final ScrollController _scrollCtrl;
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollCtrl = ScrollController()..addListener(_onScroll);
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) setState(() => _ready = true);
    });
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_loadingMore) return;
    final pos = _scrollCtrl.position;
    if (pos.pixels >= pos.maxScrollExtent - 300) {
      _triggerLoadMore();
    }
  }

  Future<void> _triggerLoadMore() async {
    if (_loadingMore) return;
    _loadingMore = true;
    await Future.wait([
      ref.read(receiptsNotifier.notifier).loadMore(),
      ref.read(salesNotifier.notifier).loadMore(),
    ]);
    _loadingMore = false;
  }

  Future<void> _refresh() async {
    await Future.wait([
      ref.read(receiptsNotifier.notifier).refresh(),
      ref.read(salesNotifier.notifier).refresh(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final timelineAsync = _ready ? ref.watch(timelineProvider) : const AsyncLoading<TimelineData>();
    final fabOpen = ref.watch(fabOpenProvider);

    return Scaffold(
      body: Stack(
        children: [
          RefreshIndicator(
        onRefresh: _refresh,
        child: SafeArea(
          child: CustomScrollView(
          controller: _scrollCtrl,
          slivers: [
            // ── Fixed app bar with search + limits ───────────────────────────
            SliverAppBar(
              pinned: false,
              floating: false,
              expandedHeight: 64.0,
              snap: false,
              elevation: 0.0,
              title: const Text('FUZZIES'),
              centerTitle: true,
              actions: [
                IconButton(
                  icon: const Icon(Icons.settings_outlined, size: 20),
                  onPressed: () => context.push('/settings'),
                  tooltip: 'Settings',
                ),
              ],
              // bottom: PreferredSize(
              //     preferredSize: Size.fromHeight(0),
              //     child: Container(
              //         decoration: const BoxDecoration(
              //             color: Colors.white,
              //             boxShadow: [
              //                 BoxShadow(
              //                     color: Colors.white,
              //                     blurRadius: 0.0,
              //                     spreadRadius: 1.0,
              //                     offset: Offset(0, 0),
              //                 ),
              //             ],
              //         )
              //     ) 
              // )
            ),
          
            SliverPersistentHeader(
                pinned: true,
                delegate: HomePageSearchHeader((active) => setState(() => _searchActive = active),
             )),
          
            // ── Search results row (visible only when search is active) ───────
            SliverToBoxAdapter(
              child: AnimatedSize(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeInOut,
                child: _searchActive
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                            child: Text(
                              'RESULTS',
                              style: theme.textTheme.labelLarge
                                  ?.copyWith(color: ext.mutedFg),
                            ),
                          ),
                          const SearchResultsRow(),
                          Divider(color: ext.borderSubtle, height: 1),
                        ],
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          
            // ── Timeline ─────────────────────────────────────────────────────
            ...timelineAsync.when(
              loading: () => [
                const SliverFillRemaining(
                  child: Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                ),
              ],
              error: (e, st) => [
                SliverFillRemaining(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: _isNetworkError(e)
                          ? _NetworkErrorBody(onRetry: _refresh)
                          : Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('FAILED TO LOAD', style: theme.textTheme.titleMedium),
                                const SizedBox(height: 8),
                                Text(
                                  e.toString(),
                                  style: theme.textTheme.bodySmall
                                      ?.copyWith(color: context.fuzzy.dangerColor),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 16),
                                OutlinedButton(
                                  onPressed: _refresh,
                                  child: const Text('RETRY'),
                                ),
                              ],
                            ),
                    ),
                  ),
                ),
              ],
              data: (data) => _buildTimeline(data),
            ),
          
            // Bottom padding so FAB doesn't cover last item
            // const SliverToBoxAdapter(child: SizedBox(height: 96)),
          ],
                ),
        ),
      ),
          AnimatedOpacity(
            opacity: fabOpen ? 0.35 : 0.0,
            duration: const Duration(milliseconds: 220),
            child: IgnorePointer(
              ignoring: !fabOpen,
              child: GestureDetector(
                onTap: () => ref.read(fabOpenProvider.notifier).state = false,
                child: const ColoredBox(
                  color: Colors.black,
                  child: SizedBox.expand(),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: const AnimatedFab(),
    );
  }

  List<Widget> _buildTimeline(TimelineData data) {
    final groups = data.groups;

    if (groups.isEmpty && !data.isLoadingMore) {
      return [
        SliverFillRemaining(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.inbox_outlined, size: 48, color: context.fuzzy.mutedFg),
                const SizedBox(height: 12),
                Text('NO ITEMS YET', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text('Tap + to upload a receipt or sale',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ),
      ];
    }

    final slivers = <Widget>[];
    for (final group in groups) {
      slivers.add(SliverMainAxisGroup(
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: DateHeaderDelegate(group.date),
          ),
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (ctx, i) => TimelineItemCard(item: group.items[i]),
              childCount: group.items.length,
            ),
          ),
        ],
      ));
    }

    // Pagination footer
    slivers.add(SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: data.isLoadingMore
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : !data.hasMore && groups.isNotEmpty
                  ? Text(
                      'ALL CAUGHT UP',
                      style: Theme.of(context)
                          .textTheme
                          .labelSmall
                          ?.copyWith(color: context.fuzzy.mutedFg),
                    )
                  : const SizedBox(height: 0),
        ),
      ),
    ));

    // FAB clearance
    slivers.add(const SliverToBoxAdapter(child: SizedBox(height: 72)));

    return slivers;
  }
}

bool _isNetworkError(Object e) {
  if (e is SocketException) return true;
  if (e is DioException) {
    return e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.error is SocketException;
  }
  return false;
}

// ── Header panel tiles ────────────────────────────────────────────────────────

class _SyncStatusTile extends ConsumerWidget { 
  final double height;
  const _SyncStatusTile({required this.height});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final receipts = ref.watch(receiptsNotifier).valueOrNull?.items ?? [];
    final sales = ref.watch(salesNotifier).valueOrNull?.items ?? [];

    int complete = 0, staged = 0, failed = 0;
    void tally(String name) {
      final n = name.toLowerCase();
      if (n == 'complete' || n == 'completenosync') {
        complete++;
      } else if (n == 'failed') {
        failed++;
      } else if (n != 'unknown') {
        staged++;
      }
    }
    for (final r in receipts) tally(r.status.name);
    for (final s in sales) tally(s.status.name);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('SYNC', style: theme.textTheme.labelLarge?.copyWith(fontSize: 6, color: ext.mutedFg)),
            SizedBox(
              height: height,
              child: SingleChildScrollView(
                physics: NeverScrollableScrollPhysics(),
                child: Row( 
                    children: [ 
                        _StatRow(count: complete, label: 'DONE', color:    ext.successColor),
                        _StatRow(count: staged,   label: 'PENDING', color: ext.infoColor),
                        _StatRow(count: failed,   label: 'FAILED', color:  ext.dangerColor),
                    ],
                ),
              ),
            )
          ],
        ),
      ),
    );
  }
}

class _StorageTile extends ConsumerWidget {
  const _StorageTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final rState = ref.watch(receiptsNotifier).valueOrNull;
    final sState = ref.watch(salesNotifier).valueOrNull;
    final receipts = rState?.items ?? [];
    final sales = sState?.items ?? [];
    final hasMore = (rState?.hasMore ?? false) || (sState?.hasMore ?? false);

    // Rough estimate: receipts avg ~50 KB (with image metadata), sales ~20 KB
    final kbEst = receipts.length * 50.0 + sales.length * 20.0;
    final storageStr = kbEst < 1024
        ? '~${kbEst.round()} KB'
        : '~${(kbEst / 1024).toStringAsFixed(1)} MB';
    final totalDocs = receipts.length + sales.length;
    final suffix = hasMore ? '+' : '';

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Expanded(child: Text('STORAGE', style: theme.textTheme.labelLarge?.copyWith(fontSize: 6, color: ext.mutedFg))),
                Text('$totalDocs$suffix docs', style: theme.textTheme.bodySmall?.copyWith(fontSize: 7, color: ext.mutedFg)),
              ],
            ),
            Expanded(child: Center(child: Text(storageStr, style: theme.textTheme.labelLarge?.copyWith(fontSize: 16)))),
          ],
        ),
      ),
    );
  }
}

class _ActivityGraphTile extends ConsumerWidget {
  const _ActivityGraphTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ext = context.fuzzy;
    final theme = Theme.of(context);
    final receipts = ref.watch(receiptsNotifier).valueOrNull?.items ?? [];
    final sales = ref.watch(salesNotifier).valueOrNull?.items ?? [];

    final now = DateTime.now();
    bool sameDay(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;

    final rCounts = List.generate(7, (i) {
      final day = DateTime(now.year, now.month, now.day - (6 - i));
      return receipts.where((r) => sameDay(r.createdAt, day)).length.toDouble();
    });
    final sCounts = List.generate(7, (i) {
      final day = DateTime(now.year, now.month, now.day - (6 - i));
      return sales.where((s) => sameDay(s.createdAt, day)).length.toDouble();
    });

    return Stack(
      children: [
        Positioned.fill(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 20, 4, 4),
            child: LayoutBuilder(
              builder: (_, c) => CustomPaint(
                size: c.biggest,
                painter: ActivitySplinePainter(
                  receiptCounts: rCounts,
                  saleCounts: sCounts,
                  receiptColor: ext.infoColor,
                  saleColor: ext.successColor,
                  gridColor: ext.borderSubtle,
                ),
              ),
            ),
          ),
        ),
        Positioned(
          top: 6,
          left: 8,
          child: Text(
            '7D ACTIVITY',
            style: theme.textTheme.labelLarge?.copyWith(fontSize: 6, color: ext.mutedFg),
          ),
        ),
        Positioned(
          top: 5,
          right: 8,
          child: Row(
            children: [
              _LegendDot(color: ext.infoColor, label: 'RECEIPTS'),
              const SizedBox(width: 8),
              _LegendDot(color: ext.successColor, label: 'SALES'),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.count, required this.label, required this.color});
  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
        // Replace with column tile
        return Expanded(
            child: DecoratedBox(
                decoration: BoxDecoration( 
                    color: color.withAlpha(24)
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2.0, vertical: 8.0),
                  child: Column(
                      spacing: 4.0,
                      mainAxisAlignment: MainAxisAlignment.start,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [ 
                          Center(child: Text('$count', style: theme.textTheme.labelLarge?.copyWith(fontSize: 16, color: color))),
                          Text(label, style: theme.textTheme.labelLarge?.copyWith(fontSize: 8, color: color.withValues(alpha: 0.8)), overflow: TextOverflow.ellipsis)
                      ],
                  ),
                ),
            ),
        )
    ;
    // Row(
    //   children: [
    //     Container(width: 4, height: 4, color: color),
    //     const SizedBox(width: 4),
    //     Text(
    //       '$count',
    //       style: theme.textTheme.labelLarge?.copyWith(fontSize: 9, color: color),
    //     ),
    //     const SizedBox(width: 3),
    //     Expanded(
    //       child: Text(
    //         label,
    //         style: theme.textTheme.labelLarge?.copyWith(fontSize: 7, color: color.withValues(alpha: 0.8)),
    //         overflow: TextOverflow.ellipsis,
    //       ),
    //     ),
    //   ],
    // );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(width: 5, height: 5, color: color),
        const SizedBox(width: 3),
        Text(
          label,
          style: theme.textTheme.labelLarge?.copyWith(fontSize: 6, color: color),
        ),
      ],
    );
  }
}

// ── Network error body ────────────────────────────────────────────────────────

class _NetworkErrorBody extends StatelessWidget {
  const _NetworkErrorBody({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.wifi_off_outlined, size: 48, color: ext.mutedFg),
        const SizedBox(height: 12),
        Text('NO CONNECTION', style: theme.textTheme.titleMedium),
        const SizedBox(height: 6),
        Text(
          'Cannot reach the server.\nCheck your connection and try again.',
          style: theme.textTheme.bodySmall?.copyWith(color: ext.mutedFg),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('RETRY'),
        ),
      ],
    );
  }
}

