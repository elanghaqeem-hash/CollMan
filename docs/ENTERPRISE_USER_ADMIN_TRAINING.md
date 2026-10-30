# User, administrator and training guide

This guide describes the integration candidate. It does not authorize bank customer onboarding or replace the release sign-off.

## User workflow

1. Sign in with your individually provisioned account. Use password change after initial provisioning. Shared role credentials are prohibited operationally.
2. In Register Agunan choose category and type, complete the applicable attributes, reference the reviewed documents and legal/security basis. Save Draft; reload to confirm persistence.
3. Enter the manual appraisal and referenced price/method assumptions. Sources and FX are entered explicitly; the system does not supply market prices. Source evidence metadata can be appended; raw document storage is unavailable.
4. Optional: use Multi-Method Valuation Studio in asset detail. Select a model in the correct region/category/effective period, enter dated source information, fill method inputs and liquidation/bank-value bases, and save an indication. Review the saved model status. This indication is separate from the final manual appraisal.
5. Submit for independent Checker review. The Reviewer recommends and a separate Approver decides. Recorded evidence must be reviewed. Disputed evidence requires a documented Approver exception; it is not an official legal clearance.
6. During eligibility review, the authorized independent reviewer records the bank accepted IDR value and policy reference. It cannot exceed the liquidation estimate. No regulatory eligibility is implied.
7. In Fasilitas & Alokasi register the facility, select an approved asset, supply the allocation amount and linkage basis, and send to Approver. Different facilities can share an asset only within the remaining accepted ceiling.
8. To release an allocation, request release with a reason. The value remains committed until a different authorized Approver records the release. This does not remove the physical/legal collateral from custody; formal legal release and document-handling procedures remain external.
9. Filter registers and export the current visible result set. Facility results are capped at 200, allocations at 300 and the approved-asset picker at 50. Reconcile a full-bank extract through an approved reporting procedure; current-page CSV is not a complete regulatory report.

## Model governance

- Admin registers a new model/version with methodology, category, region, dates and source freshness limit. No model is seeded as validated.
- Reviewer enters actual supported realization observations for the same category/region, notes sampling limitations and attaches a reference to the validation decision. The system computes descriptive error statistics.
- Separate Approver records the model sign-off reference. This is a user action requiring real process authority; synthetic QA does not provide bank authorization.
- Approver may suspend a validated model. Earlier snapshots retain their original model status and input hash. New runs on a suspended model are refused.
- Sources too old/future-dated or insufficient comparables require additional evidence or a separately referenced specialist/manual assessment. Do not fill gaps with invented prices or default confidence.

## Administrator procedure

Verify the actual environment before provisioning. Do not bootstrap an initialized database. Create named users through Admin and assign only the required role. Maintain separate Maker, Checker, Reviewer and Approver identities. Never paste passwords, API tokens, connection strings or bank source files into a public issue/PR.

Use the existing Vercel project and distinct PostgreSQL environments. Migrations are run only in a controlled session after backup/restore and checksum checks. The normal deployment command refuses an unlinked/wrong project and refuses direct production flags. Follow the release runbook for an approved staged production build and promotion.

SSO/MFA, bank federation, branch ABAC, delegated authority, provider price/GIS/legal connectors, encrypted document vault and SIEM are not available merely because a menu displays metadata. Their release gates require separate implementation and verification.

## Facilitated training / acceptance exercises

| Exercise | Roles | Required observed outcome |
|---|---|---|
| Register two asset categories | Maker | Correct forms, save/reload and applicable evidence only |
| Workflow and negative SoD | Checker, Reviewer, Approver | Different actors; self-review/approval and out-of-sequence decisions rejected |
| Sourced indication | Maker | Correct units/FX, preserved lineage, indication only |
| Missing/stale evidence | Maker | Error explains missing data; no automatic final valuation |
| Model governance | Admin, Reviewer, Approver | Immutable version, real realization review, independent sign-off |
| Shared collateral coverage | Maker, Approver | First allocation approved; excess second allocation rejected |
| Controlled release | Maker, Approver | Release-pending still counted; independent approval frees capacity |
| Audit and report | Auditor | Read-only history, no edit/delete; reconcile export scope |
| Tenant negative tests | Authorized UAT administrator | Foreign-tenant IDs hidden; no cross-tenant links |

Record participant, role, environment fingerprint, commit, test case, expected/actual result, evidence reference and defect disposition. Process owner, independent valuation/model risk, Legal/Compliance, Information Security, DBA/DR, IAM and release manager must record their real decisions. No signatures or approval dates are prefilled.

## Operational handover — pending

Required before handover: named service/support owners, incident escalation, approved RPO/RTO, restore drill, certificate/key rotation, retention/legal hold, SIEM alert routing, monitoring thresholds, release rollback drill, IAM joiner/mover/leaver procedure and hypercare roster. These items have not been activated or signed off by this development run.
