class ServerCapabilities {
  const ServerCapabilities({
    required this.apiLevel,
    required this.salesSearchEnabled,
    required this.exportsEnabled,
  });

  final String apiLevel;
  final bool salesSearchEnabled;
  final bool exportsEnabled;

  static const defaults = ServerCapabilities(
    apiLevel: 'v1',
    salesSearchEnabled: false,
    exportsEnabled: true,
  );

  factory ServerCapabilities.fromJson(Map<String, dynamic> json) =>
      ServerCapabilities(
        apiLevel: json['apiLevel'] as String? ?? 'v1',
        salesSearchEnabled:
            (json['features'] as Map<String, dynamic>?)?['salesSearch']
                as bool? ??
            false,
        exportsEnabled:
            (json['features'] as Map<String, dynamic>?)?['exports'] as bool? ??
            true,
      );

  Map<String, dynamic> toJson() => {
        'apiLevel': apiLevel,
        'features': {
          'salesSearch': salesSearchEnabled,
          'exports': exportsEnabled,
        },
      };
}
