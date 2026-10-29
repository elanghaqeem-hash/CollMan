/** Explicit PostgreSQL migration. Never run schema changes automatically on API requests. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPostgres} from '../src/postgres.js';

const filename=new URL('../migrations/postgres/0001_initial.sql',import.meta.url);
const sql=await readFile(filename,'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
const db=getPostgres();
const client=await db.pool.connect();
try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('collman_schema_migration'))");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMP WITHOUT TIME ZONE
      NOT NULL DEFAULT timezone('utc',now())
  )`);
  const prior=await client.query('SELECT checksum FROM schema_migrations WHERE version=$1',['0001_initial']);
  if(prior.rows.length) {
    if(prior.rows[0].checksum!==checksum) throw new Error('Migration checksum mismatch: refusing divergent schema');
    console.log('PostgreSQL CollMan schema 0001 already applied');
  }else {
    const existing=await client.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema=current_schema() AND table_type='BASE TABLE' AND table_name<>'schema_migrations'`);
    if(existing.rowCount) throw new Error('Target schema is not empty; explicit reconciliation required');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',['0001_initial',checksum]);
    console.log('PostgreSQL CollMan schema 0001 applied');
  }
  await client.query('COMMIT');
}catch(error){
  await client.query('ROLLBACK');
  console.error('Migration aborted:',error.message);
  process.exitCode=1;
}finally{
  client.release();await db.pool.end();
}
