# Security and Operations — Release 0.1.0

## Implemented safeguards

- User-account access via salted PBKDF2-SHA256 (210,000 iterations). Admin-only user creation and one-time, high-entropy bootstrap secret.
- 12-hour sessions stored as hashed random tokens, `HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS; sign-out and password-change revocation.
- Same-origin POST/PUT/DELETE enforcement with JSON content type; CSP and `nosniff` for served UI.
- Server-side role checks and tenant ID scoping on all relevant queries. Maker is prohibited from checking/recommending/approving the same record.
- Database-backed login-failure lockout per email hash, audit entries for critical mutations and workflow transitions.
- SQL parameter binding on all user input. No bank-specific example borrower records or templates with identities are committed.

## Limitations / release gates

1. **Data custody:** Do not load live production borrower files before security/legal approval, tenant-isolation negative tests and residency review. Durable Objects primary placement is provider-managed; data residency must be validated separately.
2. **Backups:** Set approved point-in-time recovery, scheduled export procedures and restoration tests. Never treat availability as a backup strategy.
3. **Atomicity:** Workflow status changes and their history/audit events are committed in one synchronous SQLite transaction. Still verify concurrent retries, idempotency and failure injection in full end-to-end tests.
4. **Scale:** Current single DO instance is a v0.1 foundation. Migrate to tenant-partitioned DOs or dedicated account D1 capacity before enterprise / large-scale operations.
5. **Authorization:** Implement bank matrix and independent penetration testing (IDOR, CSRF, privilege escalation, stored XSS, user lifecycle, role changes) before production approval.
6. **Retention:** Define banking privacy, data retention and immutability requirements for audit logs and supporting documents before activation.
7. **Evidence:** Certificate images, floor plans and valuation report attachments have not been implemented. Do not attempt to upload customer files to this version.
8. **External data:** No external risk maps, title verification, ML price estimation, or data licensing connectors exist; user-entered attributes are unverified by the platform.
9. **Admin recovery:** There is no self-service forgotten password or bulk onboarding. Establish controlled break-glass policy and secure administrator rotation.

## Quick release acceptance

- [ ] `npm run build` passes on CI
- [ ] `wrangler deploy` succeeds and `GET /api/health` = `database: connected`
- [ ] `GET /api/meta` = `needs_setup: true` before first admin; `false` after
- [ ] Initial admin bootstrap works only with configured Cloudflare secret
- [ ] Maker can create object, set legal status, enter appraisal/comparables, submit
- [ ] Maker cannot check or approve own object; independent role sequence succeeds
- [ ] Reviewer/Approver can return/reject with mandatory note
- [ ] Auditor sees audit trail but cannot mutate business data
- [ ] Cross-tenant IDOR tests fail
- [ ] Test backup / restore, Access/SSO, monitoring, alerting and sign-off
