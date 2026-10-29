-- CollMan 0003: audit evidence is append-only at the SQL access layer.
-- Financial and workflow history must never be updated or deleted by the application.
-- Privileged database operators can still override this by changing schema; production
-- requires separation of DBA/application credentials and external immutable backups.
CREATE OR REPLACE FUNCTION collman_reject_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CollMan history records are append-only: %', TG_TABLE_NAME
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER collman_audit_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION collman_reject_history_mutation();

CREATE TRIGGER collman_workflow_immutable
  BEFORE UPDATE OR DELETE ON workflow_history
  FOR EACH ROW EXECUTE FUNCTION collman_reject_history_mutation();
