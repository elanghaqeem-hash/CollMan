# Enterprise API additions

All routes require a valid HttpOnly session, same-origin mutation header and tenant isolation. Monetary outputs are whole IDR; source currency must match the asset. Requests are limited to 64 KiB. Invalid input is 400/422, unauthenticated 401, unauthorized 403, tenant-hidden/missing objects 404, stale workflow or exhausted allocation 409. Duplicate schema keys may return the existing database diagnostic and must be handled by callers.

| Route | Methods | Access / persisted behavior |
|---|---|---|
| `/api/models` | GET | Tenant model registry and methods; validation observations are withheld from list output |
| `/api/models` | POST | Admin creates immutable draft definition: name, version, method, category, region, effective_from/to, parameters, methodology_ref |
| `/api/models/:id/review` | POST | Independent Reviewer; reference, note, observations (predicted, actual, realized_on, realization_ref, category, region) |
| `/api/models/:id/approve` | POST | Separate Approver; reference; REVIEWED → VALIDATED |
| `/api/models/:id/suspend` | POST | Approver; reference; VALIDATED → SUSPENDED |
| `/api/assets/:id/model-runs` | GET | Tenant asset's immutable indication snapshots |
| `/api/assets/:id/model-runs` | POST | Owner Maker/Admin on Draft/Returned; model_id, as_of, region, method-specific input |
| `/api/facilities?q=...` | GET | Tenant facilities with approved active allocations, coverage and allocation-based LTV (max 200) |
| `/api/facilities` | POST | Maker/Admin: reference_no, borrower_ref, branch_code, exposure_idr |
| `/api/facilities/:id` | PUT | Owner Maker/Admin updates exposure_idr with old/new audit |
| `/api/allocations` | GET | Tenant allocation and release register (max 300) |
| `/api/allocations` | POST | Maker/Admin: asset_id, facility_id, amount_idr, basis_ref; creates PENDING |
| `/api/allocations/:id/approve` | POST | Independent Approver; requires approved/perfected/eligible asset and independently recorded bank acceptance |
| `/api/allocations/:id/reject` | POST | Independent Approver rejects PENDING |
| `/api/allocations/:id/request-release` | POST | Maker/Admin on ACTIVE; reason mandatory |
| `/api/allocations/:id/approve-release` | POST | Independent Approver; reason mandatory; releases capacity transactionally |
| `/api/assets/:id/eligibility` | PUT | Existing independent review now accepts optional bank_accepted_value and bank_policy_ref; amount ≤ liquidation |

Model inputs and formulas are documented in `ENTERPRISE_EXECUTION_20261030.md`. See synthetic examples in `tests/valuation-engine.test.mjs` for complete shapes; these examples are not market data or approved bank parameters.

Model registry state: DRAFT → REVIEWED → VALIDATED → SUSPENDED. Definitions cannot be rewritten; create a new version. Model runs always remain indications and never update the manual appraisal or asset approval status.

Allocation state: PENDING → ACTIVE or REJECTED; ACTIVE → RELEASE_PENDING → RELEASED. ACTIVE and RELEASE_PENDING both consume the bank accepted ceiling. No API deletes allocation history. Guarantees are excluded from asset allocation and from the dashboard's asset value sum.

Bank accepted values are cleared whenever a draft manual appraisal is recalculated. A later independent review must supply the current bank value/policy again before allocation. No regulatory value is derived from LTV or bank acceptance.
