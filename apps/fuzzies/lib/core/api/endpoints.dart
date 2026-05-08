import '../config/app_config.dart';

class Endpoints {
  static String get base => AppConfig.baseUrl;

  // ── Auth (better-auth) ────────────────────────────────────────────────────
  static String get signInSocial => '$base/api/auth/sign-in/social';
  static String get signOut => '$base/api/auth/sign-out';
  static String get session => '$base/api/auth/get-session';

  // ── Capability discovery ──────────────────────────────────────────────────
  static String get health => '$base/api/health';

  // ── Receipts ──────────────────────────────────────────────────────────────
  static String get receipts => '$base/api/receipts';
  static String receipt(String id) => '$base/api/receipts/$id';
  static String receiptStatus(String id) => '$base/api/receipts/$id/status';
  static String receiptCommit(String id) => '$base/api/receipts/$id/commit';
  static String receiptAbort(String id) => '$base/api/receipts/$id/abort';
  static String get receiptsSearch => '$base/api/receipts/search';

  // ── Payables ──────────────────────────────────────────────────────────────
  static String receiptPayable(String id) => '$base/api/receipts/$id/payable';
  static String receiptPayableUpdates(String id) =>
      '$base/api/receipts/$id/payable/updates';

  // ── Sales ─────────────────────────────────────────────────────────────────
  static String get sales => '$base/api/sales';
  static String sale(String id) => '$base/api/sales/$id';
  static String saleStatus(String id) => '$base/api/sales/$id/status';
  static String saleCommit(String id) => '$base/api/sales/$id/commit';
  static String saleAbort(String id) => '$base/api/sales/$id/abort';
  static String get salesSearch => '$base/api/sales/search';

  // ── Receivables ───────────────────────────────────────────────────────────
  static String saleReceivable(String id) => '$base/api/sales/$id/receivable';
  static String saleReceivableUpdates(String id) =>
      '$base/api/sales/$id/receivable/updates';

  // ── Passkeys ──────────────────────────────────────────────────────────────
  static String get passkeyRegisterOptions =>
      '$base/api/auth/passkey/register-options';
  static String get passkeyVerifyRegistration =>
      '$base/api/auth/passkey/verify-registration';
  static String get passkeyAuthenticateOptions =>
      '$base/api/auth/passkey/authenticate-options';
  static String get passkeyVerifyAuthentication =>
      '$base/api/auth/passkey/verify-authentication';
}
