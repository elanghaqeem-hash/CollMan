# CVS restricted Cloudflare pilot

This deployment is an administrator-only **non-operational pilot**, not the bank-production FastAPI/PostGIS platform. It only performs deterministic calculation demonstrations on sample data and accepts no PII, uploads, or customer records.

- URL: https://collman.elang-haqeem.workers.dev
- Access app permits only the connected Cloudflare administrator and requires MFA per Zero Trust organization settings.
- Worker independently verifies RS256 JWT signature, audience, issuer, validity, and administrator email.
- GET /health exposes only non-sensitive deployment metadata.
- POST /calculate enforces same-origin form submission and parameter constraints, uses BigInt fixed-point arithmetic and HALF_UP rounding.
- No D1, R2, password authentication, document storage, credit decision, or final-report approvals.

ASUMSI: cloudflare administrator email, Access audience and issuer are scoped to this deployment; rotate/update on account changes.
ASUMSI: PPN and other rates are demo fixtures only and not authoritative current rates.
ASUMSI: Cloudflare adapter does not replace the Python FastAPI/PostGIS engine; parity and full acceptance tests are pending.

Production release blocked until operational authorization and per-bank roles, approved versioned master, protected data storage, encryption and PII minimization, maker/checker/approval SoD, immutable audit, document reporting, migration/DR, independent UAT, and compliance signoff.
