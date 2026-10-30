# CollMan Vercel Release Runbook — 2026-10-29

## Current status
Source implementation is available in draft PR #2 on branch `migration/vercel-postgres`.
Production activation is intentionally **BLOCKED** until the checks below pass. Do not connect real customer or appraisal data before the security/UAT gate.

## Architecture
- Web UI: existing zero-dependency `public/` static assets, served by Vercel.
- Backend: `api/index.js` Vercel Node.js Function, rewriting `/api/:path*` via `vercel.json`.
- Domain logic and security: `src/vercel-api.js` + unchanged `src/domain.js`.
- Database: dedicated PostgreSQL 16+ instance, via pooled `pg` with parameterized queries and atomic workflow transactions.
- Data model: versioned SQL migrations `0001_initial.sql` through `0004_financial_integrity.sql`. They enforce tenant foreign keys, append-only audit/history, and financial/status CHECK constraints. All unapplied migrations are executed atomically by `npm run db:migrate`.
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
- Isolated PostgreSQL integration: `npm run db:migrate && npm run db:verify && npm run test:integration && npm run db:verify`.
- Node HTTP adapter: `node --test tests/vercel-handler.integration.test.mjs`.
- Chromium desktop/mobile: `node --test tests/frontend.e2e.mjs` after installing Playwright; executed via GitHub Actions.
- Run the schema migrator a second time: checksum validated, no duplicate migration.
- `npm run db:verify` is read-only and checks migration checksums, required tables, database-level tenant foreign keys, immutable audit triggers, financial/status constraints, and cross-tenant joins. Check financial numeric precision and role isolation separately.
- On a reviewed preview, execute `COLLMAN_BASE_URL=https://collman-<preview>.vercel.app npm run test:live` to check static assets, `/api/health`, `/api/meta`, and anonymous access controls without mutating database contents. Vercel Deployment Protection may require `VERCEL_AUTOMATION_BYPASS_SECRET`; obtain it through protected CI secrets, never paste into a chat. Browser login/menu navigation must also pass.
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
- Vercel plan must permit commercial use (Hobby is limited to personal/non-commercial usage; Pro or Enterprise required for banking rollout).
- PostgreSQL production database provisioned, TLS connection verified, migrations 0001–0004 applied, `npm run db:verify` and the live read-only smoke tests passed, and an encrypted backup/restore rehearsal was successful.
- Separate preview end-to-end UAT passed for admin, maker, checker, reviewer, approver, auditor and mobile.
- Negative tests for IDOR, maker self-approval, session expiration, CSRF, concurrent updates, audit tampering and invalid monetary/status values passed.
- Cloudflare inventory rechecked immediately prior to cutover and reconciled.
- Vercel project/team access and preview deployment verified; production domain `collman-lemon.vercel.app` assigned to READY deployment.
- Production health and access checks passed without placing real bank PII into public environments.
- Explicit go/no-go record and rollback instructions reviewed.

## Rollback
If any production check fails, pause writes, restore the previous production deployment or remove active routing to unverified release; preserve DB backup and audit. Do not redirect users back to Cloudflare until data consistency and authorized credentials are confirmed.

## Latest verified state — 30 October 2026
The legacy statement that no production deployment/database exists is superseded by `docs/PRODUCTION_AUDIT_2026-10-30.md`.
- Vercel production alias `collman-lemon.vercel.app` is assigned to a READY deployment.
- A read-only GitHub Actions probe confirms live frontend, PostgreSQL health, metadata, completed administrator bootstrap and anonymous API access denial.
- Separate Prisma Postgres stores exist, but their links are reversed **by resource name**: Preview → `collman-production-db`, Production → `collman-uat-db`. Database contents and backup state must be inventoried before changing links.
- Source Cloudflare Durable Objects namespace still lists zero objects (not a SQL row count).
- Commercial operation remains **NO-GO** until database identity, migration checksum, backup/restore and all role UAT requirements are confirmed; Vercel Hobby is not a commercial production plan.
- Do not automatically swap URLs or migrate data. Preserve current operational state and investigate safely.
