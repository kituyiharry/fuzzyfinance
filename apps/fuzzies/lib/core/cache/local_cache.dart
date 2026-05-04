import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';

const _boxName = 'fuzzy_cache';
const _ttlMs = 5 * 60 * 1000; // 5 minutes

class LocalCache {
  static LocalCache? _instance;
  static LocalCache get instance => _instance!;

  LocalCache._(this._box);
  final Box<String> _box;

  static Future<void> init() async {
    await Hive.initFlutter();
    final box = await Hive.openBox<String>(_boxName);
    _instance = LocalCache._(box);
  }

  Future<void> put(String key, Object value) async {
    final entry = jsonEncode({
      'data': value,
      'ts': DateTime.now().millisecondsSinceEpoch,
    });
    await _box.put(key, entry);
  }

  T? get<T>(String key) {
    final raw = _box.get(key);
    if (raw == null) return null;
    final entry = jsonDecode(raw) as Map<String, dynamic>;
    final age = DateTime.now().millisecondsSinceEpoch - (entry['ts'] as int);
    if (age > _ttlMs) {
      _box.delete(key);
      return null;
    }
    return entry['data'] as T?;
  }

  Future<void> invalidate(String key) => _box.delete(key);

  Future<void> invalidateAll() => _box.clear();
}

// Well-known cache keys
extension CacheKeys on LocalCache {
  static const receipts = 'receipts_list';
  static const sales = 'sales_list';
  static String receipt(String id) => 'receipt_$id';
  static String sale(String id) => 'sale_$id';
  static const capabilities = 'server_capabilities';
}
