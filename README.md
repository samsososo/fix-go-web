# Hotfix

Hotfix is a Hong Kong home-services marketplace web app covering public marketing, shared authentication, customer workflows, pro workflows, and a lightweight internal ops area.

This codebase started as an early validation build and has now been hardened into a production-ready baseline for local deployment and further iteration.

## What Changed In This Hardening Pass

The biggest readiness upgrades are:

- Password-based authentication for customer and pro accounts
- Durable opaque sessions stored server-side
- Configurable application storage with SQLite or MongoDB instead of JSON-file persistence
- Bootstrap demo credentials gated behind environment flags
- Stronger auth tests and environment-driven runtime configuration

This is still not a finished enterprise marketplace, but it is now materially closer to a deployable production baseline than the earlier mocked build.

## Product Scope

Implemented sections:

- Public marketing pages: home, how it works, service categories, become a pro, FAQ / trust
- Shared auth: email or Hong Kong phone plus password, signup, role-based session handling
- Customer portal: dashboard, create request, request detail, incoming quotes, accept quote, booking history, booking calendar, message centre shell, profile / saved addresses
- Pro portal: dashboard, profile completion, lead list/detail, send quote, accepted jobs, work calendar, booking status updates, earnings shell
- Admin area: overview, customers, pros, requests, quotes, operations calendar, manual request status updates, pro verification toggle

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- Local shadcn-style primitives using `class-variance-authority` and `tailwind-merge`
- React Hook Form + Zod
- TanStack Query
- next-intl
- SQLite via `better-sqlite3`
- MongoDB via the official `mongodb` driver
- Vitest
- ESLint + Prettier

## Architecture

Key directories:

- `src/app`: routes, layouts, route handlers
- `src/components`: shared UI primitives and layout shells
- `src/features`: auth, customer, pro and admin interaction flows
- `src/lib`: auth, actions, env, persistence, security, formatting, status rules
- `src/mock`: seed data used to bootstrap non-production databases
- `src/types`: domain models and local type declarations
- `tests`: repository, access, auth and status coverage

Important implementation notes:

- App data persists in MongoDB by default; SQLite remains available only when `STORAGE_DRIVER=sqlite`
- Seed data always comes from `src/mock/seed.ts`; local `data/` artifacts are never used as production seed input
- Auth uses hashed passwords and opaque session identifiers stored server-side
- Demo quick-login and database seeding are environment-controlled and default off in production
- Marketplace repositories still expose a pragmatic typed interface, while storage durability can come from SQLite or MongoDB

## Local Setup

Requirements:

- Node.js 24+
- npm

Install:

```bash
npm install
```

Optional environment overrides:

```bash
cp .env.example .env.local
```

Run locally:

```bash
npm run dev
```

Open:

- [http://localhost:3000](http://localhost:3000)

Validation commands:

```bash
npm run build
npm run lint
npm test
```

## Environment

Supported environment variables:

- `APP_URL`
- `STORAGE_DRIVER`
- `DATA_DIR`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `ENABLE_DEMO_LOGIN`
- `ENABLE_DATABASE_SEEDING`
- `DEMO_PASSWORD`
- `BOOTSTRAP_ADMIN_PASSWORD`

MongoDB is the default storage driver. Set `MONGODB_URI` before running the app locally or in deployment. In production, set explicit secrets, disable demo login, and leave database seeding disabled unless you are intentionally resetting a non-production environment.

### MongoDB Development

For MongoDB development, set these values in `.env.local`:

```bash
STORAGE_DRIVER=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=hotfix_dev
ENABLE_DATABASE_SEEDING=true
```

For production MongoDB, use a separate database and keep mock data disabled:

```bash
STORAGE_DRIVER=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=hotfix_prod
ENABLE_DEMO_LOGIN=false
ENABLE_DATABASE_SEEDING=false
```

## Railway Deployment

This app can run on Railway with the current architecture because it is a full Next.js server app. With SQLite, mount persistent storage for the SQLite file. With MongoDB, provide `MONGODB_URI` and `MONGODB_DATABASE` instead.

### Mock Data Behaviour

- The app already ships with bundled seed data in `src/mock/seed.ts`.
- In non-production, the app can bootstrap the database with that mock dataset when `ENABLE_DATABASE_SEEDING=true`.
- In production, database seeding defaults off and should stay off for live data.
- You do not need to upload your local `data/hotfix.sqlite` file when using MongoDB.
- Local `data/` is intentionally excluded from deployments to avoid shipping test artifacts or stale developer state.

### Required Railway Setup

- Runtime: Node.js 24
- Build command: `npm run build` with a post-build asset copy into `.next/standalone/`
- Start command: `HOSTNAME=0.0.0.0 node .next/standalone/server.js`
- Persistent volume mount: only needed for `STORAGE_DRIVER=sqlite`
- Health check path: `/api/health`

### Production Variables

```bash
APP_URL=https://your-domain-or-railway-url
STORAGE_DRIVER=mongodb
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=hotfix_prod
SESSION_COOKIE_NAME=hotfix_session
SESSION_TTL_HOURS=720
ENABLE_DEMO_LOGIN=false
ENABLE_DATABASE_SEEDING=false
DEMO_PASSWORD=change-this-before-deploying
BOOTSTRAP_ADMIN_PASSWORD=change-this-before-deploying
```

### Before Deploy

- Confirm the app name and public copy use `Hotfix`.
- Run `npm run lint`, `npm test`, and `npm run build`.
- Set strong values for `DEMO_PASSWORD` and `BOOTSTRAP_ADMIN_PASSWORD`.
- Use MongoDB for the deployed environment unless you explicitly opt back into SQLite.
- Keep `ENABLE_DATABASE_SEEDING=false` for production so mock/testing data is not created.

### Deploy

1. Create or select a Railway project and Node service.
2. Attach a persistent volume and mount it to `/data`.
3. Set `APP_URL`, storage variables, `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, `ENABLE_DEMO_LOGIN`, `ENABLE_DATABASE_SEEDING`, `DEMO_PASSWORD`, and `BOOTSTRAP_ADMIN_PASSWORD`.
4. Deploy with `railway up -s <service-name>` or Railway's GitHub integration.
5. Wait until Railway reports the deployment as healthy.

### After Deploy

- Open `/api/health` and confirm it returns `ok: true`.
- Open `/zh-HK` and confirm no `_next/static` assets return 404.
- Log in as customer, pro and admin.
- Run `BASE_URL=https://your-domain npm run qa:flows`.
- Run `BASE_URL=https://your-domain npm run qa:ui`.
- Keep the volume mounted before any future redeploy; otherwise SQLite data will not persist.

To reset a non-production environment back to the current Hotfix mock dataset, set `ENABLE_DATABASE_SEEDING=true`, open a shell for the service and run `npm run db:reset`. This replaces the seeded accounts with the current `@hotfix.hk` accounts and current environment passwords.

### Deployment Workflow Choice

- Manual deploy is the fastest first deployment.
- GitHub-triggered deploy is also fine once this workspace is pushed to a repo.
- If you want automation later, Railway's built-in GitHub integration is usually simpler than custom GitHub Actions for the first pass.

## Bootstrap Accounts

Local bootstrap accounts are seeded automatically:

- Customer: `amy@hotfix.hk`
- Customer: `ben@hotfix.hk`
- Pro: `chan@hotfix.hk`
- Pro: `wong@hotfix.hk`
- Admin: `ops@hotfix.hk`

Default local passwords:

- Customer / Pro demo accounts: `HotfixDemo123!`
- Admin bootstrap account: `HotfixAdmin123!`

Change them through environment variables before deploying.

## Assumptions

Production-readiness assumptions used for this pass:

- Public signup remains limited to `customer` and `pro`; `admin` stays internal
- Email / phone + password is a valid first production auth baseline, replacing the earlier OTP mock step
- SQLite or MongoDB is acceptable for the current deployment phase and local operation model
- File uploads, messaging, earnings, document verification depth and payouts remain intentionally simplified
- Matching stays category + district based for now

## What Is Still Simplified

These parts are intentionally not fully production-complete yet:

- File uploads are still represented by local file references
- Messaging remains a reserved shell for a later release
- Payments / payouts are not implemented
- Verification workflow is basic and admin-driven
- Notifications are stored locally and not delivered externally
- Lead matching logic is rule-based, not marketplace-optimized

## Production Review

### Before the upgrade

The previous version was a strong early build but not production-ready because:

- auth was effectively mocked
- persistence depended on a JSON file
- demo login behaviour was mixed into the core auth flow
- environment/runtime assumptions were not explicit

### During the upgrade

The main production-hardening decisions were:

- switching from JSON persistence to database-backed storage
- replacing mocked auth with password hashing plus server-side sessions
- keeping the existing typed repository surface so feature work could continue without a full rewrite of every page
- separating development convenience from production defaults via environment flags

### After the upgrade

The app is now much closer to a deployable baseline, but “production-ready” here should be interpreted honestly:

- ready for controlled deployment and continued hardening
- not yet ready for regulated payments, large-scale marketplace abuse prevention, or formal KYC operations

## Remaining Gaps Before Wider Production Rollout

- Replace bootstrap/demo credentials with proper onboarding and password reset flows
- Add MFA or OTP if the business decides phone-first identity is required
- Move file uploads to object storage with signed URLs and moderation controls
- Add structured auditing for admin changes and security-sensitive events
- Add external notification delivery, monitoring, backups and operational dashboards
- Plan the eventual move to managed Postgres once multi-instance deployment or heavier operational reporting is required

## Testing

Current automated coverage includes:

- customer request submission repository flow
- pro quote submission repository flow
- admin list/detail repository flow
- role-based access checks
- password/session authentication checks
- core status transition rules
