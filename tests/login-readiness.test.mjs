import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {requestApi,validateMetadata} from '../public/api-client.js';
import {serviceError} from '../src/service-errors.js';
import handler from '../api/index.js';

test('Login distinguishes a missing deployment API from database readiness',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('NOT_FOUND',{status:404,headers:{'content-type':'text/plain'}});
    await assert.rejects(requestApi('/api/meta'),e=>e.code==='API_NOT_DEPLOYED'&&e.status===404&&!e.message.includes('database'));
    globalThis.fetch=async()=>Response.json({error:'Database belum terhubung.',code:'DATABASE_NOT_CONFIGURED'},{status:503});
    await assert.rejects(requestApi('/api/meta'),e=>e.code==='DATABASE_NOT_CONFIGURED'&&e.message==='Database belum terhubung.');
  }finally{globalThis.fetch=original;}
});

test('HTML, malformed JSON, null JSON and wrong metadata never open login',async()=>{
  const original=globalThis.fetch;
  try {
    for(const response of [new Response('<html>Fallback</html>',{headers:{'content-type':'text/html'}}),new Response('{',{headers:{'content-type':'application/json'}}),Response.json(null),Response.json([])]){
      globalThis.fetch=async()=>response;
      await assert.rejects(requestApi('/api/meta'),e=>e.code==='INVALID_API_RESPONSE');
    }
    for(const meta of [{},{product:'CollMan',needs_setup:'false',roles:[],user:null},{product:'CollMan',needs_setup:false,roles:[],user:{}}])
      assert.throws(()=>validateMetadata(meta),e=>e.code==='INVALID_API_RESPONSE');
  }finally{globalThis.fetch=original;}
});

test('Manual retry recovers after a network failure using uncached same-origin metadata',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>{throw new TypeError('Offline');};
    await assert.rejects(requestApi('/api/meta'),e=>e.code==='NETWORK_UNAVAILABLE');
    globalThis.fetch=async(path,options)=>{
      assert.equal(path,'/api/meta');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');
      return Response.json({product:'CollMan',needs_setup:false,roles:['ADMIN'],user:null});
    };
    assert.equal(validateMetadata(await requestApi('/api/meta')).needs_setup,false);
  }finally{globalThis.fetch=original;}
});

test('Database diagnostics use 503 and never expose raw SQL or credentials',()=>{
  for(const [error,code] of [[new Error('DATABASE_URL is missing'),'DATABASE_NOT_CONFIGURED'],[{code:'42P01'},'DATABASE_MIGRATION_REQUIRED'],[{code:'42703'},'DATABASE_MIGRATION_REQUIRED'],[{code:'ECONNREFUSED'},'DATABASE_UNAVAILABLE'],[{code:'28P01'},'DATABASE_UNAVAILABLE']]){
    error.message??='postgresql://secret:password@private-host SELECT * FROM users';
    const result=serviceError(error);
    assert.equal(result.status,503);assert.equal(result.code,code);assert.doesNotMatch(result.message,/password|private-host|SELECT/);
  }
  assert.equal(serviceError(Object.assign(new Error('Sesi kedaluwarsa.'),{status:401})).status,401);
  assert.deepEqual(serviceError(new Error('private internal error')),{status:500,code:'INTERNAL_ERROR',message:'Terjadi gangguan sistem. Hubungi administrator.'});
});

test('Vercel rewrite returns actionable JSON 503 without a configured database',async()=>{
  const env={DATABASE_URL:process.env.DATABASE_URL,DATABASE_URL_POOLED:process.env.DATABASE_URL_POOLED};
  delete process.env.DATABASE_URL;delete process.env.DATABASE_URL_POOLED;
  const server=createServer((req,res)=>handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/index?_collman_path=meta');
    assert.equal(response.status,503);assert.match(response.headers.get('content-type'),/application\/json/);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).code,'DATABASE_NOT_CONFIGURED');
  }finally{
    await new Promise(resolve=>server.close(resolve));
    for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
