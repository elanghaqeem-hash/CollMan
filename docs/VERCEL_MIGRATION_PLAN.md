# CollMan — Cloudflare to Vercel migration plan

Status: **Migration preparation only. Do not deploy production until gates pass.**

## Current source architecture
- Cloudflare Worker entrypoint: `src/index.js`, using `cloudflare:workers` DurableObject.
- SQLite persistence: Durable Object `COLLMAN_STORE`, schema in `src/schema.js`.
- Static UI: `public/`.
- CI `npm run build` only checks and tests; it does not build a Vercel backend.
- GitHub `main` is currently the Cloudflare deployment source.

## Target architecture
- Vercel Functions running Node.js for `/api/*`.
- Managed PostgreSQL with connection pooling and SSL, and per-request tenant isolation.
- Static UI deployed from `public/`, preserving same-origin API routes.
- Credentials stored only as Vercel environment variables; never in source.
- No production cutover until backend parity and data integrity are verified.

## Required implementation
1. Inventory every API route, SQL statement, transaction, workflow transition and tenant filter.
2. Extract business rules and auth from the Durable Object handler without changing semantics.
3. Port SQLite schema and queries to PostgreSQL migrations; replace SQLite-only functions, positional bindings, and `db.batch` with parameterized transactions.
4. Preserve PBKDF2 password hashing, HttpOnly cookies, CSRF/origin checks, rate limits, six roles, maker-checker separation, audit records, and tenant boundaries.
5. Add Vercel-compatible API handlers, `/api/health`, and static asset routing.
6. Provision a dedicated PostgreSQL database; configure `DATABASE_URL`, `BOOTSTRAP_TOKEN`, and production secrets through Vercel Settings.
7. Back up and export Cloudflare Durable Object SQLite using an authorized migration path. Do not assume D1 export works for Durable Objects.
8. Validate record counts, keys, money precision, referential integrity, audit chronology, and tenant isolation before switching writes.
9. Run automated tests, end-to-end maker/checker/reviewer/approver UAT, security tests, and restore rehearsal.
10. Deploy preview, verify, then promote a reviewed production deployment; test domain and health endpoint.
11. Retain Cloudflare as rollback source until reconciliation and operational acceptance.

## Release gates
- No dummy or synthetic collateral records in production.
- No customer data copied into public repository or logs.
- No database migration without a tested backup and rollback.
- No production deployment while runtime or integration tests fail.
- Do not mark migration complete until production URL, database connectivity, and user workflows are verified.

## Read-only Cloudflare data inventory — 2026-10-29

Method: Cloudflare authenticated account API using GET requests only. No production API invocation, database initialization, state mutation, export or reset.

- Account: Elang.haqeem@gmail.com's Account (ID retained only in API audit, not committed).
- Active Worker: `collman`; recent deployment on 2026-10-29.
- Worker bindings: `ASSETS` (static), `BOOTSTRAP_TOKEN` (secret, value **not** accessed), `COLLMAN_STORE` (Durable Object).
- Durable Object namespace: `collman_CollManStore` (SQLite-backed); list objects endpoint returned HTTP 200, `success: true`, `result: []`, `result_info.count: 0`, cursor empty.
- D1 inventory: 10 databases, none named for CollMan. No CollMan D1 binding in the Worker.
- Workers KV: 2 namespaces, neither named for CollMan. No CollMan KV binding.
- R2: account API returned 403 / code 10042, indicating R2 is not enabled. No CollMan R2 binding.
- GitHub Worker code routes `/api/*` to `COLLMAN_STORE.getByName('production')`; direct fetch would initialize the schema and was intentionally not performed to preserve read-only inventory conditions.

**Assessment:** No persisted CollMan Durable Objects currently listed, and no alternative connected Cloudflare data store found. Evidence strongly favors a fresh Vercel PostgreSQL database rather than a bulk historical export. This is not an SQL row-count attestation or a guarantee that data was never stored in a previous/deleted resource, other account or external integration. Do not claim zero users/assets based solely on object listing. Recheck the namespace immediately before cutover, with access held to prevent intervening writes.

**Next steps:** Proceed with Vercel PostgreSQL migration implementation on this feature branch; provision empty target DB (no dummy personal/financial records). Before production cutover, repeat the namespace list, inspect any newly discovered object through an authorized read-only count endpoint, snapshot/export if non-empty, and reconcile counts. Keep Cloudflare operational until Vercel end-to-end authentication, role segregation, valuation, audit and transaction tests pass.
