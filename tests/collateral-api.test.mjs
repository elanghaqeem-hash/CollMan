import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isolatedDatabase} from './isolated-enterprise-db.mjs';
import {handleCollManApi} from '../src/vercel-api.js';
import {GROUPS,BUILTIN_TYPES} from '../public/collateral-catalog.js';
import {completeAsset,valuationInput} from './collateral-fixtures.mjs';
const ORIGIN='https://collman.test';
export async function seedActors(db){
 await db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').bind('tenant-a','Isolated synthetic tests').run();
 await db.prepare('INSERT INTO tenant_settings(tenant_id) VALUES (?)').bind('tenant-a').run();
 const tokens={};
 for(const role of ['ADMIN','MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR']){
  await db.prepare('INSERT INTO users(id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)').bind(role,'tenant-a',role+'@test.invalid',role,role,'0'.repeat(64),'0'.repeat(32)).run();
  const token=createHash('sha256').update(role).digest('hex');tokens[role]=token;
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+12 hours'))").bind(createHash('sha256').update(token).digest('hex'),role).run();
 }
 return tokens;
}
export async function callApi(db,tokens,role,method,path,body){
 try{const response=await handleCollManApi(new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json',...(role?{cookie:'collman_session='+tokens[role]}:{})},body:body===undefined?undefined:JSON.stringify(body)}),{},db);return {status:response.status,body:await response.json()};}
 catch(e){if(!e.status)throw e;return {status:e.status,body:{error:e.message}};}
}
test('PostgreSQL migration and API: every category persists, validates and passes independent review',async()=>{
 const {engine,db}=await isolatedDatabase();
 try{
  const tokens=await seedActors(db),api=(role,method,path,body)=>callApi(db,tokens,role,method,path,body);
  assert.equal((await api(null,'GET','/api/collateral-catalog')).status,401);
  assert.equal((await api('MAKER','PUT','/api/collateral-catalog',{})).status,403);
  const catalog=await api('ADMIN','GET','/api/collateral-catalog');assert.equal(catalog.body.groups.length,16);
  for(const group of GROUPS){
   const type=BUILTIN_TYPES.find(t=>t.group===group.code),payload=completeAsset(type.name);
   const create=await api('MAKER','POST','/api/assets',payload);assert.equal(create.status,201,JSON.stringify(create));const path='/api/assets/'+create.body.id;
   let detail=await api('CHECKER','GET',path);assert.equal(detail.body.asset.category_code,group.code);assert.deepEqual(detail.body.asset.collateral_details,payload.collateral_details);
   const val=await api('MAKER','PUT',path+'/appraisal',valuationInput(group.methods[0]));assert.equal(val.status,200,JSON.stringify(val));
   assert.equal((await api('MAKER','POST',path+'/transition',{action:'SUBMIT'})).status,200);
   assert.equal((await api('MAKER','PUT',path+'/eligibility',{eligibility_status:'ELIGIBLE',eligibility_notes:'Self approval attempted'})).status,403);
   assert.equal((await api('CHECKER','POST',path+'/transition',{action:'CHECK'})).status,200);
   assert.equal((await api('REVIEWER','POST',path+'/transition',{action:'RECOMMEND'})).status,200);
   assert.equal((await api('APPROVER','POST',path+'/transition',{action:'APPROVE'})).status,400);
   assert.equal((await api('CHECKER','PUT',path+'/eligibility',{eligibility_status:'ELIGIBLE',eligibility_notes:'Synthetic bank policy reviewed'})).status,200);
   assert.equal((await api('APPROVER','POST',path+'/transition',{action:'APPROVE'})).status,200);
   detail=await api('AUDITOR','GET',path);assert.equal(detail.body.asset.status,'APPROVED');assert.equal(detail.body.history.length,4);
  }
  const dashboard=await api('ADMIN','GET','/api/dashboard');assert.equal(Number(dashboard.body.assets.total),16);assert.equal(dashboard.body.categories.length,16);
  const guarantee=dashboard.body.categories.find(c=>c.collateral_kind==='GUARANTEE');assert.ok(Number(guarantee.approved_value)>0);
  assert.equal(Number(dashboard.body.assets.approved_liquidation),dashboard.body.categories.filter(c=>c.collateral_kind!=='GUARANTEE').reduce((sum,c)=>sum+Number(c.approved_value),0));
  const filtered=await api('MAKER','GET','/api/assets?category=CASH');assert.equal(Number(filtered.body.total),1);assert.equal(filtered.body.records[0].category_code,'CASH');
  const custom={custom_types:[{code:'CUSTOM_TRACTOR',name:'Traktor Pertanian',group:'MACHINERY'}],policies:{}};
  assert.equal((await api('ADMIN','PUT','/api/collateral-catalog',custom)).status,200);
  assert.equal((await api('ADMIN','PUT','/api/collateral-catalog',{})).status,409);
  const types=(await api('MAKER','GET','/api/collateral-catalog')).body.types;
  const created=await api('MAKER','POST','/api/assets',completeAsset('Traktor Pertanian',types));assert.equal(created.status,201);
  const path='/api/assets/'+created.body.id;assert.equal((await api('MAKER','PUT',path+'/appraisal',valuationInput('COST'))).status,200);
  assert.equal((await api('MAKER','PUT',path,completeAsset('Deposito'))).status,200);
  assert.equal((await api('MAKER','GET',path)).body.appraisal,null,'Changing type invalidates old valuation');
  // Missing evidence and invalid legal state cannot enter the workflow.
  const incomplete=await api('MAKER','POST','/api/assets',{borrower:'Incomplete',asset_type:'Mobil',address:'Synthetic'});
  assert.equal((await api('MAKER','POST','/api/assets/'+incomplete.body.id+'/transition',{action:'SUBMIT'})).status,400);
  // Disabling a type affects only the current tenant and is rechecked at submission.
  assert.equal((await api('ADMIN','PUT','/api/collateral-catalog',{...custom,policies:{CASH_3:{enabled:false,policy:'BLOCKED'}}})).status,200);
  assert.equal((await api('MAKER','POST','/api/assets',completeAsset('Deposito'))).status,400);
  assert.equal((await api('AUDITOR','PUT',path,completeAsset('Mobil'))).status,403);
  const token=createHash('sha256').update('other-tenant').digest('hex');
  await db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').bind('tenant-b','Other isolated tenant').run();
  await db.prepare('INSERT INTO tenant_settings(tenant_id) VALUES (?)').bind('tenant-b').run();
  await db.prepare('INSERT INTO users(id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)').bind('other','tenant-b','other@test.invalid','Other','ADMIN','0'.repeat(64),'0'.repeat(32)).run();
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+12 hours'))").bind(createHash('sha256').update(token).digest('hex'),'other').run();tokens.OTHER=token;
  assert.equal((await api('OTHER','GET',path)).status,404);
  assert.equal((await api('OTHER','GET','/api/collateral-catalog')).body.types.some(t=>t.code==='CUSTOM_TRACTOR'),false);
  assert.equal((await api('OTHER','PUT',path+'/eligibility',{eligibility_status:'ELIGIBLE',eligibility_notes:'Bad tenant'})).status,404);
  const audits=await api('ADMIN','GET','/api/audit');assert.ok(audits.body.records.some(r=>r.action==='ASSESS_ELIGIBILITY'));
 }finally{await engine.close();}
});

test('asset-specific changes invalidate valuations even when type and currency stay the same',async()=>{
 const {engine,db}=await isolatedDatabase();try{
  const tokens=await seedActors(db),api=(method,path,body)=>callApi(db,tokens,'MAKER',method,path,body);
  const asset=completeAsset('Deposito'),created=await api('POST','/api/assets',asset),path='/api/assets/'+created.body.id;
  assert.equal((await api('PUT',path+'/appraisal',valuationInput('NOMINAL'))).status,200);
  asset.collateral_details.blocked_amount=50;
  assert.equal((await api('PUT',path,asset)).status,200);
  assert.equal((await api('GET',path)).body.appraisal,null);
  assert.equal((await api('POST',path+'/transition',{action:'SUBMIT'})).status,400);
 }finally{await engine.close();}
});
