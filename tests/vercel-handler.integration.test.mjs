import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import handler from '../api/index.js';

test('Vercel Node function accepts rewrites and returns DB-backed API health', {skip:!process.env.DATABASE_URL}, async()=>{
  const server=createServer((request,response)=>handler(request,response));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const origin='http://127.0.0.1:'+server.address().port;
    const response=await fetch(origin+'/api/index?_collman_path=health');
    const result=await response.json();
    assert.equal(response.status,200);
    assert.equal(result.database,'connected');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    const metadata=await fetch(origin+'/api/index?_collman_path=meta');
    assert.equal(metadata.status,200);
    assert.equal((await metadata.json()).product,'CollMan');
    const traversal=await fetch(origin+'/api/index?_collman_path=..%2Fadmin');
    assert.equal(traversal.status,400);
  }finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
