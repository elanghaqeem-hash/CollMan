# CollMan — Enterprise Collateral Management

Existing application: static JavaScript UI, Node.js Vercel Functions and PostgreSQL. GitHub is the source of truth. Production target is the existing Vercel project `collman` at https://collman-lemon.vercel.app; do not deploy this application to the archived Cloudflare/Turso targets.

**Release status: BLOCKED / integration candidate.** Passing tests and an existing reachable production baseline do not establish bank production readiness. Production PostgreSQL inventory, encrypted backup/restore, authenticated bank UAT, security controls, full model validation and real process/control sign-off remain mandatory. No source attachment or customer data is included in this public repository.

## Current functions

- Tenant-scoped six-role authentication and collateral register with 16 asset categories and 74 initial types, category-specific fields and legal/evidence references.
- Manual appraisal, editable sourced comparables, independent review/approval, immutable audit/history and internal evidence reviews.
- Versioned model registry, independent validation and separate model sign-off, suspension and immutable sourced indication snapshots. Models never publish final appraisal automatically.
- Deterministic comparison, property cost, depreciated cost, capitalization, DCF, quote/NAV, blocked cash, gold purity, receivable recovery, specialist, reconciliation and guarantee indication methods.
- Facility register, independent allocation approval, bank accepted ceiling, coverage, allocation-based LTV and independent release. Guarantees stay separate from asset values. Pending release continues consuming capacity.
- Desktop/mobile UI, filtered registers and scoped CSV exports. Regulatory recognition remains null until an approved rule set exists.

## Development and verification

```bash
npm ci --ignore-scripts
npm run build
npm run dev
```

`npm run dev` uses disposable PostgreSQL WASM and synthetic local-only identities; it does not connect to Production or Preview. Real PostgreSQL, concurrency, HTTP and browser checks run in CI using a disposable service database. The synthetic CI restore drill compares all restored table counts and SHA256 content fingerprints.

Versioned migrations live in `migrations/postgres`. Run `npm run db:migrate` and `npm run db:verify` only in a controlled, verified environment after the appropriate backup and change gates. Migration files are checksum protected and never applied on public requests/builds.

`npm run deploy` requires the exact existing Vercel team/project link, creates preview only and rejects direct production flags. Production uses an approved staged-build/promotion process. No database reset or URL swap is part of deployment.

## Documentation

- [Execution audit, formulas, architecture, ERD and open gates](docs/ENTERPRISE_EXECUTION_20261030.md)
- [Requirement traceability matrix](docs/ENTERPRISE_RTM.csv)
- [Enterprise API](docs/ENTERPRISE_API.md)
- [User/admin guide and training exercises](docs/ENTERPRISE_USER_ADMIN_TRAINING.md)
- [Production release runbook](docs/VERCEL_RELEASE_RUNBOOK.md)
- [Security and operations](docs/SECURITY_OPERATIONS.md)

Historical files under `deploy/cloudflare`, `wrangler.jsonc` and the legacy SQLite Worker remain for audit/history. They are not the current production target.

## Source-control policy

Read current branches/PRs before changes. Preserve existing data, tenants, accounts and history. Commit and push tested work to a feature branch; verify the remote SHA and PR. Do not commit secrets, raw bank source materials, confidential workbooks or appraisal/customer rows. Do not claim completion, bank sign-off or production deployment without the corresponding evidence. Source synchronization is an explicit Git operation, not a background monitoring service.
