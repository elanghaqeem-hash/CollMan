# Evidence register & internal review — release handover

## Scope and boundary

This addition covers the **internal evidence metadata register** attached to one collateral asset and a distinct Maker-to-Checker/Reviewer evidence review. It is not an ATR/BPN connector, an OCR inference engine, scanned document store, validated cadastral layer, or certified AI valuation.

The supplied CIIS BRD describes document intake, Maker/Checker tasks, a review status for collateral (Green/Amber/Red), PDF resume, and audit reporting. This implementation addresses the **evidence metadata and internal review control** only. It does not implement the BRD's complete task/SLA, bulk document intake, KJPP performance, resume/QR, or Green/Amber/Red decision system; these remain tracked gaps. ATR/BPN and AI appraisal are additional CollMan enhancements, not assertions of live BPN connectivity.

## Implemented endpoints (same for Vercel PostgreSQL and Cloudflare pilot)

- `GET /api/assets/:assetId/evidence` — tenant-scoped evidence list for an authenticated role.
- `POST /api/assets/:assetId/evidence` — Maker of owned Draft/Returned asset or Admin may record **metadata only**.
- `POST /api/assets/:assetId/evidence/:evidenceId/review` — independent Checker at Submitted, or Reviewer at Reviewed, may apply `REVIEWED_INTERNAL` or `DISPUTED` with rationale >= 10 characters.
- `GET /api/assets/:assetId` — includes `evidence` list and reviewer labels, without exposing raw documents.
- `POST /api/assets/:assetId/transition` APPROVE — blocked if recorded evidence remains pending; if disputed requires an explicit Approver exception rationale >= 20 characters. Does not automatically change legal status.

Allowed evidence types: LEGAL_DOCUMENT, OWNERSHIP, VALUATION_SUPPORT, SITE_SURVEY, SPATIAL_SCREEN, OCR_EXTRACTION, KJPP_REPORT. Reference, source name, note and optional SHA-256 digest are user-provided; a SHA-256 digest is **not proof of official authenticity**.

## Data integrity, migration & safety

- `migrations/postgres/0006_asset_evidence_reviews.sql` additive, tenant-scoped composite FKs, immutable source metadata and one-time review trigger. `src/evidence-schema.js` maintains Cloudflare SQLite pilot parity.
- No existing collateral, appraisals, approvals, users, or sessions are deleted. Migration must be run through the explicit migration script against an approved UAT database and verified via `npm run db:verify`. Never auto-run on production requests.
- Audit events: `ADD_EVIDENCE` and `REVIEW_EVIDENCE`. No raw OCR text, certificate image, national ID, government API payload or API secret is accepted as uploaded evidence here.
- Real document upload, encryption, malware scanning, page provenance, S3/R2 vault, OCR inference and government verification require separately designed and approved connectors.

## Controlled UAT checklist

1. Run `npm ci`, `npm run build`, `npm run db:migrate`, `npm run db:verify` against **isolated UAT**, then `npm run test:integration`.
2. Maker: login, create Draft, record LEGAL_DOCUMENT metadata; refresh and find persisted row; duplicate metadata should not be misrepresented as verified.
3. Auditor: can see evidence and audit but cannot POST or review. Viewer from another tenant receives 404 on asset IDs; no cross-tenant leaks.
4. Checker: cannot review before Submitted, can review once at Submitted, self-review denied. Reviewer only when the task is Reviewed; Maker and Admin cannot use the review route.
5. Verify pending evidence blocks final approval. Disputed evidence requires explicit human Approver exception note. Review transition is immutable; no update/delete endpoint.
6. Verify all legacy agunan without recorded evidence retain preexisting workflow behavior (backward compatibility).
7. Verify UI responsive, keyboard accessible, server errors redacted; after logout old session must receive 401.
8. Apply official integration and model gates in `docs/BRD_IMPLEMENTATION_GATES_20261030.md` before any provider is enabled.
9. Preserve production/preview database separation; PR #6 documents existing reversed labels, PR #4 documents pending universal-collateral migration.

## Known limitations / no-release claims

No authenticated live six-role test against production was completed in this change. Vercel SSO and UAT role accounts must be resolved through the security-approved test process. Production DB migration, backups/restores, formal security signoff and deployment remain unverified; do not merge/promote solely because isolated CI succeeds.
