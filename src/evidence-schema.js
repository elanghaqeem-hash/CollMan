/** Additive SQLite schema for Cloudflare Durable Object pilot, separate from v1 bootstrap. */
export const EVIDENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS asset_evidence (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, asset_id TEXT NOT NULL,
 evidence_type TEXT NOT NULL CHECK(evidence_type IN
 ('LEGAL_DOCUMENT','OWNERSHIP','VALUATION_SUPPORT','SITE_SURVEY','SPATIAL_SCREEN','OCR_EXTRACTION','KJPP_REPORT')),
 source_name TEXT NOT NULL CHECK(length(source_name) BETWEEN 1 AND 200),
 reference_no TEXT NOT NULL CHECK(length(reference_no) BETWEEN 1 AND 200),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 digest_sha256 TEXT, review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
 CHECK(review_status IN ('PENDING_REVIEW','REVIEWED_INTERNAL','DISPUTED')),
 recorded_by TEXT NOT NULL, reviewed_by TEXT, review_note TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now')), reviewed_at TEXT,
 FOREIGN KEY(asset_id) REFERENCES assets(id), FOREIGN KEY(recorded_by) REFERENCES users(id),
 FOREIGN KEY(reviewed_by) REFERENCES users(id),
 CHECK((review_status='PENDING_REVIEW' AND reviewed_by IS NULL AND review_note IS NULL AND reviewed_at IS NULL)
 OR (review_status<>'PENDING_REVIEW' AND reviewed_by IS NOT NULL AND review_note IS NOT NULL
 AND length(review_note)>=10 AND reviewed_at IS NOT NULL AND reviewed_by<>recorded_by))
);
CREATE INDEX IF NOT EXISTS idx_evidence_asset_status ON asset_evidence(tenant_id,asset_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS collman_evidence_no_delete BEFORE DELETE ON asset_evidence
 BEGIN SELECT RAISE(ABORT,'Evidence immutable'); END;
CREATE TRIGGER IF NOT EXISTS collman_evidence_one_review BEFORE UPDATE ON asset_evidence
 WHEN OLD.review_status!='PENDING_REVIEW' OR NEW.review_status='PENDING_REVIEW'
 OR OLD.id!=NEW.id OR OLD.tenant_id!=NEW.tenant_id OR OLD.asset_id!=NEW.asset_id
 OR OLD.source_name!=NEW.source_name OR OLD.reference_no!=NEW.reference_no
 OR OLD.evidence_type!=NEW.evidence_type OR OLD.notes!=NEW.notes OR OLD.recorded_by!=NEW.recorded_by
 BEGIN SELECT RAISE(ABORT,'Evidence immutable'); END;
`;
