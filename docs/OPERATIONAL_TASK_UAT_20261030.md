# CollMan Operational CIIS Tasks — Development & Authorized UAT Handover
Date: 2026-10-30

## Source and scope
CIIS BRD pp. 8–10 identifies Login, Dashboard, Input Data Dokumen, Task Management (Open, Waiting, Ongoing, Finish Task), Data Agunan, Laporan Taksasi/Retaksasi and master data. Its flow describes Maker receiving and starting a task, populating collateral, Checker returning tasks for correction, a two-working-day SLA **after inspection**, role access and leave replacement. BRD's initial three-role model is Maker, Checker and CIIS Admin; CollMan retains its established extended roles (Maker, Checker, Reviewer, Approver, Admin, Auditor). This is a documented product adaptation, not an assertion that the CIIS BRD approved the expanded role matrix.

This increment covers task inbox/lane state, receive, start, Admin assignment, completed inspection date and conservative weekday-only SLA, with approval workflow synchronization. **Not yet implemented**: interbranch Send Other Branch with Checker consent, leave-delegation approvals, holiday calendar, inspection reminders, full multi-memo data intake, document vault, Excel bulk workflow, KJPP scoring, PDF+QR reports, complete notification/escalation, and external system integration.

## Runtime and data isolation
- Vercel PostgreSQL: additive **0007_task_management.sql**. No existing collateral or user rows are deleted or bulk-updated. Existing assets without a task row appear virtually in Open or Finish according to their current status and are materialized only on an authorized interaction. Existing task rows maintain completed inspection/due-date fields across workflow stages, including Return.
- Cloudflare SQLite Durable Object pilot is not the approved production target for this increment. A task-schema draft exists for later parity, but **the new operational task endpoints run in the Vercel/PostgreSQL API only**.
- All writes use PostgreSQL transactions with **asset row locking** and existing tenant-scoped composite foreign keys. Task actions create tenant-local audit trail entries. Approval and workflow changes continue to enforce server-side status, RBAC, and maker-checker separation.
- Task SLA 'today' is evaluated using WIB (Asia/Jakarta, UTC+07) by default; multi-timezone bank policy is not yet configured. The due date currently ignores Indonesian national holidays because a bank-approved calendar has not been supplied. Displayed SLA must not be described as a regulatory/bank-authoritative deadline until that parameter is approved.
- No database migration has been run against production, no production data were inserted, deleted, reset or reclassified, and no live Vercel deployment/promotion is part of this change.

## API
| Method and route | Purpose and access |
|---|---|
| GET /api/tasks?lane=OPEN/WAITING/ONGOING/FINISHED&scope=mine | Tenant-filtered inbox scoped by logged-in role |
| GET /api/tasks?scope=all | Admin and Auditor only, tenant-filtered read |
| POST /api/tasks/:assetId/receive | Allowed owner/assignee accepts Open Task (Waiting Task) |
| POST /api/tasks/:assetId/start | Same recipient starts Waiting Task (Ongoing Task) |
| PUT /api/tasks/:assetId/inspection | Original Maker on Ongoing Draft/Returned task records completed inspection once; immutable date |
| POST /api/tasks/:assetId/assign | Admin assigns an Open Task to an active same-tenant user of matching role; no cross-tenant user IDs |

Only business approval workflow transitions can finish a task. The administrative assignment does **not** impersonate an actor or grant permission to edit or approve an asset owned by another person. Historical tasks before migration are displayed without destructive backfill.

## Controlled UAT plan
**Before any UAT mutation:** provision a dedicated isolated PostgreSQL UAT database, verify that it is neither the existing live DB nor accidentally mapped to it, snapshot/restore-test the live DB, run explicit migrations 0001–0007 against the isolated UAT database only, and verify checksums with `npm run db:verify`.

1. Use isolated test users, unique synthetic counterparties and collaterals. Never use a real debtor name/certificate, or a real user's existing production account.
2. ADMIN creates UAT users and a separate user for each CollMan role. Test assigning CHECKER, maker assignment restricted to original Maker, and foreign tenant user rejected.
3. MAKER: create Draft, Receive, Start, record an inspection completed date, check exact due date (Friday -> Tuesday, excluding nonworking weekend), and submit after valuation/legal fields. Original asset fields remain unchanged by task read/list.
4. CHECKER: see Submitted in Open, Receive, Start, review evidence, CHECK or RETURN. If RETURN occurs, Maker receives new Open task and prior inspection/due date remains unchanged.
5. REVIEWER and APPROVER: receive/start at authorized stage; verify maker self-check and self-approval denied and cannot bypass stages. Approval closes task as Finish.
6. AUDITOR: read own-tenant task state and audit trail; attempting receive/start/assign/inspection must be denied. Other roles cannot use `scope=all`. Cross-tenant asset/task identifiers reveal no data.
7. Validate double RECEIVE, START before Receive, repeat/invalid future inspection date, assignment while Ongoing, stale task update, and duplicate workflow transition return appropriate errors.
8. Run desktop and mobile browser end-to-end including filtering, modal prompts, and link navigation. Confirm timeline and task audit events remain available.
9. Run periodic report and complete CIIS/KJPP/Excel/QR/leave delegation UAT **only after those modules are implemented**.

## Live authentication without touching business records
`scripts/uat-login.mjs` performs app-level login, checks cookie controls, reads /api/meta, /api/assets and /api/tasks, tests authorization and logout for all six roles. It does **not create/edit/delete collateral**, although login/logout naturally write session and audit events.

Provide `UAT_BASE_URL` and `UAT_ROLE_ACCOUNTS` through an approved secrets manager/ephemeral CI environment; do not commit, paste into tickets, print or store passwords in screenshots. A manual, protected GitHub Action is supplied at `.github/workflows/uat-authorized-login.yml`: configure GitHub Environment `uat` with required reviewer approval and environment secrets `COLLMAN_UAT_BASE_URL`, `COLLMAN_UAT_ROLE_ACCOUNTS` (all six account objects), and optionally `COLLMAN_UAT_OIDC_TOKEN`. The workflow cannot legitimately pass with missing credentials. An optional short-lived `UAT_OIDC_TOKEN` header supports authorized access through Vercel SSO protection. This is **not** permission to disable deployment protection or bypass the identity policy.

**Status:** real six-role live authentication cannot be marked PASS without actual authorized UAT credentials, SSO authorization and an isolated UAT endpoint. A deployment marked READY and isolated browser CI passing are not proof of live role login.

## Release gate
Hold merge and production rollout until UAT DB identity and reversal between environment labels are reconciled, production backup/restore rehearsal and migration checks pass, exact branch CI and preview are verified, six-role live UAT signed off, all pending BRD modules and external integration contracts evaluated, and bank security/appraisal owners approve the release.
