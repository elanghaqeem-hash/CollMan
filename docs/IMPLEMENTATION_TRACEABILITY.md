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
