# Fuzzies

Mobile companion app for FuzzyFinance. Lets users sign in with Google, view their receipts and sales on a timeline, search across both, and upload new documents from camera or file picker.

Targets Android and iOS.

---

## Architecture

### State management — Riverpod

All state is managed with `flutter_riverpod`. The key providers are:

| Provider | Type | Purpose |
|---|---|---|
| `authProvider` | `AsyncNotifierProvider` | Auth state, Google sign-in, sign-out |
| `capabilitiesProvider` | `FutureProvider` | Server feature flags from `GET /api/health` |
| `receiptsProvider` | `FutureProvider` | Fetches and caches the receipt list |
| `salesProvider` | `FutureProvider` | Fetches and caches the sales list |
| `timelineProvider` | `FutureProvider` | Merges + groups receipts and sales by date |
| `searchProvider` | `AsyncNotifierProvider` | Debounced search with remote + local fallback |
| `uploadLimitsProvider` | `Provider` | Today's upload counts derived from list data |
| `themeProvider` | `NotifierProvider` | Active theme, persisted to SharedPreferences |
| `apiClientProvider` | `Provider` | Singleton Dio client |

### Routing — go_router

Declarative routing with an auth redirect guard. `_AuthListenable` bridges Riverpod auth state changes into go_router's `refreshListenable` so route guards re-evaluate whenever auth state changes.

| Route | Page |
|---|---|
| `/sign-in` | Google sign-in |
| `/home` | Timeline + search + upload |
| `/receipt/:id` | Receipt detail |
| `/sale/:id` | Sale detail |
| `/settings` | Theme switcher + sign-out |

### HTTP — Dio

`ApiClient` wraps Dio with:
- `CookieManager` backed by `CookieJar` for automatic session cookie attachment
- `_AuthInterceptor` — on 401, clears the session and triggers sign-out via `onUnauthorized` callback
- `X-App-Version` and `X-App-Env` headers on every request for server-side client tracking

### Auth flow

1. `GoogleSignIn` presents the native account picker and returns an `idToken`
2. The app POSTs `{ idToken }` to `POST /api/auth/mobile/google` — a thin SvelteKit wrapper that forwards to better-auth's social sign-in handler, bypassing origin checks that reject non-browser clients
3. better-auth verifies the token with Google, creates a session, and responds with `Set-Cookie`
4. The raw cookie string is persisted to `flutter_secure_storage` (AES-256 / Keychain)
5. On cold restart, `ApiClient._restoreSession()` re-injects the cookie into the `CookieJar` before the first request fires
6. `hasActiveSession()` checks for a stored cookie locally — no network call needed. If the cookie is expired the first API call returns 401 and the interceptor signs the user out

### Caching — Hive

`LocalCache` wraps a `Box<String>` storing JSON-encoded `{ data, ts }` entries with a 5-minute TTL. Initialised in `main()` before `runApp`.

Cache keys: `receipts_list`, `sales_list`, `receipt_{id}`, `sale_{id}`.

Pull-to-refresh and successful uploads invalidate the relevant cache keys before re-fetching.

### Theme system

Three themes mirroring the web app's brutalist design identity:

| Name | Background | Foreground |
|---|---|---|
| High Contrast (default) | `#ffffff` | `#000000` |
| Dark | `#0a0a0a` | `#f0f0f0` |
| Low Contrast | `#fdfcf0` | `#3a3a3a` |

All themes use sharp corners (`BorderRadius.zero`), weight-900 uppercase headings, and hard box shadows with zero blur. Active theme is persisted to `SharedPreferences`.

### Data models

`Receipt` and `Sale` use defensive `fromJson` factories:
- `createdAt` accepts both Unix millisecond integers (SQLite storage) and ISO strings
- `lineItems` and `tags` accept both parsed JSON arrays and raw JSON strings (Drizzle returns SQLite JSON columns as text)

`TimelineItem` is a sealed class wrapping `ReceiptItem | SaleItem`, used to merge the two lists into a single date-grouped timeline.

---

## Project structure

```
lib/
├── main.dart
├── core/
│   ├── api/
│   │   ├── api_client.dart        # Dio singleton, cookie manager, 401 interceptor
│   │   └── endpoints.dart         # All API path constants
│   ├── auth/
│   │   └── auth_service.dart      # Google sign-in, session persistence
│   ├── cache/
│   │   └── local_cache.dart       # Hive wrapper with TTL
│   ├── config/
│   │   └── app_config.dart        # --dart-define constants
│   └── theme/
│       ├── app_colors.dart        # Color tokens for all 3 themes
│       └── app_theme.dart         # ThemeData factory, ThemeNotifier
├── features/
│   ├── auth/
│   │   ├── auth_provider.dart     # AuthNotifier, capabilitiesProvider
│   │   └── sign_in_page.dart
│   ├── detail/
│   │   ├── receipt_detail_page.dart
│   │   └── sale_detail_page.dart
│   ├── home/
│   │   ├── home_page.dart
│   │   ├── home_provider.dart
│   │   └── widgets/
│   │       ├── animated_fab.dart          # Expandable FAB with 4 upload actions
│   │       ├── date_header_delegate.dart  # Sticky date section headers
│   │       ├── fuzzy_search_bar.dart      # Debounced search input
│   │       ├── search_results_row.dart    # Horizontal result cards
│   │       ├── timeline_item_card.dart    # Receipt/sale row card
│   │       └── upload_limits_tile.dart    # Collapsible daily limit counts
│   └── settings/
│       └── settings_page.dart
├── models/
│   ├── receipt.dart
│   ├── sale.dart
│   ├── server_capabilities.dart   # Feature flags from /api/health
│   └── timeline_item.dart         # Sealed union: ReceiptItem | SaleItem
└── router/
    └── app_router.dart
```

---

## Environment configuration

Environment values are injected at build time via `--dart-define` and read from `AppConfig`:

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `dev` | `dev` or `prod` |
| `API_BASE_URL` | `http://10.0.2.2:5173` | Base URL for all API calls |
| `APP_VERSION` | `0.0.1` | Sent as `X-App-Version` header |

`10.0.2.2` is the Android emulator's alias for the host machine's localhost. For a physical device on the same network, use the machine's local IP instead.

---

## Build and run

### Prerequisites

- Flutter SDK `^3.7.0`
- Android Studio / Xcode for emulators
- The FuzzyFinance web server running locally

### Install dependencies

```bash
flutter pub get
```

### Run (Android emulator → local server)

```bash
flutter run \
  --dart-define=APP_ENV=dev \
  --dart-define=API_BASE_URL=http://10.0.2.2:5173
```

### Run (physical device → local server)

```bash
flutter run \
  --dart-define=APP_ENV=dev \
  --dart-define=API_BASE_URL=http://192.168.x.x:5173
```

### Production build

```bash
# Android
flutter build apk \
  --dart-define=APP_ENV=prod \
  --dart-define=API_BASE_URL=https://app.fuzzyfinance.com \
  --dart-define=APP_VERSION=1.0.0

# iOS
flutter build ipa \
  --dart-define=APP_ENV=prod \
  --dart-define=API_BASE_URL=https://app.fuzzyfinance.com \
  --dart-define=APP_VERSION=1.0.0
```

### VS Code launch configuration

Create `.vscode/launch.json` to avoid typing `--dart-define` flags manually:

```json
{
  "configurations": [
    {
      "name": "Fuzzies (dev - emulator)",
      "request": "launch",
      "type": "dart",
      "args": [
        "--dart-define=APP_ENV=dev",
        "--dart-define=API_BASE_URL=http://10.0.2.2:5173"
      ]
    },
    {
      "name": "Fuzzies (dev - device)",
      "request": "launch",
      "type": "dart",
      "args": [
        "--dart-define=APP_ENV=dev",
        "--dart-define=API_BASE_URL=http://192.168.x.x:5173"
      ]
    }
  ]
}
```

---

## Google OAuth setup

Two OAuth 2.0 client IDs are required from Google Cloud Console (same project):

- **Web client** — used by the server's better-auth Google provider (`GOOGLE_CLIENT_ID` env var)
- **iOS client** — bundle ID must match `CFBundleIdentifier` in `ios/Runner/Info.plist`

The server's better-auth config passes both as `clientId: [webClientId, iosClientId]` so tokens issued by either client are accepted by the same session system.

The `GIDClientID` key in `ios/Runner/Info.plist` must be set to the iOS OAuth client ID. The corresponding reverse-DNS URL scheme (`com.googleusercontent.apps.<client-id>`) must also be present in `CFBundleURLTypes`.

Android requires a SHA-1 certificate fingerprint registered in Google Cloud Console. Generate it with:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android
```

---

## API endpoints used

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/mobile/google` | — | Exchange Google idToken for session cookie |
| `POST` | `/api/auth/sign-out` | — | End session |
| `GET` | `/api/health` | — | Server capability flags |
| `GET` | `/api/receipts` | required | List all receipts |
| `POST` | `/api/receipts` | required | Upload receipt (multipart) |
| `GET` | `/api/receipts/:id` | required | Receipt detail |
| `GET` | `/api/receipts/:id/status` | required | Processing status |
| `POST` | `/api/receipts/:id/commit` | required | Confirm staged receipt |
| `POST` | `/api/receipts/:id/abort` | required | Discard staged receipt |
| `POST` | `/api/receipts/search` | required | Semantic search |
| `GET` | `/api/sales` | required | List all sales |
| `POST` | `/api/sales` | required | Upload sale (multipart) |
| `GET` | `/api/sales/:id` | required | Sale detail |
| `GET` | `/api/sales/:id/status` | required | Processing status |
| `POST` | `/api/sales/:id/commit` | required | Confirm staged sale |
| `POST` | `/api/sales/:id/abort` | required | Discard staged sale |
| `POST` | `/api/sales/search` | required | Semantic search |
