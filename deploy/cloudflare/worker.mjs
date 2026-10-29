/**
 * CVS/CollMan restricted pilot.
 * ASUMSI: Isolated technical pilot; operational FastAPI/PostGIS and bank data are not deployed here.
 * ASUMSI: Only linked Cloudflare administrator may access the pilot.
 * No persisted data and no customer information accepted.
 */
const RELEASE="0.2.0-restricted-pilot";
const ISS="https://green-heart-e2b0.cloudflareaccess.com";
const AUD="364b68df0874c5918451cc00a3751b718713bc9d74eb702ae8c85c9475b2b42f";
const ADMIN="elang.haqeem@gmail.com";
const SCALE=100000000n;
const SEC={"Cache-Control":"no-store","X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(),microphone=(),geolocation=()","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{...SEC,"Content-Type":"application/json; charset=utf-8"}});
const html=(body,status=200)=>new Response(body,{status,headers:{...SEC,"Content-Type":"text/html; charset=utf-8"}});
function decode64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(s.padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0))}
async function allowed(req){
  const jwt=req.headers.get("CF-Access-Jwt-Assertion");
  if(!jwt)return false;
  try{
    const p=jwt.split(".");if(p.length!==3)return false;
    const h=JSON.parse(new TextDecoder().decode(decode64(p[0])));
    const c=JSON.parse(new TextDecoder().decode(decode64(p[1])));
    const now=Math.floor(Date.now()/1000);
    if(h.alg!=="RS256"||!h.kid||c.iss!==ISS||String(c.email).toLowerCase()!==ADMIN||c.exp<=now||c.iat>now+60)return false;
    if(!(Array.isArray(c.aud)?c.aud.includes(AUD):c.aud===AUD))return false;
    const res=await fetch(ISS+"/cdn-cgi/access/certs");
    if(!res.ok)return false;
    const {keys}=await res.json();const jwk=keys.find(k=>k.kid===h.kid&&k.kty==="RSA");
    if(!jwk)return false;
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decode64(p[2]),new TextEncoder().encode(p[0]+"."+p[1]));
  }catch{return false}
}
function parse(s,name,max=1000000000000n){
  s=String(s??"").trim();
  if(!/^\d{1,13}(\.\d{1,8})?$/.test(s))throw Error(name+": angka desimal tidak valid");
  const [a,b=""]=s.split(".");
  const v=BigInt(a)*SCALE+BigInt(b.padEnd(8,"0"));
  if(v>max*SCALE)throw Error(name+": di luar rentang simulasi");
  return v;
}
const mul=(a,b)=>(a*b+SCALE/2n)/SCALE;
const round=(a,unit)=>{const n=BigInt(unit)*SCALE;return (a+n/2n)/n*n};
function fmt(v,dp=0){
  const n=10n**BigInt(8-dp);
  const t=((v+n/2n)/n).toString().padStart(dp+1,"0");
  const i=(dp?t.slice(0,-dp):t).replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return i+(dp?","+t.slice(-dp):"");
}
const formInputs=[
["biaya","Biaya langsung/m² (Rp)","4763836"],["lantai","Indeks lantai","1"],
["wilayah","Indeks wilayah","0.828"],["fee","Professional fee","0.03"],
["izin","Perizinan","0.015"],["profit","Keuntungan kontraktor","0.10"],
["ppn","PPN (data contoh)","0.11"],["umur","Umur efektif (tahun)","3"],
["ekonomis","Umur ekonomis (tahun)","30"]
];
function calculate(p){
 const direct=parse(p.get("biaya"),"Biaya langsung");
 const fl=parse(p.get("lantai"),"Indeks lantai",10n);
 const rg=parse(p.get("wilayah"),"Indeks wilayah",10n);
 const fee=parse(p.get("fee"),"Fee",1n);
 const izin=parse(p.get("izin"),"Perizinan",1n);
 const profit=parse(p.get("profit"),"Kontraktor",1n);
 const vat=parse(p.get("ppn"),"PPN",1n);
 const age=parse(p.get("umur"),"Umur efektif",500n);
 const life=parse(p.get("ekonomis"),"Umur ekonomis",500n);
 if(life===0n)throw Error("Umur ekonomis tidak boleh nol");
 const f=mul(direct,fl),region=mul(f,rg),indirect=mul(region,fee+izin+profit);
 const before=region+indirect,tax=mul(before,vat),brb=before+tax,brbRounded=round(brb,10000);
 const dep=(age*SCALE)/life>=SCALE?SCALE:(age*SCALE)/life;
 const np=round(mul(brbRounded,SCALE-dep),1000);
 return [["Biaya langsung",fmt(direct)],["Indeks lantai",fmt(fl,4)],["Indeks wilayah",fmt(rg,4)],
 ["Biaya setelah indeks lantai",fmt(f)],["Biaya langsung setelah indeks wilayah",fmt(region)],
 ["Biaya tidak langsung",fmt(indirect)],["Total sebelum PPN",fmt(before)],["PPN",fmt(tax)],
 ["BRB sebelum pembulatan",fmt(brb,2)],["BRB / m² dibulatkan",fmt(brbRounded)],
 ["Penyusutan efektif",fmt(dep*100n,2)+"%"],["NP Bangunan / m²",fmt(np)]];
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function page(rows=null,error=""){
 const style="body{margin:0;background:#f2f5f9;color:#172d49;font:15px system-ui}header{background:#122c50;color:#fff;padding:26px max(22px,calc((100vw - 1080px)/2))}header p{color:#c6d9ed}main{max-width:1080px;margin:auto;padding:28px 20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.card{background:#fff;border:1px solid #dfe6ee;border-radius:12px;padding:22px;margin-top:16px;box-shadow:0 2px 10px #00000008}.card strong{display:block;font-size:22px;margin:10px 0}.notice{padding:14px;background:#fff1d3;border-radius:7px;color:#78521c}form{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}label{display:grid;gap:7px;font-weight:600;font-size:13px}input{border:1px solid #c9d5e2;border-radius:7px;padding:10px;font:inherit;max-width:100%}button{background:#175d9e;border:0;border-radius:7px;color:white;padding:12px 19px;cursor:pointer}.wide{grid-column:1/-1}table{width:100%;border-collapse:collapse}td{padding:11px;border-bottom:1px solid #e8eef5}td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}.error{color:#a32332}footer{text-align:center;color:#65758a;padding:25px}@media(max-width:670px){.grid,form{grid-template-columns:1fr}}";
 const fields=formInputs.map(([name,label,v])=>'<label>'+esc(label)+'<input name="'+name+'" type="number" min="0" step="any" required value="'+v+'"></label>').join("");
 const result=rows?'<section class="card"><h2>Calculation Trace (contoh)</h2><table>'+rows.map(x=>'<tr><td>'+esc(x[0])+'</td><td>'+esc(x[1])+'</td></tr>').join("")+'</table><p>Rumus: biaya langsung × indeks lantai × indeks wilayah + biaya tidak langsung + PPN; lalu penyusutan fisik. Pembulatan HALF_UP.</p></section>':"";
 return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CVS | Collateral Valuation System</title><style>'+style+'</style></head><body><header><small>CVS · COLLMAN · ACCESS RESTRICTED</small><h1>Collateral Valuation System</h1><p>Simulasi perhitungan appraisal dengan jejak rumus.</p></header><main><div class="notice"><b>PILOT TERBATAS — BUKAN APLIKASI PRODUKSI PERBANKAN.</b> Jangan mengisi NIK, nama debitur, sertifikat, dokumen, atau informasi nasabah. Belum mendukung keputusan kredit dan laporan final.</div><div class="grid"><div class="card">Core Python (lokal)<strong>22 / 22 tests</strong></div><div class="card">Contoh metode<strong>BRB & NP</strong></div><div class="card">Keamanan pilot<strong>Access + JWT</strong></div></div><section class="card"><h2>Simulasi BRB dan NP Bangunan</h2><p>Parameter ini data contoh PIK 2 dan tidak mencerminkan kebijakan bank yang telah disetujui.</p><form method="post" action="/calculate">'+fields+'<div class="wide"><button type="submit">Hitung simulasi</button></div></form>'+(error?'<p class="error">'+esc(error)+'</p>':"")+'</section>'+result+'<section class="card"><h2>Release gate operasional</h2><p><b>Belum lulus:</b> integrasi PostgreSQL/PostGIS, persetujuan master data, SoD per role, laporan final, audit trail WORM, proteksi PII, legalitas sertifikat, uji UAT dan pemulihan bencana.</p></section></main><footer>CVS '+RELEASE+' · Hanya menggunakan data simulasi</footer></body></html>';
}
export default {async fetch(req){
 const url=new URL(req.url);
 if(url.pathname==="/health"&&req.method==="GET")return json({status:"UP",release:RELEASE,mode:"RESTRICTED_PILOT",pii_storage:false,bank_production_ready:false});
 if(!(await allowed(req)))return json({error:"Cloudflare Access authentication required"},401);
 if(url.pathname==="/"&&req.method==="GET")return html(page());
 if(url.pathname==="/calculate"&&req.method==="POST"){
   if(req.headers.get("origin")!==url.origin)return json({error:"Origin mismatch"},403);
   if(Number(req.headers.get("content-length")||"0")>2000)return json({error:"Payload too large"},413);
   try{return html(page(calculate(await req.formData())))}catch(e){return html(page(null,e.message),422)}
 }
 return json({error:"Not found"},404);
}};
