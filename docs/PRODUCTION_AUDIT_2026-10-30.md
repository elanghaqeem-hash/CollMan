# CollMan — Vercel production audit (30 October 2026)

## Scope
Authenticated Vercel metadata and read-only GitHub Actions production HTTP probes.
No database passwords, connection strings, secrets or bank customer records were accessed or committed.
No SQL write, database migration, production promotion or reassignment was performed during this audit.

## Current deployment evidence
- Vercel team: `team_Y6DNKOu4wHEjmSax8LeZ1B7J`; project: `prj_XfJOcY7dzut4OdM1Tx2cbyfpZflW`.
- Production alias: `collman-lemon.vercel.app`, verified and assigned to READY deployment `dpl_GqWcGcSoEoMAJwyvwTWr76KdikWi` (commit `4bca94a1371c7cf709586ad6c2af05276579da90`).
- Preview branch: `migration/vercel-postgres` is still draft PR #2; production deployment is not evidence that PR is merged.
- Read-only public production check: GitHub Actions run [40971942321](https://github.com/elanghaqeem-hash/CollMan/actions/runs/40971942321) confirmed HTTP 200 for homepage, static JS/CSS, `/api/health` with `database=connected`, `/api/meta`, and JSON HTTP 401 for anonymous dashboard/users/audit.
- Bootstrap readiness check: run [40972107004](https://github.com/elanghaqeem-hash/CollMan/actions/runs/40972107004) also confirmed `needs_setup=false`. Production administrator bootstrap has completed; no credentials were accessed.
- Neither the public health probe nor the build state validates all applied SQL migration checksums, backup recovery, or full authenticated role UAT.

## Critical environment/database misalignment
Checked Vercel project environment-variable `contentHint.storeId` without decrypting the variables, and looked up the corresponding storage resource metadata. **The two stores have distinct IDs** and are not sharing the same resource.

| Vercel environment | DATABASE_URL and DATABASE_URL_POOLED are linked to | Resource status | Plan |
| --- | --- | --- | --- |
| Preview | `collman-production-db` | available | Prisma Postgres Free |
| Production | `collman-uat-db` | available | Prisma Postgres Free |

The labels are reversed relative to intended environment roles. Runtime production `/api/meta` has `needs_setup=false`, implying the database attached to Production currently contains at least an initialized admin. **Do not automatically exchange connection strings**: that could replace live production data with an empty or unrelated database. Database names alone do not establish contents or prove the resources were used correctly.

## Mandatory safe remediation
1. Suspend onboarding real customers or banking collateral records; keep current production deployed only for explicitly permitted non-commercial testing.
2. Using approved DB administrator access, perform **read-only inventories** separately on both resources:
   - `SELECT version, checksum FROM schema_migrations ORDER BY version`
   - Counts from `tenants`, `users`, `assets`, `appraisals`, `comparables`, `workflow_history`, `audit_log`; do not export individual PII in audit reports.
   - Confirm foreign keys, database-level immutability triggers, statuses, numeric checks, and duplicate/tenant integrity.
3. Record which resource is the actual production source of truth using contents, active users, and approved business-owner validation rather than the display name alone.
4. Capture encrypted backups of both databases, perform a separate restore rehearsal, and verify checksums before any switch or rename.
5. If the resources truly need swapping, approve a cutover plan: freeze writes, preserve credentials/rollback, connect each Vercel environment to its intended store, redeploy, check `npm run db:verify`, live API, RBAC and operational journey, then unfreeze.
6. Keep preview test data isolated; do not treat production as a test fixture.
7. Upgrade Vercel Hobby before commercial use and approve production-grade PostgreSQL backup and availability controls.

## Source-data re-verification
Authenticated Cloudflare Durable Objects namespace listing for CollMan returned `success=true`, HTTP 200, `count=0`, no cursor. This is **not** SQL table evidence and should be repeated immediately before confirmed cutover.

## Current release classification
**Production endpoint reachable; banking/commercial production readiness NOT approved.**
Blocking: environment-to-resource identity verification, production migration attestation, backup/restore proof, live authenticated role/UAT signoff, and commercially permitted Vercel plan.

Keep PR #2 draft until release gates are closed. Do not infer readiness from a READY deployment alone.
