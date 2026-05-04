DateTime _parseTs(dynamic v) {
  if (v is int) return DateTime.fromMillisecondsSinceEpoch(v);
  if (v is String) return DateTime.tryParse(v) ?? DateTime.now();
  return DateTime.now();
}

class PayableUpdate {
  const PayableUpdate({
    required this.id,
    required this.note,
    required this.createdAt,
  });

  final String id;
  final String note;
  final DateTime createdAt;

  factory PayableUpdate.fromJson(Map<String, dynamic> j) => PayableUpdate(
        id: j['id'] as String,
        note: j['note'] as String? ?? '',
        createdAt: _parseTs(j['createdAt']),
      );
}

class Payable {
  const Payable({
    required this.id,
    required this.status,
    required this.openedAt,
    this.closedAt,
    required this.updates,
  });

  final String id;
  final String status; // 'open' | 'closed'
  final DateTime openedAt;
  final DateTime? closedAt;
  final List<PayableUpdate> updates;

  bool get isOpen => status == 'open';

  factory Payable.fromJson(Map<String, dynamic> j) => Payable(
        id: j['id'] as String,
        status: j['status'] as String? ?? 'open',
        openedAt: _parseTs(j['openedAt']),
        closedAt: j['closedAt'] != null ? _parseTs(j['closedAt']) : null,
        updates: (j['updates'] as List<dynamic>? ?? [])
            .map((u) => PayableUpdate.fromJson(u as Map<String, dynamic>))
            .toList(),
      );
}

class ReceivableUpdate {
  const ReceivableUpdate({
    required this.id,
    required this.note,
    required this.createdAt,
  });

  final String id;
  final String note;
  final DateTime createdAt;

  factory ReceivableUpdate.fromJson(Map<String, dynamic> j) => ReceivableUpdate(
        id: j['id'] as String,
        note: j['note'] as String? ?? '',
        createdAt: _parseTs(j['createdAt']),
      );
}

class Receivable {
  const Receivable({
    required this.id,
    required this.status,
    required this.openedAt,
    this.closedAt,
    required this.updates,
  });

  final String id;
  final String status;
  final DateTime openedAt;
  final DateTime? closedAt;
  final List<ReceivableUpdate> updates;

  bool get isOpen => status == 'open';

  factory Receivable.fromJson(Map<String, dynamic> j) => Receivable(
        id: j['id'] as String,
        status: j['status'] as String? ?? 'open',
        openedAt: _parseTs(j['openedAt']),
        closedAt: j['closedAt'] != null ? _parseTs(j['closedAt']) : null,
        updates: (j['updates'] as List<dynamic>? ?? [])
            .map((u) => ReceivableUpdate.fromJson(u as Map<String, dynamic>))
            .toList(),
      );
}
