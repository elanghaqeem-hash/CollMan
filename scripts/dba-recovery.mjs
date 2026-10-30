/**
 * CollMan DBA: metadata-only inventory or controlled pg_dump/pg_restore to an empty clone.
 * Never writes to the source, logs secrets, or dumps borrower rows to output.
 */
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,chmod,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const {Client}=pg;
const dir=fileURLToPath(new URL('../migrations/postgres/',import.meta.url));
const mode=process.argv[2],local=process.env.COLLMAN_DBA_LOCAL_TEST==='test-only';
function fail(code){const e=new Error(code);e.safeCode=code;throw e;}
function urlFor(raw,kind){
 if(!raw||raw.length>4096)fail('MISSING_OR_INVALID_'+kind+'_SECRET');
 let u;try{u=new URL(raw);}catch{fail('BAD_'+kind+'_CONNECTION_URL');}
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.username||!u.password||!u.pathname.slice(1))fail('BAD_'+kind+'_CONNECTION_COMPONENTS');
 if(u.port&&u.port!=='5432')fail('UNEXPECTED_'+kind+'_PORT');
 if(u.hash)fail('UNEXPECTED_'+kind+'_URL_FRAGMENT');
 if(!(local?['127.0.0.1','localhost'].includes(u.hostname):u.hostname==='db.prisma.io'))fail('UNAPPROVED_'+kind+'_HOST');
 if(u.searchParams.get('sslmode')!==(local?'disable':'require'))fail('INVALID_'+kind+'_SSL_MODE');
 for(const k of u.searchParams.keys())if(!['sslmode','channel_binding'].includes(k))fail('UNRECOGNIZED_'+kind+'_PARAMETER');
 return u;
}
function envFor(u){
 return {...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('COLLMAN_DBA_'))),
 PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),
 PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),
 PGSSLMODE:local?'disable':'require',PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c statement_timeout=600000 -c lock_timeout=15000'};
}
function id(u){return createHash('sha256').update(u.hostname+'/'+u.pathname+'/'+u.username).digest('hex').slice(0,16);}
function quoted(v){return '"'+v.replaceAll('"','""')+'"';}
async function processRun(bin,args,env,onChunk){
 return new Promise((resolve,reject)=>{
  const child=spawn(bin,args,{env,shell:false,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{if(onChunk)onChunk(chunk);});
  child.stderr.on('data',()=>{}); // never emit potentially secret-bearing messages
  child.on('error',()=>reject(new Error('SUBPROCESS_START_ERROR')));
  child.on('close',code=>code===0?resolve():reject(new Error('SUBPROCESS_FAILED')));
 });
}
async function tables(c){return (await c.query("SELECT schemaname AS schema,tablename AS table FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' ORDER BY schemaname,tablename")).rows;}
async function inventory(c){
 const list=await tables(c);
 if(!list.some(t=>t.schema==='public'&&t.table==='schema_migrations'))fail('SOURCE_MIGRATION_LEDGER_MISSING');
 const entries=(await c.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
 const files=(await readdir(dir)).filter(f=>/^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
 const expect=new Map();
 for(const f of files)expect.set(f.replace(/\.sql$/,''),createHash('sha256').update(await readFile(join(dir,f))).digest('hex'));
 if(!entries.length)fail('EMPTY_MIGRATION_LEDGER');
 for(const row of entries)if(expect.get(row.version)!==row.checksum)fail('UNKNOWN_OR_CHANGED_MIGRATION');
 return {tables:list,versions:entries.map(e=>e.version),pending:[...expect.keys()].filter(x=>!entries.some(e=>e.version===x))};
}
async function hashTables(u,list){
 const output=[];
 for(const {schema,table} of list){
  const sql='COPY (SELECT to_jsonb(t)::text FROM '+quoted(schema)+'.'+quoted(table)+' t ORDER BY to_jsonb(t)::text) TO STDOUT';
  const h=createHash('sha256');let rows=0;
  await processRun('psql',['-X','-q','-v','ON_ERROR_STOP=1','-c',sql],envFor(u),chunk=>{
   h.update(chunk);for(const byte of chunk)if(byte===10)rows++;
  });
  output.push({schema,table,rows,sha256:h.digest('hex')});
 }
 return output;
}
async function output(data){
 const text=JSON.stringify({...data,tag:'COLLMAN_DBA_SECURE_REHEARSAL_V1'},null,2)+'\n';
 if(process.env.COLLMAN_DBA_REPORT_PATH)await writeFile(process.env.COLLMAN_DBA_REPORT_PATH,text,{mode:0o600});
 process.stdout.write(text);
}
async function main(){
 if(!['inventory','backup-restore'].includes(mode))fail('CHOOSE_INVENTORY_OR_BACKUP_RESTORE');
 if(local&&process.env.GITHUB_ACTIONS==='true')fail('LOCAL_TEST_DISALLOWED_IN_GITHUB_ACTIONS');
 const source=urlFor(process.env.COLLMAN_DBA_SOURCE_DIRECT_URL,'SOURCE');
 const c=new Client({connectionString:source.href,connectionTimeoutMillis:15000,statement_timeout:600000});
 try{
  await c.connect();
  const base=await inventory(c);
  if(!base.tables.length)fail('SOURCE_HAS_NO_APPLICATION_TABLES');
  if(mode==='inventory')return output({status:'PASS',mode,source_id:id(source),table_count:base.tables.length,applied_versions:base.versions,pending_versions:base.pending});
  if(process.env.COLLMAN_DBA_ACK_RESTORE_EMPTY!=='true')fail('RESTORE_APPROVAL_MISSING');
  if(!/^[a-f0-9]{16}$/.test(process.env.COLLMAN_DBA_APPROVED_SOURCE_ID||'')||process.env.COLLMAN_DBA_APPROVED_SOURCE_ID!==id(source))fail('APPROVED_SOURCE_FINGERPRINT_MISSING_OR_CHANGED');
  const target=urlFor(process.env.COLLMAN_DBA_RESTORE_DIRECT_URL,'RESTORE');
  if(target.href===source.href||target.username===source.username||target.password===source.password)fail('SOURCE_AND_RESTORE_NOT_INDEPENDENT');
  const clone=new Client({connectionString:target.href,connectionTimeoutMillis:15000,statement_timeout:600000});
  try{
   await clone.connect();
   if((await tables(clone)).length)fail('RESTORE_TARGET_NOT_EMPTY');
   const folder=await mkdtemp(join(tmpdir(),'collman-dba-'));
   try{
    await chmod(folder,0o700);
    const backup=join(folder,'snapshot.custom');
    await processRun('pg_dump',['--format=custom','--serializable-deferrable','--no-owner','--no-acl','--file='+backup],envFor(source));
    const h=createHash('sha256');for await(const chunk of createReadStream(backup))h.update(chunk);
    const backupSha=h.digest('hex');await chmod(backup,0o600);
    // Only the EMPTY, separate target receives writes. No production migrations.
    await processRun('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-acl',backup],envFor(target));
    const cloneTables=await tables(clone);
    if(JSON.stringify(cloneTables)!==JSON.stringify(base.tables))fail('RESTORED_TABLE_INVENTORY_MISMATCH');
    const [before,after]=await Promise.all([hashTables(source,base.tables),hashTables(target,cloneTables)]);
    if(JSON.stringify(before)!==JSON.stringify(after))fail('RESTORED_DATA_FINGERPRINT_MISMATCH_OR_SOURCE_CHANGED');
    if(JSON.stringify((await inventory(clone)).versions)!==JSON.stringify(base.versions))fail('RESTORED_MIGRATION_LEDGER_MISMATCH');
    return output({status:'PASS',mode,source_id:id(source),restore_id:id(target),backup_sha256:backupSha,
     table_count:before.length,populated_tables:before.filter(t=>t.rows).length,row_count:before.reduce((s,t)=>s+t.rows,0),
     applied_versions:base.versions,pending_versions:base.pending,source_modified_by_workflow:false,
     restore_target_modified:true,backup_retained:false,production_database_verified:!local});
   }finally{await rm(folder,{recursive:true,force:true});}
  }finally{await clone.end();}
 }finally{await c.end();}
}
try{await main();}catch(e){
 console.error('COLLMAN_DBA_RESULT=BLOCKED;CODE='+String(e.safeCode||'UNKNOWN_OR_CONNECTION_FAILURE'));
 process.exitCode=1;
}
