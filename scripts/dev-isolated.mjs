/** Local QA only: in-memory PostgreSQL WASM, synthetic records, no production credentials. */
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {isolatedDatabase} from '../tests/pglite-harness.mjs';
import {handleCollManApi} from '../src/vercel-api.js';
const {engine,db}=await isolatedDatabase();
const env={BOOTSTRAP_TOKEN:'local-synthetic-bootstrap-not-for-production-0123456789'};
const setup=new Request('http://localhost/api/auth/bootstrap',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({organization:'Isolated Development — Synthetic Only',email:'admin@test.invalid',display_name:'Synthetic QA Admin',password:'SyntheticPassword123!',setup_token:env.BOOTSTRAP_TOKEN})});
await handleCollManApi(setup,env,db);
// Local-only browser QA fixture. It provisions no production account or permissions.
const qaToken=randomBytes(32).toString('hex');
const qaUser=await db.prepare('SELECT id FROM users WHERE email=?').bind('admin@test.invalid').first();
await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+12 hours'))").bind(createHash('sha256').update(qaToken).digest('hex'),qaUser.id).run();
const files=new Set(['index.html','app.js','styles.css','helpers.js','api-client.js','collateral-catalog.js','collateral-ui.js','enterprise-ui.js']);
const server=createServer(async(req,res)=>{
 try{
  const origin=(req.headers['x-forwarded-proto']?.split(',')[0]||'http')+'://'+req.headers.host,url=new URL(req.url,origin);
  if(url.pathname==='/mobile-qa'){res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><title>CollMan Mobile QA</title><body style="margin:0;background:#edf0f6"><iframe title="CollMan Mobile QA" src="/" style="width:390px;height:844px;border:1px solid #ddd"></iframe></body>');return;}
  if(url.pathname==='/qa'){res.writeHead(302,{'location':'/','set-cookie':`collman_session=${qaToken}; Path=/; HttpOnly; SameSite=Strict`}).end();return;}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   // Serialize local requests: PGlite is one connection. Production uses PostgreSQL row locks/pool.
   const pending=queue.then(()=>handleCollManApi(request,env,db));queue=pending.catch(()=>{});
   const result=await pending;res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
  }
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!files.has(file)){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','cache-control':'no-store'});res.end(await readFile(new URL('../public/'+file,import.meta.url)));
 }catch(e){res.writeHead(e.status||500,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));}
});
let queue=Promise.resolve();
const portFlag=process.argv.indexOf('--port');
const port=Number(portFlag>=0?process.argv[portFlag+1]:(process.env.PORT||3000));server.listen(port,'0.0.0.0',()=>console.log(`Isolated CollMan QA listening on ${port}; synthetic database only.`));
process.on('SIGTERM',()=>server.close(async()=>{await engine.close();process.exit(0);}));
