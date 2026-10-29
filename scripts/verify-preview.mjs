/** Read-only smoke test for a reviewed CollMan Vercel PREVIEW.
 * Never runs writes or exposes auth cookies/secret values.
 *
 * Usage: COLLMAN_BASE_URL=https://collman-...vercel.app npm run test:live
 */
const input=process.env.COLLMAN_BASE_URL;
if(!input) throw new Error('COLLMAN_BASE_URL must be a reviewed preview URL');
const base=new URL(input);
const isLocal=['localhost','127.0.0.1'].includes(base.hostname);
if((base.protocol!=='https:'&&!isLocal)||base.username||base.password||base.search||base.hash||base.pathname!=='/')
  throw new Error('Use only an HTTPS origin URL without credentials, path or query');
if(!isLocal && !(base.hostname.startsWith('collman-')&&base.hostname.endsWith('.vercel.app')))
  throw new Error('Refusing unexpected hostname: only CollMan preview URLs are allowed');
let passed=0;
async function get(path) {
  const url=new URL(path,base);
  const headers={'accept':'application/json, text/html, */*'};
  if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const res=await fetch(url,{headers,signal:AbortSignal.timeout(12000),redirect:'error',cache:'no-store'});
  // Vercel also sets Server: Vercel on *application* 401 responses.
  // A JSON 401 with Cache-Control: no-store is the expected RBAC denial.
  // Deployment Protection typically responds with an HTML authentication page.
  if([401,403].includes(res.status) && !(res.headers.get('content-type')||'').includes('application/json'))
    throw new Error('The target refused access before the CollMan API returned JSON. Check Vercel Deployment Protection.');
  return res;
}
async function check(name,path,status,verify=()=>true) {
  const res=await get(path);
  if(res.status!==status) throw new Error(name+': expected HTTP '+status+', got '+res.status);
  if(!await verify(res))throw new Error(name+': response does not meet acceptance criteria');
  console.log('PASS: '+name);passed++;
}
await check('Static homepage','/',200,async r=>{
  const html=await r.text();
  return html.includes('app.js') && html.includes('styles.css') && html.includes('id="app"');
});
await check('Frontend JavaScript','/app.js',200,async r=>r.headers.get('content-type')?.includes('javascript'));
await check('API client module','/api-client.js',200,async r=>r.headers.get('content-type')?.includes('javascript'));
await check('Frontend stylesheet','/styles.css',200,async r=>r.headers.get('content-type')?.includes('css'));
await check('PostgreSQL health','/api/health',200,async r=>{
  if(!r.headers.get('cache-control')?.includes('no-store'))return false;
  const json=await r.json();
  return json.ok===true&&json.service==='collman'&&json.database==='connected';
});
await check('Product metadata','/api/meta',200,async r=>{
  const json=await r.json();
  if(json.needs_setup===true) {
    console.error('RELEASE BLOCKER: no administrator has completed initial setup.');
    return false;
  }
  if(json.needs_setup!==false) {
    console.error('RELEASE BLOCKER: invalid administrator readiness state.');
    return false;
  }
  console.log('PASS: administrator setup completed');
  return json.product==='CollMan' && Array.isArray(json.roles) && json.roles.includes('AUDITOR');
});
for(const [name,path] of [['Anonymous dashboard','/api/dashboard'],['Anonymous users','/api/users'],['Anonymous audit','/api/audit']])
  await check(name,path,401,async r=>r.headers.get('cache-control')?.includes('no-store'));
console.log('SUCCESS: '+passed+' read-only checks passed on reviewed preview origin.');
