# CollMan — BRD Completion and Live UAT Gates (2026-10-30)

> **Classification:** Working implementation gap/control matrix. Source documents are privately held and are NOT reproduced in this public repository. This matrix combines the CIIS BRD's process patterns, Quick Appraisal's screening concept, and additional CollMan enterprise requirements. It does not claim exact bank-specific acceptance criteria or that external interfaces are licensed.
>
> **Current release decision:** NOT READY FOR BANK PRODUCTION. Draft feature branch only. No live ATR/BPN, OCR provider, GIS registry, or AI provider is connected. No end-to-end live login across six real accounts has been demonstrated.

## Requirement matrix (operationally testable)

| Domain | BRD / enhancement intent | Current capability | Remaining build / acceptance gate |
|---|---|---|---|
| F01 Identity | Login, change password, user management | PBKDF2, session cookie, bootstrap, six roles | Live 6-role auth UAT, password resets, SSO/MFA, deactivation/session concurrency; negative cases |
| F02 Dashboard | Work queues and status per function | Summary/status list | Role inbox, open/waiting/ongoing assignments, due dates and SLA escalations |
| F03 Intake | Input Data Dokumen, debitur/agunan, master metadata | Core property fields | Bank-approved complete form, dynamic collateral-type schema, required evidence, provenance |
| F04 Legal | Certificate, NIB, right holder, legal review | Manual fields | Official/approved ATR-BPN partner interface, contract and consent, mismatch policy, freshness and signed evidence |
| F05 Workflow | Maker, Checker, Reviewer, Approver, Admin, Auditor | Core transitions and journal | Bank-approved role mapping, assignments, delegations, SoD tests, re-open/version cases |
| F06 Appraisal | Data Pembanding, market/liquidation values, KJPP | Manual comps and haircut, unadjusted asking-price analysis | Calibrated templates by property type, adjustment and cost/depreciation, KJPP evidence, supervisor review |
| F07 Spatial | Site-risk screening, peta spasial, history | Coordinate/radius calculation from user-supplied features only | Licensed geocoding, map layers, polygon intersections, flood/SUTET/TPU/zoning/roads, timestamps and map provenance |
| F08 OCR | Evidence upload, extraction and verification | Candidate field normalization and review endpoint only | Secure document vault (R2/approved storage), AV, hashes, OCR inference, field confidence/source-page bounding boxes, consent, human confirmation |
| F09 AI assist | Assisted price risk analysis and explainability | NO trained model; deterministic manual offer statistics | Approved model/provider, minimization, DPA/DPIA, comparable selection review, calibration/backtesting, drift monitoring, model version, override |
| F10 Reports | Report, memo, rekapan, signed appraisal | Dashboard and CSV | Certified bank templates, PDF, author/approver signature, immutable revision, attachments, watermark and access audit |
| F11 Data migration | Excel bulk upload incl. document metadata | Not implemented | Template validation, duplicate detection, error batches, rollback, sample tests |
| F12 Operations | Activity log, retention, backup and disaster recovery | Basic audit table | Tamper-evident logs, retention, immutable evidence, per-tenant isolation, backups and restore drills |
| F13 Collateral coverage | All eligible banking asset categories | Current register is mostly real-property-focused | Movable assets, inventory, vehicles, equipment, receivables, deposits, securities, guarantees, other bank-approved categories |
| F14 Storage | Requested PostgreSQL path / operational persistence | Runtime examined: Cloudflare SQLite-backed Durable Object | Formal PostgreSQL architecture and controlled migration path; current data must not be destroyed or silently replatformed |

## External connector acceptance gates

**ATR/BPN (official verification):** Written authorization and partner API documentation, test/prod credential segregation, endpoint/domain allowlist, certificate/NIB and ownership matching fields, consent/legal basis, error codes, retry/backoff, source response timestamp, evidence digest, manual exception queue. Status remains *NOT_CONFIGURED* until credentials and contract exist, then *CONFIGURED_UNVERIFIED* until actual authenticated contract test succeeds. Government portal UI or public maps are not themselves a bank-ready API.

**OCR:** Allowed MIME/PDF limits, malware scan, encrypted private object storage, signed one-time download/processing, page-level extraction, confidence threshold, field-level human confirmation, encrypted retention and deletion, bank approval for any external OCR processor. Review-only OCR input must never change legal fields automatically.

**AI appraisal:** Model/provider agreement and data-classification approval, benchmark by collateral type/geography, reproducible input/output versioning, human approval, quality flags and counterexamples, data-drift testing, and model rollback. Inference cannot declare a certificate valid, replace a licensed appraiser, set bank haircuts, or auto-approve.

**Spatial GIS:** Source licensing and update cycle for land parcels, restrictions, flooding, SUTET, public facilities, access roads, zoning, and historical imagery. Distinguish manual geodistance (implemented) from official polygon intersection (not implemented). No blank layer can count as "risk-free."

## UAT roles and sample end-to-end scenarios

Roles in CollMan: ADMIN, MAKER, CHECKER, REVIEWER, APPROVER, AUDITOR. The CIIS source workflow also refers to **CIS Admin**; the bank must approve the mapping between these role sets.

1. **ADMIN:** Login, view all authorized modules, create/deactivate a role, alter configured risk parameter with audit; cannot silently bypass SoD or change historical approvals.
2. **MAKER:** Login, create a draft, record evidence, comparables, manual coordinates, preliminary value, submit; cannot CHECK/RECOMMEND/APPROVE its own case.
3. **CHECKER:** Login, view submitted cases, request corrections, check valid case only; cannot modify Maker's historical evidence without controlled return.
4. **REVIEWER:** Login, review checked case, return or recommend; cannot approve own-case and cannot bypass prior stage.
5. **APPROVER:** Login, approve/reject with rationale and applicable authority; maker self-approval rejected; approval remains governed by bank policy.
6. **AUDITOR:** Login, access activity/audit record and authorized read-only data; no creation, modification, approval or provisioning.
7. **All six:** Session cookie Secure/HttpOnly/SameSite, logout invalidates session, expired session 401, wrong role 403, no cross-tenant enumeration, no personal data in error messages.
8. **Negative tenancy:** Use two test tenants with distinct asset UUIDs. Cross-tenant GET/PUT/transition must return 404/403, not reveal borrower names or existence.
9. **Spatial:** Valid/malformed coordinates, radius boundaries, missing source, >100 hazards, provenance markers, user review and lack of official validation.
10. **OCR:** Missing confidence, out-of-range confidence, unknown field, no unauthorized automatic changes, evidence availability/retention.
11. **Appraisal:** Fewer than 3 comparables, invalid price, excluded comparable, manually set haircut and finite arithmetic, no false AI label.
12. **Connector:** No configured key -> unavailable; invalid test key -> error and no cached verified claim; official live response + audit + explicit approval only after signed integration test.

## Real login test command — read-only

Run from a controlled computer with network access and **six dedicated test users** created through the Admin UI; do not use personal or production credentials in shell history:

```bash
export UAT_BASE_URL='https://<approved-uat-host>'
# Populate UAT_ROLE_ACCOUNTS securely through a secrets manager:
# JSON map of each role -> {email,password}. NEVER commit this file/value.
node scripts/uat-login.mjs
```

The script: checks GET /api/health, logs into each role, checks /api/meta role and cookie flags, tests scoped GET /api/assets, checks Admin-only /api/users and Admin/Auditor /api/audit, logs out, and verifies old session receives 401. It does not mutate assets or users. **A successful GET to the home page or Cloudflare Worker deployment is not proof of successful login.** Cloudflare Access or enterprise SSO policies may also block app-level login before the request reaches CollMan.

## Mandatory production-release evidence

- GitHub CI syntax/domain tests PASS, threat-model/security review PASS.
- Confirm deployed backend/database match the reviewed commit and no unauthorized migration occurs.
- Six-role **direct network** UAT PASS with request IDs/redacted evidence; cross-tenant UAT PASS.
- External provider approvals and contractual integration UAT PASS for each actually enabled connector; no fake/scraped data.
- PDF/report and upload/retention controls verified; GDPR/PDP equivalent bank privacy obligations and DR drills complete.
- Product owner, Information Security, Risk/Appraisal, Legal, and Operations formally sign the release gate.
