/**
 * Run real read-only authentication tests against an EXPLICIT UAT origin.
 * Requirements:
 * UAT_BASE_URL=https://uat.example
 * UAT_ROLE_ACCOUNTS='{"ADMIN":{"email":"...","password":"..."},...}'
 * Do not put credentials in git, CI output, screenshots, or source files.
 */
import assert from 'node:assert/strict';
const ROLES=['ADMIN','MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR'];
const originRaw=process.env.UAT_BASE_URL;
const rawAccounts=process.env.UAT_ROLE_ACCOUNTS;
if(!originRaw || !rawAccounts){
 console.error('BLOCKED: UAT_BASE_URL and UAT_ROLE_ACCOUNTS (6 dedicated role accounts) are required.');
 process.exitCode=2;
} else {
 try{
  const origin=new URL(originRaw);
  assert.equal(origin.protocol,'https:','UAT origin requires HTTPS');
  assert.equal(origin.pathname,'/','Use only an exact UAT origin, without a path.');
  assert.equal(origin.username,'','UAT URL must not embed credentials');
  assert.equal(origin.search,'','UAT URL must not include query credentials');
  const accounts=JSON.parse(rawAccounts);
  for(const role of ROLES)assert.ok(accounts[role]?.email&&accounts[role]?.password,'Missing approved UAT role account: '+role);
  const oidc=process.env.UAT_OIDC_TOKEN||'';
  const extra=oidc?{'x-vercel-trusted-oidc-idp-token':oidc}:{};
  // Never print or save an SSO token, a session cookie, or the accounts JSON.
  const results=[];
  const call=async(path,{method='GET',cookie='',body}={})=>{
   const response=await fetch(new URL(path,origin),{method,redirect:'manual',signal:AbortSignal.timeout(12000),
     headers:{...extra,...(cookie?{cookie}:{}),...(method!=='GET'?{origin:origin.origin,'content-type':'application/json'}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   const contentType=response.headers.get('content-type')||'';
   const payload=contentType.includes('application/json')?await response.json():{};
   return {response,payload};
  };
  const health=await call('/api/health');assert.equal(health.response.status,200,'API health');
  for(const role of ROLES){
   const credentials=accounts[role];
   const login=await call('/api/auth/login',{method:'POST',body:credentials});
   assert.equal(login.response.status,200,role+' login failed (possibly restricted by Access)');
   const setCookie=login.response.headers.get('set-cookie')||'';
   assert.match(setCookie,/collman_session=[a-f0-9]{64}/,role+' session');
   assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Strict/i);assert.match(setCookie,/Secure/i);
   const cookie=setCookie.split(';')[0];
   const meta=await call('/api/meta',{cookie});
   assert.equal(meta.response.status,200);
   assert.equal(meta.payload.user?.role,role,'Role mismatch');
   const assets=await call('/api/assets',{cookie});
   assert.equal(assets.response.status,200,'Tenant-scoped register access');
   const tasks=await call('/api/tasks?scope=mine',{cookie});
   assert.equal(tasks.response.status,200,'UAT task inbox '+role);
   const everyTask=await call('/api/tasks?scope=all',{cookie});
   assert.equal(everyTask.response.status,['ADMIN','AUDITOR'].includes(role)?200:403,'UAT task scoping '+role);
   const users=await call('/api/users',{cookie});
   assert.equal(users.response.status,role==='ADMIN'?200:403,'User management RBAC');
   const audit=await call('/api/audit',{cookie});
   assert.equal(audit.response.status,['ADMIN','AUDITOR'].includes(role)?200:403,'Audit RBAC');
   const logout=await call('/api/auth/logout',{method:'POST',cookie});
   assert.equal(logout.response.status,200,'Logout');
   const after=await call('/api/assets',{cookie});
   assert.equal(after.response.status,401,'Session invalidation');
   results.push({role,login:'PASS',session:'PASS',permissions:'PASS',tasks:'PASS',logout:'PASS'});
  }
  console.log(JSON.stringify({base_url:origin.origin,result:'PASS',results},null,2));
 }catch(e){
  console.error('FAIL (no credentials printed): '+String(e?.message||'unknown failure').replace(/https?:\/\/[^ ]+/g,'[redacted]'));
  process.exitCode=1;
 }
}
