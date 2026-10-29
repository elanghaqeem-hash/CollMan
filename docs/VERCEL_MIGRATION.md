# CollMan migration to Vercel — controlled release

**Migration candidate, NOT LIVE.** Do not disable or delete the existing Cloudflare Worker or Durable Object until production acceptance is complete.

## Architecture
- Frontend: existing `public/` hosted as Vercel static files (Framework: Other).
- API: Web standard Vercel Function in `api/router.js`, retaining existing `/api/*` contracts.
- Data: Turso Cloud (libSQL / serverless SQLite) through Vercel Marketplace, replacing Cloudflare SQLite-backed Durable Object.
- GitHub: `elanghaqeem-hash/CollMan`; Vercel project: `collman`; production branch `main`.
- Function region: `sin1`. Validate with data residency and vendor due diligence before processing any banking data.

## Setup in Vercel (required before production)
1. Open **collman → Storage → Marketplace → Turso Cloud**. Install and attach a new Turso SQLite database to the project. Review the provider's data residency, security and cost terms.
2. In **Settings → Environment Variables**, confirm `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (provided by the integration), and `BOOTSTRAP_TOKEN` (new random 32+ character secret, used only for initial setup).
3. Use Framework Preset **Other**, Root Directory `./`, `public/` as output. `vercel.json` provides the build, rewrite, function region and security headers.
4. Run `npm install` and commit a regenerated `package-lock.json` before merging to `main`. Existing package-lock was created before the new database dependency.
5. On the migration branch, use a Preview deployment with a dedicated test database. Perform `npm run build` and end-to-end tests. Do not point preview at production data.

## Migration of existing data — NOT automated
Data in Cloudflare Durable Objects **will not** automatically appear in Turso. If any persisted collateral, users or audit records exist, create an approved, encrypted export/import procedure, with a maintenance window, reconciliation and a tested rollback. Foreign-key order: tenants, users, settings/assets, appraisals, comparables, workflow history, audit records, login attempts (reset), sessions (invalidate). Preserve tenant IDs and object IDs; verify row counts, approved amounts, history order and tenant isolation. Do not transfer live session tokens. Test backup/restore, encryption and access policies.

If the source database is verified empty, document a signed off fresh initialization. Do not bootstrap a production administrator until this decision is recorded.

## Release acceptance gates
- Build and automated tests pass; Vercel deployment READY and domain mapped.
- `GET /api/health`: persistent database online; `/api/meta` and bootstrap path work in a test tenant.
- Login/logout, CSRF/same-origin, session expiry, rate limiting and password change.
- Admin / Maker / Checker / Reviewer / Approver / Auditor permissions and negative RBAC tests.
- Cross-tenant isolation; asset create/update; appraisal math; comparable evidence.
- Maker→Checker→Reviewer→Approver with independent users, race protection and immutable audit records.
- User management, CSV export, desktop/mobile views.
- Data counts and checksum reconciliation where relevant; recovery/rollback rehearsal.
- Information-security and business acceptance before any customer data or production cutover.

## Rollback
Preserve Cloudflare Worker, Durable Object and data backups. On Vercel error, do not switch traffic. If already cut over, use approved rollback and reconcile writes before returning to Cloudflare.

## Technical notes
- `src/vercel-api.js` is the Cloudflare-independent copy of the existing API logic.
- `src/vercel-db.js` provides a SQLite-compatible remote query interface with transactional workflow updates.
- `src/index.js` and `wrangler.jsonc` stay unchanged for fallback.
- Initial schema creation is idempotent per cold start. Add a versioned migration system before future schema changes.
- Vercel Functions are stateless. Local SQLite in the Vercel filesystem is NOT a persistent database.

**This PR must stay unmerged until the database is attached and the release gates pass.**
