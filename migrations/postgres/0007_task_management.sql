-- Additive CIIS-style task tracker; no data backfill, no changes to existing collateral records.
CREATE TABLE IF NOT EXISTS task_state (
 asset_id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 stage_status TEXT NOT NULL CHECK(stage_status IN
  ('DRAFT','SUBMITTED','REVIEWED','RECOMMENDED','APPROVED','RETURNED','REJECTED')),
 lane TEXT NOT NULL CHECK(lane IN ('OPEN','WAITING','ONGOING','FINISHED')),
 assigned_to TEXT,
 received_by TEXT,
 started_by TEXT,
 inspection_date TEXT,
 due_date TEXT,
 updated_by TEXT,
 created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now()),
 updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now()),
 CONSTRAINT fk_task_asset_tenant FOREIGN KEY (tenant_id,asset_id) REFERENCES assets(tenant_id,id),
 CONSTRAINT fk_task_assignee_tenant FOREIGN KEY (tenant_id,assigned_to) REFERENCES users(tenant_id,id),
 CONSTRAINT fk_task_receiver_tenant FOREIGN KEY (tenant_id,received_by) REFERENCES users(tenant_id,id),
 CONSTRAINT fk_task_starter_tenant FOREIGN KEY (tenant_id,started_by) REFERENCES users(tenant_id,id),
 CONSTRAINT fk_task_updater_tenant FOREIGN KEY (tenant_id,updated_by) REFERENCES users(tenant_id,id),
 CONSTRAINT chk_task_lane_invariants CHECK (
   (lane='OPEN' AND received_by IS NULL AND started_by IS NULL)
   OR (lane='WAITING' AND received_by IS NOT NULL AND started_by IS NULL)
   OR (lane='ONGOING' AND received_by IS NOT NULL AND started_by IS NOT NULL)
   OR (lane='FINISHED')
 ),
 CONSTRAINT chk_task_inspection_consistency CHECK (
  (inspection_date IS NULL AND due_date IS NULL)
  OR (inspection_date IS NOT NULL AND due_date IS NOT NULL AND
      inspection_date ~ '^\\d{4}-\\d{2}-\\d{2}$' AND due_date ~ '^\\d{4}-\\d{2}-\\d{2}$')
 )
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_stage_lane ON task_state(tenant_id,stage_status,lane);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON task_state(tenant_id,assigned_to,updated_at DESC);
-- No import from existing assets; legacy rows surface as virtual OPEN tasks until next authorized change.
