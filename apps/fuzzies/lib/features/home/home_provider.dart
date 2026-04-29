import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/endpoints.dart';
import '../../core/cache/local_cache.dart';
import '../../models/receipt.dart';
import '../../models/sale.dart';
import '../../models/server_capabilities.dart';
import '../../models/timeline_item.dart';
import '../auth/auth_provider.dart';

// ── Pagination state ──────────────────────────────────────────────────────────

const _pageSize = 20;

class PaginatedListState<T> {
  const PaginatedListState({
    required this.items,
    this.nextCursor,
    required this.hasMore,
    this.isLoadingMore = false,
  });

  final List<T> items;
  final int? nextCursor; // createdAt ms of the oldest loaded item
  final bool hasMore;
  final bool isLoadingMore;

  PaginatedListState<T> copyWith({
    List<T>? items,
    int? nextCursor,
    bool? hasMore,
    bool? isLoadingMore,
  }) =>
      PaginatedListState(
        items: items ?? this.items,
        nextCursor: nextCursor ?? this.nextCursor,
        hasMore: hasMore ?? this.hasMore,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

// ── Receipts notifier ─────────────────────────────────────────────────────────

class ReceiptsNotifier
    extends AsyncNotifier<PaginatedListState<Receipt>> {
  @override
  Future<PaginatedListState<Receipt>> build() async {
    debugPrint('[home] receiptsNotifier: build');
    final cached =
        LocalCache.instance.get<List<dynamic>>(CacheKeys.receipts);
    if (cached != null) {
      debugPrint('[home] receiptsNotifier: cache hit (${cached.length} items)');
      final items = _parseReceipts(cached);
      return PaginatedListState(
        items: items,
        nextCursor: _cursor(items),
        hasMore: items.length >= _pageSize,
      );
    }
    return _fetchPage(null, []);
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    try {
      final next = await _fetchPage(current.nextCursor, current.items);
      state = AsyncData(next);
    } catch (e) {
      // Restore previous state without the loading flag so user can retry
      state = AsyncData(current.copyWith(isLoadingMore: false));
      debugPrint('[home] receiptsNotifier loadMore ERROR: $e');
    }
  }

  Future<void> refresh() async {
    await LocalCache.instance.invalidate(CacheKeys.receipts);
    state = const AsyncLoading();
    try {
      state = AsyncData(await _fetchPage(null, []));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<PaginatedListState<Receipt>> _fetchPage(
      int? cursor, List<Receipt> existing) async {
    final client = ref.read(apiClientProvider);
    final uri = cursor != null
        ? '${Endpoints.receipts}?before=$cursor&limit=$_pageSize'
        : '${Endpoints.receipts}?limit=$_pageSize';

    final resp = await client.dio.get<List<dynamic>>(uri);
    final data = resp.data ?? [];
    debugPrint('[home] receiptsNotifier: ${data.length} items (cursor: $cursor)');

    final newItems = _parseReceipts(data);
    final all = [...existing, ...newItems];

    if (cursor == null) {
      await LocalCache.instance.put(CacheKeys.receipts, data);
    }

    return PaginatedListState(
      items: all,
      nextCursor: _cursor(all),
      hasMore: newItems.length >= _pageSize,
    );
  }

  List<Receipt> _parseReceipts(List<dynamic> data) =>
      data.map((e) => Receipt.fromJson(e as Map<String, dynamic>)).toList();

  int? _cursor(List<Receipt> items) =>
      items.isNotEmpty ? items.last.createdAt.millisecondsSinceEpoch : null;
}

final receiptsNotifier =
    AsyncNotifierProvider<ReceiptsNotifier, PaginatedListState<Receipt>>(
  ReceiptsNotifier.new,
);

// ── Sales notifier ────────────────────────────────────────────────────────────

class SalesNotifier extends AsyncNotifier<PaginatedListState<Sale>> {
  @override
  Future<PaginatedListState<Sale>> build() async {
    debugPrint('[home] salesNotifier: build');
    final cached =
        LocalCache.instance.get<List<dynamic>>(CacheKeys.sales);
    if (cached != null) {
      debugPrint('[home] salesNotifier: cache hit (${cached.length} items)');
      final items = _parseSales(cached);
      return PaginatedListState(
        items: items,
        nextCursor: _cursor(items),
        hasMore: items.length >= _pageSize,
      );
    }
    return _fetchPage(null, []);
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    try {
      final next = await _fetchPage(current.nextCursor, current.items);
      state = AsyncData(next);
    } catch (e) {
      state = AsyncData(current.copyWith(isLoadingMore: false));
      debugPrint('[home] salesNotifier loadMore ERROR: $e');
    }
  }

  Future<void> refresh() async {
    await LocalCache.instance.invalidate(CacheKeys.sales);
    state = const AsyncLoading();
    try {
      state = AsyncData(await _fetchPage(null, []));
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<PaginatedListState<Sale>> _fetchPage(
      int? cursor, List<Sale> existing) async {
    final client = ref.read(apiClientProvider);
    final uri = cursor != null
        ? '${Endpoints.sales}?before=$cursor&limit=$_pageSize'
        : '${Endpoints.sales}?limit=$_pageSize';

    final resp = await client.dio.get<List<dynamic>>(uri);
    final data = resp.data ?? [];
    debugPrint('[home] salesNotifier: ${data.length} items (cursor: $cursor)');

    final newItems = _parseSales(data);
    final all = [...existing, ...newItems];

    if (cursor == null) {
      await LocalCache.instance.put(CacheKeys.sales, data);
    }

    return PaginatedListState(
      items: all,
      nextCursor: _cursor(all),
      hasMore: newItems.length >= _pageSize,
    );
  }

  List<Sale> _parseSales(List<dynamic> data) =>
      data.map((e) => Sale.fromJson(e as Map<String, dynamic>)).toList();

  int? _cursor(List<Sale> items) =>
      items.isNotEmpty ? items.last.createdAt.millisecondsSinceEpoch : null;
}

final salesNotifier =
    AsyncNotifierProvider<SalesNotifier, PaginatedListState<Sale>>(
  SalesNotifier.new,
);

// ── Combined timeline ─────────────────────────────────────────────────────────

class TimelineData {
  const TimelineData({
    required this.groups,
    required this.hasMore,
    this.isLoadingMore = false,
  });
  final List<DateGroup> groups;
  final bool hasMore;
  final bool isLoadingMore;
}

// Returns AsyncLoading on initial load, AsyncError if both fail with no data,
// otherwise AsyncData — allowing incremental display while loading more.
final timelineProvider = Provider<AsyncValue<TimelineData>>((ref) {
  final rAsync = ref.watch(receiptsNotifier);
  final sAsync = ref.watch(salesNotifier);

  // Initial load: both still in flight, no data yet
  if ((rAsync.isLoading && rAsync.valueOrNull == null) ||
      (sAsync.isLoading && sAsync.valueOrNull == null)) {
    return const AsyncLoading();
  }

  // Hard error: initial fetch failed with no prior data
  if (rAsync.hasError && rAsync.valueOrNull == null) {
    return AsyncError(rAsync.error!, rAsync.stackTrace!);
  }
  if (sAsync.hasError && sAsync.valueOrNull == null) {
    return AsyncError(sAsync.error!, sAsync.stackTrace!);
  }

  final receipts = rAsync.valueOrNull?.items ?? [];
  final sales = sAsync.valueOrNull?.items ?? [];
  final hasMore = (rAsync.valueOrNull?.hasMore ?? false) ||
      (sAsync.valueOrNull?.hasMore ?? false);
  final isLoadingMore = (rAsync.valueOrNull?.isLoadingMore ?? false) ||
      (sAsync.valueOrNull?.isLoadingMore ?? false);

  final items = <TimelineItem>[
    ...receipts.map(ReceiptItem.new),
    ...sales.map(SaleItem.new),
  ];
  debugPrint('[home] timeline: ${items.length} items, hasMore=$hasMore');

  return AsyncData(TimelineData(
    groups: groupByDate(items),
    hasMore: hasMore,
    isLoadingMore: isLoadingMore,
  ));
});

// ── Search ────────────────────────────────────────────────────────────────────

class SearchNotifier extends AsyncNotifier<List<TimelineItem>> {
  final _cache = <String, List<TimelineItem>>{};
  Timer? _debounce;

  @override
  Future<List<TimelineItem>> build() async => [];

  void search(String query) {
    _debounce?.cancel();
    if (query.trim().isEmpty) {
      state = const AsyncData([]);
      return;
    }
    _debounce =
        Timer(const Duration(milliseconds: 300), () => _doSearch(query.trim()));
  }

  Future<void> _doSearch(String query) async {
    if (_cache.containsKey(query)) {
      state = AsyncData(_cache[query]!);
      return;
    }

    state = const AsyncLoading();
    try {
      final client = ref.read(apiClientProvider);
      final capabilities = ref.read(capabilitiesProvider).valueOrNull ??
          ServerCapabilities.defaults;

      final futures = <Future<List<TimelineItem>>>[
        _searchReceipts(client, query),
        if (capabilities.salesSearchEnabled)
          _searchSalesRemote(client, query)
        else
          _searchSalesLocal(query),
      ];

      final results = await Future.wait(futures);
      final merged = results.expand((r) => r).toList();
      _cache[query] = merged;
      state = AsyncData(merged);
    } catch (e) {
      state = AsyncError(e, StackTrace.current);
    }
  }

  Future<List<TimelineItem>> _searchReceipts(
      ApiClient client, String query) async {
    final resp = await client.dio.post<List<dynamic>>(
      Endpoints.receiptsSearch,
      data: {'query': query},
    );
    return (resp.data ?? [])
        .map((e) => ReceiptItem(Receipt.fromJson(e as Map<String, dynamic>)))
        .toList();
  }

  Future<List<TimelineItem>> _searchSalesRemote(
      ApiClient client, String query) async {
    final resp = await client.dio.post<List<dynamic>>(
      Endpoints.salesSearch,
      data: {'query': query},
    );
    return (resp.data ?? [])
        .map((e) => SaleItem(Sale.fromJson(e as Map<String, dynamic>)))
        .toList();
  }

  Future<List<TimelineItem>> _searchSalesLocal(String query) async {
    final sales =
        ref.read(salesNotifier).valueOrNull?.items ?? [];
    return sales
        .where((s) => s.matchesQuery(query))
        .map(SaleItem.new)
        .toList();
  }

  void clear() {
    _debounce?.cancel();
    state = const AsyncData([]);
  }
}

final searchProvider =
    AsyncNotifierProvider<SearchNotifier, List<TimelineItem>>(
  SearchNotifier.new,
);

// ── FAB open state (shared so the home body can render a scrim) ───────────────

final fabOpenProvider = StateProvider<bool>((ref) => false);

// ── Upload limits ─────────────────────────────────────────────────────────────

class UploadLimits {
  const UploadLimits({
    required this.receiptsToday,
    required this.salesToday,
    this.dailyLimit = 30,
  });
  final int receiptsToday;
  final int salesToday;
  final int dailyLimit;

  bool get receiptsNearLimit => receiptsToday >= dailyLimit - 5;
  bool get salesNearLimit => salesToday >= dailyLimit - 5;
}

final uploadLimitsProvider = Provider<UploadLimits>((ref) {
  final receipts = ref.watch(receiptsNotifier).valueOrNull?.items ?? [];
  final sales = ref.watch(salesNotifier).valueOrNull?.items ?? [];

  final today = DateTime.now();
  bool isToday(DateTime dt) =>
      dt.year == today.year && dt.month == today.month && dt.day == today.day;

  return UploadLimits(
    receiptsToday: receipts.where((r) => isToday(r.createdAt)).length,
    salesToday: sales.where((s) => isToday(s.createdAt)).length,
  );
});
