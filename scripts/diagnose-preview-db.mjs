/** One-off, read-only Preview DB diagnostic. Never prints credentials or row contents. */
import pg from 'pg';
const target=process.env.VERCEL_ENV,ref=process.env.VERCEL_GIT_COMMIT_REF;
if(target!=='preview'||ref!=='feature/all-collateral-categories') {
 console.log('COLLMAN_DIAG SKIPPED: not the isolated feature Preview deployment');
 process.exit(0);
}
const url=process.env.DATABASE_URL;
if(!url){console.log('COLLMAN_DIAG preview_database=UNCONFIGURED');process.exit(0);}
const client=new pg.Client({connectionString:url,connectionTimeoutMillis:7000});
try{
 await client.connect();
 await client.query('BEGIN READ ONLY');
 const tables=await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name");
 const names=tables.rows.map(r=>r.table_name);
 const has=(name)=>names.includes(name);
 let versions=[];
 if(has('schema_migrations')){
  const res=await client.query('SELECT version FROM schema_migrations ORDER BY version');
  versions=res.rows.map(r=>r.version);
 }
 const status=has('users')&&has('tenants')&&has('assets')?'CORE_TABLES_PRESENT':names.length===0?'EMPTY_DATABASE':'PARTIAL_SCHEMA';
 console.log('COLLMAN_DIAG '+JSON.stringify({target:'preview',status,table_count:names.length,core_tables:{tenants:has('tenants'),users:has('users'),assets:has('assets'),schema_migrations:has('schema_migrations')},migration_versions:versions}));
 await client.query('COMMIT');
}catch(error){
 console.log('COLLMAN_DIAG '+JSON.stringify({target:'preview',status:'READ_ERROR',code:String(error.code||'CONNECTION_ERROR').replace(/[^A-Z0-9_]/g,'').slice(0,30)}));
 try{await client.query('ROLLBACK')}catch{}
}finally{try{await client.end()}catch{}}
