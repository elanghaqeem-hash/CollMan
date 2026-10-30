# CollMan Collateral Category Selector — Android / Production Hotfix
Date: 2026-10-30

## Purpose
The existing production register shows only eight property-based types in a large Android native selector. This additive hotfix reuses the **same declarative enterprise asset catalog** already built in the pending enterprise PR #8. The UI exposes **16 categories, 74 builtin types**, a category-first short native picker, and a searchable full-catalog selector with touch-sized results. `src/domain.js` derives server allowlisted types from the same source, preventing valid new selections from failing as unknown.

## Preserved behavior
- Original eight type labels remain unchanged, including `Lainnya`.
- No database migration, no backfill, no deletion/rewriting of historical agunan.
- `asset_type` stays the same existing text field, and name matching is backward-compatible.
- Role-based controls, old workflow, original data values, and existing appraisal records are not changed.
- Retains native select keyboard/screen-reader behavior; searchable buttons are optional.
- Default `legal_status` remains `BELUM_DIVERIFIKASI`. The picker is a registration catalogue, **not** bank eligibility, legal perfection, certified market valuation, or regulator acceptance.

## Explicit limitations
The old `main` application is a **basic register**. Its generic form for `address`, certificate, `land_area` and `building_area` is not a category-specific financial/vehicle/guarantee workflow. The **full enterprise collateral-specific schemas**, evidence, eligibility and valuations remain in PR #8, which is **not production ready** and requires additive managed Postgres migrations and UAT. The hotfix improves selection and initial registration only.

## UAT
- Unit tests: number of categories; original eight labels; every category can be validated and submitted by backend; search, grouping and unknown-type rejection.
- Browser E2E (desktop/mobile): search Deposito, choose VEHICLE/Mobil, search Piutang Usaha, mobile overflow check; no real collateral creation in browser test.
- Production smoke after deploy: verify exact SHA served, 16 categories displayed, app.js asset URL cache-busted, selected type persists on create and reload **in a dedicated isolated UAT tenant** only. Never use real bank debtor or live account for test setup.
- Release gate: no schema migration required for this hotfix, but the deployment itself must be verified on the Vercel production alias; do not claim live until Vercel confirms the commit and smoke passes.
