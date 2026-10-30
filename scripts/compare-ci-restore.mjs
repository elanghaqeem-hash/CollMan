/** Synthetic CI only. Read-only verification of a restore, never a production backup tool. */
import pg from 'pg';
import {createHash} from 'node:crypto';
const original=new URL(process.env.DATABASE_URL),restored=new URL(process.env.COLLMAN_CI_RESTORE_URL);
if(![original,restored].every(u=>['localhost','127.0.0.1'].includes(u.hostname))||original.pathname!=='/collman_ci'||restored.pathname!=='/collman_restore_ci')throw new Error('This verifier is restricted to the two local synthetic CI databases');
const source=new pg.Pool({connectionString:original.href}),target=new pg.Pool({connectionString:restored.href});
async function inventory(pool){
 const client=await pool.connect();try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=(await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' OR schemaname LIKE 'enterprise_ci_%' ORDER BY schemaname,tablename")).rows;
  const output=[];
  for(const {schemaname,tablename} of tables){
   if(!/^[a-z0-9_]+$/.test(tablename)||!/^(public|enterprise_ci_[a-f0-9]+)$/.test(schemaname))throw new Error('Unexpected schema/table identifier');
   const values=(await client.query(`SELECT to_jsonb(t)::text AS value FROM "${schemaname}"."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows;
   output.push({schema:schemaname,table:tablename,count:values.length,sha256:createHash('sha256').update(values.map(r=>r.value).join('\n')).digest('hex')});
  }
  await client.query('COMMIT');return output;
 }finally{client.release();}
}
try{
 const before=await inventory(source),after=await inventory(target);
 if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Restored table counts or SHA256 content fingerprints differ');
 console.log(JSON.stringify({status:'PASS',scope:'SYNTHETIC_CI_ONLY',tables:before},null,2));
}finally{await source.end();await target.end();}
