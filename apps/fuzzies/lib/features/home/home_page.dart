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

class _HomePageState extends ConsumerState<HomePage> {
  bool _searchActive = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ext = context.fuzzy;
    final timelineAsync = ref.watch(timelineProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          await LocalCache.instance.invalidate(CacheKeys.receipts);
          await LocalCache.instance.invalidate(CacheKeys.sales);
          ref.invalidate(receiptsProvider);
          ref.invalidate(salesProvider);
          ref.invalidate(timelineProvider);
          await ref.read(timelineProvider.future).catchError((_) {});
        },
        child: CustomScrollView(
        slivers: [
          // ── Fixed app bar with search + limits ───────────────────────────
          SliverAppBar(
            pinned: true,
            title: const Text('FUZZIES'),
            actions: [
              IconButton(
                icon: const Icon(Icons.settings_outlined, size: 20),
                onPressed: () => context.push('/settings'),
                tooltip: 'Settings',
              ),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(104),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  FuzzySearchBar(
                    onActiveChanged: (active) =>
                        setState(() => _searchActive = active),
                  ),
                  const UploadLimitsTile(),
                ],
              ),
            ),
          ),

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
                          onPressed: () {
                            ref.invalidate(receiptsProvider);
                            ref.invalidate(salesProvider);
                            ref.invalidate(timelineProvider);
                          },
                          child: const Text('RETRY'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
            data: (groups) => _buildTimeline(groups),
          ),

          // Bottom padding so FAB doesn't cover last item
          const SliverToBoxAdapter(child: SizedBox(height: 96)),
        ],
      ),
      ),
      floatingActionButton: const AnimatedFab(),
    );
  }

  List<Widget> _buildTimeline(List<DateGroup> groups) {
    if (groups.isEmpty) {
      return [
        SliverFillRemaining(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.inbox_outlined, size: 48, color: context.fuzzy.mutedFg),
                const SizedBox(height: 12),
                Text(
                  'NO ITEMS YET',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  'Tap + to upload a receipt or sale',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ];
    }

    final slivers = <Widget>[];
    for (final group in groups) {
      slivers.add(
        SliverPersistentHeader(
          pinned: true,
          delegate: DateHeaderDelegate(group.date),
        ),
      );
      slivers.add(
        SliverList(
          delegate: SliverChildBuilderDelegate(
            (ctx, i) => TimelineItemCard(item: group.items[i]),
            childCount: group.items.length,
          ),
        ),
      );
    }
    return slivers;
  }
}
