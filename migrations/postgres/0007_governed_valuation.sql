-- Additive only. Historical appraisals remain intact; no model is seeded as validated.
CREATE TABLE valuation_models (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 name TEXT NOT NULL,version TEXT NOT NULL,method TEXT NOT NULL,category TEXT NOT NULL,region TEXT NOT NULL,
 effective_from TEXT NOT NULL,effective_to TEXT NOT NULL,
 parameters JSONB NOT NULL,methodology_ref TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','VALIDATED','SUSPENDED')),
 created_by TEXT NOT NULL,reviewed_by TEXT,approved_by TEXT,validation JSONB,review_ref TEXT,approval_ref TEXT,
 created_at TIMESTAMP NOT NULL DEFAULT timezone('utc',now()),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,name,version,category,region),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id),
 CHECK(effective_from<=effective_to),
 CHECK(status NOT IN ('REVIEWED','VALIDATED') OR (reviewed_by IS NOT NULL AND reviewed_by<>created_by AND validation IS NOT NULL AND review_ref IS NOT NULL)),
 CHECK(status<>'VALIDATED' OR (approved_by IS NOT NULL AND approved_by<>created_by AND approved_by<>reviewed_by AND approval_ref IS NOT NULL))
);
CREATE TABLE valuation_runs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),asset_id TEXT NOT NULL,model_id TEXT NOT NULL,
 as_of TEXT NOT NULL,input JSONB NOT NULL,result JSONB NOT NULL,input_sha256 TEXT NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),
 created_by TEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT timezone('utc',now()),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id),
 FOREIGN KEY(tenant_id,model_id) REFERENCES valuation_models(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE OR REPLACE FUNCTION collman_model_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Model versions cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','reviewed_by','approved_by','validation','review_ref','approval_ref']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','reviewed_by','approved_by','validation','review_ref','approval_ref']) THEN
  RAISE EXCEPTION 'Model definition is immutable; create a new version' USING ERRCODE='23514';
 END IF;
 IF NOT ((OLD.status='DRAFT' AND NEW.status='REVIEWED') OR (OLD.status='REVIEWED' AND NEW.status='VALIDATED') OR
         (OLD.status='VALIDATED' AND NEW.status='SUSPENDED')) THEN
  RAISE EXCEPTION 'Invalid model governance transition' USING ERRCODE='23514';
 END IF;
 IF OLD.status<>'DRAFT' AND (NEW.validation IS DISTINCT FROM OLD.validation OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.review_ref IS DISTINCT FROM OLD.review_ref) THEN
  RAISE EXCEPTION 'Independent validation record is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.status='VALIDATED' AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approval_ref IS DISTINCT FROM OLD.approval_ref) THEN
  RAISE EXCEPTION 'Approval record is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER valuation_model_guard BEFORE UPDATE OR DELETE ON valuation_models FOR EACH ROW EXECUTE FUNCTION collman_model_guard();
CREATE TRIGGER valuation_runs_immutable BEFORE UPDATE OR DELETE ON valuation_runs FOR EACH ROW EXECUTE FUNCTION collman_reject_history_mutation();
CREATE INDEX valuation_runs_asset ON valuation_runs(tenant_id,asset_id,created_at);
