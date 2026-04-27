class AppConfig {
  static const String env = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'dev',
  );

  // Android emulator → host: 10.0.2.2; iOS simulator → host: localhost
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5173',
  );

  static const String appVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: '0.0.1',
  );

  static bool get isDev => env == 'dev';
  static bool get isProd => env == 'prod';
}
