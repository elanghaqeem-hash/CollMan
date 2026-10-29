# CollMan v0.1.0 — Requirement Traceability

Source documents supplied to the project are read-only references. BRD CIIS represents a **separate bank's process**, which is adapted here as product design input rather than an assumption that the same approval policies apply to other institutions.

| Source area | Source framing / requirements | This release | Next actions |
|---|---|---|---|
| CIIS — Login / Dashboard | Role-specific access and progress | Implemented, basic | Enterprise SSO / detailed SLA dashboard |
| CIIS — Input Data Dokumen | Debtor, work and legal attachments | Partial: borrower, asset, certificate data | Full document request metadata, upload and verification |
| CIIS — Open / Waiting / Ongoing Task | Task states and progress tracking | Basic status list and per-object history | Queued assignments, start/due dates, SLA, escalation |
| CIIS — Legal / ownership | Certificate number, NIB, right holder, verified legal documents | Manual fields and verification status | Source evidence + licensed verification connector |
| CIIS — Input Data Pembanding | Comparative property data and source | Manual comparable records | Adjustment tables and inclusion/exclusion analysis |
| CIIS — Penilaian KJPP | Appraiser review and assessment data | Preliminary configurable valuation | Penilai/KJPP evidence, verified review record |
| CIIS — Maker/Checker/Reviewer/Approver | Stepwise decision and segregation | Implemented server-side | Assignment matrix, delegated approval and negative UAT |
| CIIS — Laporan / Resume / Rekap | Reporting and tax/assessment memo | Dashboard, summary and paginated CSV | Signed full PDF, memo, role-based reporting |
| CIIS — Admin / Auditor | Master data / access / audit trail | Basic users, risk parameters, audit | Comprehensive settings, log retention / SIEM export |
| Sxored Quick Appraisal | Before-site screening, risk flags, comparable inputs, liquidation indicative | Manual flags with adjustable haircuts | Spatial validation, historical imagery, market feeds |
| BPR Ruko workbook | Sertifikat, luas, pembanding, nilai pasar/likuidasi | Schema fields and configurable indicators | Exact worksheet calculations with authorized formula review |
| BPR Tanah Bangunan workbook | Land/building measurements, cost approach, depreciation and resume | Land/building area, indicative values | Cost components, depreciation and supported appraisal report |

**Important:** No default haircut is presented as bank-approved or empirically validated. Risk weights start at 0 and are manually maintained by an Admin. No automatic property legality decision is offered. Comparables are manually keyed and not asserted as live.

## Universal collateral extension (2026-10-30)

Active implementation target: `migration/vercel-postgres`, extended on `feature/all-collateral-categories`. The older Cloudflare pilot and `main` are not the release target for this change.

- 16 category schemas / 74 initial types share one browser/server catalog. Admin can append tenant-specific subtypes and disable or block types without removing historical records.
- Each category defines data attributes, evidence references, valuation methods and candidate security instruments. Candidate instruments require case-specific legal analysis; their presence is not a legal opinion.
- Drafts may be incomplete; Submit requires verified legal status, required attributes, verified document references and non-expired rights/documents where expiry is recorded.
- Approve additionally requires independent bank eligibility assessment and completed legal security. Maker cannot assess or approve their own asset, including when assigned Admin.
- Property, cash/deposits, securities, precious metals, vehicles, machinery, vessels, aircraft, inventory, receivables, warehouse receipts, biological assets, financial rights, intellectual property, guarantees and other special assets are supported for registration.
- 8 valuation methods: externally assessed market value, depreciated replacement cost, externally assessed income-approach value, quantity/quote, blocked nominal, net eligible receivables, confirmed surrender value and verified guarantee limit. FX conversion is explicit and results are IDR. No automatic market feed or hardcoded regulatory/bank haircut.
- Guarantees/protection are excluded from the approved tangible/property/financial-asset collateral total and reported separately.
- Type, currency or asset-specific data revisions invalidate prior valuations; every revision invalidates eligibility. Rejected/conditional assessments cannot reach Approved.
- Document support is a reference checklist only. No upload, document custody, external registry validation or automated legal verification is claimed.
- Source BRD/workbook concepts informed property fields, human review and configurable liquidation parameters. Customer names and proprietary source documents are not embedded in the repository.
- Regulatory classification is separate from technical registration. No SLIK code mapping, PPKA deduction eligibility, regulatory haircut or automatic acceptance is asserted. Selected context: OJK SEOJK 11/SEOJK.01/2024 (SLIK collateral taxonomy), SEOJK 16/SEOJK.03/2024 and 17/SEOJK.03/2024 (BPR/BPRS reporting). Bank compliance must validate applicability and current amendments before reporting.

### Validation scope

`npm run build` includes unit coverage of all 74 types and their allowed valuation methods, plus isolated PostgreSQL WASM API integration through all 16 category workflows. Integration applies all five SQL migrations, persists JSONB data, calculates valuations, records independent assessments, blocks incomplete/self approvals, checks tenant isolation, protects custom types and checks portfolio segregation. PostgreSQL WASM does not establish live network TLS, pool/concurrency behavior, production schema state or deployment success.
