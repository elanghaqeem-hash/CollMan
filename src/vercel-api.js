/** Vercel runtime adapter of the Cloudflare business API. Cloudflare source remains untouched. */
import {ROLES, RISK_FLAGS, STATUS_LABELS, ACTIONS, validateAsset, calculateValuation, nextWorkflow, numberIn, required, optional, problem} from './domain.js';

const COOKIE = 'collman_session';
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const MUTATIONS = new Set(['POST','PUT','PATCH','DELETE']);
const response = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status,headers:{...JSON_HEADERS,...headers}});
const uuid = () => crypto.randomUUID();
const sha256 = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const bytesToHex = bytes => Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('');
const constantEquals=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;let mismatch=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return mismatch===0;};
const row = (db,sql,...p) => db.prepare(sql).bind(...p).first();
const all = async (db,sql,...p) => (await db.prepare(sql).bind(...p).all()).results;
const run = (db,sql,...p) => db.prepare(sql).bind(...p).run();
const guard = (condition,message,status=403)=>{if(!condition)throw problem(message,status);};
const validEmail = value => {const x=required(value,'Email',200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))throw problem('Email tidak valid.');return x;};
const strongPassword = value=>{const x=String(value??'');if(x.length<12 || x.length>128 || !/[A-Z]/.test(x)||!/[a-z]/.test(x)||!/[0-9]/.test(x))throw problem('Password minimal 12 karakter dengan huruf besar, huruf kecil, dan angka.');return x;};
async function hashPassword(password,saltHex) {
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(saltHex.match(/../g).map(x=>parseInt(x,16))),iterations:210000},material,256);
  return bytesToHex(new Uint8Array(bits));
}
async function readBody(request) {
  guard(request.headers.get('content-type')?.toLowerCase().startsWith('application/json'),'Content-Type harus application/json.',415);
  const value=await request.text();
  guard(value.length<=65536,'Payload terlalu besar.',413);
  try {const body=JSON.parse(value);guard(body&&typeof body==='object'&&!Array.isArray(body),'JSON object diperlukan.');return body;}
  catch(error) {if(error.status)throw error;throw problem('Format JSON tidak valid.');}
}
const sessionCookie = (value, request, expires=false) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; ${new URL(request.url).protocol==='https:'?'Secure; ':''}${expires?'Max-Age=0; ':'Max-Age=43200; '}`;
function requireSameOrigin(request) {
  if(!MUTATIONS.has(request.method))return;
  const origin=request.headers.get('origin');
  const url=new URL(request.url);
  guard(origin===url.origin,'Permintaan lintas origin ditolak.',403);
}
async function getActor(request,db) {
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  if(!token || !/^[a-f0-9]{64}$/.test(token))return null;
  const user=await row(db,`SELECT u.id,u.tenant_id,u.email,u.display_name,u.role,u.active FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.active=1`,await sha256(token));
  return user||null;
}
async function audit(db,actor,entityType,entityId,action,detail={}) {
  await run(db,'INSERT INTO audit_log (id,tenant_id,entity_type,entity_id,action,actor_user_id,detail_json) VALUES (?,?,?,?,?,?,?)',
    uuid(),actor.tenant_id,entityType,entityId,action,actor.id,JSON.stringify(detail));
}
async function tenantWeights(db,tenantId){
  const r=await row(db,'SELECT risk_weights_json FROM tenant_settings WHERE tenant_id=?',tenantId);
  try{return JSON.parse(r?.risk_weights_json||'{}');}catch{return {};}
}
async function fetchAsset(db,actor,id){
  const asset=await row(db,'SELECT a.*,u.display_name AS maker_name FROM assets a JOIN users u ON u.id=a.created_by WHERE a.id=? AND a.tenant_id=?',id,actor.tenant_id);
  guard(asset,'Agunan tidak ditemukan.',404);return asset;
}
const canEditAsset=(actor,asset)=> (actor.role==='ADMIN'||actor.role==='MAKER'&&asset.created_by===actor.id)&&['DRAFT','RETURNED'].includes(asset.status);
const safeNote = value=>optional(value,2000);

async function authRoutes(request,env,db,path) {
  if(path==='/api/meta'&&request.method==='GET'){
    const count=await row(db,'SELECT COUNT(*) AS total FROM users');
    const actor=await getActor(request,db);
    return response({product:'CollMan',version:'0.1.0',needs_setup:count.total===0,user:actor,roles:ROLES});
  }
  if(path==='/api/auth/bootstrap'&&request.method==='POST'){
    const body=await readBody(request);
    guard(env.BOOTSTRAP_TOKEN&&env.BOOTSTRAP_TOKEN.length>=32,'Bootstrap belum dikonfigurasi oleh administrator.',503);
    guard(constantEquals(String(body.setup_token??''),env.BOOTSTRAP_TOKEN),'Token setup salah.',403);
    const name=required(body.organization,'Nama organisasi',150),email=validEmail(body.email),displayName=required(body.display_name,'Nama administrator',150);
    const password=strongPassword(body.password),salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    const t=uuid(),u=uuid();
    // The advisory lock serializes first-admin creation across independent Vercel instances.
    await db.transaction(async tx=>{
      await tx.prepare("SELECT pg_advisory_xact_lock(hashtext('collman_bootstrap'))").first();
      const existing=await row(tx,'SELECT COUNT(*) AS total FROM users');
      guard(existing.total===0,'Sistem telah diinisialisasi.',409);
      await tx.prepare('INSERT INTO tenants (id,name) VALUES (?,?)').bind(t,name).run();
      await tx.prepare('INSERT INTO users (id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)').bind(u,t,email,displayName,'ADMIN',await hashPassword(password,salt),salt).run();
      await tx.prepare('INSERT INTO tenant_settings (tenant_id,risk_weights_json) VALUES (?,?)').bind(t,'{}').run();
      await tx.prepare('INSERT INTO audit_log (id,tenant_id,entity_type,entity_id,action,actor_user_id) VALUES (?,?,?,?,?,?)').bind(uuid(),t,'USER',u,'BOOTSTRAP_ADMIN',u).run();
    });
    return response({ok:true,message:'Administrator berhasil diinisialisasi. Silakan login.'},201);
  }
  if(path==='/api/auth/login'&&request.method==='POST'){
    const body=await readBody(request),email=validEmail(body.email),password=String(body.password||'');
    const attemptKey=await sha256(email);
    const attempt=await row(db,'SELECT attempts,window_start FROM login_attempts WHERE identifier_hash=?',attemptKey);
    if(attempt&&attempt.attempts>=8&&Date.now()-Date.parse(attempt.window_start+'Z')<900000)throw problem('Terlalu banyak percobaan. Coba kembali setelah 15 menit.',429);
    const user=await row(db,'SELECT * FROM users WHERE email=? AND active=1',email);
    const hash=user?await hashPassword(password,user.password_salt):null;
    if(!user || !constantEquals(hash,user.password_hash)){
      await run(db,`INSERT INTO login_attempts (identifier_hash,attempts,window_start) VALUES (?,1,datetime('now'))
        ON CONFLICT(identifier_hash) DO UPDATE SET attempts=CASE WHEN window_start<datetime('now','-15 minutes') THEN 1 ELSE attempts+1 END,
        window_start=CASE WHEN window_start<datetime('now','-15 minutes') THEN datetime('now') ELSE window_start END`,attemptKey);
      throw problem('Email atau password salah.',401);
    }
    await run(db,'DELETE FROM login_attempts WHERE identifier_hash=?',attemptKey);
    const token=bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    await run(db,`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+12 hours'))`,await sha256(token),user.id);
    await audit(db,user,'USER',user.id,'LOGIN');
    return response({ok:true},200,{'set-cookie':sessionCookie(token,request)});
  }
  if(path==='/api/auth/logout'&&request.method==='POST'){
    const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
    if(token)await run(db,'DELETE FROM sessions WHERE token_hash=?',await sha256(token));
    return response({ok:true},200,{'set-cookie':sessionCookie('',request,true)});
  }
  return null;
}

async function api(request,env,db){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/health'&&request.method==='GET'){
    await row(db,'SELECT 1 AS ok');return response({ok:true,service:'collman',database:'connected'});
  }
  requireSameOrigin(request);
  const publicResult=await authRoutes(request,env,db,path);
  if(publicResult)return publicResult;
  const actor=await getActor(request,db);
  guard(actor,'Sesi tidak valid atau kedaluwarsa.',401);
  if(path==='/api/auth/password' && request.method==='POST'){
    const body=await readBody(request),password=strongPassword(body.new_password);
    const u=await row(db,'SELECT password_hash,password_salt FROM users WHERE id=?',actor.id);
    guard(constantEquals(await hashPassword(String(body.old_password??''),u.password_salt),u.password_hash),'Password lama salah.',403);
    const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    await db.batch([
      db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(await hashPassword(password,salt),salt,actor.id),
      db.prepare('DELETE FROM sessions WHERE user_id=?').bind(actor.id)
    ]);
    await audit(db,actor,'USER',actor.id,'CHANGE_PASSWORD');return response({ok:true,relogin:true},200,{'set-cookie':sessionCookie('',request,true)});
  }
  if(path==='/api/dashboard'&&request.method==='GET'){
    const stats=await all(db,`SELECT status,COUNT(*) AS total FROM assets WHERE tenant_id=? GROUP BY status`,actor.tenant_id);
    const assets=await row(db,`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN a.status='APPROVED' THEN p.market_value ELSE 0 END),0) AS approved_market,
      COALESCE(SUM(CASE WHEN a.status='APPROVED' THEN p.liquidation_value ELSE 0 END),0) AS approved_liquidation
      FROM assets a LEFT JOIN appraisals p ON p.asset_id=a.id AND p.tenant_id=a.tenant_id WHERE a.tenant_id=?`,actor.tenant_id);
    const recent=await all(db,`SELECT a.id,a.reference_no,a.borrower,a.asset_type,a.status,a.updated_at,p.market_value,p.liquidation_value
      FROM assets a LEFT JOIN appraisals p ON p.asset_id=a.id AND p.tenant_id=a.tenant_id WHERE a.tenant_id=? ORDER BY a.updated_at DESC LIMIT 8`,actor.tenant_id);
    return response({assets,statuses:stats,recent});
  }
  if(path==='/api/assets'&&request.method==='GET'){
    const search=(url.searchParams.get('q')||'').slice(0,80),status=url.searchParams.get('status')||'';
    const offset=numberIn(url.searchParams.get('offset')||0,0,1000000,'offset');
    guard(!status||Object.keys(STATUS_LABELS).includes(status),'Filter status tidak valid.');
    const where=`a.tenant_id=? AND (?='' OR a.borrower LIKE ? OR a.reference_no LIKE ? OR a.address LIKE ?) AND (?='' OR a.status=?)`;
    const args=[actor.tenant_id,search,`%${search}%`,`%${search}%`,`%${search}%`,status,status];
    const count=await row(db,`SELECT COUNT(*) AS total FROM assets a WHERE ${where}`,...args);
    const records=await all(db,`SELECT a.id,a.reference_no,a.borrower,a.asset_type,a.address,a.status,a.legal_status,a.updated_at,a.created_by,p.market_value,p.liquidation_value
      FROM assets a LEFT JOIN appraisals p ON p.asset_id=a.id AND p.tenant_id=a.tenant_id WHERE ${where} ORDER BY a.updated_at DESC LIMIT 50 OFFSET ?`,...args,offset);
    return response({records,total:count.total,offset});
  }
  if(path==='/api/assets'&&request.method==='POST'){
    guard(['ADMIN','MAKER'].includes(actor.role),'Hanya Maker atau Admin dapat mencatat agunan.');
    const item=validateAsset(await readBody(request)),id=uuid(),ref=`CM-${new Date().getUTCFullYear()}-${uuid().slice(0,8).toUpperCase()}`;
    await run(db,`INSERT INTO assets (id,tenant_id,reference_no,borrower,asset_type,address,certificate_type,certificate_no,nib,ownership_name,land_area,building_area,legal_status,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,actor.tenant_id,ref,item.borrower,item.asset_type,item.address,item.certificate_type,item.certificate_no,item.nib,item.ownership_name,item.land_area,item.building_area,item.legal_status,item.notes,actor.id);
    await audit(db,actor,'ASSET',id,'CREATE',{reference_no:ref});return response({id,reference_no:ref},201);
  }
  const route=path.match(/^\/api\/assets\/([^/]+)(?:\/(.*))?$/);
  if(route){
    const id=route[1],sub=route[2]||'',asset=await fetchAsset(db,actor,id);
    if(!sub&&request.method==='GET'){
      const appraisal=await row(db,'SELECT * FROM appraisals WHERE tenant_id=? AND asset_id=?',actor.tenant_id,id);
      const comps=await all(db,'SELECT * FROM comparables WHERE tenant_id=? AND asset_id=? ORDER BY created_at DESC',actor.tenant_id,id);
      const history=await all(db,`SELECT w.*,u.display_name AS actor_name FROM workflow_history w JOIN users u ON u.id=w.actor_user_id
        WHERE w.tenant_id=? AND w.asset_id=? ORDER BY w.created_at DESC LIMIT 100`,actor.tenant_id,id);
      return response({asset,appraisal:appraisal?{...appraisal,risk_flags:JSON.parse(appraisal.risk_flags_json)}:null,comparables:comps,history});
    }
    if(!sub&&request.method==='PUT'){
      guard(canEditAsset(actor,asset),'Hanya Maker pemilik tugas dapat mengedit Draft atau Returned.');
      const data=validateAsset(await readBody(request));
      await run(db,`UPDATE assets SET borrower=?,asset_type=?,address=?,certificate_type=?,certificate_no=?,nib=?,ownership_name=?,land_area=?,building_area=?,legal_status=?,notes=?,updated_at=datetime('now')
        WHERE id=? AND tenant_id=?`,data.borrower,data.asset_type,data.address,data.certificate_type,data.certificate_no,data.nib,data.ownership_name,data.land_area,data.building_area,data.legal_status,data.notes,id,actor.tenant_id);
      await audit(db,actor,'ASSET',id,'UPDATE');return response({ok:true});
    }
    if(sub==='appraisal'&&request.method==='PUT'){
      guard(canEditAsset(actor,asset),'Penilaian hanya dapat diubah pada Draft/Returned oleh Maker.');
      const data=await readBody(request),weights=await tenantWeights(db,actor.tenant_id);
      const calc=calculateValuation(data,weights);
      const notes=safeNote(data.notes),date=/^\d{4}-\d{2}-\d{2}$/.test(data.valuation_date||'')?data.valuation_date:new Date().toISOString().slice(0,10);
      await run(db,`INSERT INTO appraisals (id,tenant_id,asset_id,market_value,base_haircut_pct,risk_haircut_pct,total_haircut_pct,liquidation_value,risk_flags_json,valuation_date,notes,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET market_value=excluded.market_value,base_haircut_pct=excluded.base_haircut_pct,
      risk_haircut_pct=excluded.risk_haircut_pct,total_haircut_pct=excluded.total_haircut_pct,liquidation_value=excluded.liquidation_value,
      risk_flags_json=excluded.risk_flags_json,valuation_date=excluded.valuation_date,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=datetime('now')`,
      uuid(),actor.tenant_id,id,calc.market_value,calc.base_haircut_pct,calc.risk_haircut_pct,calc.total_haircut_pct,calc.liquidation_value,JSON.stringify(calc.risk_flags),date,notes,actor.id);
      await run(db,'UPDATE assets SET updated_at=datetime(\'now\') WHERE id=? AND tenant_id=?',id,actor.tenant_id);
      await audit(db,actor,'APPRAISAL',id,'UPSERT',{market_value:calc.market_value,total_haircut_pct:calc.total_haircut_pct,liquidation_value:calc.liquidation_value});
      return response({ok:true,calculation:calc});
    }
    if(sub==='comparables'&&request.method==='POST'){
      guard(canEditAsset(actor,asset),'Tidak memiliki hak mengubah data pembanding.');
      const data=await readBody(request),description=required(data.description,'Deskripsi pembanding',250),address=optional(data.address,500);
      let source=optional(data.source_url,1000);
      if(source){let parsed;try{parsed=new URL(source);}catch{throw problem('URL pembanding tidak valid.');}guard(parsed.protocol==='https:'||parsed.protocol==='http:','URL pembanding harus HTTP(S).');}
      const price=numberIn(data.offering_price,1,9e15,'Harga penawaran');guard(Number.isSafeInteger(price),'Harga pembanding harus bilangan bulat.');
      const land=numberIn(data.land_area??0,0,1e9,'Luas tanah'),building=numberIn(data.building_area??0,0,1e9,'Luas bangunan');
      const cid=uuid();await run(db,`INSERT INTO comparables (id,tenant_id,asset_id,description,address,source_url,offering_price,land_area,building_area,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,cid,actor.tenant_id,id,description,address,source,price,land,building,actor.id);
      await audit(db,actor,'COMPARABLE',cid,'CREATE',{asset_id:id});return response({id:cid},201);
    }
    const cm=sub.match(/^comparables\/([^/]+)$/);
    if(cm&&request.method==='DELETE'){
      guard(canEditAsset(actor,asset),'Tidak memiliki hak menghapus pembanding.');
      const result=await run(db,'DELETE FROM comparables WHERE id=? AND tenant_id=? AND asset_id=?',cm[1],actor.tenant_id,id);
      guard(result.meta.changes>0,'Pembanding tidak ditemukan.',404);
      await audit(db,actor,'COMPARABLE',cm[1],'DELETE',{asset_id:id});return response({ok:true});
    }
    if(sub==='transition'&&request.method==='POST'){
      const data=await readBody(request),action=required(data.action,'Aksi workflow',50),note=safeNote(data.note);
      const next=nextWorkflow(action,asset.status,actor.role,asset.created_by,actor.id);
      if(action==='SUBMIT'){
        guard((actor.role==='ADMIN'||asset.created_by===actor.id),'Hanya Maker pemilik tugas dapat mengirim agunan.');
        guard(asset.legal_status!=='BELUM_DIVERIFIKASI','Status legalitas harus diperiksa sebelum submit.');
        const val=await row(db,'SELECT market_value FROM appraisals WHERE tenant_id=? AND asset_id=?',actor.tenant_id,id);
        guard(val&&val.market_value>0,'Nilai pasar harus diisi sebelum submit.');
      }
      if(action==='RETURN'||action==='REJECT')guard(note.length>=5,'Alasan minimal 5 karakter diperlukan.');
      await db.transaction(async tx=>{
        const update=await tx.prepare(`UPDATE assets SET status=?,updated_at=datetime('now') WHERE id=? AND tenant_id=? AND status=?`).bind(next,id,actor.tenant_id,asset.status).run();
        guard(update.meta.changes===1,'Status berubah. Muat ulang dan coba kembali.',409);
        await tx.prepare('INSERT INTO workflow_history (id,tenant_id,asset_id,action,from_status,to_status,note,actor_user_id) VALUES (?,?,?,?,?,?,?,?)').bind(uuid(),actor.tenant_id,id,action,asset.status,next,note,actor.id).run();
        await tx.prepare('INSERT INTO audit_log (id,tenant_id,entity_type,entity_id,action,actor_user_id,detail_json) VALUES (?,?,?,?,?,?,?)').bind(uuid(),actor.tenant_id,'ASSET',id,action,actor.id,JSON.stringify({from:asset.status,to:next,note})).run();
      });
      return response({ok:true,status:next});
    }
  }
  if(path==='/api/settings'&&request.method==='GET'){
    return response({risk_weights:await tenantWeights(db,actor.tenant_id),risk_flags:RISK_FLAGS,
      notice:'Bobot awal 0%: parameter harus ditetapkan sesuai kebijakan internal; bukan valuasi otomatis atau keputusan kredit.'});
  }
  if(path==='/api/settings'&&request.method==='PUT'){
    guard(actor.role==='ADMIN','Hanya Admin dapat mengubah parameter.');
    const body=await readBody(request),raw=body.risk_weights||{},weights={};
    for(const f of RISK_FLAGS)weights[f]=numberIn(raw[f]??0,0,100,`Bobot ${f}`);
    await run(db,'UPDATE tenant_settings SET risk_weights_json=?,updated_at=datetime(\'now\') WHERE tenant_id=?',JSON.stringify(weights),actor.tenant_id);
    await audit(db,actor,'SETTINGS',actor.tenant_id,'UPDATE_RISK_WEIGHTS',{weights});return response({ok:true,risk_weights:weights});
  }
  if(path==='/api/users'&&request.method==='GET'){
    guard(actor.role==='ADMIN','Hanya Admin dapat melihat pengguna.');
    return response({records:await all(db,'SELECT id,email,display_name,role,active,created_at FROM users WHERE tenant_id=? ORDER BY created_at DESC',actor.tenant_id)});
  }
  if(path==='/api/users'&&request.method==='POST'){
    guard(actor.role==='ADMIN','Hanya Admin dapat membuat pengguna.');
    const body=await readBody(request),email=validEmail(body.email),name=required(body.display_name,'Nama pengguna',150),role=required(body.role,'Peran',50),password=strongPassword(body.password);
    guard(ROLES.includes(role),'Peran tidak dikenal.');
    const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16))),id=uuid();
    try{await run(db,'INSERT INTO users (id,tenant_id,email,display_name,role,password_hash,password_salt) VALUES (?,?,?,?,?,?,?)',id,actor.tenant_id,email,name,role,await hashPassword(password,salt),salt);}
    catch{throw problem('Gagal membuat pengguna. Pastikan email belum digunakan.',409);}
    await audit(db,actor,'USER',id,'CREATE',{email,role});return response({id},201);
  }
  const userRoute=path.match(/^\/api\/users\/([^/]+)$/);
  if(userRoute&&request.method==='PUT'){
    guard(actor.role==='ADMIN','Hanya Admin dapat memperbarui pengguna.');
    const id=userRoute[1],data=await readBody(request),role=required(data.role,'Peran',50);guard(ROLES.includes(role),'Peran tidak dikenal.');
    const active=data.active===true?1:0;
    guard(id!==actor.id || role==='ADMIN'&&active===1,'Admin tidak dapat menonaktifkan atau mengubah perannya sendiri.');
    const update=await run(db,'UPDATE users SET role=?,active=? WHERE id=? AND tenant_id=?',role,active,id,actor.tenant_id);
    guard(update.meta.changes>0,'Pengguna tidak ditemukan.',404);
    if(!active)await run(db,'DELETE FROM sessions WHERE user_id=?',id);
    await audit(db,actor,'USER',id,'UPDATE',{role,active});return response({ok:true});
  }
  if(path==='/api/audit'&&request.method==='GET'){
    guard(['ADMIN','AUDITOR'].includes(actor.role),'Hanya Admin dan Auditor dapat melihat audit trail.');
    const records=await all(db,`SELECT l.entity_type,l.entity_id,l.action,l.detail_json,l.created_at,u.display_name AS actor_name
      FROM audit_log l JOIN users u ON u.id=l.actor_user_id WHERE l.tenant_id=? ORDER BY l.created_at DESC LIMIT 150`,actor.tenant_id);
    return response({records});
  }
  return response({error:'Endpoint tidak ditemukan.'},404);
}

export {api as handleCollManApi};
