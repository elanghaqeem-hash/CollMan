import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import handler from '../api/index.js';

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
test('CollMan desktop and mobile browser: login, dashboard, register, navigation', {skip:!process.env.DATABASE_URL}, async()=>{
  const web=createServer(async (req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) return handler(req,res);
    let file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!['index.html','app.js','helpers.js','styles.css'].includes(file)){res.writeHead(404).end();return;}
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
    assert.equal(overflows,false,'Mobile layout should not scroll horizontally');
    await page.close();
  }finally{
    await browser.close();await new Promise(resolve=>web.close(resolve));
  }
});
