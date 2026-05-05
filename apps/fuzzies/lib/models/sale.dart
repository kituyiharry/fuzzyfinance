import 'dart:convert';

DateTime _parseDateTime(dynamic value) {
  if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
  if (value is String) return DateTime.tryParse(value) ?? DateTime.now();
  return DateTime.now();
}

List<dynamic> _parseJsonList(dynamic value) {
  if (value is List) return value;
  if (value is String && value.isNotEmpty) {
    final decoded = jsonDecode(value);
    if (decoded is List) return decoded;
  }
  return [];
}

class Sale {
  const Sale({
    required this.id,
    required this.status,
    required this.createdAt,
    this.documentTitle,
    this.saleDate,
    this.totalRevenue,
    this.totalCost,
    this.totalMargin,
    this.currency,
    this.category,
    this.notes,
    this.tags = const [],
    this.lineItems = const [],
    this.errorMessage,
  });

  final String id;
  final SaleStatus status;
  final DateTime createdAt;
  final String? documentTitle;
  final String? saleDate;
  final String? totalRevenue;
  final String? totalCost;
  final String? totalMargin;
  final String? currency;
  final String? category;
  final String? notes;
  final List<String> tags;
  final List<SaleLineItem> lineItems;
  final String? errorMessage;

  String get displayTitle => documentTitle ?? 'Sale';

  bool matchesQuery(String q) {
    final lower = q.toLowerCase();
    return (documentTitle?.toLowerCase().contains(lower) ?? false) ||
        (category?.toLowerCase().contains(lower) ?? false) ||
        (notes?.toLowerCase().contains(lower) ?? false) ||
        tags.any((t) => t.toLowerCase().contains(lower));
  }

  factory Sale.fromJson(Map<String, dynamic> json) => Sale(
        id: json['id'] as String,
        status: SaleStatus.fromString(json['status'] as String? ?? ''),
        createdAt: _parseDateTime(json['createdAt']),
        documentTitle: json['documentTitle'] as String?,
        saleDate: json['saleDate'] as String?,
        totalRevenue: json['totalRevenue'] as String?,
        totalCost: json['totalCost'] as String?,
        totalMargin: json['totalMargin'] as String?,
        currency: json['currency'] as String?,
        category: json['category'] as String?,
        notes: json['notes'] as String?,
        tags: _parseJsonList(json['tags']).cast<String>(),
        lineItems: _parseJsonList(json['lineItems'])
            .map((e) => SaleLineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        errorMessage: json['errorMessage'] as String?,
      );
}

enum SaleStatus {
  processing,
  staged,
  complete,
  completeNoSync,
  failed,
  unknown;

  static SaleStatus fromString(String s) =>
      SaleStatus.values.where((e) => e.name == _toCamel(s)).firstOrNull ??
      SaleStatus.unknown;

  static String _toCamel(String s) =>
      s.replaceAllMapped(RegExp(r'_(\w)'), (m) => m[1]!.toUpperCase());
}

class SaleLineItem {
  const SaleLineItem({
    this.id,
    this.description,
    this.type,
    this.unitsSold,
    this.buyPrice,
    this.sellPrice,
    this.total,
  });

  final String? id;
  final String? description;
  final String? type;
  final String? unitsSold;
  final String? buyPrice;
  final String? sellPrice;
  final String? total;

  factory SaleLineItem.fromJson(Map<String, dynamic> json) => SaleLineItem(
        id: json['id'] as String?,
        description: json['description'] as String?,
        type: json['type'] as String?,
        unitsSold: json['unitsSold'] as String?,
        buyPrice: json['buyPrice'] as String?,
        sellPrice: json['sellPrice'] as String?,
        total: json['total'] as String?,
      );
}
