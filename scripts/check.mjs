import {existsSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const path of ['src/index.js','src/vercel-api.js','src/vercel-db.js','api/router.js','vercel.json','src/domain.js','src/schema.js','public/index.html','public/app.js','public/styles.css','migrations/0001_initial.sql','wrangler.jsonc']){
 if(!existsSync(path)) throw new Error(`Missing required path: ${path}`);
}
for(const path of ['src/index.js','src/vercel-api.js','src/vercel-db.js','api/router.js','src/domain.js','src/schema.js','public/app.js']) execFileSync(process.execPath,['--check',path]);
const wrangler=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(!wrangler.name || !wrangler.main || !wrangler.assets?.directory || !wrangler.durable_objects?.bindings?.[0]?.class_name) throw new Error('Wrangler config incomplete');
if(!existsSync(wrangler.main) || !existsSync(wrangler.assets.directory)) throw new Error('Wrangler entrypoint or assets missing');
if(!readFileSync('public/index.html','utf8').includes('id="app"')) throw new Error('SPA root missing');
console.log('PASS: source syntax, Wrangler entrypoint/assets, SQLite DO migration, index.html');
