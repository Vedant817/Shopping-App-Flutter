# Threadline

Threadline is a Flutter commerce-intelligence client backed by the TypeScript service in `service/`. It provides workspace-scoped overview, catalog, customer, order, synchronization, Shopify installation, and member-management views.

The repository contains no bundled commerce records, demo tenants, fallback metrics, simulated health state, or Shopify/Supabase secrets. A build without the required runtime configuration opens a setup screen instead of showing fabricated data.

## Architecture

```text
Flutter client
  ├─ Supabase Email OTP and secure session storage
  ├─ Authenticated HTTPS API client
  └─ threadline:// Shopify install return

Render web service (service/src/http)
  ├─ Supabase JWT verification and tenant authorization
  ├─ Shopify OAuth and GraphQL ingestion
  ├─ PostgreSQL-backed queue and analytics queries
  └─ REST/webhook API

Render worker (service/src/worker)
  └─ Durable Shopify sync, webhook, and compliance processing

Supabase/PostgreSQL
  ├─ Auth users and JWT issuer/JWKS
  ├─ Threadline schema and RLS policies
  └─ Shopify installations, source data, jobs, and audit events
```

## Prerequisites

- Node.js `24` or newer.
- Flutter `3.38.1` or newer and Dart `3.10` or newer.
- A Supabase project with Email OTP enabled.
- A Shopify Partner account, public app, and development store.
- A Render account and a reachable HTTPS service hostname.
- Android SDK for Android builds; macOS with Xcode and signing for iOS builds.
- Docker Desktop if running the database/RLS integration check locally.

## 1. Supabase

1. Create a Supabase project.
2. In **Authentication → Providers**, enable Email. Keep the confirmation/OTP email template usable for the intended users.
3. Copy the project URL and a publishable key. Use the publishable key in Flutter; never use a Supabase secret or service-role key in the client.
4. Set the service JWT values to:
   - `SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1`
   - `SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
   - `SUPABASE_JWT_AUDIENCE=authenticated`
5. Use one migration history for the database. The canonical runtime history is `service/drizzle/`; `supabase/migrations/` is a checked mirror. Do not apply both histories independently to the same database. For the Render deployment, let the API pre-deploy command apply Drizzle migrations.

For a local/service-owned migration run:

```bash
cd service
npm ci
$env:DATABASE_URL="postgresql://..."
npm run db:migrate
```

The Render blueprint runs the compiled equivalent, `npm run db:migrate:runtime`, before the web service starts. The migration mirror check is available with `npm run migrations:sync` and `npm run migrations:check`.

## 2. Shopify Partner app

Create a public app in the Shopify Partner dashboard and a development store for verification.

Configure the app with:

- The API version supported by the service, currently configured as `2026-07` in `render.yaml`.
- The scopes needed for the queried products, variants, customers, orders, refunds, and abandoned checkouts. The service does not silently broaden scopes; review the current Shopify Partner requirements before publishing.
- The OAuth callback URL:

```text
https://<render-service-host>/v1/auth/shopify/callback
```

- The post-install return URL:

```text
threadline://shopify/install
```

- The webhook endpoint:

```text
https://<render-service-host>/v1/webhooks/shopify
```

Register the webhook topics accepted by the service, including the relevant product topics. Customer, order, refund, privacy, and event topics require Shopify protected-customer-data approval before they can be deployed. Abandoned checkout data is collected through the Admin `abandonedCheckouts` query rather than unsupported Admin cart/checkout roots.

The first successful Shopify install creates the workspace and assigns the installing Supabase user as owner. Additional members must already have a Supabase account; the member page adds an existing user by user ID.

## 3. Render service

1. Create a Render Blueprint from `render.yaml`, or create the web and worker services manually.
2. Set the web service health-check path to `/health/ready`.
3. Use the generated web-service hostname for `APP_BASE_URL`, the OAuth callback, and the Flutter `API_BASE_URL` after deployment.
4. Set the same database, Supabase JWT, Shopify, and CORS values on both services. Secrets marked `sync: false` must be entered in Render; do not put them in `render.yaml`.
5. Deploy the API first, confirm `/health/live` and `/health/ready`, then deploy the worker.

The service refuses an invalid environment, a non-HTTPS OAuth callback, a database URL that is not PostgreSQL, a token-encryption key that is not exactly 32 decoded bytes, and production database SSL set to false.

Generate a token-encryption key locally and store it in the Render secret manager only:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

### Service environment variables

The complete names are listed in `.env.example`. The important values are:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `DATABASE_SSL` | `true` in production |
| `SUPABASE_JWT_ISSUER` | Supabase Auth issuer |
| `SUPABASE_JWKS_URL` | Supabase JWKS endpoint |
| `SUPABASE_JWT_AUDIENCE` | Usually `authenticated` |
| `SHOPIFY_API_KEY` | Shopify app client ID |
| `SHOPIFY_API_SECRET` | Shopify app client secret |
| `SHOPIFY_WEBHOOK_SECRET` | Secret used to verify Shopify webhook HMACs |
| `SHOPIFY_API_VERSION` | Pinned Shopify Admin GraphQL version |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte key for offline and refresh tokens |
| `SHOPIFY_TOKEN_REFRESH_LEAD_SECONDS` | How long before expiry a token is refreshed; defaults to `300` |
| `SHOPIFY_SCOPES` | Space- or comma-separated approved scopes |
| `APP_BASE_URL` | Public HTTPS API base URL |
| `SHOPIFY_OAUTH_CALLBACK_URL` | Exact API callback URL |
| `SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL` | `threadline://shopify/install` |
| `CORS_ORIGIN` | Comma-separated allowed HTTP(S) origins |

`PORT`, `HOST`, queue/poll settings, retry settings, log level, and proxy trust are also validated. Keep `SHOPIFY_API_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_TOKEN_ENCRYPTION_KEY`, and the database URL out of source control and client builds.

## 4. Flutter runtime configuration

Every run that starts the authenticated client needs all four values:

| Dart define | Requirement |
|---|---|
| `API_BASE_URL` | HTTPS service base URL without credentials, query, or fragment |
| `SUPABASE_URL` | HTTPS Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key or legacy anon key; never a secret key |
| `SHOPIFY_MOBILE_RETURN_URL` | Exactly `threadline://shopify/install` |

Example:

```bash
flutter run \
  --dart-define=API_BASE_URL=https://<render-service-host> \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
  --dart-define=SHOPIFY_MOBILE_RETURN_URL=threadline://shopify/install
```

The service must have the same mobile return URL in `SHOPIFY_MOBILE_POST_INSTALL_RETURN_URL`. Missing or invalid values produce a setup-required screen listing the missing defines.

## Authentication and authorization

- Supabase Email OTP is the only client sign-in path in this build.
- Supabase access tokens are stored with platform secure storage and sent as Bearer credentials.
- The service validates Supabase JWTs against JWKS and checks workspace membership on every tenant route.
- Workspace roles and capabilities are server-authoritative. The client hides unauthorized actions, while the service remains the enforcement point.
- Shopify offline tokens are encrypted at rest by the service and are never sent to Flutter.

### Shopify token lifecycle

The app requests expiring offline access tokens, because Shopify rejects non-expiring tokens on GraphQL Admin API requests for public apps. Public apps must be on expiring tokens by January 1, 2027.

- The authorization code exchange sends `expiring=1` and stores the access token, the refresh token, and both expiry times. The refresh token is encrypted with the same key as the access token.
- Access tokens last one hour. Before a token enters the refresh window (`SHOPIFY_TOKEN_REFRESH_LEAD_SECONDS`, default 300 seconds), every sync and webhook refetch renews it through the `refresh_token` grant and stores the replacement pair.
- Each refresh returns a new refresh token. The stored value is replaced with a compare-and-swap on the previous one, so two workers refreshing the same shop cannot overwrite each other; the loser of the race re-reads the winner's tokens.
- A transient refresh failure (network, `429`, `5xx`) fails the ingestion job so the queue retries it. A rejected refresh (`401`) is terminal: the installation is flagged with `reauthorize_required_at`, an audit event is recorded, and further ingestion stops until the merchant completes OAuth again. Reinstalling through the app clears the flag.
- An installation with no expiry stored is treated as non-expiring and is used as-is, so an installation created before this migration keeps working until the merchant reinstalls.

## Client behavior

- Server workspaces are the only source of tenant selection.
- Overview, catalog, customers, product/customer details, sync state, and members come from service DTOs.
- Money and ratios use decimal values; currency comes from the workspace or source DTO.
- Product and customer lists use server-side search and opaque cursor pagination.
- Revenue trends are dense, workspace-local service values; the client does not fabricate missing days.
- Ingestion polling continues through queued/running states until the service reports success or a terminal dead state.
- Per-workspace ranges and successful in-memory snapshots are retained across selection and refresh.
- Stale workspace, search, pagination, detail, onboarding, and polling responses cannot replace newer state.

## Platform identity

- Android application ID: `com.threadline.app`.
- iOS/macOS bundle ID: `com.threadline.app`.
- Mobile/macOS OAuth scheme: `threadline://`.
- Shopify return path: `threadline://shopify/install`.
- Android activity: `android/app/src/main/kotlin/com/threadline/app/MainActivity.kt`.

Android release signing is not delegated to the debug key. A release build fails unless `android/key.properties` provides `storeFile`, `storePassword`, `keyAlias`, and `keyPassword`. Keep that file and its keystore outside source control. iOS release signing requires the Apple team, bundle identifier, keychain entitlements, and provisioning profiles on macOS.

## Validate locally

From the repository root:

```bash
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug
flutter build web --release
```

From `service/`:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run migrations:check
npm run test:docker
```

The test suite injects configuration, authentication, repositories, launchers, deep links, clocks, and polling delays. It covers setup validation, OTP/session transitions, onboarding, RFC 7807 errors, typed decimal DTOs, search and pagination, ranges, retry polling, stale tenant responses, detail isolation, member capabilities, dark mode, keyboard visibility, 320-pixel layouts, and large text.

### Running the service against a real database

Unit tests stub the database, so they cannot catch a mistake in generated SQL. `npm run test:docker` therefore also runs `scripts/local-smoke.mjs`, which starts the compiled service as a real process against a containerized PostgreSQL instance and drives it over HTTP with a real signed JWT and real webhook HMACs. It covers health and readiness, JWT rejection paths, tenant reads, tenant isolation, role enforcement, member management, the install URL, webhook acceptance and deduplication, request hygiene, and query validation.

To run the stack by hand:

```bash
docker run --name threadline-local -p 55450:5432 \
  -e POSTGRES_PASSWORD=local-dev -e POSTGRES_DB=threadline -d postgres:16-alpine

cd service
DATABASE_URL=postgresql://postgres:local-dev@127.0.0.1:55450/threadline \
DATABASE_SSL=false NODE_ENV=development \
  node dist/migrate.js

SMOKE_DATABASE_URL=postgresql://postgres:local-dev@127.0.0.1:55450/threadline \
  npm run test:smoke
```

The service refuses to start on an invalid environment. `SHOPIFY_OAUTH_CALLBACK_URL` must be HTTPS in production, and may use plain HTTP on loopback only outside it. Operational tuning values (`OAUTH_STATE_TTL_SECONDS`, the `INGESTION_*` retry and queue settings, `LOG_LEVEL`, `TRUST_PROXY`) fall back to the same defaults the Render blueprint sets, so only real secrets must be supplied. The Flutter client applies the same rule to `API_BASE_URL` and `SUPABASE_URL`: HTTPS everywhere, plain HTTP on loopback for local development.

### Database connection

Use the **session pooler** connection string, not the direct one. Direct connections are IPv6-only unless the project has the IPv4 add-on, and Render cannot reach them. Copy the host from the dashboard's Connect dialog rather than composing it from the region, because a region can have more than one pooler cluster.

Supabase's proxies present a chain rooted in the "Supabase Root 2021 CA", which is not in the public trust store, and the server does not send that root. Verifying it therefore fails unless you download the root certificate from **Supabase Dashboard → Settings → Database → Download Certificate**, save it into `service/`, and set `DATABASE_CA_CERT_PATH` to its filename.

With no certificate configured the service connects with encryption but without server authentication, which is exactly `sslmode=require` — the mode Supabase documents as the default. The service logs a warning at startup whenever TLS is on and no certificate is configured, so the weaker mode is never silent.

### Databases that already have the schema applied

`scripts/baseline-migrations.mjs` exists for a database whose schema was created by running the SQL directly rather than through the Drizzle migrator. The migrator decides what to run by comparing the newest `drizzle.__drizzle_migrations.created_at` against each migration file's journal timestamp, so recording a single row stamped at the last applied migration makes it skip everything up to that point and apply only what is genuinely pending. It refuses to run against an empty schema, and does nothing if migrations are already recorded.

```bash
cd service
node scripts/baseline-migrations.mjs 0004_role_constraint_snapshot
node dist/migrate.js
```

## Live verification checklist

Do not treat local tests as proof that external integrations work. After credentials and infrastructure exist, verify in this order:

1. `/health/live` and `/health/ready` on Render.
2. Supabase Email OTP delivery, verification, session restoration, and sign-out.
3. Shopify OAuth against the development store and exact mobile deep-link return.
4. Product, customer, order, refund, and abandoned checkout sync progress and terminal state.
5. A signed Shopify webhook and canonical refetch.
6. Owner/admin/member/viewer authorization and last-owner protection.
7. App uninstall, privacy request, redaction, and shop redact handling.
8. Release-signed Android artifact and, on macOS, an iOS archive.

The repository has passed local Flutter, service, migration, and Android/web build checks. Live Shopify, Supabase email, Render, webhook, and store verification remain pending until those external resources are configured.
