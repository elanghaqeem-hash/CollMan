import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Vercel deploy is static public plus serverless API',()=>{
 const c=JSON.parse(readFileSync('vercel.json','utf8'));
 assert.equal(c.framework,null);
 assert.equal(c.outputDirectory,'public');
 assert.equal(c.rewrites.find(x=>x.source==='/api/:path*')?.destination,'/api/router?route=:path*');
 assert.match(readFileSync('src/vercel-db.js','utf8'),/TURSO_DATABASE_URL/);
 assert.doesNotMatch(readFileSync('src/vercel-api.js','utf8'),/cloudflare:workers|DurableObject/);
});
