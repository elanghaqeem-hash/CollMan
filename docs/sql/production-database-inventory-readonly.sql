-- CollMan database identity / migration inventory
-- RUN SEPARATELY in Prisma Console SQL editor on each selected database resource.
-- Read-only: SELECT only. Contains no user/borrower/asset details.
-- If an expected table is absent, the affected SELECT fails: treat as NO-GO.
-- Do not run on a database that you have not positively identified and authorized.

-- 1. Database identity (do not copy connection URL or password into audit tickets).
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_setting('server_version') AS postgres_version;

-- 2. Versioned migration attestation.
SELECT version, checksum, applied_at
FROM schema_migrations
ORDER BY version;

-- 3. Counts only — zero individual PII rows are selected.
SELECT 'tenants' AS entity, COUNT(*)::bigint AS total FROM tenants
UNION ALL SELECT 'users', COUNT(*)::bigint FROM users
UNION ALL SELECT 'active_admins', COUNT(*)::bigint FROM users WHERE role='ADMIN' AND active=1
UNION ALL SELECT 'assets', COUNT(*)::bigint FROM assets
UNION ALL SELECT 'appraisals', COUNT(*)::bigint FROM appraisals
UNION ALL SELECT 'comparables', COUNT(*)::bigint FROM comparables
UNION ALL SELECT 'workflow_history', COUNT(*)::bigint FROM workflow_history
UNION ALL SELECT 'audit_log', COUNT(*)::bigint FROM audit_log
UNION ALL SELECT 'sessions', COUNT(*)::bigint FROM sessions
ORDER BY entity;

-- 4. Verify database-level protection constraints and their validity.
SELECT conname AS constraint_name, contype AS constraint_type, convalidated AS validated
FROM pg_constraint
WHERE connamespace=current_schema()::regnamespace
  AND (conname LIKE 'fk_%_tenant' OR conname LIKE 'chk_%')
ORDER BY conname;

-- 5. Check append-only audit/approval SQL triggers are active.
SELECT tgname AS trigger_name,
       tgenabled AS enabled_state,
       tgrelid::regclass::text AS table_name
FROM pg_trigger
WHERE tgname IN ('collman_audit_immutable','collman_workflow_immutable')
  AND NOT tgisinternal
ORDER BY tgname;

-- 6. Count anomalous tenant relationships, without revealing records.
SELECT 'asset_creator_tenant_mismatch' AS control,
       COUNT(*)::bigint AS violations
FROM assets a JOIN users u ON u.id=a.created_by
WHERE a.tenant_id <> u.tenant_id
UNION ALL
SELECT 'appraisal_asset_tenant_mismatch', COUNT(*)::bigint
FROM appraisals p JOIN assets a ON a.id=p.asset_id
WHERE p.tenant_id <> a.tenant_id
UNION ALL
SELECT 'comparable_asset_tenant_mismatch', COUNT(*)::bigint
FROM comparables c JOIN assets a ON a.id=c.asset_id
WHERE c.tenant_id <> a.tenant_id
UNION ALL
SELECT 'workflow_asset_tenant_mismatch', COUNT(*)::bigint
FROM workflow_history w JOIN assets a ON a.id=w.asset_id
WHERE w.tenant_id <> a.tenant_id
UNION ALL
SELECT 'audit_actor_tenant_mismatch', COUNT(*)::bigint
FROM audit_log l JOIN users u ON u.id=l.actor_user_id
WHERE l.tenant_id <> u.tenant_id
ORDER BY control;

-- Evidence handling:
-- Retain only database resource name, timestamp, migration versions + checksums,
-- counts, constraints, trigger activation and violation counts.
-- NEVER copy rows from users/assets/appraisals into a public issue or chat.
