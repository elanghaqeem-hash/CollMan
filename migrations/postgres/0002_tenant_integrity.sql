-- CollMan PostgreSQL 0002: enforce tenancy at the database boundary.
-- In addition to application RBAC/tenant filtering, reject cross-tenant foreign keys.
-- All constraints are validated on application; migration must abort if existing rows violate tenancy.
ALTER TABLE users ADD CONSTRAINT uq_users_tenant_id UNIQUE (tenant_id,id);
ALTER TABLE assets ADD CONSTRAINT uq_assets_tenant_id UNIQUE (tenant_id,id);

ALTER TABLE assets
  ADD CONSTRAINT fk_asset_creator_tenant
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id);

ALTER TABLE appraisals
  ADD CONSTRAINT fk_appraisal_asset_tenant
  FOREIGN KEY (tenant_id,asset_id) REFERENCES assets(tenant_id,id),
  ADD CONSTRAINT fk_appraisal_editor_tenant
  FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id);

ALTER TABLE comparables
  ADD CONSTRAINT fk_comparable_asset_tenant
  FOREIGN KEY (tenant_id,asset_id) REFERENCES assets(tenant_id,id),
  ADD CONSTRAINT fk_comparable_creator_tenant
  FOREIGN KEY (tenant_id,created_by) REFERENCES users(tenant_id,id);

ALTER TABLE workflow_history
  ADD CONSTRAINT fk_workflow_asset_tenant
  FOREIGN KEY (tenant_id,asset_id) REFERENCES assets(tenant_id,id),
  ADD CONSTRAINT fk_workflow_actor_tenant
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id);

ALTER TABLE audit_log
  ADD CONSTRAINT fk_audit_actor_tenant
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES users(tenant_id,id);

-- Important: no automatic tenant data rewrites or deletes.
