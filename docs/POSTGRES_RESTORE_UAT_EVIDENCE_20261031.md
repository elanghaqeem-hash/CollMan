# CollMan PostgreSQL migration, restore and technical UAT execution — 31 October 2026

**Scope:** Disposable Vercel Sandbox PostgreSQL only. **Source commit:** `cd0fd81917d664c82af812000aaf948bab23078f` (PR #8). **Release disposition:** PRODUCTION NO-GO pending actual managed database backup/restore, live bank UAT, and sign-off. This evidence is not a bank acceptance certificate.

## Environment and security boundary

- Vercel project `collman`; isolated, nonpersistent sandbox `collman-readonly-check-1031` in `sin1`, session `sbx_6gvyWiHWEiY5wklwKflJz1s6Cb5a`.
- Public source cloned at the exact tested SHA. PostgreSQL **18.6**, `psql`, `pg_dump`, `pg_restore`, Node 22, pinned npm dependencies. No managed production connections or client/borrower records copied into the sandbox.
- Vercel's managed integration secret listing is not equivalent to access to the underlying credential: its value is omitted. Production `DATABASE_URL` refers to store `store_ozlf60ZcAanOExtI`, resource label `collman-uat-db`; Preview refers to `store_bWGXxCTtSD5ifFb5`, resource label `collman-production-db`. The names are reversed relative to actual environment targets. No credential was extracted.
- All synthetic backup files exist only in ephemeral sandbox storage. SHA256s below identify temporary *synthetic* archives; they are **not** production backup recovery points. Database user passwords used in the disposable local sandbox are not application/production secrets.

## Migration upgrade and restore

1. Initialized temporary real PostgreSQL database `collman_upgrade_rehearsal` with the **original 0001–0004** SQL files and corresponding SHA256 entries in `schema_migrations`.
2. Seeded **2 synthetic tenants, 7 synthetic users (six roles + separate-tenant Maker), and 3 synthetic assets**.
3. `pg_dump -Fc` backup at version 0004, SHA256 `0d60b1b95abfba1b182576c294aef18f7559b2a6de509c2dcfaf178655711f68`; `pg_restore --exit-on-error` to `collman_rehearsal_restored` **PASS** with the same 2/7/3 record counts.
4. Ran the actual repository `npm run db:migrate` in **both** baseline and restored databases. Migrations `0005_universal_collateral`, `0006_asset_evidence_reviews`, `0007_governed_valuation`, `0008_facility_coverage`, and `0009_task_management` all **APPLIED**. Checksums for prior `0001–0004` matched.
5. Ran `npm run db:verify` in both upgraded databases: **PASS** for migration checksums, required tables, tenant FK, immutable audit triggers, financial/status constraints, and cross-tenant data integrity.
6. Re-ran `npm run db:migrate`: all **9** migrations were correctly reported `Already applied` (idempotence PASS). Original 2 tenants, 7 users, 3 assets remained after migration; version ledger count 9.
7. Ran separately isolated *real* PostgreSQL enterprise tests against disposable `collman_ci` using the repository's local-only safety guard. After testing, dumped as custom archive, SHA256 `e64d28795af4c26a16d6f9b66e8ea6a28822277ba4da5a15dc4b03694a98c66d`; `pg_restore` into `collman_restore_ci` **PASS**. `scripts/compare-ci-restore.mjs` compared **80 schema/table instances**, **47 populated** and **380 rows**: every row-count and SHA256 JSON-content fingerprint identical (**PASS**).

## Automated role, collateral and browser UAT

| Actual execution | Outcome |
|---|---|
| `npm run build` (source + static + business tests) | PASS |
| `npm run test:integration`, clean isolated real PostgreSQL | PASS, 1/1; auth, ADMIN/MAKER/CHECKER/REVIEWER/APPROVER/AUDITOR, RBAC, SoD, workflow, audit and tenant isolation |
| `CI=1 COLLMAN_REAL_PG_ISOLATED=1 node --test tests/collateral-api.test.mjs tests/enterprise-api.test.mjs`, local `/collman_ci` fixture | PASS, 5/5; 16 categories, valuation changes, governance/signoff/immutability, ceilings/allocations and concurrent approvals |
| `node --test tests/enterprise-frontend.e2e.mjs` with Chromium on desktop/mobile | PASS, 1/1; model registry, sourced indications, facilities, reload/export |
| `node --test tests/frontend.e2e.mjs` with database-backed synthetic ADMIN account | PASS, 2/2; login/dashboard/register/menu on desktop/mobile, missing API/database and retry recovery |
| `npm run db:verify` on migrated datasets | PASS |
| `scripts/compare-ci-restore.mjs` on cloned test data | PASS, 80 tables, 380 rows |

**Test-environment adjustments, not application defects:** Integration test initially refused a pre-seeded database by design; a new clean database resolved the precondition. Enterprise real-PG fixture requires `CI=1`, localhost and database path `/collman_ci`; it was executed only inside the disposable sandbox. Ubuntu 26.04 was unsupported by bundled Playwright 1.56.1, so browser dependencies and a compatible Playwright Chromium package were installed in the disposable sandbox. Browser UAT was rerun and completed with zero skips after supplying a populated synthetic UAT DB.

## Explicitly unverified / production blocking

- No actual Production/Preview Prisma PostgreSQL **SQL access** was obtained: Vercel integration-managed database secrets are not readable through the currently available connector. Provider metadata `mcpReadonly` does not provide administrative backup/restore actions.
- No **real** production database fingerprint, baseline migration ledger, size, row-count, encrypted backup, safe restore to independently controlled target or 0005–0009 managed migration. Do not assume synthetic PG18 results match the existing managed instance's data, version, extensions or migrations.
- No six-role authentication using **actual authorized UAT credentials/SSO** against a live protected instance. Synthetic local roles passed; GitHub `.github/workflows/uat-authorized-login.yml` still requires approved GitHub Environment `uat` with dedicated role-account and origin secrets.
- No bank-signed model methodology, legal/custody/insurance/AYDA, InfoSec/IAM or business acceptance. Vercel Hobby / Prisma free resource operational suitability is not certified.

**Controlled next step:** Authorized DBA or Prisma provider administrator must provide a managed **read-only inventory** and take a protected actual backup, restore it to an isolated clone, and compare migration ledger plus contents/hash. Only then authorize a dedicated managed-UAT schema migration, credentialed six-role UAT, bank signoffs, and controlled production release with rollback. Do not swap databases based on inverted resource names.

**Integrity:** No `main` merge, Vercel production promotion, production credentials modification, PostgreSQL production backup, production schema mutation or customer-data copy was performed in this execution.
