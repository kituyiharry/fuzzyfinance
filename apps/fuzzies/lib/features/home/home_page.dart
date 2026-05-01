import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
                            decoration: BoxDecoration( 
                                color: theme.colorScheme.surface,
                            ),
                            // Buffer some height to avoid overflows
                            child: Column(
                                children: [ 
                                    Row(
                                        children: [ 
                                            Expanded(
                                                child: Padding(
                                                    padding: const EdgeInsets.fromLTRB(
                                                        4.0, 2.0, 4.0, 4.0
                                                    ),
                                                    child: SizedBox(
                                                        //color: Colors.red,
                                                        height: metrHeight - 4.0,
                                                        child: Column( 
                                                            children: [ 
                                                                Expanded(
                                                                    child: remHeight > 64.0 ? TweenAnimationBuilder<Offset>(
                                                        tween: Tween(
                                                            begin: Offset(0,-1), // : Offset(0, 0),
                                                            end:   Offset(0, 0), // : Offset(0,-1)
                                                        ),
                                                        duration: Duration(milliseconds: 200),
                                                        curve: Curves.easeOutQuart, // Makes the "flying" feel smooth
                                                        builder: (context, offset, child) {
                                                            return FractionalTranslation(
                                                                translation: offset,
                                                                child: child,
                                                            );
                                                        },
                                                                      child: InfoTile(child:
                                                                          Center(child:
                                                                              Text("4 / 0 / 1 "),),),
                                                                    ) : SizedBox.shrink(),
                                                                ),
                                                                Expanded(
                                                                    child:
                                                                    remHeight > 128.0 ? TweenAnimationBuilder<Offset>(
                                                        tween: Tween(
                                                            begin: Offset(0,-1), // : Offset(0, 0),
                                                            end:   Offset(0, 0), // : Offset(0,-1)
                                                        ),
                                                        duration: Duration(milliseconds: 200),
                                                        curve: Curves.easeOutQuart, // Makes the "flying" feel smooth
                                                        builder: (context, offset, child) {
                                                            return FractionalTranslation(
                                                                translation: offset,
                                                                child: child,
                                                            );
                                                        },
                                                                      child: InfoTile(child:
                                                                          Center(child: Text("308.8 kIB"),),),
                                                                    )
                                                                    : SizedBox.shrink(),
                                                                ),
                                                            ]
                                                        ),
                                                    ),
                                                ),
                                            ),
                                            Expanded(
                                                child: Padding(
                                                    padding: const EdgeInsets.fromLTRB( 
                                                        2.0, 4.0, 4.0, 4.0
                                                    ),
                                                    child: remHeight > 64.0 ? 
                                                    TweenAnimationBuilder<Offset>(
                                                        tween: Tween(
                                                            begin: Offset(0,-1), // : Offset(0, 0),
                                                            end:   Offset(0, 0), // : Offset(0,-1)
                                                        ),
                                                        duration: Duration(milliseconds: 200),
                                                        curve: Curves.easeOutQuart, // Makes the "flying" feel smooth
                                                        builder: (context, offset, child) {
                                                            return FractionalTranslation(
                                                                translation: offset,
                                                                child: child,
                                                            );
                                                        },
                                                      child: 
                                                        SizedBox(
                                                            height: metrHeight - 4.0,
                                                            child: InfoTile( 
                                                                child: 
                                                                //Center(child: Text("C ${}")),
                                                                LayoutBuilder(builder: (b,c) {
                                                                    var points = generateRandomPoints(c.biggest, 5);
                                                                    return CustomPaint( 
                                                                        size: c.biggest,
                                                                        painter: SplinePainter(points)
                                                                    );
                                                                }

                                                                )
                                                            )
                                                        )
                                                    ) : SizedBox.shrink()


                                                ),
                                            ),
                                        ],
                                    ),
                                    Padding(
                                        padding: const EdgeInsets.only(left: 4.0, right: 4.0),
                                        child: AnimatedUploadLimit(remHeight: remMetrHeight),
                                    ),
                                ],
                            ),
                        ),
                    ),
                     //const UploadLimitsTile(),
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
      slivers.add(SliverPersistentHeader(
        pinned: true,
        delegate: DateHeaderDelegate(group.date),
      ));
      slivers.add(SliverList(
        delegate: SliverChildBuilderDelegate(
          (ctx, i) => TimelineItemCard(item: group.items[i]),
          childCount: group.items.length,
        ),
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

// TODO: AnimatedSwitcher with SizedBox.shrink

class InfoTile extends StatelessWidget {

    final Widget child;
    const InfoTile({super.key, required this.child});

    @override
    Widget build(BuildContext context) {
        final ext = context.fuzzy;
        final theme = Theme.of(context);
        return Container(
            margin: const EdgeInsets.all(4.0),
            decoration: BoxDecoration(
                border: Border.all(color: ext.border, width: 2),
                boxShadow: [ext.cardShadow],
                color: theme.colorScheme.surface,
            ),
            child: child,
        );
    }
}
