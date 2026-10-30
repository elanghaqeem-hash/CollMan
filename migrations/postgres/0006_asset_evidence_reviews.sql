-- CollMan evidence metadata and internal review journal. No source documents or OCR PII are stored here.
-- Requires existing tenant composite uniqueness from integrity migrations.
CREATE TABLE IF NOT EXISTS asset_evidence (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 asset_id TEXT NOT NULL,
 evidence_type TEXT NOT NULL CHECK (evidence_type IN
  ('LEGAL_DOCUMENT','OWNERSHIP','VALUATION_SUPPORT','SITE_SURVEY','SPATIAL_SCREEN','OCR_EXTRACTION','KJPP_REPORT')),
 source_name TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 200),
 reference_no TEXT NOT NULL CHECK (length(reference_no) BETWEEN 1 AND 200),
 notes TEXT NOT NULL DEFAULT '' CHECK (length(notes)<=1000),
 digest_sha256 TEXT CHECK (digest_sha256 IS NULL OR digest_sha256 ~ '^[a-f0-9]{64}$'),
 review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
   CHECK (review_status IN ('PENDING_REVIEW','REVIEWED_INTERNAL','DISPUTED')),
 recorded_by TEXT NOT NULL,
 reviewed_by TEXT,
 review_note TEXT,
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now()),
 reviewed_at TIMESTAMP WITHOUT TIME ZONE,
 CONSTRAINT fk_evidence_asset_tenant FOREIGN KEY (tenant_id,asset_id) REFERENCES assets(tenant_id,id),
 CONSTRAINT fk_evidence_recorder_tenant FOREIGN KEY (tenant_id,recorded_by) REFERENCES users(tenant_id,id),
 CONSTRAINT fk_evidence_reviewer_tenant FOREIGN KEY (tenant_id,reviewed_by) REFERENCES users(tenant_id,id),
 CONSTRAINT chk_evidence_review_consistency CHECK (
  (review_status='PENDING_REVIEW' AND reviewed_by IS NULL AND review_note IS NULL AND reviewed_at IS NULL)
  OR
  (review_status<>'PENDING_REVIEW' AND reviewed_by IS NOT NULL AND review_note IS NOT NULL AND
    length(review_note)>=10 AND reviewed_at IS NOT NULL AND reviewed_by<>recorded_by)
 )
);
CREATE INDEX IF NOT EXISTS idx_evidence_asset_status ON asset_evidence(tenant_id,asset_id,created_at DESC);
-- Evidence metadata cannot be deleted or rewritten after recording, except one review transition.
CREATE OR REPLACE FUNCTION collman_guard_evidence_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Evidence is append-only' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
   IF OLD.review_status<>'PENDING_REVIEW'
     OR NEW.review_status NOT IN ('REVIEWED_INTERNAL','DISPUTED')
     OR (OLD.id,OLD.tenant_id,OLD.asset_id,OLD.evidence_type,OLD.source_name,OLD.reference_no,
       OLD.notes,OLD.digest_sha256,OLD.recorded_by,OLD.created_at)
     IS DISTINCT FROM
       (NEW.id,NEW.tenant_id,NEW.asset_id,NEW.evidence_type,NEW.source_name,NEW.reference_no,
        NEW.notes,NEW.digest_sha256,NEW.recorded_by,NEW.created_at)
   THEN RAISE EXCEPTION 'Evidence fields immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS collman_evidence_append_only ON asset_evidence;
CREATE TRIGGER collman_evidence_append_only BEFORE UPDATE OR DELETE ON asset_evidence
 FOR EACH ROW EXECUTE FUNCTION collman_guard_evidence_history();
