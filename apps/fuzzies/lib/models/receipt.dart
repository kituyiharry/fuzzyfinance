import 'dart:convert';

DateTime _parseDateTime(dynamic value) {
  if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
  if (value is String) return DateTime.tryParse(value) ?? DateTime.now();
  return DateTime.now();
}

// SQLite stores JSON columns as text; Drizzle returns them as strings.
List<dynamic> _parseJsonList(dynamic value) {
  if (value is List) return value;
  if (value is String && value.isNotEmpty) {
    final decoded = jsonDecode(value);
    if (decoded is List) return decoded;
  }
  return [];
}

class Receipt {
  const Receipt({
    required this.id,
    required this.status,
    required this.createdAt,
    this.merchantName,
    this.receiptDate,
    this.total,
    this.subtotal,
    this.tax,
    this.tip,
    this.currency,
    this.category,
    this.notes,
    this.paymentMethod,
    this.receiptNumber,
    this.tags = const [],
    this.lineItems = const [],
    this.errorMessage,
    this.duplicateOf,
  });

  final String id;
  final ReceiptStatus status;
  final DateTime createdAt;
  final String? merchantName;
  final String? receiptDate;
  final String? total;
  final String? subtotal;
  final String? tax;
  final String? tip;
  final String? currency;
  final String? category;
  final String? notes;
  final String? paymentMethod;
  final String? receiptNumber;
  final List<String> tags;
  final List<ReceiptLineItem> lineItems;
  final String? errorMessage;
  final String? duplicateOf;

  String get displayTitle => merchantName ?? 'Receipt';

  factory Receipt.fromJson(Map<String, dynamic> json) => Receipt(
        id: json['id'] as String,
        status: ReceiptStatus.fromString(json['status'] as String? ?? ''),
        createdAt: _parseDateTime(json['createdAt']),
        merchantName: json['merchantName'] as String?,
        receiptDate: json['receiptDate'] as String?,
        total: json['total'] as String?,
        subtotal: json['subtotal'] as String?,
        tax: json['tax'] as String?,
        tip: json['tip'] as String?,
        currency: json['currency'] as String?,
        category: json['category'] as String?,
        notes: json['notes'] as String?,
        paymentMethod: json['paymentMethod'] as String?,
        receiptNumber: json['receiptNumber'] as String?,
        tags: _parseJsonList(json['tags']).cast<String>(),
        lineItems: _parseJsonList(json['lineItems'])
            .map((e) => ReceiptLineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        errorMessage: json['errorMessage'] as String?,
        duplicateOf: json['duplicateOf'] as String?,
      );
}

enum ReceiptStatus {
  processing,
  staged,
  complete,
  completeNoSync,
  failed,
  unknown;

  static ReceiptStatus fromString(String s) =>
      ReceiptStatus.values.where((e) => e.name == _toCamel(s)).firstOrNull ??
      ReceiptStatus.unknown;

  static String _toCamel(String s) =>
      s.replaceAllMapped(RegExp(r'_(\w)'), (m) => m[1]!.toUpperCase());

  bool get isTerminal =>
      this == complete || this == completeNoSync || this == failed;
}

class ReceiptLineItem {
  const ReceiptLineItem({
    this.id,
    this.description,
    this.qty,
    this.unitPrice,
    this.total,
  });

  final String? id;
  final String? description;
  final String? qty;
  final String? unitPrice;
  final String? total;

  factory ReceiptLineItem.fromJson(Map<String, dynamic> json) =>
      ReceiptLineItem(
        id: json['id'] as String?,
        description: json['description'] as String?,
        qty: json['qty'] as String?,
        unitPrice: json['unitPrice'] as String?,
        total: json['total'] as String?,
      );
}
