-- Additive only. Historical properties and approvals retain their data and category.
ALTER TABLE tenant_settings ADD COLUMN collateral_catalog_json JSONB NOT NULL DEFAULT '{}'::jsonb
 CHECK (jsonb_typeof(collateral_catalog_json)='object');
ALTER TABLE assets
 ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'IDR' CHECK (currency_code ~ '^[A-Z]{3}$'),
 ADD COLUMN category_code TEXT NOT NULL DEFAULT 'PROPERTY',
 ADD COLUMN collateral_kind TEXT NOT NULL DEFAULT 'ASSET' CHECK (collateral_kind IN ('ASSET','GUARANTEE')),
 ADD COLUMN collateral_details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(collateral_details)='object'),
 ADD COLUMN document_checklist JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(document_checklist)='object'),
 ADD COLUMN security_type TEXT NOT NULL DEFAULT 'REVIEW',
 ADD COLUMN security_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (security_status IN ('PENDING','PERFECTED','INVALID')),
 ADD COLUMN security_reference TEXT NOT NULL DEFAULT '',
 ADD COLUMN eligibility_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (eligibility_status IN ('PENDING','ELIGIBLE','CONDITIONAL','INELIGIBLE')),
 ADD COLUMN eligibility_notes TEXT NOT NULL DEFAULT '';
UPDATE assets SET category_code='OTHER' WHERE asset_type='Lainnya';
ALTER TABLE appraisals
 ADD COLUMN valuation_method TEXT NOT NULL DEFAULT 'MANUAL_MARKET',
 ADD COLUMN valuation_inputs JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(valuation_inputs)='object'),
 ADD COLUMN valuation_reference TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_assets_tenant_category ON assets(tenant_id,category_code,status);
