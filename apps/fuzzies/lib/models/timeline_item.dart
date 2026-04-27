import 'receipt.dart';
import 'sale.dart';

sealed class TimelineItem {
  DateTime get createdAt;
  String get id;
  String get displayTitle;
}

final class ReceiptItem extends TimelineItem {
  ReceiptItem(this.receipt);
  final Receipt receipt;

  @override
  DateTime get createdAt => receipt.createdAt;
  @override
  String get id => receipt.id;
  @override
  String get displayTitle => receipt.displayTitle;
}

final class SaleItem extends TimelineItem {
  SaleItem(this.sale);
  final Sale sale;

  @override
  DateTime get createdAt => sale.createdAt;
  @override
  String get id => sale.id;
  @override
  String get displayTitle => sale.displayTitle;
}

// Groups items by calendar date (yyyy-MM-dd)
class DateGroup {
  DateGroup({required this.date, required this.items});
  final DateTime date;
  final List<TimelineItem> items;
}

List<DateGroup> groupByDate(List<TimelineItem> items) {
  final sorted = [...items]
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  final groups = <String, DateGroup>{};
  for (final item in sorted) {
    final key = _dateKey(item.createdAt);
    groups.putIfAbsent(
      key,
      () => DateGroup(
        date: DateTime(item.createdAt.year, item.createdAt.month,
            item.createdAt.day),
        items: [],
      ),
    ).items.add(item);
  }
  // Return in descending date order
  return groups.values.toList()
    ..sort((a, b) => b.date.compareTo(a.date));
}

String _dateKey(DateTime dt) =>
    '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
