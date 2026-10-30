/** Optional real PostgreSQL CI path. New disposable schemas; never a managed database. */
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PostgresAdapter} from '../src/postgres.js';
import {isolatedDatabase as wasmDatabase} from './pglite-harness.mjs';
export async function isolatedDatabase(){
 if(process.env.COLLMAN_REAL_PG_ISOLATED!=='1')return wasmDatabase();
 const url=new URL(process.env.DATABASE_URL);
 if(!process.env.CI||!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/collman_ci')throw new Error('Real integration fixture is restricted to the local synthetic CI service');
 const schema='enterprise_ci_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:url.href,max:1});
 await admin.query('CREATE SCHEMA "'+schema+'"');await admin.end();
 const pool=new pg.Pool({connectionString:url.href,max:2,options:'-c search_path='+schema});
 try{
  const files=(await readdir(new URL('../migrations/postgres/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
  for(const file of files)await pool.query(await readFile(new URL('../migrations/postgres/'+file,import.meta.url),'utf8'));
 }catch(error){await pool.end();throw error;}
 // Retain synthetic schemas until pg_dump/restore comparison. The entire service is disposable.
 return {db:new PostgresAdapter(pool),engine:{close:()=>pool.end()}};
}
