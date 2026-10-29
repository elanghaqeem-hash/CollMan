import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCollManApi} from '../src/vercel-api.js';
import {getPostgres} from '../src/postgres.js';

const BASE='https://collman-test.vercel.app';
const env={BOOTSTRAP_TOKEN:'integration-only-token-not-for-production-0123456789'};
async function call(method,path,body,cookie,origin=BASE) {
  const headers={};
  if(body!==undefined) headers['content-type']='application/json';
  if(origin!==null) headers.origin=origin;
  if(cookie) headers.cookie=cookie;
  const request=new Request(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  try {
    const response=await handleCollManApi(request,env,getPostgres());
    const data=await response.json();
    return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  } catch(error) {
    if(!Number.isInteger(error.status)) throw error;
    return {status:error.status,data:{error:error.message}};
  }
}
async function login(email,password) {
  const r=await call('POST','/api/auth/login',{email,password});
  assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(r.cookie);return r.cookie;
}
const password='StrongPassword123!';
const assetInfo={borrower:'Test only / bukan data nasabah',asset_type:'Ruko',address:'Jalan UAT No 1',land_area:120,building_area:180,legal_status:'SESUAI'};

test('CollMan PostgreSQL: auth, RBAC, SoD, approval journal and tenant isolation', {skip:!process.env.DATABASE_URL}, async()=>{
  const h=await call('GET','/api/health');
  assert.equal(h.status,200);assert.equal(h.data.database,'connected');
  const meta=await call('GET','/api/meta');
  assert.equal(meta.status,200);assert.equal(meta.data.needs_setup,true,'Use a clean isolated test database');
  const bootstrap=await call('POST','/api/auth/bootstrap',{organization:'UAT Isolated',email:'admin@uat.example',display_name:'UAT Admin',password,setup_token:env.BOOTSTRAP_TOKEN});
  assert.equal(bootstrap.status,201,JSON.stringify(bootstrap.data));
  assert.equal((await call('POST','/api/auth/bootstrap',{organization:'Again'})).status,403);
  const admin=await login('admin@uat.example',password);
  assert.equal((await call('GET','/api/users')).status,401);
  assert.equal((await call('GET','/api/users',undefined,admin)).status,200);
  const roles=['MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR'];
  const userIds={};
  for(const role of roles){
    const r=await call('POST','/api/users',{email:role.toLowerCase()+'@uat.example',display_name:'UAT '+role,role,password},admin);
    assert.equal(r.status,201,JSON.stringify(r.data));
    userIds[role]=r.data.id;
  }
  const maker=await login('maker@uat.example',password);
  const checker=await login('checker@uat.example',password);
  const reviewer=await login('reviewer@uat.example',password);
  const approver=await login('approver@uat.example',password);
  const auditor=await login('auditor@uat.example',password);
  assert.equal((await call('GET','/api/users',undefined,auditor)).status,403);
  assert.equal((await call('POST','/api/assets',assetInfo,checker)).status,403);
  assert.equal((await call('POST','/api/assets',assetInfo,maker,'https://evil.test')).status,403);
  const created=await call('POST','/api/assets',assetInfo,maker);
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;
  assert.equal((await call('PUT','/api/assets/'+id,assetInfo,maker)).status,200);
  const list=await call('GET','/api/assets?q=UAT',undefined,maker);
  assert.equal(list.status,200);
  assert.ok(list.data.records.some(x=>x.id===id));
  const detail=await call('GET','/api/assets/'+id,undefined,maker);
  assert.equal(detail.status,200);
  assert.equal(detail.data.asset.status,'DRAFT');
  const setting=await call('PUT','/api/settings',{risk_weights:{banjir:5}},admin);
  assert.equal(setting.status,200);
  assert.equal((await call('GET','/api/settings',undefined,maker)).data.risk_weights.banjir,5);
  assert.equal((await call('PUT','/api/settings',{risk_weights:{banjir:99}},maker)).status,403);
  const appr=await call('PUT','/api/assets/'+id+'/appraisal',{market_value:1000000000,base_haircut_pct:20,risk_flags:{banjir:true},valuation_date:'2026-10-29'},maker);
  assert.equal(appr.status,200,JSON.stringify(appr.data));
  assert.equal(appr.data.calculation.liquidation_value,750000000);
  const comp=await call('POST','/api/assets/'+id+'/comparables',{description:'UAT comparable',source_url:'https://example.com',offering_price:1200000000},maker);
  assert.equal(comp.status,201);
  assert.equal((await call('DELETE','/api/assets/'+id+'/comparables/'+comp.data.id,undefined,maker)).status,200);
  assert.equal((await call('GET','/api/assets/'+id,undefined,checker)).data.comparables.length,0);
  const compAgain=await call('POST','/api/assets/'+id+'/comparables',{description:'UAT comparable',offering_price:1200000000},maker);
  assert.equal(compAgain.status,201);
  assert.equal((await call('GET','/api/assets/'+id,undefined,checker)).data.comparables.length,1);
  assert.equal((await call('POST','/api/assets/'+id+'/transition',{action:'APPROVE'},maker)).status,403);
  for(const [cookie,action,want] of [[maker,'SUBMIT','SUBMITTED'],[checker,'CHECK','REVIEWED'],[reviewer,'RECOMMEND','RECOMMENDED'],[approver,'APPROVE','APPROVED']]){
    const r=await call('POST','/api/assets/'+id+'/transition',{action},cookie);
    assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.status,want);
  }
  assert.equal((await call('PUT','/api/assets/'+id,assetInfo,maker)).status,403);
  assert.equal((await call('POST','/api/assets/'+id+'/transition',{action:'APPROVE'},approver)).status,403);
  const final=await call('GET','/api/assets/'+id,undefined,auditor);
  assert.equal(final.status,200);
  assert.equal(final.data.history.length,4);
  const dashboard=await call('GET','/api/dashboard',undefined,admin);
  assert.equal(dashboard.status,200);assert.equal(Number(dashboard.data.assets.approved_liquidation),750000000);
  const journal=await call('GET','/api/audit',undefined,auditor);
  assert.equal(journal.status,200);
  assert.ok(journal.data.records.some(x=>x.action==='APPROVE'));
  const second=await call('POST','/api/assets',assetInfo,maker);
  assert.equal(second.status,201);
  const secondId=second.data.id;
  assert.equal((await call('PUT','/api/assets/'+secondId+'/appraisal',{market_value:100000,base_haircut_pct:15},maker)).status,200);
  assert.equal((await call('POST','/api/assets/'+secondId+'/transition',{action:'SUBMIT'},maker)).status,200);
  assert.equal((await call('POST','/api/assets/'+secondId+'/transition',{action:'RETURN',note:'Need correction'},checker)).status,200);
  assert.equal((await call('POST','/api/assets/'+secondId+'/transition',{action:'SUBMIT'},maker)).status,200);
  assert.equal((await call('POST','/api/assets/'+secondId+'/transition',{action:'CHECK'},checker)).status,200);
  assert.equal((await call('POST','/api/assets/'+secondId+'/transition',{action:'RECOMMEND'},reviewer)).status,200);
  assert.equal((await call('POST','/api/assets/'+secondId+'/transition',{action:'REJECT',note:'Policy exception'},approver)).status,200);
  assert.equal((await call('GET','/api/assets/'+secondId,undefined,admin)).data.asset.status,'REJECTED');
  const db=getPostgres();
  await db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').bind('test-tenant-2','UAT B').run();
  await db.prepare('INSERT INTO users(id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)')
    .bind('test-other-maker','test-tenant-2','other@uat.example','Other maker','MAKER','0'.repeat(64),'0'.repeat(32)).run();
  await db.prepare('INSERT INTO assets(id,tenant_id,reference_no,borrower,asset_type,address,created_by) VALUES (?,?,?,?,?,?,?)')
    .bind('test-asset-other','test-tenant-2','CM-UAT-OTHER','Outside tenant','Ruko','Other address','test-other-maker').run();
  assert.equal((await call('GET','/api/assets/test-asset-other',undefined,maker)).status,404);
  assert.ok(!(await call('GET','/api/assets',undefined,maker)).data.records.some(x=>x.id==='test-asset-other'));
  assert.equal((await call('POST','/api/assets/'+id+'/transition',{action:'RETURN',note:'reason'},checker)).status,403);
  const changed=await call('POST','/api/auth/password',{old_password:password,new_password:'NewPassword123!'},maker);
  assert.equal(changed.status,200);
  assert.equal((await call('GET','/api/dashboard',undefined,maker)).status,401);
  const makerNew=await login('maker@uat.example','NewPassword123!');
  assert.equal((await call('POST','/api/auth/logout',{},makerNew)).status,200);
  assert.equal((await call('GET','/api/dashboard',undefined,makerNew)).status,401);
  assert.equal((await call('PUT','/api/users/'+userIds.AUDITOR,{role:'AUDITOR',active:false},admin)).status,200);
  assert.equal((await call('GET','/api/audit',undefined,auditor)).status,401);
  for(let attempt=0;attempt<8;attempt++)
    assert.equal((await call('POST','/api/auth/login',{email:'unknown@uat.example',password:'invalid'})).status,401);
  assert.equal((await call('POST','/api/auth/login',{email:'unknown@uat.example',password:'invalid'})).status,429);
});
