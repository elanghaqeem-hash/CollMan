-- CollMan PostgreSQL 0004: defend collateral monetary and workflow invariants.
-- These are additional DB-side safeguards; application validation remains required.
-- Existing invalid data causes migration failure instead of silent modification.
ALTER TABLE assets
  ADD CONSTRAINT chk_asset_area_nonnegative CHECK (land_area >= 0 AND building_area >= 0),
  ADD CONSTRAINT chk_asset_status CHECK (status IN
    ('DRAFT','SUBMITTED','REVIEWED','RECOMMENDED','APPROVED','RETURNED','REJECTED')),
  ADD CONSTRAINT chk_asset_legal_status CHECK (legal_status IN
    ('BELUM_DIVERIFIKASI','SESUAI','TIDAK_SESUAI'));

ALTER TABLE appraisals
  ADD CONSTRAINT chk_appraisal_market_value CHECK (market_value >= 0 AND market_value <= 9000000000000000),
  ADD CONSTRAINT chk_appraisal_liquidation CHECK (liquidation_value >= 0 AND liquidation_value <= market_value),
  ADD CONSTRAINT chk_appraisal_base_haircut CHECK (base_haircut_pct >= 0 AND base_haircut_pct <= 100),
  ADD CONSTRAINT chk_appraisal_risk_haircut CHECK (risk_haircut_pct >= 0),
  ADD CONSTRAINT chk_appraisal_total_haircut CHECK (total_haircut_pct >= 0 AND total_haircut_pct <= 100);

ALTER TABLE comparables
  ADD CONSTRAINT chk_comparable_price CHECK (offering_price > 0 AND offering_price <= 9000000000000000),
  ADD CONSTRAINT chk_comparable_area CHECK (land_area >= 0 AND building_area >= 0);

ALTER TABLE workflow_history
  ADD CONSTRAINT chk_workflow_to_status CHECK (to_status IN
    ('DRAFT','SUBMITTED','REVIEWED','RECOMMENDED','APPROVED','RETURNED','REJECTED'));

ALTER TABLE login_attempts
  ADD CONSTRAINT chk_login_attempts_nonnegative CHECK (attempts >= 0);
