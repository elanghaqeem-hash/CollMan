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
3. Provision **dedicated** managed PostgreSQL (e.g. through an approved Vercel marketplace integration) with backups and access restrictions; production DB must be distinct from CI/preview DB.
4. Set `DATABASE_URL` via Vercel Environment Variables, not source. Production DSN must use `sslmode=require` or stronger, with certificate verification according to provider guidance.
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
Vercel connector currently does not enumerate/access team `serayamg`; a team owner must authorize the Vercel connection before remote project inspection or deployment. No production PostgreSQL service or environment variables were provisioned during this development session.
