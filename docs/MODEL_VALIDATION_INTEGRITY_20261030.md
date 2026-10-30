# CollMan model validation integrity — 30 October 2026

**Scope:** Targeted integrity hardening on the existing enterprise integration branch; not production certification. This branch is based on PR #8 head `820682661b9318576df11695e2d9d1a2654d3211`. Do not merge into production-tracked `main` or migrate the live database without the existing release gates.

## Problem and control

Prior backtesting could accept an observation whose `realized_on` occurred after the validation date and did not distinguish historically dated forecasts from estimates reconstructed after a sale/realization. That creates look-ahead bias risk: small MAPE/MdAPE or bias could be mistakenly used to certify a model even without evidence that the predictions existed before outcomes were known.

Backtesting now:
- Rejects future `realized_on` dates relative to the execution date (UTC).
- When forecast metadata is supplied, requires both `predicted_on` (ISO calendar date) and `prediction_ref` (reference to historical archived forecast), with `predicted_on <= realized_on`.
- Reports the observed realization period, count of prediction-documented observations and `historical_prediction_evidence: COMPLETE | INCOMPLETE`.
- Allows a Reviewer to record descriptive statistics for incomplete historical data but **prevents an Approver from changing the model to VALIDATED** without complete dated prediction provenance.
- Retains existing separation of the ADMIN model author, independent REVIEWER and independent APPROVER. No override of the model-validation gate is exposed here.
- Keeps all model runs indicative: `approved_market_value: null`, `automatic_final_valuation: false`, `regulatory_value: null` until separately governed processes are implemented.

This is a **minimum integrity precondition, not proof of model fitness**. No inference about source authenticity, transaction legitimacy, representativeness, minimum sample size, concentration, calibration, segmentation, or bank approval thresholds is made from a user-supplied reference. These conditions require independently verified bank records and model-risk owner sign-off.

## API contract (incremental)

`POST /api/models/{id}/review` accepts its existing `observations` array. For an observation to count as historical-prediction evidence, add:

```json
{
  "category": "PROPERTY",
  "region": "APPROVED_BANK_REGION",
  "predicted": 123,
  "actual": 125,
  "predicted_on": "2026-07-01",
  "prediction_ref": "approved-private-vault-record-id",
  "realized_on": "2026-08-01",
  "realization_ref": "approved-private-transaction-record-id"
}
```

The numbers above illustrate **schema only**, not market evidence, approved calibration, or production data. Never place bank/customer reference documents, identifiable addresses, actual values, credential tokens or raw workbook rows in this public repository.

The `review` action still records backtesting output while `approve` now responds HTTP 409 for incomplete historical-prediction evidence. Existing previously approved registry rows (if any) are not edited by this code change.

## Test and release evidence

- Unit: `tests/valuation-engine.test.mjs` exercises future-realization rejection, forecasts dated after outcome, missing historical reference, incomplete/complete provenance and descriptive observation period.
- Isolated PostgreSQL integration: `tests/enterprise-api.test.mjs` verifies complete evidence permits independent approval and incomplete evidence leaves the registry in REVIEWED state.
- Execute `npm ci && npm run build` on the **exact reviewed commit**, then run isolated PostgreSQL migration/checksum/integrity and the authenticated staging UAT gate; do not equate CI fixtures with real model validation.
- Production URL remains `https://collman-lemon.vercel.app`, independently observed at deployment `dpl_GqWcGcSoEoMAJwyvwTWr76KdikWi`, SHA `4bca94a1371c7cf709586ad6c2af05276579da90`; that is **not** this candidate branch.

## Source inspection and limitations

Four supplied confidential appraisal/requirements inputs are kept outside GitHub. CIIS BRD PDF has 28 scanned pages and does not supply machine-readable text without controlled extraction. Quick Appraisal has 10 pages and presents early collateral screening as a filter, not a replacement for bank policy. Workbook container inventory found eight worksheets / 2,964 formula cells / 8 cached errors in the Ruko workbook, and nine worksheets / 2,798 formula cells / 81 cached errors in the Tanah Bangunan workbook. The spreadsheet importer returned `PartDoesNotExist` on both; do **not** claim full-workbook validation or silently trust caches. Previously selected equation golden tests are narrower than a complete independent valuation attestation. No source workbook or customer data is embedded here.

## Still-blocking release gates

1. Current PR #8 is draft; reconcile the newer `main` collateral registration hotfix rather than overwrite it.
2. Verify actual managed Preview and Production PostgreSQL identities, migration checksum inventory, encrypted backup and independently tested isolated restore; do not trust database names or swap secrets.
3. Verify deployment at exact candidate SHA; existing Vercel free-tier build quota has caused HTTP 402 on previous attempts.
4. Complete six-role authenticated live UAT and negative tenant/branch/SoD/security testing with properly authorized identities.
5. Finish bank-specific effective-dated regulatory rules, document vault, role authority/delegation, insurance/custody, revaluation, recovery/AYDA, external source contracts and sign-offs.
6. Record explicit go/no-go, change and rollback approvals from business owner, Risk/Appraisal, Model Risk, Legal, InfoSec, IAM, Operations and DBA.

**Release decision: HOLD / NO-GO.** This change does not read or mutate any managed production database, does not reveal secrets and does not trigger a production deployment.
