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
