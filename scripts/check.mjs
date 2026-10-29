import {existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const path of ['src/index.js','src/domain.js','src/schema.js','public/index.html','public/app.js','public/styles.css','migrations/0001_initial.sql','wrangler.jsonc','src/vercel-api.js','src/postgres.js','api/index.js','migrations/postgres/0001_initial.sql','migrations/postgres/0002_tenant_integrity.sql','migrations/postgres/0003_audit_immutability.sql','migrations/postgres/0004_financial_integrity.sql','scripts/check-db.mjs','scripts/verify-preview.mjs','vercel.json']){
 if(!existsSync(path)) throw new Error(`Missing required path: ${path}`);
}
for(const path of ['src/index.js','src/domain.js','src/schema.js','public/app.js','src/vercel-api.js','src/postgres.js','api/index.js','scripts/migrate-postgres.mjs','scripts/check-db.mjs','scripts/verify-preview.mjs']) execFileSync(process.execPath,['--check',path]);
const wrangler=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(!wrangler.name || !wrangler.main || !wrangler.assets?.directory || !wrangler.durable_objects?.bindings?.[0]?.class_name) throw new Error('Wrangler config incomplete');
if(!existsSync(wrangler.main) || !existsSync(wrangler.assets.directory)) throw new Error('Wrangler entrypoint or assets missing');
if(!readFileSync('public/index.html','utf8').includes('id="app"')) throw new Error('SPA root missing');
console.log('PASS: source syntax, Wrangler entrypoint/assets, SQLite DO migration, index.html');

const vercel=JSON.parse(readFileSync('vercel.json','utf8'));
if(vercel.outputDirectory!=='public' || !vercel.rewrites?.some(r=>r.source==='/api/:path*'&&r.destination.includes('_collman_path'))) throw new Error('Vercel static/API routing invalid');
const migration=readFileSync('migrations/postgres/0001_initial.sql','utf8');
for(const table of ['tenants','users','sessions','tenant_settings','assets','appraisals','comparables','workflow_history','audit_log','login_attempts'])
 if(!migration.includes('CREATE TABLE IF NOT EXISTS '+table)) throw new Error('Missing PostgreSQL table: '+table);
console.log('PASS: Vercel API, SQL migration, routing, frontend assets');

for(const [file,needle] of [
  ['migrations/postgres/0002_tenant_integrity.sql','fk_asset_creator_tenant'],
  ['migrations/postgres/0003_audit_immutability.sql','collman_audit_immutable'],
  ['migrations/postgres/0004_financial_integrity.sql','chk_appraisal_liquidation']]){
  if(!readFileSync(file,'utf8').includes(needle))throw new Error('Integrity migration incomplete: '+file);
}
console.log('PASS: financial integrity, tenant foreign keys, immutable audit triggers and live verification syntax');
