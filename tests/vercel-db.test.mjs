import test from 'node:test';
import assert from 'node:assert/strict';
import {Database} from '../src/vercel-db.js';
test('adapter translates libSQL positional rows to named objects and changes',async()=>{
 const ex={execute:async ({sql,args})=>({columns:['id','role'],rows:[['a','MAKER']],rowsAffected:1})};
 const db=new Database(ex);
 assert.deepEqual(await db.prepare('SELECT id,role FROM users WHERE id=?').bind('a').first(),{id:'a',role:'MAKER'});
 assert.deepEqual((await db.prepare('SELECT id,role FROM users').all()).results,[{id:'a',role:'MAKER'}]);
 assert.deepEqual(await db.prepare('UPDATE users SET role=?').bind('MAKER').run(),{meta:{changes:1}});
});
test('workflow transaction commits on success and rolls back on failure',async()=>{
 const events=[];
 const ex={transaction:async mode=>{
   assert.equal(mode,'write');
   return {execute:async()=>({columns:[],rows:[],rowsAffected:1}),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback')};
 }};
 const db=new Database(ex);
 await db.transaction(async tx=>{await tx.prepare('UPDATE asset').run();});
 await assert.rejects(()=>db.transaction(async()=>{throw Error('conflict');}),/conflict/);
 assert.deepEqual(events,['commit','rollback']);
});
