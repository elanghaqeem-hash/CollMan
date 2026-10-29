/** Same-origin JSON API client. Never display an HTML error page to users. */
export function apiError(message,code,status=0) {
  return Object.assign(new Error(message),{code,status});
}

export async function requestApi(path,options={}) {
  const config={credentials:'same-origin',cache:'no-store',...options};
  if(config.body&&typeof config.body!=='string')config.body=JSON.stringify(config.body);
  if(config.body)config.headers={'content-type':'application/json',...config.headers};
  let res;
  try{res=await fetch(path,config);}
  catch{throw apiError('Tidak dapat menghubungi server. Periksa jaringan, lalu coba lagi.','NETWORK_UNAVAILABLE');}
  const type=res.headers.get('content-type')||'';
  if(!type.includes('application/json')) {
    if(res.status===404)throw apiError('Layanan login belum terpasang pada deployment ini. Hubungi administrator.','API_NOT_DEPLOYED',404);
    if([401,403].includes(res.status))throw apiError('Akses ke layanan dibatasi. Hubungi administrator.','DEPLOYMENT_ACCESS_DENIED',res.status);
    throw apiError('Layanan mengembalikan respons yang tidak sesuai. Silakan coba lagi atau hubungi administrator.','INVALID_API_RESPONSE',res.status);
  }
  let json;
  try{json=await res.json();}
  catch{throw apiError('Respons layanan tidak dapat dibaca. Silakan coba lagi.','INVALID_API_RESPONSE',res.status);}
  if(!json||typeof json!=='object'||Array.isArray(json))throw apiError('Respons layanan tidak sesuai. Hubungi administrator.','INVALID_API_RESPONSE',res.status);
  if(!res.ok)throw apiError(json.error||`Layanan tidak tersedia (HTTP ${res.status}).`,json.code||'API_ERROR',res.status);
  return json;
}

export function validateMetadata(meta) {
  if(meta.product!=='CollMan'||typeof meta.needs_setup!=='boolean'||!Array.isArray(meta.roles)||!(meta.user===null||meta.user&&typeof meta.user.id==='string'))
    throw apiError('Konfigurasi layanan login belum sesuai. Hubungi administrator.','INVALID_API_RESPONSE');
  return meta;
}
