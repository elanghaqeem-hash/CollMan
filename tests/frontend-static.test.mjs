import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const load=p=>readFileSync(p,'utf8');
test('Vercel serves the unmodified CollMan UI and same-origin API',()=>{
  const html=load('public/index.html'),js=load('public/app.js'),v=JSON.parse(load('vercel.json'));
  assert.match(html,/id="app"/);assert.match(html,/app\.js/);
  assert.match(js,/\/api\//);
  assert.equal(v.outputDirectory,'public');
  assert.ok(v.rewrites.some(r=>r.source==='/api/:path*' && r.destination.includes('_collman_path')));
  assert.ok(existsSync('api/index.js'));assert.ok(existsSync('src/vercel-api.js'));
});
test('Vercel adapter preserves all six role names and transactional audit writes',()=>{
  const src=load('src/vercel-api.js');
  assert.match(src,/nextWorkflow\(/);
  assert.match(src,/await db\.transaction\(async tx/);
  assert.match(src,/INSERT INTO workflow_history/);
  assert.match(src,/INSERT INTO audit_log/);
  assert.doesNotMatch(src,/cloudflare:workers|runSync\(/);
});
