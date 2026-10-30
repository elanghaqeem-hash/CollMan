/** Isolated PostgreSQL WASM test engine. Does not replace live network/concurrency UAT. */
import {PGlite} from '@electric-sql/pglite';
import {readdir,readFile} from 'node:fs/promises';
import {PostgresAdapter} from '../src/postgres.js';
export async function isolatedDatabase(){
 const engine=new PGlite();
 for(const file of (await readdir(new URL('../migrations/postgres/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile(new URL('../migrations/postgres/'+file,import.meta.url),'utf8'));
 const executor={query:async(sql,values=[])=>{const r=await engine.query(sql,values);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const pool={...executor,connect:async()=>({...executor,release(){}})};
 return {engine,db:new PostgresAdapter(pool)};
}
