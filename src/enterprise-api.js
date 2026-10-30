import {required,optional,problem} from './domain.js';
import {validateModel,priceIndication,backtest,numeric,MODEL_METHODS} from './valuation-engine.js';
import {createHash,randomUUID} from 'node:crypto';
const row=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const rows=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const guard=(ok,msg,status=403)=>{if(!ok)throw problem(msg,status);};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const integer=(x,label)=>{const n=numeric(x,label,1);guard(Number.isSafeInteger(n),label+' harus bulat.',400);return n;};
export async function enterpriseRoutes(request,db,actor,{readBody,audit}){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/api/models'&&method==='GET'){
  const records=await rows(db,'SELECT * FROM valuation_models WHERE tenant_id=? ORDER BY created_at DESC LIMIT 200',actor.tenant_id);
  return response({methods:MODEL_METHODS,records:records.map(m=>({...m,validation:m.validation?{metrics:m.validation.metrics,note:m.validation.note}:null}))});
 }
 if(path==='/api/models'&&method==='POST'){
  guard(actor.role==='ADMIN','Pendaftaran versi model hanya Admin.');const m=validateModel(await readBody(request)),id=randomUUID();
  await db.transaction(async tx=>{
   await run(tx,`INSERT INTO valuation_models(id,tenant_id,name,version,method,category,region,effective_from,effective_to,parameters,methodology_ref,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,id,actor.tenant_id,m.name,m.version,m.method,m.category,m.region,m.effective_from,m.effective_to,JSON.stringify(m.parameters),m.methodology_ref,actor.id);
   await audit(tx,actor,'MODEL',id,'REGISTER_MODEL_VERSION',{name:m.name,version:m.version});
  });return response({id,status:'DRAFT'},201);
 }
 const modelRoute=path.match(/^\/api\/models\/([^/]+)\/(review|approve|suspend)$/);
 if(modelRoute&&method==='POST'){
  const body=await readBody(request),[,id,action]=modelRoute;const ref=required(body.reference,'Referensi keputusan independen',500);
  await db.transaction(async tx=>{
   const m=await row(tx,'SELECT * FROM valuation_models WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,id);
   guard(m,'Model tidak ditemukan.',404);
   if(action==='review'){
    guard(actor.role==='REVIEWER'&&actor.id!==m.created_by,'Validasi wajib Reviewer independen.');
    guard(m.status==='DRAFT','Model sudah direview.',409);
    // References and observations stay tenant-private. These are descriptive metrics, never automatic validation.
    guard(Array.isArray(body.observations)&&body.observations.every(o=>o&&o.category===m.category&&o.region===m.region),'Observasi harus sesuai kategori dan wilayah model.',400);
    const metrics=backtest(body.observations);
    const note=required(body.note,'Kesimpulan validasi dan keterbatasan segmen',2000);
    await run(tx,"UPDATE valuation_models SET status='REVIEWED',reviewed_by=?,review_ref=?,validation=? WHERE id=? AND tenant_id=?",
     actor.id,ref,JSON.stringify({metrics,note,observations:body.observations}),id,actor.tenant_id);
   }else if(action==='approve'){
    guard(actor.role==='APPROVER'&&actor.id!==m.created_by&&actor.id!==m.reviewed_by,'Sign-off model wajib Approver independen.');
    guard(m.status==='REVIEWED','Model belum direview independen.',409);
    await run(tx,"UPDATE valuation_models SET status='VALIDATED',approved_by=?,approval_ref=? WHERE id=? AND tenant_id=?",actor.id,ref,id,actor.tenant_id);
   }else{
    guard(actor.role==='APPROVER'&&m.status==='VALIDATED','Hanya Approver dapat menangguhkan model tervalidasi.');
    await run(tx,"UPDATE valuation_models SET status='SUSPENDED' WHERE id=? AND tenant_id=?",id,actor.tenant_id);
   }
   await audit(tx,actor,'MODEL',id,'MODEL_'+action.toUpperCase(),{reference:ref});
  });return response({ok:true});
 }
 const valuation=path.match(/^\/api\/assets\/([^/]+)\/model-runs$/);
 if(valuation){
  const id=valuation[1];const asset=await row(db,'SELECT * FROM assets WHERE tenant_id=? AND id=?',actor.tenant_id,id);
  guard(asset,'Agunan tidak ditemukan.',404);
  if(method==='GET')return response({records:await rows(db,'SELECT * FROM valuation_runs WHERE tenant_id=? AND asset_id=? ORDER BY created_at DESC LIMIT 100',actor.tenant_id,id)});
  if(method==='POST'){
   guard(actor.role==='MAKER'&&asset.created_by===actor.id||actor.role==='ADMIN','Hanya pembuat / Admin dapat membuat indikasi.');
   const body=await readBody(request),rid=randomUUID();let result;
   await db.transaction(async tx=>{
    const current=await row(tx,'SELECT * FROM assets WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,id);
    guard(['DRAFT','RETURNED'].includes(current.status),'Indikasi hanya pada Draft/Returned.',409);
    const m=await row(tx,'SELECT * FROM valuation_models WHERE tenant_id=? AND id=? FOR SHARE',actor.tenant_id,required(body.model_id,'ID model',100));
    guard(m,'Model tidak ditemukan.',404);guard(m.status!=='SUSPENDED','Model ditangguhkan.',409);
    guard(body.input?.currency===current.currency_code,'Mata uang indikasi harus sama dengan objek.',400);
    const limits={NOMINAL:['blocked_amount','blocked_amount'],GUARANTEE:['confirmed_limit','limit'],GOLD:['grams','weight'],QUOTED:['units',current.category_code==='SECURITIES'?'units':'quantity']};
    const limit=limits[m.method],details=current.collateral_details;
    if(limit&&details[limit[1]]!==undefined)guard(Number(body.input[limit[0]])<=Number(details[limit[1]]),'Kuantitas / nilai melebihi register objek.',400);
    result=priceIndication(m,body.input,{as_of:body.as_of,region:body.region,category:current.category_code});
    const serialized=JSON.stringify(body.input),sha=createHash('sha256').update(serialized).digest('hex');
    await run(tx,'INSERT INTO valuation_runs(id,tenant_id,asset_id,model_id,as_of,input,result,input_sha256,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
     rid,actor.tenant_id,id,m.id,body.as_of,serialized,JSON.stringify(result),sha,actor.id);
    await audit(tx,actor,'VALUATION_RUN',rid,'CALCULATE_INDICATION',{asset_id:id,model_id:m.id,input_sha256:sha});
   });return response({id:rid,result,notice:'Indikasi tersimpan terpisah. Tidak menerbitkan final appraisal atau persetujuan otomatis.'},201);
  }
 }
 if(path==='/api/facilities'&&method==='GET'){
  const q='%'+optional(url.searchParams.get('q'),80)+'%';
  const records=await rows(db,`SELECT f.*,COALESCE(SUM(CASE WHEN a.status IN ('ACTIVE','RELEASE_PENDING') THEN a.amount_idr ELSE 0 END),0) AS allocated_idr
    FROM facilities f LEFT JOIN collateral_allocations a ON a.tenant_id=f.tenant_id AND a.facility_id=f.id
    WHERE f.tenant_id=? AND (f.reference_no ILIKE ? OR f.borrower_ref ILIKE ?) GROUP BY f.id ORDER BY f.created_at DESC LIMIT 200`,actor.tenant_id,q,q);
  return response({records:records.map(r=>({...r,coverage_pct:Number(r.allocated_idr)/r.exposure_idr*100,ltv_pct:Number(r.allocated_idr)>0?r.exposure_idr/Number(r.allocated_idr)*100:null,regulatory_value:null}))});
 }
 if(path==='/api/facilities'&&method==='POST'){
  guard(['ADMIN','MAKER'].includes(actor.role),'Hanya Maker/Admin dapat mencatat fasilitas.');
  const body=await readBody(request),id=randomUUID(),ref=required(body.reference_no,'Referensi fasilitas',100),borrower=required(body.borrower_ref,'Referensi debitur',200),branch=required(body.branch_code,'Cabang',80),exposure=integer(body.exposure_idr,'Exposure IDR');
  await db.transaction(async tx=>{
   await run(tx,'INSERT INTO facilities(id,tenant_id,reference_no,borrower_ref,branch_code,exposure_idr,created_by) VALUES(?,?,?,?,?,?,?)',id,actor.tenant_id,ref,borrower,branch,exposure,actor.id);
   await audit(tx,actor,'FACILITY',id,'CREATE_FACILITY',{reference_no:ref});
  });return response({id},201);
 }
 const facility=path.match(/^\/api\/facilities\/([^/]+)$/);
 if(facility&&method==='PUT'){
  guard(['ADMIN','MAKER'].includes(actor.role),'Peran tidak dapat mengubah fasilitas.');
  const body=await readBody(request),exposure=integer(body.exposure_idr,'Exposure IDR');
  await db.transaction(async tx=>{
   const f=await row(tx,'SELECT * FROM facilities WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,facility[1]);
   guard(f,'Fasilitas tidak ditemukan.',404);guard(actor.role==='ADMIN'||f.created_by===actor.id,'Hanya pemilik fasilitas.');
   guard(f.status==='ACTIVE','Fasilitas sudah ditutup.',409);
   await run(tx,'UPDATE facilities SET exposure_idr=? WHERE tenant_id=? AND id=?',exposure,actor.tenant_id,f.id);
   await audit(tx,actor,'FACILITY',f.id,'UPDATE_EXPOSURE',{before:f.exposure_idr,after:exposure});
  });return response({ok:true});
 }
 if(path==='/api/allocations'&&method==='GET')return response({records:await rows(db,`SELECT c.*,a.reference_no AS collateral_reference,f.reference_no AS facility_reference
  FROM collateral_allocations c JOIN assets a ON a.id=c.asset_id AND a.tenant_id=c.tenant_id
  JOIN facilities f ON f.id=c.facility_id AND f.tenant_id=c.tenant_id WHERE c.tenant_id=? ORDER BY c.created_at DESC LIMIT 300`,actor.tenant_id)});
 if(path==='/api/allocations'&&method==='POST'){
  guard(['ADMIN','MAKER'].includes(actor.role),'Alokasi diajukan Maker/Admin.');
  const b=await readBody(request),id=randomUUID(),assetId=required(b.asset_id,'Agunan',100),facilityId=required(b.facility_id,'Fasilitas',100),amount=integer(b.amount_idr,'Alokasi IDR'),ref=required(b.basis_ref,'Dasar pengajuan / hubungan debitur',1000);
  await db.transaction(async tx=>{
   const a=await row(tx,'SELECT id FROM assets WHERE tenant_id=? AND id=?',actor.tenant_id,assetId),f=await row(tx,"SELECT id FROM facilities WHERE tenant_id=? AND id=? AND status='ACTIVE'",actor.tenant_id,facilityId);
   guard(a&&f,'Agunan / fasilitas tidak ditemukan.',404);
   await run(tx,'INSERT INTO collateral_allocations(id,tenant_id,asset_id,facility_id,amount_idr,basis_ref,created_by) VALUES(?,?,?,?,?,?,?)',id,actor.tenant_id,assetId,facilityId,amount,ref,actor.id);
   await audit(tx,actor,'ALLOCATION',id,'REQUEST_ALLOCATION',{asset_id:assetId,facility_id:facilityId,amount_idr:amount});
  });return response({id,status:'PENDING'},201);
 }
 const allocation=path.match(/^\/api\/allocations\/([^/]+)\/(approve|reject|request-release|approve-release)$/);
 if(allocation&&method==='POST'){
  const b=await readBody(request),[,id,action]=allocation;
  await db.transaction(async tx=>{
   const c=await row(tx,'SELECT * FROM collateral_allocations WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,id);
   guard(c,'Alokasi tidak ditemukan.',404);
   const a=await row(tx,'SELECT * FROM assets WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,c.asset_id);
   const f=await row(tx,'SELECT * FROM facilities WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,c.facility_id);
   if(action==='approve'||action==='reject'){
    guard(actor.role==='APPROVER'&&actor.id!==c.created_by&&actor.id!==a.created_by,'Approver wajib berbeda dari Maker pengajuan dan agunan.');
    guard(c.status==='PENDING'&&f.status==='ACTIVE','Status alokasi / fasilitas berubah.',409);
    if(action==='approve'){
     guard(a.status==='APPROVED'&&a.collateral_kind==='ASSET'&&a.security_status==='PERFECTED'&&a.eligibility_status==='ELIGIBLE','Agunan belum layak dialokasikan.',400);
     const val=await row(tx,'SELECT liquidation_value,bank_accepted_value FROM appraisals WHERE tenant_id=? AND asset_id=?',actor.tenant_id,a.id);
     guard(val?.bank_accepted_value!=null,'Nilai diterima bank belum ditetapkan melalui kajian independen.',400);
     const total=await row(tx,"SELECT COALESCE(SUM(amount_idr),0) AS amount FROM collateral_allocations WHERE tenant_id=? AND asset_id=? AND status IN ('ACTIVE','RELEASE_PENDING')",actor.tenant_id,a.id);
     guard(Number(total.amount)+c.amount_idr<=Math.min(val.bank_accepted_value,val.liquidation_value),'Nilai agunan telah terpakai; alokasi melebihi batas bank.',409);
    }
    await run(tx,'UPDATE collateral_allocations SET status=?,approved_by=? WHERE tenant_id=? AND id=?',action==='approve'?'ACTIVE':'REJECTED',actor.id,actor.tenant_id,id);
   }else if(action==='request-release'){
    guard(['MAKER','ADMIN'].includes(actor.role)&&c.status==='ACTIVE','Pelepasan hanya untuk alokasi aktif oleh Maker/Admin.');
    await run(tx,"UPDATE collateral_allocations SET status='RELEASE_PENDING',release_requested_by=?,release_reason=? WHERE tenant_id=? AND id=?",actor.id,required(b.reason,'Alasan pelepasan',1000),actor.tenant_id,id);
   }else{
    guard(actor.role==='APPROVER'&&actor.id!==c.release_requested_by&&c.status==='RELEASE_PENDING','Pelepasan wajib persetujuan independen.');
    required(b.reason,'Dasar persetujuan pelepasan',1000);
    await run(tx,"UPDATE collateral_allocations SET status='RELEASED',release_approved_by=? WHERE tenant_id=? AND id=?",actor.id,actor.tenant_id,id);
   }
   await audit(tx,actor,'ALLOCATION',id,action.toUpperCase().replaceAll('-','_'),{reason:optional(b.reason,1000)});
  });return response({ok:true});
 }
 return null;
}
