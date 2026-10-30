import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function attempt(mode,vars={}){
 const env={...process.env};
 for(const k of Object.keys(env))if(k.startsWith('COLLMAN_DBA_'))delete env[k];
 Object.assign(env,vars);
 const r=spawnSync(process.execPath,['scripts/dba-recovery.mjs',mode],{env,encoding:'utf8',timeout:10000});
 return {exit:r.status,output:r.stdout+r.stderr};
}
test('DBA requires explicitly approved source credential',()=>{
 const x=attempt('inventory');assert.equal(x.exit,1);assert.match(x.output,/MISSING_OR_INVALID_SOURCE_SECRET/);
});
test('DBA rejects pooled Prisma endpoint, never logs credentials',()=>{
 const x=attempt('inventory',{COLLMAN_DBA_SOURCE_DIRECT_URL:'postgresql://sensitive_user:sensitive_password@pooled.db.prisma.io:5432/postgres?sslmode=require'});
 assert.equal(x.exit,1);assert.match(x.output,/UNAPPROVED_SOURCE_HOST/);
 assert.doesNotMatch(x.output,/sensitive_user|sensitive_password/);
});
test('DBA rejects non-TLS hosted connection',()=>{
 const x=attempt('inventory',{COLLMAN_DBA_SOURCE_DIRECT_URL:'postgresql://u:secret@db.prisma.io:5432/postgres?sslmode=disable'});
 assert.equal(x.exit,1);assert.match(x.output,/INVALID_SOURCE_SSL_MODE/);
});
test('DBA rejects unapproved hostname',()=>{
 const x=attempt('inventory',{COLLMAN_DBA_SOURCE_DIRECT_URL:'postgresql://u:secret@example.net:5432/postgres?sslmode=require'});
 assert.equal(x.exit,1);assert.match(x.output,/UNAPPROVED_SOURCE_HOST/);
});
test('DBA prohibits local-mode override on GitHub Actions',()=>{
 const x=attempt('inventory',{GITHUB_ACTIONS:'true',COLLMAN_DBA_LOCAL_TEST:'test-only',COLLMAN_DBA_SOURCE_DIRECT_URL:'postgresql://u:secret@127.0.0.1:5432/db?sslmode=disable'});
 assert.equal(x.exit,1);assert.match(x.output,/LOCAL_TEST_DISALLOWED_IN_GITHUB_ACTIONS/);
});
test('DBA does not expose a production migration mode',()=>{
 const x=attempt('migrate-production');assert.equal(x.exit,1);assert.match(x.output,/CHOOSE_INVENTORY_OR_BACKUP_RESTORE/);
});
