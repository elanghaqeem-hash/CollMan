/** Read-only database release gate. No application rows or secrets are printed. */
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPostgres} from '../src/postgres.js';

const requiredTables=['tenants','users','sessions','tenant_settings','assets','appraisals',
  'comparables','workflow_history','audit_log','login_attempts','schema_migrations'];
const requiredConstraints=['fk_asset_creator_tenant','fk_appraisal_asset_tenant',
  'fk_appraisal_editor_tenant','fk_comparable_asset_tenant','fk_comparable_creator_tenant',
  'fk_workflow_asset_tenant','fk_workflow_actor_tenant','fk_audit_actor_tenant'];

const dir=fileURLToPath(new URL('../migrations/postgres/',import.meta.url));
const files=(await readdir(dir)).filter(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
const db=getPostgres({useDirect:true});
const client=await db.pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=await client.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema=current_schema() AND table_type='BASE TABLE'`);
  const tableSet=new Set(tables.rows.map(x=>x.table_name));
  for(const table of requiredTables) if(!tableSet.has(table)) throw new Error('Missing required table: '+table);
  const constraints=await client.query(`SELECT conname FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace AND contype='f'`);
  const fkSet=new Set(constraints.rows.map(x=>x.conname));
  for(const name of requiredConstraints) if(!fkSet.has(name)) throw new Error('Missing tenant FK: '+name);
  const activeTriggers=await client.query(`SELECT tgname
    FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A')`);
  const triggerSet=new Set(activeTriggers.rows.map(x=>x.tgname));
  for(const trigger of ['collman_audit_immutable','collman_workflow_immutable'])
    if(!triggerSet.has(trigger)) throw new Error('Missing audit history protection: '+trigger);
  const rows=await client.query('SELECT version,checksum FROM schema_migrations');
  if(rows.rowCount!==files.length) throw new Error('Unexpected PostgreSQL migration count');
  for(const file of files) {
    const version=basename(file,'.sql');
    const digest=createHash('sha256').update(await readFile(join(dir,file),'utf8')).digest('hex');
    const applied=rows.rows.find(x=>x.version===version);
    if(!applied || applied.checksum!==digest) throw new Error('Missing or altered migration: '+version);
  }
  const unsafe=await client.query(`SELECT
    (SELECT count(*) FROM assets a JOIN users u ON u.id=a.created_by
      WHERE a.tenant_id<>u.tenant_id) AS assets,
    (SELECT count(*) FROM appraisals p JOIN assets a ON a.id=p.asset_id
      WHERE p.tenant_id<>a.tenant_id) AS appraisals,
    (SELECT count(*) FROM comparables c JOIN assets a ON a.id=c.asset_id
      WHERE c.tenant_id<>a.tenant_id) AS comparables,
    (SELECT count(*) FROM workflow_history w JOIN assets a ON a.id=w.asset_id
      WHERE w.tenant_id<>a.tenant_id) AS workflow,
    (SELECT count(*) FROM audit_log l JOIN users u ON u.id=l.actor_user_id
      WHERE l.tenant_id<>u.tenant_id) AS audit`);
  if(Object.values(unsafe.rows[0]).some(x=>Number(x)!==0)) throw new Error('Cross-tenant data relation detected');
  await client.query('COMMIT');
  console.log('PASS: PostgreSQL schema checksums, required tables, tenant FK constraints, immutable audit triggers, cross-tenant data integrity');
}catch(error) {
  try{await client.query('ROLLBACK');}catch{}
  console.error('PostgreSQL preflight FAILED:',error.message);
  process.exitCode=1;
}finally{
  client.release();await db.pool.end();
}
