# CollMan — Secure Prisma PostgreSQL DBA Access (31 October 2026)

**Status: CONNECTION PENDING.** This manual recovery workflow does not obtain Production SQL access until authorized credentials are configured in a protected GitHub environment. Do not copy credentials into chat, commits or workflow inputs.

## Production database identification

- Vercel project: collman; id `prj_XfJOcY7dzut4OdM1Tx2cbyfpZflW`.
- Production DATABASE_URL points to store `store_ozlf60ZcAanOExtI`, misleadingly named `collman-uat-db`.
- Preview DATABASE_URL points to store `store_bWGXxCTtSD5ifFb5`, misleadingly named `collman-production-db`.
- Confirm source by **Vercel environment attachment and actual Prisma Console database identity**, never by resource label. Do not swap database connections.

## Protected administration connection — required operator steps

1. Go to Vercel Dashboard → CollMan → Storage, select the database **attached to Production**, and open Prisma Console using SSO. Cross-check the correct workspace and database.
2. In Prisma Console, choose **Connect to your database → Generate new connection string**. Create a new independently revocable maintenance credential for the verified Production DB; use the **direct** `db.prisma.io:5432` connection with `sslmode=require`. Do not rotate application credentials or edit Vercel application variables. Prisma documents that generated credentials have full database access; read-only protections are enforced by script operations, not a restricted DB credential.
3. Provision a **separate, empty, disposable Prisma Postgres database** (not Preview and not any populated DB) with a separate direct credential.
4. In GitHub `elanghaqeem-hash/CollMan` → Settings → Environments, create `collman-dba`. Require named human reviewers and restrict deployments to protected `main`. Create encrypted environment secrets `COLLMAN_DBA_SOURCE_DIRECT_URL` (Production credential) and `COLLMAN_DBA_RESTORE_DIRECT_URL` (disposable target credential). Never paste URLs into ChatGPT.
5. After code review, move `.github/workflows/collman-dba-restore-rehearsal.yml` and `scripts/dba-recovery.mjs` onto the protected default branch. GitHub manual workflows require the workflow file to exist on the default branch. **Check that this commit does not trigger an unintended Vercel Production deploy**; alternatively use a separate protected operations repository for the workflow.
6. Manually run **CollMan DBA — controlled inventory and recovery**, select `inventory`, supply a non-sensitive approved ticket, and obtain its 16-character `source_id` plus migration versions.
7. Verify the restore database is EMPTY. Run the workflow again using `backup-restore`, enter the exact `source_id` in `approved_source_id`, check `confirm_disposable_restore`, and obtain GitHub Environment reviewer approval.
8. Examine the report (table counts, row fingerprints, migration ledger, backup SHA256). Revoke temporary credentials afterwards. Do not release the application until all independent gates pass.

## Safety and limits

- Both workflows are manual only with minimal read permissions, protected environment and single-run concurrency.
- The direct source receives metadata SELECT/COPY reads and `pg_dump --format=custom --serializable-deferrable` only. No production data mutation or migration.
- Only a separate EMPTY database receives `pg_restore --single-transaction --exit-on-error --no-owner --no-acl`.
- Credentials are stored in encrypted GitHub Environment secrets and passed via process environment rather than command line/logs.
- The restored data is compared by table inventory, record counts and SHA256 of row contents. Concurrent live writes may make the comparison fail, so use a bank-approved low-write window.
- Backup is temporary and discarded after the job; this **does not provide durable encrypted backup retention**. A separately retained, independently tested encrypted production backup remains necessary.
- No actual Production SQL access, backup/restore, or schema migration has been performed through the current Vercel connection. Previous synthetic PostgreSQL tests are documented separately in `docs/POSTGRES_RESTORE_UAT_EVIDENCE_20261031.md`.

## Alternative Prisma MCP connection

The official Prisma MCP server `https://mcp.prisma.io/mcp` supports SQL execution, schema inspection and provider-backed backup recovery. It can be added as a custom plugin in ChatGPT using OAuth for the authorized Prisma workspace. It is **not automatically connected** by the existing Vercel integration. This MCP interface is separate from operating-system `pg_dump`/`pg_restore`.

Sources: https://www.prisma.io/docs/guides/postgres/vercel ; https://www.prisma.io/docs/postgres/database/connecting-to-your-database ; https://www.prisma.io/docs/postgres/database/backups ; https://www.prisma.io/docs/ai/tools/chatgpt .

**Release status:** PR #8 remains production NO-GO until verified real database recovery, real-user UAT, appraisal validation and bank signoffs.