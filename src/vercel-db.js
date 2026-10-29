import {createClient} from '@libsql/client/web';
import {INITIAL_SCHEMA} from './schema.js';

// SQLite/libSQL over HTTPS. No Cloudflare bindings or durable local filesystem.
const statements=INITIAL_SCHEMA.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
let client;
let ready;

function getClient() {
  if(client)return client;
  const url=process.env.TURSO_DATABASE_URL;
  const authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken)throw Object.assign(new Error('Database Vercel belum dikonfigurasi.'),{status:503});
  if(!/^(libsql|https):\/\//.test(url))throw Object.assign(new Error('URL database tidak valid.'),{status:503});
  client=createClient({url,authToken,intMode:'number'});
  return client;
}

class Statement {
  constructor(executor,sql,args=[]) {this.executor=executor;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.executor,this.sql,args);}
  async execute(){return this.executor.execute({sql:this.sql,args:this.args});}
  async first(){return (await this.execute()).rows[0]??null;}
  async all(){return {results:(await this.execute()).rows};}
  async run(){const result=await this.execute();return {meta:{changes:result.rowsAffected}};}
}
class Database {
  constructor(executor){this.executor=executor;}
  prepare(sql){return new Statement(this.executor,sql);}
  async batch(items){return this.executor.batch(items.map(s=>({sql:s.sql,args:s.args})), 'write');}
  async transaction(fn){
    const tx=await this.executor.transaction('write');
    try{
      const value=await fn(new Database(tx));
      await tx.commit();
      return value;
    }catch(error){
      try{await tx.rollback();}catch{ /* transaction already aborted */ }
      throw error;
    }
  }
}
export async function openDatabase() {
  const db=getClient();
  if(!ready){
    ready=(async()=>{
      // IF NOT EXISTS: safe for retries, but durable migrations must be versioned before future changes.
      await db.batch(statements.map(sql=>({sql})), 'write');
    })();
  }
  try{await ready;}catch(error){ready=undefined;throw error;}
  return new Database(db);
}
