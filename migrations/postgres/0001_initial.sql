-- CollMan PostgreSQL v1. All timestamps stored as UTC without time zone to preserve the legacy API wire format.
-- For initial empty database. Existing Cloudflare SQLite data requires a separately approved, reconciled export/import.
CREATE TABLE IF NOT EXISTS tenants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('ADMIN','MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR')),
 password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),
 expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS tenant_settings (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),risk_weights_json TEXT NOT NULL DEFAULT '{}',
 updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE TABLE IF NOT EXISTS assets (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 reference_no TEXT NOT NULL,borrower TEXT NOT NULL,asset_type TEXT NOT NULL,
 address TEXT NOT NULL,certificate_type TEXT,certificate_no TEXT,nib TEXT,ownership_name TEXT,
 land_area DOUBLE PRECISION NOT NULL DEFAULT 0,building_area DOUBLE PRECISION NOT NULL DEFAULT 0,
 legal_status TEXT NOT NULL DEFAULT 'BELUM_DIVERIFIKASI',notes TEXT,
 status TEXT NOT NULL DEFAULT 'DRAFT',created_by TEXT NOT NULL REFERENCES users(id),
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now()),
 updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now()),
 UNIQUE(tenant_id,reference_no)
);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_status ON assets(tenant_id,status,created_at);
CREATE TABLE IF NOT EXISTS appraisals (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id),
 market_value BIGINT NOT NULL,base_haircut_pct DOUBLE PRECISION NOT NULL,
 risk_haircut_pct DOUBLE PRECISION NOT NULL,total_haircut_pct DOUBLE PRECISION NOT NULL,
 liquidation_value BIGINT NOT NULL,risk_flags_json TEXT NOT NULL,
 valuation_date TEXT NOT NULL,notes TEXT,updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE TABLE IF NOT EXISTS comparables (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 asset_id TEXT NOT NULL REFERENCES assets(id),description TEXT NOT NULL,
 source_url TEXT,address TEXT,offering_price BIGINT NOT NULL,
 land_area DOUBLE PRECISION NOT NULL DEFAULT 0,building_area DOUBLE PRECISION NOT NULL DEFAULT 0,
 included INTEGER NOT NULL DEFAULT 1 CHECK(included IN (0,1)),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS idx_comparables_asset ON comparables(tenant_id,asset_id);
CREATE TABLE IF NOT EXISTS workflow_history (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 asset_id TEXT NOT NULL REFERENCES assets(id),
 action TEXT NOT NULL,from_status TEXT,to_status TEXT NOT NULL,
 note TEXT,actor_user_id TEXT NOT NULL REFERENCES users(id),
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS idx_workflow_asset ON workflow_history(tenant_id,asset_id,created_at);
CREATE TABLE IF NOT EXISTS audit_log (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),
 entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,
 actor_user_id TEXT NOT NULL REFERENCES users(id),detail_json TEXT,
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id,created_at);
CREATE TABLE IF NOT EXISTS login_attempts (
 identifier_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,
 window_start TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
);
