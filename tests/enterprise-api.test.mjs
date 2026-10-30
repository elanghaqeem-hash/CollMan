import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isolatedDatabase} from './pglite-harness.mjs';
import {handleCollManApi} from '../src/vercel-api.js';
import {completeAsset,valuationInput} from './collateral-fixtures.mjs';
async function fixture(){
 const {engine,db}=await isolatedDatabase(),tokens={};
 await db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').bind('tenant-a','Synthetic enterprise QA').run();
 await db.prepare('INSERT INTO tenant_settings(tenant_id) VALUES (?)').bind('tenant-a').run();
 for(const role of ['ADMIN','MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR']){
  await db.prepare('INSERT INTO users(id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)').bind(role,'tenant-a',role+'@test.invalid',role,role,'0'.repeat(64),'0'.repeat(32)).run();
  const token=createHash('sha256').update(role).digest('hex');tokens[role]=token;
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+12 hours'))").bind(createHash('sha256').update(token).digest('hex'),role).run();
 }
 async function api(role,method,path,body){
  try{const res=await handleCollManApi(new Request('https://qa.test'+path,{method,headers:{origin:'https://qa.test','content-type':'application/json',...(role?{cookie:'collman_session='+tokens[role]}:{})},body:body===undefined?undefined:JSON.stringify(body)}),{},db);return {status:res.status,body:await res.json()};}
  catch(e){if(!e.status)throw e;return {status:e.status,body:{error:e.message}};}
 }
 return {engine,db,api};
}
test('governed model versions, independent signoff, append-only runs, tenant and role denial',async()=>{
 const {engine,db,api}=await fixture();try{
  const def={name:'Synthetic nominal model',version:'1',method:'NOMINAL',category:'CASH',region:'TEST_REGION',effective_from:'2026-01-01',effective_to:'2026-12-31',parameters:{max_source_age_days:30},methodology_ref:'Synthetic methodology'};
  assert.equal((await api(null,'GET','/api/models')).status,401);
  assert.equal((await api('MAKER','POST','/api/models',def)).status,403);
  const created=await api('ADMIN','POST','/api/models',def);assert.equal(created.status,201,JSON.stringify(created));const id=created.body.id;
  assert.equal((await api('APPROVER','POST','/api/models/'+id+'/approve',{reference:'Synthetic approval'})).status,409);
  const review={reference:'Synthetic validation',note:'Synthetic review; no bank signoff implied',observations:[{category:'CASH',region:'TEST_REGION',predicted:100,actual:100,realized_on:'2026-10-01',realization_ref:'Synthetic A'},{category:'CASH',region:'TEST_REGION',predicted:100,actual:110,realized_on:'2026-10-01',realization_ref:'Synthetic B'}]};
  assert.equal((await api('ADMIN','POST','/api/models/'+id+'/review',review)).status,403);
  assert.equal((await api('REVIEWER','POST','/api/models/'+id+'/review',review)).status,200);
  assert.equal((await api('APPROVER','POST','/api/models/'+id+'/approve',{reference:'Synthetic approval'})).status,200);
  await assert.rejects(db.prepare('UPDATE valuation_models SET parameters=? WHERE id=?').bind('{}',id).run(),{code:'23514'});
  const asset=await api('MAKER','POST','/api/assets',completeAsset('Deposito'));assert.equal(asset.status,201);
  const body={model_id:id,region:'TEST_REGION',as_of:'2026-10-30',input:{currency:'IDR',balance:100,blocked_amount:80,source:{reference:'Synthetic balance',as_of:'2026-10-29'},liquidation_amount:80,liquidation_basis:'Confirmed redeemable cash',bank_accepted_amount:80,bank_policy_ref:'Synthetic policy'}};
  assert.equal((await api('AUDITOR','POST','/api/assets/'+asset.body.id+'/model-runs',body)).status,403);
  const result=await api('MAKER','POST','/api/assets/'+asset.body.id+'/model-runs',body);assert.equal(result.status,201,JSON.stringify(result));assert.equal(result.body.result.approved_market_value,null);
  assert.equal((await api('MAKER','GET','/api/assets/'+asset.body.id)).body.appraisal,null,'Model indication cannot overwrite appraisal');
  await assert.rejects(db.prepare('DELETE FROM valuation_runs WHERE id=?').bind(result.body.id).run(),{code:'23514'});
  assert.equal((await api('APPROVER','POST','/api/models/'+id+'/suspend',{reference:'Synthetic suspension'})).status,200);
  assert.equal((await api('MAKER','POST','/api/assets/'+asset.body.id+'/model-runs',body)).status,409);
  assert.equal((await api('ADMIN','POST','/api/models/other-tenant-model/approve',{reference:'Unknown model'})).status,404);
 }finally{await engine.close();}
});
test('facility coverage prevents double counting, requires bank acceptance and independent release',async()=>{
 const {engine,db,api}=await fixture();try{
  const asset=await api('MAKER','POST','/api/assets',completeAsset('Deposito')),aid=asset.body.id,path='/api/assets/'+aid;
  assert.equal((await api('MAKER','PUT',path+'/appraisal',valuationInput('NOMINAL'))).status,200);
  for(const [role,action] of [['MAKER','SUBMIT'],['CHECKER','CHECK'],['REVIEWER','RECOMMEND']])assert.equal((await api(role,'POST',path+'/transition',{action})).status,200);
  const val=(await api('MAKER','GET',path)).body.appraisal;
  const limit=Math.floor(val.liquidation_value*.8);
  assert.equal((await api('CHECKER','PUT',path+'/eligibility',{eligibility_status:'ELIGIBLE',eligibility_notes:'Synthetic policy and legal review',bank_accepted_value:limit,bank_policy_ref:'Synthetic bank policy'})).status,200);
  assert.equal((await api('APPROVER','POST',path+'/transition',{action:'APPROVE'})).status,200);
  const facilities=[];
  for(let i=0;i<2;i++){
   const f=await api('MAKER','POST','/api/facilities',{reference_no:'SYN-F-'+i,borrower_ref:'Synthetic borrower',branch_code:'SYN',exposure_idr:limit});assert.equal(f.status,201);facilities.push(f.body.id);
  }
  const allocate=async(f,amount)=>api('MAKER','POST','/api/allocations',{asset_id:aid,facility_id:f,amount_idr:amount,basis_ref:'Synthetic collateral linkage'});
  assert.equal((await api('AUDITOR','POST','/api/facilities',{})).status,403);
  const first=await allocate(facilities[0],limit);assert.equal(first.status,201);
  assert.equal((await api('MAKER','POST','/api/allocations/'+first.body.id+'/approve',{})).status,403);
  assert.equal((await api('APPROVER','POST','/api/allocations/'+first.body.id+'/approve',{})).status,200);
  const second=await allocate(facilities[1],1);
  assert.equal((await api('APPROVER','POST','/api/allocations/'+second.body.id+'/approve',{})).status,409);
  const coverage=(await api('AUDITOR','GET','/api/facilities')).body.records;assert.equal(Number(coverage.find(f=>f.id===facilities[0]).allocated_idr),limit);
  assert.equal((await api('MAKER','POST','/api/allocations/'+first.body.id+'/request-release',{reason:'Synthetic settlement'})).status,200);
  assert.equal((await api('APPROVER','POST','/api/allocations/'+second.body.id+'/approve',{})).status,409,'Pending release must still consume capacity');
  assert.equal((await api('MAKER','POST','/api/allocations/'+first.body.id+'/approve-release',{reason:'Self release denied'})).status,403);
  assert.equal((await api('APPROVER','POST','/api/allocations/'+first.body.id+'/approve-release',{reason:'Synthetic independent settlement review'})).status,200);
  assert.equal((await api('APPROVER','POST','/api/allocations/'+second.body.id+'/approve',{})).status,200);
  await assert.rejects(db.prepare('DELETE FROM collateral_allocations WHERE id=?').bind(first.body.id).run(),{code:'23514'});
  assert.equal((await api(null,'GET','/api/facilities')).status,401);
  assert.equal((await api('ADMIN','POST','/api/allocations',{asset_id:'foreign',facility_id:facilities[0],amount_idr:1,basis_ref:'Unknown asset'})).status,404);
 }finally{await engine.close();}
});
