import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/cache/local_cache.dart';
import '../../core/theme/app_theme.dart';
import '../../models/timeline_item.dart';
import 'home_provider.dart';
import 'widgets/animated_fab.dart';
import 'widgets/date_header_delegate.dart';
import 'widgets/fuzzy_search_bar.dart';
import 'widgets/search_results_row.dart';
import 'widgets/timeline_item_card.dart';
import 'widgets/upload_limits_tile.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class HomePageSearchHeader extends SliverPersistentHeaderDelegate {

    //static const double _kElevationOnMinShrinkOffset = 0.0;
    //static const double _kElevationOnOtherShrinkOffset = 2.0;
    static const double _kMaxExtent = 286.0;
    static const double _kMinExtent = 167.0;
    //static const double _kHorizontalCardPadding = 16.0;
    //static const double _kVerticalCardPadding = 8.0;
    Function(bool) callback;

    HomePageSearchHeader(this.callback);


    @override
    Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
        return 
            Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                    Builder(builder: (innerCtx) =>
                        Container(
                            height: (_kMaxExtent - shrinkOffset - 64.0).clamp(0, _kMaxExtent),
                            decoration: const BoxDecoration( 
                                color: Colors.blue,
                            ),
                            child: const Center(child: Text("Some center")),
                        )
                    ),
                    // const UploadLimitsTile(),
                    FuzzySearchBar(
                        onActiveChanged: (active) => callback(active),
                    ),
                ],
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

    return Scaffold(
      body: RefreshIndicator(
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
              bottom: PreferredSize(
                  preferredSize: Size.fromHeight(0),
                  child: Container(
                      decoration: const BoxDecoration(
                          color: Colors.white,
                          boxShadow: [
                              BoxShadow(
                                  color: Colors.white,
                                  blurRadius: 0.0,
                                  spreadRadius: 1.0,
                                  offset: Offset(0, 0),
                              ),
                          ],
                      )
                  ) 
              )
            ),
          
            SliverPersistentHeader(
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
                      child: Column(
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
