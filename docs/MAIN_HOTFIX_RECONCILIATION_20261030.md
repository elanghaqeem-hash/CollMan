# CollMan safe reconciliation of main registration hotfix into enterprise — 30 October 2026

## Reconciliation target

- Production-tracked `main` head: `7fc0ba270024385dd23c3d7e36e33e46fb7628c6`.
- Enterprise PR #8 head before reconciliation: `e182f2a8e4c0cce187a159a9b9adfe30b5763417`.
- Integration branch: `merge/main-hotfix-into-enterprise-20261030`.
- Reconciliation uses a **two-parent source merge** that records both prior histories; it is **not** a deployment and does not alter any PostgreSQL environment.

## Conflict decisions (recorded, not silently overwritten)

| Conflicting path(s) | Resolution | Reason |
|---|---|---|
| `public/app.js`, `public/collateral-ui.js` | Keep enterprise dynamic 16-category forms and tenant-aware search. Import main's accent-insensitive search normalization and bounded result count into enterprise picker. | Main legacy `asset-form` markup and click handlers refer to different element IDs and would overwrite enterprise legal, evidence and valuation flows. |
| `public/collateral-catalog.js` | Exactly identical blob in both histories. | Same shared 16-category source, no merge conflict. |
| `public/collateral-picker.js`, `tests/collateral-picker.test.mjs`, `docs/COLLATERAL_PICKER_HOTFIX_20261030.md` | Preserve main files verbatim. Enable the picker test in `npm test` and syntax guard. | Retains reviewed legacy picker helper, source history, and search/catalog regression coverage without routing enterprise UI through legacy form. |
| `public/index.html` | Preserve enterprise SPA and refresh HTML CSS/JS query version. | Prevent stale login and picker assets on mobile browsers without changing Vercel/PG routing. |
| `package.json`, `scripts/check.mjs` | Preserve enterprise PostgreSQL, valuation, task and migration test gates; add main's category picker checks. | Neither gate should be dropped. |
| `src/domain.js`, `src/index.js`, `src/vercel-api.js` | Preserve newer enterprise type-aware registration/appraisal/eligibility/SoD guards. | Main's `mayUseLegacyAppraisal` was specifically a **stop-gap** to deny non-property approvals in the legacy UI. Re-applying it would incorrectly deny approved enterprise category workflows. No weakening of enterprise tenant, legal evidence or SoD checks is intended. |
| `tests/frontend.e2e.mjs`, `tests/vercel-api.integration.test.mjs` | Preserve enterprise UI selectors, role transition and PostgreSQL integration tests, alongside the main standalone picker tests. | Main tests use now-superseded legacy picker IDs and historical draft-only limitation. Enterprise E2E and isolated DB tests exercise the same business outcome with the new UI/API. |
| `public/styles.css` | Preserve enterprise grouped search and mobile styling. | Main selectors bind to retired markup; duplicating them adds dead CSS but not functionality. |

## Mandatory CI and deployment gates

- Run syntax/domain/picker and enterprise tests, isolated PostgreSQL 0001–0009 migrations and integrity checks, RBAC/SoD, 16-category API, desktop/mobile browsers, and synthetic restore on **the final integration SHA**.
- New commit is a two-parent merge of main and enterprise. The production tracked main branch is **not** updated by this reconciliation.
- Confirm preview exact SHA, production alias and actual managed Preview vs Production DB contents. Do not treat a Vercel READY preview as authenticated bank UAT.
- Production must remain on existing baseline until real production backup+restore, migration checksums, six-role UAT, bank legal/security/model sign-off and explicit go/no-go are confirmed. Do not auto-migrate on build or replace existing bank records.

**Production decision: HOLD.** This reconciliation alone does not certify CollMan for commercial banking production.
