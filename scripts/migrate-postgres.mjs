/** Explicit, atomic PostgreSQL migrations.
 * Run against a dedicated database in a protected environment, never on public API requests.
 * Do not auto-repair corrupted/legacy schemas; stop and reconcile deliberately.
 */
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,basename} from 'node:path';
import {getPostgres} from '../src/postgres.js';

const directory=fileURLToPath(new URL('../migrations/postgres/',import.meta.url));
const files=(await readdir(directory)).filter(x=>/^\d{4}_[a-z0-9_]+\.sql$/.test(x)).sort();
if(!files.length) throw new Error('No PostgreSQL migration files found');

const db=getPostgres({useDirect:true});
const client=await db.pool.connect();
const messages=[];
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('collman_schema_migration'))");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT NOT NULL,
    applied_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT timezone('utc',now())
  )`);
  const recorded=await client.query('SELECT version,checksum FROM schema_migrations');
  const expectedVersions=new Set(files.map(f=>basename(f,'.sql')));
  for(const row of recorded.rows) {
    if(!expectedVersions.has(row.version)) throw new Error('Unknown applied migration: '+row.version);
  }
  for(const filename of files) {
    const version=basename(filename,'.sql');
    const sql=await readFile(join(directory,filename),'utf8');
    const checksum=createHash('sha256').update(sql).digest('hex');
    const prior=recorded.rows.find(r=>r.version===version);
    if(prior) {
      if(prior.checksum!==checksum) throw new Error('Migration checksum mismatch: '+version);
      messages.push('Already applied: '+version);
      continue;
    }
    if(version===files[0].replace(/\.sql$/,'') && !recorded.rows.length) {
      const existing=await client.query(`SELECT table_name FROM information_schema.tables
        WHERE table_schema=current_schema() AND table_type='BASE TABLE'
          AND table_name<>'schema_migrations'`);
      if(existing.rowCount) throw new Error('Target schema is not empty; explicit reconciliation required');
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
    messages.push('Applied: '+version);
  }
  await client.query('COMMIT');
  messages.forEach(x=>console.log('PostgreSQL CollMan '+x));
}catch(error) {
  try{await client.query('ROLLBACK');}catch{ /* keep the original error */ }
  console.error('Migration aborted:',error.message);
  process.exitCode=1;
}finally {
  client.release();await db.pool.end();
}
