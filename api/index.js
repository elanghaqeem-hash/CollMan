/** Single Vercel Node.js function for all /api/* routes. */
import {handleCollManApi} from '../src/vercel-api.js';
import {getPostgres} from '../src/postgres.js';

function json(res,status,message) {
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.end(JSON.stringify({error:message}));
}

export default async function handler(req,res) {
  try {
    const hostname=req.headers.host;
    if(!hostname || /[\\\s/]/.test(hostname)) return json(res,400,'Invalid host');
    const scheme=process.env.VERCEL==='1'||req.socket?.encrypted?'https':'http';
    const url=new URL(req.url||'/api/index',scheme+'://'+hostname);
    // Rewrites retain query parameters; this explicit route parameter works on both Vercel and local tests.
    const route=url.searchParams.get('_collman_path');
    if(route !== null) {
      if(route.includes('..')||route.startsWith('/')) return json(res,400,'Invalid API route');
      url.pathname='/api/'+route;
      url.searchParams.delete('_collman_path');
    }
    if(!url.pathname.startsWith('/api/')) return json(res,404,'Endpoint tidak ditemukan.');
    const method=(req.method||'GET').toUpperCase();
    const headers=new Headers();
    for(const [key,value] of Object.entries(req.headers)) {
      if(Array.isArray(value)) headers.set(key,value.join(', '));
      else if(value!=null) headers.set(key,String(value));
    }
    let body;
    if(!['GET','HEAD'].includes(method)) {
      if(req.body !== undefined) body=Buffer.isBuffer(req.body)?req.body:typeof req.body==='string'?req.body:JSON.stringify(req.body);
      else {
        const parts=[];let size=0;
        for await (const chunk of req) { size+=chunk.length;if(size>65536)return json(res,413,'Payload terlalu besar.');parts.push(chunk); }
        body=Buffer.concat(parts);
      }
      if(Buffer.byteLength(body)>65536) return json(res,413,'Payload terlalu besar.');
    }
    const request=new Request(url,{method,headers,body});
    const db=getPostgres();
    const result=await handleCollManApi(request,{BOOTSTRAP_TOKEN:process.env.BOOTSTRAP_TOKEN},db);
    res.statusCode=result.status;
    for(const [key,value] of result.headers) res.setHeader(key,value);
    res.setHeader('x-content-type-options','nosniff');
    res.end(Buffer.from(await result.arrayBuffer()));
  }catch(error) {
    const status=Number.isInteger(error.status)?error.status:
      error.message==='DATABASE_URL is missing'||error.message.includes('Production database must configure TLS')?503:500;
    if(status===500) console.error('CollMan Vercel API error:',error.code||error.message);
    json(res,status,status===503?'Database belum dikonfigurasi.':status===500?'Terjadi gangguan sistem. Hubungi administrator.':error.message);
  }
}
