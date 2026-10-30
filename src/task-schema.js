/** Additive Cloudflare SQLite pilot task tracker. No collateral-row rewrite. */
export const TASK_SCHEMA = `
CREATE TABLE IF NOT EXISTS task_state (
 asset_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
 stage_status TEXT NOT NULL CHECK(stage_status IN ('DRAFT','SUBMITTED','REVIEWED','RECOMMENDED','APPROVED','RETURNED','REJECTED')),
 lane TEXT NOT NULL CHECK(lane IN ('OPEN','WAITING','ONGOING','FINISHED')),
 assigned_to TEXT,received_by TEXT,started_by TEXT,
 inspection_date TEXT,due_date TEXT,updated_by TEXT,
 created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(asset_id) REFERENCES assets(id),
 FOREIGN KEY(assigned_to) REFERENCES users(id),
 FOREIGN KEY(received_by) REFERENCES users(id),
 FOREIGN KEY(started_by) REFERENCES users(id),
 FOREIGN KEY(updated_by) REFERENCES users(id),
 CHECK ((lane='OPEN' AND received_by IS NULL AND started_by IS NULL)
 OR (lane='WAITING' AND received_by IS NOT NULL AND started_by IS NULL)
 OR (lane='ONGOING' AND received_by IS NOT NULL AND started_by IS NOT NULL)
 OR lane='FINISHED'),
 CHECK ((inspection_date IS NULL AND due_date IS NULL) OR
 (inspection_date IS NOT NULL AND due_date IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_stage_lane ON task_state(tenant_id,stage_status,lane);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON task_state(tenant_id,assigned_to,updated_at DESC);
`;
