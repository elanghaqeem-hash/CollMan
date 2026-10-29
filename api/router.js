import {api} from '../src/vercel-api.js';
import {openDatabase} from '../src/vercel-db.js';

// Rewritten from /api/:path* -> /api/router?route=:path*
// Retain original Request URL for same-origin/CSRF checks and query parameters.
export default {
  async fetch(request) {
    const url=new URL(request.url);
    const route=url.searchParams.get('route');
    if(!route||!/^[a-zA-Z0-9_/-]+$/.test(route)||route.includes('..')){
      return Response.json({error:'Endpoint tidak ditemukan.'},{status:404,headers:{'cache-control':'no-store'}});
    }
    try{
      const db=await openDatabase();
      return await api(request,{BOOTSTRAP_TOKEN:process.env.BOOTSTRAP_TOKEN},db,'/api/'+route);
    }catch(error){
      const status=Number.isInteger(error?.status)?error.status:500;
      if(status===500)console.error('CollMan Vercel API error',error?.message);
      return Response.json({error:status===500?'Terjadi gangguan sistem. Hubungi administrator.':error.message},{status,headers:{'cache-control':'no-store'}});
    }
  }
};
