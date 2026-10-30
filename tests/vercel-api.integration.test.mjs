import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
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
  const makerTasks=await call('GET','/api/tasks?scope=mine',undefined,maker);
  assert.equal(makerTasks.status,200,JSON.stringify(makerTasks.data));
  assert.ok(makerTasks.data.records.some(t=>t.id===id&&t.lane==='OPEN'&&t.role_owner==='MAKER'));
  assert.equal((await call('POST','/api/tasks/'+id+'/receive',{},checker)).status,403);
  assert.equal((await call('POST','/api/tasks/'+id+'/receive',{},auditor)).status,403);
  assert.equal((await call('POST','/api/tasks/'+id+'/start',{},maker)).status,409);
  assert.equal((await call('POST','/api/tasks/'+id+'/receive',{},maker)).status,200);
  assert.equal((await call('POST','/api/tasks/'+id+'/start',{},maker)).status,200);
  const inspectDate=new Date().toISOString().slice(0,10);
  const inspect=await call('PUT','/api/tasks/'+id+'/inspection',{date:inspectDate},maker);
  assert.equal(inspect.status,200,JSON.stringify(inspect.data));
  assert.ok(inspect.data.due_date>inspectDate);
  assert.equal((await call('PUT','/api/tasks/'+id+'/inspection',{date:inspectDate},maker)).status,409);
  assert.equal((await call('PUT','/api/tasks/'+id+'/inspection',{date:inspectDate},checker)).status,403);
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
  // Evidence metadata must persist, remain tenant-scoped, and be reviewable only by
  // independent Checker/Reviewer at the correct workflow stage.
  const ev=await call('POST','/api/assets/'+id+'/evidence',{
    evidence_type:'LEGAL_DOCUMENT',source_name:'Test internal source',
    reference_no:'UAT-LEGAL-001',notes:'For integration testing only'},maker);
  assert.equal(ev.status,201,JSON.stringify(ev.data));
  const evidenceId=ev.data.id;
  assert.equal((await call('GET','/api/assets/'+id+'/evidence',undefined,auditor)).data.records.length,1);
  assert.equal((await call('POST','/api/assets/'+id+'/evidence/'+evidenceId+'/review',
    {decision:'REVIEWED_INTERNAL',note:'Recorded internally for test'},checker)).status,403);
  assert.equal((await call('POST','/api/assets/'+id+'/evidence', {
    evidence_type:'LEGAL_DOCUMENT',source_name:'Unauthorized',reference_no:'TEST'},auditor)).status,403);
  assert.equal((await call('POST','/api/assets/'+id+'/transition',{action:'APPROVE'},maker)).status,403);
  for(const [cookie,action,want] of [[maker,'SUBMIT','SUBMITTED'],[checker,'CHECK','REVIEWED'],[reviewer,'RECOMMEND','RECOMMENDED'],[approver,'APPROVE','APPROVED']]){
    if(action==='CHECK'){
      const asg=await call('POST','/api/tasks/'+id+'/assign',{user_id:userIds.CHECKER},admin);
      assert.equal(asg.status,200,JSON.stringify(asg.data));
      assert.equal((await call('POST','/api/tasks/'+id+'/receive',{},reviewer)).status,403);
    }
    if(action!=='SUBMIT'){
      const received=await call('POST','/api/tasks/'+id+'/receive',{},cookie);
      assert.equal(received.status,200,JSON.stringify(received.data));
      const started=await call('POST','/api/tasks/'+id+'/start',{},cookie);
      assert.equal(started.status,200,JSON.stringify(started.data));
    }
    const r=await call('POST','/api/assets/'+id+'/transition',{action},cookie);
    assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.status,want);
    if(action==='SUBMIT'){
      const reviewed=await call('POST','/api/assets/'+id+'/evidence/'+evidenceId+'/review',
        {decision:'REVIEWED_INTERNAL',note:'Reviewed independent supporting evidence'},checker);
      assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
      assert.equal(reviewed.data.status,'REVIEWED_INTERNAL');
      assert.equal((await call('POST','/api/assets/'+id+'/evidence/'+evidenceId+'/review',
        {decision:'DISPUTED',note:'Attempt unauthorized second review'},checker)).status,403);
      assert.equal((await call('POST','/api/assets/'+id+'/evidence/'+evidenceId+'/review',
        {decision:'DISPUTED',note:'Maker self review attempt'},maker)).status,403);
    }
  }
  assert.equal((await call('PUT','/api/assets/'+id,assetInfo,maker)).status,403);
  assert.equal((await call('POST','/api/assets/'+id+'/transition',{action:'APPROVE'},approver)).status,403);
  const final=await call('GET','/api/assets/'+id,undefined,auditor);
  assert.equal(final.status,200);
  assert.equal(final.data.history.length,4);
  const finished=await call('GET','/api/tasks?lane=FINISHED&scope=all',undefined,admin);
  assert.equal(finished.status,200,JSON.stringify(finished.data));
  const finishedCase=finished.data.records.find(t=>t.id===id);
  assert.equal(finishedCase?.lane,'FINISHED');
  assert.equal(finishedCase?.inspection_date,inspectDate);
  assert.equal(finishedCase?.due_date,inspect.data.due_date);
  assert.equal((await call('GET','/api/tasks?scope=all',undefined,maker)).status,403);
  assert.equal(final.data.evidence.length,1);
  assert.equal(final.data.evidence[0].review_status,'REVIEWED_INTERNAL');
  assert.ok(final.data.evidence[0].reviewed_by_name);
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
  const immutableAudit=await db.prepare('SELECT id FROM audit_log WHERE action=? LIMIT 1').bind('APPROVE').first();
  assert.ok(immutableAudit?.id);
  await assert.rejects(
    db.prepare('DELETE FROM audit_log WHERE id=?').bind(immutableAudit.id).run(),
    {code:'23514'}
  );
  const immutableWorkflow=await db.prepare('SELECT id FROM workflow_history WHERE asset_id=? LIMIT 1').bind(id).first();
  assert.ok(immutableWorkflow?.id);
  await assert.rejects(
    db.prepare('UPDATE workflow_history SET note=? WHERE id=?')
      .bind('Unapproved change',immutableWorkflow.id).run(),
    {code:'23514'}
  );
  assert.equal((await call('PUT','/api/assets/'+id+'/appraisal',{market_value:2,base_haircut_pct:1},maker)).status,403);
  await assert.rejects(
    db.prepare('UPDATE appraisals SET liquidation_value=market_value+1 WHERE asset_id=?').bind(id).run(),
    {code:'23514'}
  );
  await assert.rejects(
    db.prepare('UPDATE assets SET status=? WHERE id=?').bind('UNRECOGNIZED',id).run(),
    {code:'23514'}
  );

  // Concurrency UAT: an editor must not persist stale data once a workflow
  // transition commits while the editor is waiting for a row lock.
  const raceCreated=await call('POST','/api/assets',{...assetInfo,borrower:'Concurrent Maker'},maker);
  assert.equal(raceCreated.status,201);
  const raceId=raceCreated.data.id;
  const raceVal=await call('PUT','/api/assets/'+raceId+'/appraisal',
    {market_value:100000000,base_haircut_pct:10},maker);
  assert.equal(raceVal.status,200);
  const raceOwner=await db.prepare('SELECT tenant_id FROM users WHERE id=?').bind(userIds.MAKER).first();
  const independentPool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
  const locked=await independentPool.connect();
  try {
    await locked.query('BEGIN');
    await locked.query('SELECT id FROM assets WHERE id=$1 FOR UPDATE',[raceId]);
    const staleEdit=call('PUT','/api/assets/'+raceId,
      {...assetInfo,borrower:'Stale writer must not persist'},maker);
    let observedLock=false;
    for(let attempt=0;attempt<80;attempt++){
      const wait=await locked.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`);
      if(wait.rows[0].waiting>0){observedLock=true;break;}
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    assert.ok(observedLock,'Expected concurrent editor to wait for the collateral row lock');
    await locked.query("UPDATE assets SET status='SUBMITTED' WHERE id=$1",[raceId]);
    await locked.query(`INSERT INTO workflow_history
      (id,tenant_id,asset_id,action,from_status,to_status,actor_user_id)
      VALUES ($1,$2,$3,'SUBMIT','DRAFT','SUBMITTED',$4)`,
      [randomUUID(),raceOwner.tenant_id,raceId,userIds.MAKER]);
    await locked.query(`INSERT INTO audit_log
      (id,tenant_id,entity_type,entity_id,action,actor_user_id)
      VALUES ($1,$2,'ASSET',$3,'SUBMIT',$4)`,
      [randomUUID(),raceOwner.tenant_id,raceId,userIds.MAKER]);
    await locked.query('COMMIT');
    const denied=await staleEdit;
    assert.equal(denied.status,409,JSON.stringify(denied.data));
    const preserved=await db.prepare('SELECT borrower,status FROM assets WHERE id=?').bind(raceId).first();
    assert.equal(preserved.borrower,'Concurrent Maker');
    assert.equal(preserved.status,'SUBMITTED');
  }finally{
    try{await locked.query('ROLLBACK');}catch{}
    locked.release();await independentPool.end();
  }

  await db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').bind('test-tenant-2','UAT B').run();
  await db.prepare('INSERT INTO users(id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)')
    .bind('test-other-maker','test-tenant-2','other@uat.example','Other maker','MAKER','0'.repeat(64),'0'.repeat(32)).run();
  await db.prepare('INSERT INTO assets(id,tenant_id,reference_no,borrower,asset_type,address,created_by) VALUES (?,?,?,?,?,?,?)')
    .bind('test-asset-other','test-tenant-2','CM-UAT-OTHER','Outside tenant','Ruko','Other address','test-other-maker').run();
  assert.equal((await call('GET','/api/assets/test-asset-other',undefined,maker)).status,404);
  assert.ok(!(await call('GET','/api/assets',undefined,maker)).data.records.some(x=>x.id==='test-asset-other'));
  // Even if an application bug omits the tenant filter, foreign keys reject cross-tenant links.
  const owner=await db.prepare('SELECT tenant_id FROM users WHERE id=?').bind(userIds.MAKER).first();
  await assert.rejects(
    db.prepare('INSERT INTO comparables (id,tenant_id,asset_id,description,offering_price,created_by) VALUES (?,?,?,?,?,?)')
      .bind('cross-tenant-comp',''+owner.tenant_id,'test-asset-other','Forbidden tenant link',500000,userIds.MAKER).run(),
    {code:'23503'}
  );
  await assert.rejects(
    db.prepare('INSERT INTO audit_log (id,tenant_id,entity_type,entity_id,action,actor_user_id) VALUES (?,?,?,?,?,?)')
      .bind('cross-tenant-audit','test-tenant-2','ASSET',id,'CROSS_TENANT',userIds.MAKER).run(),
    {code:'23503'}
  );
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
