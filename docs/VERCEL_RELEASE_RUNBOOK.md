# CollMan Vercel Release Runbook — 2026-10-29

## Current status
Source implementation is available in draft PR #2 on branch `migration/vercel-postgres`.
Production activation is intentionally **BLOCKED** until the checks below pass. Do not connect real customer or appraisal data before the security/UAT gate.

## Architecture
- Web UI: existing zero-dependency `public/` static assets, served by Vercel.
- Backend: `api/index.js` Vercel Node.js Function, rewriting `/api/:path*` via `vercel.json`.
- Domain logic and security: `src/vercel-api.js` + unchanged `src/domain.js`.
- Database: dedicated PostgreSQL 16+ instance, via pooled `pg` with parameterized queries and atomic workflow transactions.
- Data model: `migrations/postgres/0001_initial.sql`; schema is applied explicitly by `npm run db:migrate`.
- Cloudflare: retained as rollback source until controlled cutover and signoff.

## Source and secrets
1. In Vercel project `collman`, maintain Git integration to `elanghaqeem-hash/CollMan`.
2. Framework preset: Other; Root Directory `./`; Output Directory `public`; build `npm run build`. The repository `vercel.json` defines these settings.
3. Provision **dedicated** managed PostgreSQL using the **already installed Prisma Postgres Marketplace integration** in team `serayamg` (Vercel team slug `collman`). The Vercel connector cannot provision Marketplace resources directly; use project `collman` → Storage → Create Database → Prisma Postgres. Select `sin1` (Singapore) region and an approved plan; separate production and preview databases must be used. Do not share real customer or appraisal data with CI/preview.
4. Connect the new database to the Vercel project. The integration injects `DATABASE_URL` (direct Postgres connection) and related variables into selected environments. Production DSN must use `sslmode=require` or stronger; review certificate validation with the provider. Create a separate `DATABASE_URL_POOLED` for application runtime from Prisma Console's pooled connection string, keeping `DATABASE_URL` direct for migrations. Never paste a credential into GitHub or a chat.
5. Set a random 32+-character `BOOTSTRAP_TOKEN` via the Vercel secret settings only for initial admin creation; rotate/remove after bootstrap. Never disclose it in logs or tickets.
6. Do not reuse Cloudflare session tokens or blindly copy unvalidated DB state.

## Validation
- Unit/static gate: `npm ci && npm run build`.
- Isolated PostgreSQL integration: `npm run db:migrate && npm run test:integration`.
- Node HTTP adapter: `node --test tests/vercel-handler.integration.test.mjs`.
- Chromium desktop/mobile: `node --test tests/frontend.e2e.mjs` after installing Playwright; executed via GitHub Actions.
- Run the schema migrator a second time: checksum validated, no duplicate migration.
- Audit `schema_migrations`; verify foreign keys, multi-tenant boundaries, data numeric precision and role isolation.
- Verify preview URL: `/`, `/styles.css`, `/app.js`, `/api/health`, `/api/meta`; browser login and menu navigation; unauthorized API access must fail closed.
- Perform negative IDOR, password/session, CSRF/origin and maker-self-approval tests on the live preview against **isolated** data.

## Cloudflare data re-verification (read-only)
Current authenticated Cloudflare API inventory: namespace `collman_CollManStore` (SQLite), `result: []`, `result_info.count: 0`; Worker `collman` binds `COLLMAN_STORE`. No named CollMan D1/KV binding. This is an object inventory and **not** an SQL table count or proof of historical absence.
Immediately before switch:
1. Freeze new writes or confirm no active users.
2. Read the namespace object listing again and record timestamp.
3. If any object or stored data appears, **stop** and perform an authorized export, encrypted backup and field-level/count-level reconciliation before proceeding.
4. Do not wipe Cloudflare or alter Worker bindings during Vercel setup.

## Production cutover gate
**Release only after ALL are true:**
- All GitHub Actions checks are green for the exact target commit.
- PostgreSQL production database provisioned, TLS connection verified, migration applied and backup/restore tested.
- Separate preview end-to-end UAT passed for admin, maker, checker, reviewer, approver, auditor and mobile.
- Negative tests for IDOR, self-approval, session expiration and CSRF passed.
- Cloudflare inventory rechecked immediately prior to cutover and reconciled.
- Vercel project/team access and preview deployment verified; production domain `collman-lemon.vercel.app` assigned to READY deployment.
- Production health and access checks passed without placing real bank PII into public environments.
- Explicit go/no-go record and rollback instructions reviewed.

## Rollback
If any production check fails, pause writes, restore the previous production deployment or remove active routing to unverified release; preserve DB backup and audit. Do not redirect users back to Cloudflare until data consistency and authorized credentials are confirmed.

## Outstanding prerequisite
Vercel access **now confirmed** for team ID `team_Y6DNKOu4wHEjmSax8LeZ1B7J` (name `serayamg`; dashboard slug `collman`). Project ID `prj_XfJOcY7dzut4OdM1Tx2cbyfpZflW`, bound to `elanghaqeem-hash/CollMan`. Preview commit `fef5ff4a` was READY; domain `collman-lemon.vercel.app` verified, but no production deployment is live. Project environment variables are empty and no database is provisioned. Prisma Postgres Vercel Marketplace integration is installed but no resources are connected. Create project database and secure secrets before migration and live UAT.
