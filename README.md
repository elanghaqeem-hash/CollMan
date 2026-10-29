# CollMan — Collateral Management System

An operational **initial release (v0.1.0)** for registration, preliminary appraisal, review and approval of collateral objects. Built for **Cloudflare Workers Free + SQLite-backed Durable Objects**, with a zero-dependency web UI. No applicant records, appraisal templates containing personal information, or bank policy weights are included in the public source repository.

> **Scope boundary:** This is a working foundation, not a certified valuation engine or completed implementation of the KB Bank CIIS BRD. No ATR/BPN, spatial-risk data provider, AI model, SLIK, mapping, KJPP, OCR, upload storage, or regulatory system is connected. The preliminary figures are **user-provided and parameterized**. The final bank credit decision must remain with authorized people.

## Features implemented

- Private account login, salted PBKDF2 password hashes, 12-hour HttpOnly SameSite cookies, email-based login-attempt lockout and password-change endpoint.
- Controlled one-time bootstrap using secret `BOOTSTRAP_TOKEN`; new users created only by an administrator.
- Six roles: `ADMIN`, `MAKER`, `CHECKER`, `REVIEWER`, `APPROVER`, `AUDITOR`. Data segregated by organization / tenant identifier and checked on each object query.
- Collateral register: borrower, asset type, address, certificate type/number, NIB, holder name, land/building area, legal-verification status and notes.
- Preliminary appraisal: market value, user-supplied base haircut, editable risk flags (flood/SUTET/cemetery/greenbelt/road access/illegal change) and institution-configurable additive risk haircuts, calculated liquidation value.
- Comparable listings recorded manually with source URL and offering price.
- Maker → Checker → Reviewer → Approver workflow, return/reject with rationale, maker separation of duties, immutable workflow action journal, server-side status-transition validation.
- Dashboard, status report, CSV export of the current result page, audit trail, user management and responsive desktop/mobile UI.
- No seed records, placeholder market value or risk weight is inserted.

## Storage choice and rationale

The connected Cloudflare account reached its limit of **10 D1 databases** on October 29, 2026. This project therefore uses its own **SQLite-backed Durable Object** (`CollManStore`) rather than deleting another project's DB or sharing sensitive workloads. SQLite is provisioned automatically by Wrangler through `new_sqlite_classes`, with startup schema initialization in `src/schema.js`. Data remains inside the cloud object's persistent SQLite database.

The v0.1.0 implementation uses one DO instance named `production` (logical tenant separation inside the DB). Before high-volume production / multi-bank adoption, a per-tenant DO partitioning scheme, formal migration tooling, backups/restore rehearsal, independent security assessment, secrets rotation, and integration testing are mandatory.

## Deploy

**Prerequisites:** Cloudflare Worker named `collman` connected to this repository; `main` is production branch; Workers Free supports SQLite-backed Durable Objects.

1. Under **Cloudflare → Workers & Pages → collman → Settings → Builds**, choose root directory `/`, **Build command** `npm run build`, **Deploy command** `npx wrangler deploy`. If the account's CI does not install Wrangler from `package.json`, install/pin Wrangler in Cloudflare build configuration, or use `npx --yes wrangler@4.155.0 deploy`. The `wrangler.jsonc` file pins the correct static directory and code entrypoint.
2. Set one secret under Worker **Settings → Variables and Secrets**: `BOOTSTRAP_TOKEN` = a random token of at least 32 characters. Never put its real value into GitHub, README or logs. Secret bindings must be preserved across deploys.
3. Commit/push all app files and allow Wrangler to publish the `collman` Worker. The first request to `/api/meta` initializes the Durable Object SQLite schema, including the tables and indexes.
4. Browse the Worker URL. On the first load, enter organization, administrator identity, strong password and one-time bootstrap token. The `/api/auth/bootstrap` endpoint is permanently disabled once the first user exists.
5. Log in, create individual role users, set risk weights (default zero), test a Draft → Submit → Check → Recommend → Approve flow with **different users**, and review `/api/health`.
6. Replace the bootstrap secret once the first user has been created (or remove it in the dashboard), and set up approved backup, restoration, monitoring and access control procedures before live customer onboarding.

**Security note:** Direct public login is available and registration is admin-only. For stronger bank controls, put Cloudflare Access / enterprise SSO in front of the deployment and integrate bank identity sources. Rate limiting, account policies and logs require security-team review.

## Local development and verification

```bash
npm ci
npm run build
npx wrangler dev
# in another terminal: curl http://localhost:8787/api/health
```

Create `.dev.vars` from `.dev.vars.example` for local bootstrap. No remote D1 instance is required. `npm run build` checks expected files, JavaScript syntax, and business-rule unit tests. A local Cloudflare runtime integration test is still needed for the full authentication and persisted-storage journey.

## API overview

| Endpoint | Method | Access / purpose |
|---|---|---|
| `/api/meta`, `/api/health` | GET | Account bootstrap readiness / health |
| `/api/auth/bootstrap` | POST | One-time administrator creation, secret required |
| `/api/auth/login`, `/api/auth/logout` | POST | Auth sessions |
| `/api/auth/password` | POST | Self password change and session invalidation |
| `/api/dashboard` | GET | Live status counts and approved values |
| `/api/assets` | GET, POST | Tenant-scoped register and Maker creation |
| `/api/assets/:id` | GET, PUT | Collateral detail and Maker revisions |
| `/api/assets/:id/appraisal` | PUT | Preliminary appraisal |
| `/api/assets/:id/comparables` | POST | Add price reference |
| `/api/assets/:id/comparables/:id` | DELETE | Remove comparable |
| `/api/assets/:id/transition` | POST | Role-checked workflow action |
| `/api/settings` | GET, PUT | Risk-weight parameters, Admin write |
| `/api/users` | GET, POST | Admin user provisioning |
| `/api/users/:id` | PUT | Admin role / active status |
| `/api/audit` | GET | Audit trail for Admin and Auditor |

## Reference inputs and implementation alignment

The implementation was informed by: (1) **KB Bank CIIS BRD October 2026**, including data-entry, legal verification, comparable data, review stages, reports and role definitions; (2) **Sxored Quick Appraisal**, particularly the idea of first-gate screening and editable location flags; (3) **Kertas Kerja Ruko BPR** and **Kertas Kerja Tanah Bangunan**, including certificate registers, land/building calculations, comparable evidence, market valuation and liquidation-value report structure.

These source materials are **not** reproduced or embedded in the public repository. This is a gap-aware implementation, **not** a claim that all BRD features or proprietary model methods have been implemented.

## Current limitations / controlled roadmap

- **Phase 1 now:** initial collateral register, appraisal input and calculated indicative liquidation value, comparables, multi-stage approval, status reporting, audit and admin functions.
- **Phase 2:** formal bank-specific data model, editable role/approval matrix, role-specific inbox and SLA/escalation, evidence vault (R2 + encryption + antivirus validation), advanced certificate validation, map/spatial layers, full valuation templates/adjusted comparables, configurable cost approach and depreciation, and signed report/PDF exports.
- **Phase 3:** approved integrations with bank origination, ATR/BPN or licensed spatial providers, geocoding and historical imagery, appraisal AI as a controlled decision aid, API integrations, data retention, disaster recovery, SSO, independent pen-test, UAT and production release gates.

See [Implementation Traceability](docs/IMPLEMENTATION_TRACEABILITY.md) and [Security & Operations](docs/SECURITY_OPERATIONS.md).

---

## Repository source-control policy (preserved)

CollMan is the source-controlled repository for the Collateral Management System project.

## Repository policy

**GitHub is the source of truth.** A development task must not be reported as complete until its source changes are committed, pushed to this repository, and the resulting GitHub commit is verified.

Required workflow for each future development task:
1. Read the latest repository state before making changes.
2. Implement and review the requested changes; keep credentials and sensitive documents out of commits.
3. Run relevant checks for the code touched (format/lint, type-check, tests, build, security checks as appropriate). If checks cannot run, explicitly report this.
4. Commit changes with a descriptive message, using a feature branch and pull request for higher-risk changes when appropriate.
5. Push to GitHub and verify the remote commit SHA or pull request. When working directly on `main`, confirm the branch contains the commit.
6. Report the commit SHA/link, files changed, check results, and whether any changes remain unpushed. **Do not claim completion or production deployment without evidence.**

## Change tracking

Use conventional-style commit messages when feasible:
- `feat:` new functionality
- `fix:` defect correction
- `docs:` documentation
- `test:` automated test coverage
- `refactor:` structural improvements
- `chore:` maintenance and tooling

## Source materials

Business requirements and appraisal workbooks are available as project reference materials; their presence in a working session does not mean they are committed to GitHub. Confirm permission and information sensitivity before adding source documents to this public repository.

## Notes on synchronization

Repository updates from development work performed through ChatGPT require an explicit GitHub write operation for each change set. This README establishes the working convention; it does **not** install an always-running synchronizer for edits made outside this workflow.


## Restricted pilot deployment (2026-10-29)

Cloudflare Worker `collman` has been deployed to `https://collman.elang-haqeem.workers.dev`, protected by a Cloudflare Access administrator-only policy and verified Access JWT. The deployed code is in `deploy/cloudflare/worker.mjs`.

**This pilot is NOT the operational bank application.** It performs sample BRB/NP calculations only, does not persist any data, and must not receive real customer or collateral information. The earlier full Python foundation package and migrations are not yet synchronized into this GitHub repository. They remain in the delivery artifact. Release is explicitly blocked pending backend data persistence, bank RBAC/ABAC and SoD, legal/GIS validation, approved master data, PII protection, complete reporting, and production UAT.

ASUMSI: The restricted adapter and associated access policy exist solely for technical verification.
