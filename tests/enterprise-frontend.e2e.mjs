/** Real browser -> HTTP -> isolated PostgreSQL WASM -> persisted response. No production credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {completeAsset} from './collateral-fixtures.mjs';
test('enterprise desktop/mobile: model registry, sourced indication, facility create/reload and export',async()=>{
 const server=spawn(process.execPath,['scripts/dev-isolated.mjs','--port','3101'],{stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Isolated server startup timeout')),30000);server.stdout.on('data',c=>{if(String(c).includes('listening')){clearTimeout(timer);resolve();}});server.on('exit',code=>reject(new Error('Isolated server exited '+code)));});
  browser=await chromium.launch({headless:true});
  for(const [index,viewport] of [{width:1440,height:1000},{width:390,height:844}].entries()){
   const page=await browser.newPage({viewport}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const base='http://127.0.0.1:3101';await page.goto(base);
   await page.locator('input[name=email]').fill('admin@test.invalid');await page.locator('input[name=password]').fill('SyntheticPassword123!');
   await page.getByRole('button',{name:'Masuk ke CollMan',exact:true}).click();await page.locator('.shell').waitFor();
   const nav=async name=>{if(index===1)await page.locator('[data-action=sidebar-toggle]').click();await page.locator('[data-nav="'+name+'"]').click();};
   await nav('facilities');await page.locator('#facility-form').waitFor();
   const form=page.locator('#facility-form');
   await form.locator('[name=reference_no]').fill('SYN-BROWSER-'+index);await form.locator('[name=borrower_ref]').fill('Synthetic borrower only');await form.locator('[name=branch_code]').fill('SYN');await form.locator('[name=exposure_idr]').fill('1000000');
   await form.locator('[type=submit]').click();await page.getByRole('cell',{name:'SYN-BROWSER-'+index,exact:false}).waitFor();
   await page.reload();await page.locator('.shell').waitFor();await nav('facilities');await page.getByRole('cell',{name:'SYN-BROWSER-'+index,exact:false}).waitFor();
   const downloadPromise=page.waitForEvent('download');await page.locator('[data-enterprise=export-facilities]').click();assert.equal((await downloadPromise).suggestedFilename(),'collman-facilities.csv');
   await nav('models');await page.locator('#model-form').waitFor();const mf=page.locator('#model-form');
   for(const [name,value] of Object.entries({name:'SYN Browser Model '+index,version:'1',region:'TEST_REGION',effective_from:'2026-01-01',effective_to:'2026-12-31',max_source_age_days:'30',min_comparables:'2',methodology_ref:'Synthetic QA methodology'}))await mf.locator('[name='+name+']').fill(value);
   await mf.locator('[name=category]').selectOption('CASH');await mf.locator('[name=method]').selectOption('NOMINAL');await mf.locator('[type=submit]').click();await page.getByRole('cell',{name:'SYN Browser Model '+index+' · 1',exact:false}).waitFor();
   // Test asset fixture is synthetic; valuation itself is submitted through the real browser form.
   const created=await page.request.post(base+'/api/assets',{headers:{origin:base},data:completeAsset('Deposito')});assert.equal(created.status(),201);const asset=await created.json();
   await nav('assets');await page.locator('[data-open="'+asset.id+'"]').click();await page.locator('#model-run-form').waitFor();
   const run=page.locator('#model-run-form');
   for(const [name,value] of Object.entries({as_of:'2026-10-30',region:'TEST_REGION',source_reference:'Synthetic balance reference',source_date:'2026-10-29',balance:'100',blocked_amount:'80',liquidation_amount:'80',liquidation_basis:'Synthetic liquidation basis',bank_accepted_amount:'60',bank_policy_ref:'Synthetic bank policy'}))await run.locator('[name='+name+']').fill(value);
   await run.locator('[type=submit]').click();await page.locator('section').filter({has:page.getByRole('heading',{name:'Multi-Method Valuation Studio'})}).getByRole('cell',{name:'DRAFT',exact:true}).waitFor();
   const result=await page.request.get(base+'/api/assets/'+asset.id+'/model-runs');assert.equal((await result.json()).records.length,1);
   assert.equal((await (await page.request.get(base+'/api/assets/'+asset.id)).json()).appraisal,null);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false,'Mobile page must remain within viewport');
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser?.close();server.kill('SIGTERM');}
});
