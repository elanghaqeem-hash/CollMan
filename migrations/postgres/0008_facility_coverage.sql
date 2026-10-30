ALTER TABLE appraisals ADD COLUMN bank_accepted_value BIGINT,
 ADD COLUMN bank_policy_ref TEXT,
 ADD CONSTRAINT bank_accepted_ceiling CHECK(bank_accepted_value IS NULL OR
  (bank_accepted_value>=0 AND bank_accepted_value<=liquidation_value AND length(bank_policy_ref)>0));
CREATE TABLE facilities (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),reference_no TEXT NOT NULL,borrower_ref TEXT NOT NULL,
 branch_code TEXT NOT NULL,exposure_idr BIGINT NOT NULL CHECK(exposure_idr>0 AND exposure_idr<=9000000000000000),
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
 created_by TEXT NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT timezone('utc',now()),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,reference_no),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE collateral_allocations (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),asset_id TEXT NOT NULL,facility_id TEXT NOT NULL,
 amount_idr BIGINT NOT NULL CHECK(amount_idr>0 AND amount_idr<=9000000000000000),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REJECTED','RELEASE_PENDING','RELEASED')),
 basis_ref TEXT NOT NULL,created_by TEXT NOT NULL,approved_by TEXT,release_requested_by TEXT,
 release_reason TEXT,release_approved_by TEXT,
 created_at TIMESTAMP NOT NULL DEFAULT timezone('utc',now()),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id),
 FOREIGN KEY(tenant_id,facility_id) REFERENCES facilities(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,release_requested_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,release_approved_by) REFERENCES users(tenant_id,id),
 CHECK(status NOT IN ('ACTIVE','RELEASE_PENDING','RELEASED') OR (approved_by IS NOT NULL AND approved_by<>created_by)),
 CHECK(status NOT IN ('RELEASE_PENDING','RELEASED') OR (release_requested_by IS NOT NULL AND release_reason IS NOT NULL)),
 CHECK(status<>'RELEASED' OR (release_approved_by IS NOT NULL AND release_approved_by<>release_requested_by))
);
-- Serialize approvals per asset in the database as well as the application.
-- Release-pending allocation continues consuming collateral until independently released.
CREATE OR REPLACE FUNCTION collman_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a assets%ROWTYPE; cap BIGINT; used NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Allocation history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id<>OLD.tenant_id OR NEW.asset_id<>OLD.asset_id OR NEW.facility_id<>OLD.facility_id OR NEW.amount_idr<>OLD.amount_idr OR NEW.created_by<>OLD.created_by OR NEW.basis_ref<>OLD.basis_ref) THEN
  RAISE EXCEPTION 'Allocation terms are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND NOT ((OLD.status='PENDING' AND NEW.status IN ('ACTIVE','REJECTED')) OR (OLD.status='ACTIVE' AND NEW.status='RELEASE_PENDING') OR (OLD.status='RELEASE_PENDING' AND NEW.status='RELEASED')) THEN
  RAISE EXCEPTION 'Invalid allocation transition' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.status<>'PENDING' THEN RAISE EXCEPTION 'New allocation must be pending' USING ERRCODE='23514'; END IF;
 IF NEW.status IN ('ACTIVE','RELEASE_PENDING') THEN
  SELECT * INTO a FROM assets WHERE tenant_id=NEW.tenant_id AND id=NEW.asset_id FOR UPDATE;
  IF a.status<>'APPROVED' OR a.collateral_kind<>'ASSET' OR a.security_status<>'PERFECTED' OR a.eligibility_status<>'ELIGIBLE' THEN
   RAISE EXCEPTION 'Collateral is not eligible for allocation' USING ERRCODE='23514';
  END IF;
  SELECT LEAST(liquidation_value,bank_accepted_value) INTO cap FROM appraisals
   WHERE tenant_id=NEW.tenant_id AND asset_id=NEW.asset_id AND bank_accepted_value IS NOT NULL;
  SELECT COALESCE(SUM(amount_idr),0) INTO used FROM collateral_allocations
   WHERE tenant_id=NEW.tenant_id AND asset_id=NEW.asset_id AND id<>NEW.id AND status IN ('ACTIVE','RELEASE_PENDING');
  IF cap IS NULL OR used+NEW.amount_idr>cap THEN RAISE EXCEPTION 'Collateral allocation exceeds approved liquidation ceiling' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collateral_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON collateral_allocations FOR EACH ROW EXECUTE FUNCTION collman_allocation_guard();
CREATE INDEX allocation_asset ON collateral_allocations(tenant_id,asset_id,status);
CREATE INDEX allocation_facility ON collateral_allocations(tenant_id,facility_id,status);
