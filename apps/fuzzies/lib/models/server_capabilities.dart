class ServerCapabilities {
  const ServerCapabilities({
    required this.apiLevel,
    required this.salesSearchEnabled,
    required this.exportsEnabled,
    required this.passkeysEnabled,
  });

  final String apiLevel;
  final bool salesSearchEnabled;
  final bool exportsEnabled;
  final bool passkeysEnabled;

  static const defaults = ServerCapabilities(
    apiLevel: 'v1',
    salesSearchEnabled: false,
    exportsEnabled: true,
    passkeysEnabled: false,
  );

  factory ServerCapabilities.fromJson(Map<String, dynamic> json) {
    final features = json['features'] as Map<String, dynamic>? ?? {};
    return ServerCapabilities(
      apiLevel: json['apiLevel'] as String? ?? 'v1',
      salesSearchEnabled: features['salesSearch'] as bool? ?? false,
      exportsEnabled: features['exports'] as bool? ?? true,
      passkeysEnabled: features['passkeys'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'apiLevel': apiLevel,
        'features': {
          'salesSearch': salesSearchEnabled,
          'exports': exportsEnabled,
          'passkeys': passkeysEnabled,
        },
      };
}
