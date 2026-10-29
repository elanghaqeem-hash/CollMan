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
  const response=await handleCollManApi(request,env,getPostgres());
  const data=await response.json();
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
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
  for(const role of roles){
    const r=await call('POST','/api/users',{email:role.toLowerCase()+'@uat.example',display_name:'UAT '+role,role,password},admin);
    assert.equal(r.status,201,JSON.stringify(r.data));
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
  const detail=await call('GET','/api/assets/'+id,undefined,maker);
  assert.equal(detail.status,200);
  assert.equal(detail.data.asset.status,'DRAFT');
  const setting=await call('PUT','/api/settings',{risk_weights:{banjir:5}},admin);
  assert.equal(setting.status,200);
  const appr=await call('PUT','/api/assets/'+id+'/appraisal',{market_value:1000000000,base_haircut_pct:20,risk_flags:{banjir:true},valuation_date:'2026-10-29'},maker);
  assert.equal(appr.status,200,JSON.stringify(appr.data));
  assert.equal(appr.data.calculation.liquidation_value,750000000);
  const comp=await call('POST','/api/assets/'+id+'/comparables',{description:'UAT comparable',source_url:'https://example.com',offering_price:1200000000},maker);
  assert.equal(comp.status,201);
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
  const db=getPostgres();
  await db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').bind('test-tenant-2','UAT B').run();
  const attempted=await call('GET','/api/assets/test-tenant-2-only',undefined,maker);
  assert.equal(attempted.status,404);
  const rejected=await call('POST','/api/assets/'+id+'/transition',{action:'RETURN',note:'reason'},checker);
  assert.equal(rejected.status,403);
});
