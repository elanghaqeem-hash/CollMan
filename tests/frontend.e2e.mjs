import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import handler from '../api/index.js';

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
test('Login readiness on desktop/mobile: missing API, missing DB, retry recovery',async()=>{
  const web=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!['index.html','app.js','helpers.js','api-client.js','collateral-catalog.js','collateral-ui.js','enterprise-ui.js','styles.css'].includes(file)){res.writeHead(404).end();return;}
    const body=await readFile(new URL('../public/'+file,import.meta.url));
    res.writeHead(200,{'content-type':MIME[file.slice(file.lastIndexOf('.'))]});res.end(body);
  });
  await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      let phase=0;
      await page.route('**/api/meta',route=>route.fulfill(phase===0?
        {status:404,contentType:'text/plain',body:'NOT_FOUND'}:phase===1?
        {status:503,contentType:'application/json',body:JSON.stringify({error:'Database belum terhubung.',code:'DATABASE_NOT_CONFIGURED'})}:
        {status:200,contentType:'application/json',body:JSON.stringify({product:'CollMan',needs_setup:false,user:null,roles:['ADMIN']})}));
      await page.goto('http://127.0.0.1:'+web.address().port);
      await page.getByRole('alert').waitFor();
      assert.match(await page.getByRole('alert').innerText(),/belum terpasang/);
      assert.equal(await page.locator('#auth-form').count(),0);
      assert.doesNotMatch(await page.locator('body').innerText(),/D1|Cloudflare Secret/);
      phase=1;await page.getByRole('button',{name:'Coba lagi'}).click();
      await page.getByText('Database belum terhubung.',{exact:true}).waitFor();
      assert.equal(await page.locator('#auth-form').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
      phase=2;await page.getByRole('button',{name:'Coba lagi'}).click();
      await page.locator('#auth-form').waitFor();
      assert.equal(await page.getByRole('alert').count(),0);
      await page.close();
    }
  }finally{await browser?.close();await new Promise(resolve=>web.close(resolve));}
});
test('CollMan desktop and mobile browser: login, dashboard, register, navigation', {skip:!process.env.DATABASE_URL}, async()=>{
  const web=createServer(async (req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) return handler(req,res);
    let file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!['index.html','app.js','helpers.js','api-client.js','collateral-catalog.js','collateral-ui.js','enterprise-ui.js','styles.css'].includes(file)){res.writeHead(404).end();return;}
    const body=await readFile(new URL('../public/'+file,import.meta.url));
    res.writeHead(200,{'content-type':MIME[file.slice(file.lastIndexOf('.'))]||'application/octet-stream'});
    res.end(body);
  });
  await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try{
    const url='http://127.0.0.1:'+web.address().port;
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(url);
    await page.locator('#auth-form input[name="email"]').fill('admin@uat.example');
    await page.locator('#auth-form input[name="password"]').fill('StrongPassword123!');
    await page.getByRole('button',{name:'Masuk ke CollMan'}).click();
    await page.waitForSelector('.shell',{timeout:15000});
    assert.match(await page.locator('.pagehead h1').innerText(),/Dashboard/i);
    await page.locator('[data-nav="assets"]').click();
    await page.waitForSelector('.pagehead h1');
    assert.match(await page.locator('.pagehead h1').innerText(),/Agunan/i);
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-action="sidebar-toggle"]').click();
    await page.locator('[data-nav="dashboard"]').click();
    assert.match(await page.locator('.pagehead h1').innerText(),/Dashboard/i);
    const overflows=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
    const offenders=await page.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,15).map(el=>({tag:el.tagName,cls:el.className,scroll:el.scrollWidth,left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)})));
    assert.equal(overflows,false,'Mobile layout should not scroll horizontally: '+JSON.stringify(offenders));
    await page.close();
  }finally{
    await browser.close();await new Promise(resolve=>web.close(resolve));
  }
});
