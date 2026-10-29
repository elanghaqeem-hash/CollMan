/** PostgreSQL adapter with the narrow legacy prepare().bind() contract.
 * Parameterized SQL only; no source string interpolation from user inputs.
 */
import pg from 'pg';

const {Pool, types} = pg;
// Match the JSON shapes served by the original SQLite worker.
types.setTypeParser(20, value => Number(value)); // BIGINT (valuation <= safe integer)
types.setTypeParser(1700, value => Number(value)); // NUMERIC aggregates
types.setTypeParser(1114, value => value); // UTC naive timestamp, original "YYYY-MM-DD HH:mm:ss"

export function postgresSQL(sql) {
  let n=0;
  return sql
    .replace(/datetime\('now','\+12 hours'\)/g, "(timezone('utc',now()) + interval '12 hours')")
    .replace(/datetime\('now','-15 minutes'\)/g, "(timezone('utc',now()) - interval '15 minutes')")
    .replace(/datetime\('now'\)/g, "timezone('utc',now())")
    .replace(/\?/g, () => '$'+(++n));
}

class Prepared {
  constructor(executor, sql, values=[]) {
    this.executor=executor;this.sql=sql;this.values=values;
  }
  bind(...values) {return new Prepared(this.executor,this.sql,values);}
  async first() {return (await this.executor.query(postgresSQL(this.sql),this.values)).rows[0]??null;}
  async all() {return {results:(await this.executor.query(postgresSQL(this.sql),this.values)).rows};}
  async run() {
    const result=await this.executor.query(postgresSQL(this.sql),this.values);
    return {meta:{changes:result.rowCount??0}};
  }
}

export class PostgresAdapter {
  constructor(pool,client=null) {this.pool=pool;this.executor=client||pool;}
  prepare(sql) {return new Prepared(this.executor,sql);}
  async transaction(fn) {
    if(this.executor!==this.pool) throw new Error('Nested transactions are not supported');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const result=await fn(new PostgresAdapter(this.pool,client));
      await client.query('COMMIT');return result;
    }catch(error){
      try{await client.query('ROLLBACK');}catch{ /* preserve original error */ }
      throw error;
    }finally{client.release();}
  }
  async batch(statements) {
    return this.transaction(async tx=>{
      const results=[];
      for(const statement of statements)
        results.push(await new Prepared(tx.executor,statement.sql,statement.values).run());
      return results;
    });
  }
}

/** Runtime uses an optional pooled URL. Schema migrations always use the direct URL.
 * Marketplace Prisma Postgres sets DATABASE_URL to a direct endpoint, not its pooler.
 */
export function selectDatabaseUrl(env, {useDirect=false}={}) {
  const value=(!useDirect && env.DATABASE_URL_POOLED) || env.DATABASE_URL;
  if(!value) throw new Error('DATABASE_URL is missing');
  const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL URL required');
  if(env.VERCEL_ENV==='production' && !['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode')))
    throw new Error('Production database must configure TLS with sslmode=require or stronger');
  return value;
}
let pool;
export function getPostgres({useDirect=false}={}) {
  const connectionString=selectDatabaseUrl(process.env,{useDirect});
  if(!pool) {
    pool=new Pool({connectionString,max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,allowExitOnIdle:true});
    pool.on('error',err=>console.error('CollMan PostgreSQL idle connection error:',err.code||'unknown'));
  }
  return new PostgresAdapter(pool);
}
