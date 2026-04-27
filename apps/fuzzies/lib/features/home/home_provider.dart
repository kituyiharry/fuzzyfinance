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

// ── Raw list providers ────────────────────────────────────────────────────────

final receiptsProvider = FutureProvider<List<Receipt>>((ref) async {
  debugPrint('[home] receiptsProvider: fetching');
  final client = ref.watch(apiClientProvider);
  final cache = LocalCache.instance;

  final cached = cache.get<List<dynamic>>(CacheKeys.receipts);
  if (cached != null) {
    debugPrint('[home] receiptsProvider: cache hit (${cached.length} items)');
    return cached.map((e) => Receipt.fromJson(e as Map<String, dynamic>)).toList();
  }

  try {
    final resp = await client.dio.get<List<dynamic>>(Endpoints.receipts);
    final data = resp.data ?? [];
    debugPrint('[home] receiptsProvider: got ${data.length} items from API');
    await cache.put(CacheKeys.receipts, data);
    return data.map((e) => Receipt.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e, st) {
    debugPrint('[home] receiptsProvider ERROR: $e\n$st');
    rethrow;
  }
});

final salesProvider = FutureProvider<List<Sale>>((ref) async {
  debugPrint('[home] salesProvider: fetching');
  final client = ref.watch(apiClientProvider);
  final cache = LocalCache.instance;

  final cached = cache.get<List<dynamic>>(CacheKeys.sales);
  if (cached != null) {
    debugPrint('[home] salesProvider: cache hit (${cached.length} items)');
    return cached.map((e) => Sale.fromJson(e as Map<String, dynamic>)).toList();
  }

  try {
    final resp = await client.dio.get<List<dynamic>>(Endpoints.sales);
    final data = resp.data ?? [];
    debugPrint('[home] salesProvider: got ${data.length} items from API');
    await cache.put(CacheKeys.sales, data);
    return data.map((e) => Sale.fromJson(e as Map<String, dynamic>)).toList();
  } catch (e, st) {
    debugPrint('[home] salesProvider ERROR: $e\n$st');
    rethrow;
  }
});

// ── Combined timeline ─────────────────────────────────────────────────────────

final timelineProvider = FutureProvider<List<DateGroup>>((ref) async {
  debugPrint('[home] timelineProvider: combining receipts + sales');
  final receipts = await ref.watch(receiptsProvider.future);
  final sales = await ref.watch(salesProvider.future);

  final items = <TimelineItem>[
    ...receipts.map(ReceiptItem.new),
    ...sales.map(SaleItem.new),
  ];
  final groups = groupByDate(items);
  debugPrint('[home] timelineProvider: ${items.length} items across ${groups.length} date groups');
  return groups;
});

// ── Search ────────────────────────────────────────────────────────────────────

class SearchNotifier extends AsyncNotifier<List<TimelineItem>> {
  // In-memory session cache: query → results
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
    _debounce = Timer(const Duration(milliseconds: 300), () => _doSearch(query.trim()));
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

  Future<List<TimelineItem>> _searchReceipts(ApiClient client, String query) async {
    final resp = await client.dio.post<List<dynamic>>(
      Endpoints.receiptsSearch,
      data: {'query': query},
    );
    return (resp.data ?? [])
        .map((e) => ReceiptItem(Receipt.fromJson(e as Map<String, dynamic>)))
        .toList();
  }

  Future<List<TimelineItem>> _searchSalesRemote(ApiClient client, String query) async {
    final resp = await client.dio.post<List<dynamic>>(
      Endpoints.salesSearch,
      data: {'query': query},
    );
    return (resp.data ?? [])
        .map((e) => SaleItem(Sale.fromJson(e as Map<String, dynamic>)))
        .toList();
  }

  Future<List<TimelineItem>> _searchSalesLocal(String query) async {
    final sales = ref.read(salesProvider).valueOrNull ?? [];
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

final searchProvider = AsyncNotifierProvider<SearchNotifier, List<TimelineItem>>(
  SearchNotifier.new,
);

// ── Upload limits (derived from list data) ────────────────────────────────────

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
  final receipts = ref.watch(receiptsProvider).valueOrNull ?? [];
  final sales = ref.watch(salesProvider).valueOrNull ?? [];

  final today = DateTime.now();
  bool isToday(DateTime dt) =>
      dt.year == today.year && dt.month == today.month && dt.day == today.day;

  return UploadLimits(
    receiptsToday: receipts.where((r) => isToday(r.createdAt)).length,
    salesToday: sales.where((s) => isToday(s.createdAt)).length,
  );
});
