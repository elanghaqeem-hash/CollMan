/** CIIS operational tasks for the PostgreSQL-backed CollMan application.
 * All writes use asset row locks and tenant-scoped FKs. The task lane does NOT
 * bypass the existing Maker/Checker/Reviewer/Approver approval workflow.
 */
import {problem,required} from './domain.js';
import {TASK_LANES,taskStage,taskSla,taskLaneAfterTransition,canReceiveTask,parseInspectionDate,inspectionDeadline,todayWIB} from './task-rules.js';

const result=(json,status=200)=>new Response(JSON.stringify(json),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const must=(ok,message,status=403)=>{if(!ok)throw problem(message,status);};
const row=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
async function audit(db,actor,assetId,action,detail={}){
 await run(db,'INSERT INTO audit_log (id,tenant_id,entity_type,entity_id,action,actor_user_id,detail_json) VALUES (?,?,?,?,?,?,?)',
  crypto.randomUUID(),actor.tenant_id,'TASK',assetId,action,actor.id,JSON.stringify(detail));
}
async function data(request){
 must(request.headers.get('content-type')?.toLowerCase().startsWith('application/json'),'Content-Type JSON diperlukan.',415);
 const str=await request.text();must(str.length<=4096,'Payload terlalu besar.',413);
 let value;try{value=JSON.parse(str)}catch{throw problem('JSON tidak valid.');}
 must(value && typeof value==='object'&&!Array.isArray(value),'Object diperlukan.',400);return value;
}
async function lockedTask(db,actor,id){
 const asset=await row(db,'SELECT * FROM assets WHERE tenant_id=? AND id=? FOR UPDATE',actor.tenant_id,id);
 must(asset,'Agunan tidak ditemukan.',404);
 if(!taskStage(asset.status))return {asset,task:null};
 await run(db,`INSERT INTO task_state(asset_id,tenant_id,stage_status,lane,updated_by)
   VALUES (?,?,?,?,?) ON CONFLICT (asset_id) DO NOTHING`,id,actor.tenant_id,asset.status,'OPEN',actor.id);
 const task=await row(db,'SELECT * FROM task_state WHERE tenant_id=? AND asset_id=? FOR UPDATE',actor.tenant_id,id);
 must(task.stage_status===asset.status,'Posisi task berubah; muat ulang.',409);
 return {asset,task};
}
export async function moveTaskAfterWorkflow(tx,actor,assetId,nextStatus){
 await run(tx,`INSERT INTO task_state(asset_id,tenant_id,stage_status,lane,assigned_to,received_by,started_by,updated_by)
  VALUES (?,?,?,?,NULL,NULL,NULL,?)
  ON CONFLICT(asset_id) DO UPDATE SET stage_status=excluded.stage_status,lane=excluded.lane,
    assigned_to=NULL,received_by=NULL,started_by=NULL,updated_by=excluded.updated_by,
    updated_at=datetime('now')`,assetId,actor.tenant_id,nextStatus,taskLaneAfterTransition(nextStatus),actor.id);
}
export async function taskRoutes(request,db,actor,path,url){
 if(path==='/api/tasks'&&request.method==='GET'){
  const lane=url.searchParams.get('lane')||'';
  must(!lane||TASK_LANES.includes(lane),'Filter lane tidak dikenal.',400);
  const scope=url.searchParams.get('scope')||(['ADMIN','AUDITOR'].includes(actor.role)?'all':'mine');
  must(['all','mine'].includes(scope),'Filter scope salah.',400);
  must(scope!=='all'||['ADMIN','AUDITOR'].includes(actor.role),'Tidak berwenang melihat seluruh task.');
  const offset=Number(url.searchParams.get('offset')||0);
  must(Number.isSafeInteger(offset)&&offset>=0&&offset<=100000,'Offset tidak valid.',400);
  const conditions=['a.tenant_id=?'],params=[actor.tenant_id];
  if(scope==='mine'){
    if(actor.role==='MAKER'){conditions.push("a.status IN ('DRAFT','RETURNED') AND a.created_by=?");params.push(actor.id);}
    else if(actor.role==='CHECKER'||actor.role==='REVIEWER'||actor.role==='APPROVER'){
      conditions.push('a.status=? AND a.created_by<>? AND (t.assigned_to IS NULL OR t.assigned_to=?)');
      params.push(actor.role==='CHECKER'?'SUBMITTED':actor.role==='REVIEWER'?'REVIEWED':'RECOMMENDED',actor.id,actor.id);
    }else if(!['ADMIN','AUDITOR'].includes(actor.role))throw problem('Peran tidak dikenal.',403);
  }
  const effectiveLane="COALESCE(t.lane,CASE WHEN a.status IN ('APPROVED','REJECTED') THEN 'FINISHED' ELSE 'OPEN' END)";
  if(lane){conditions.push(effectiveLane+'=?');params.push(lane);}
  const where=conditions.join(' AND ');
  const total=await row(db,`SELECT COUNT(*) AS total FROM assets a
    LEFT JOIN task_state t ON t.asset_id=a.id AND t.tenant_id=a.tenant_id WHERE ${where}`,...params);
  const records=await all(db,`SELECT a.id,a.reference_no,a.borrower,a.asset_type,a.status,a.created_by,
    a.updated_at,${effectiveLane} AS lane,t.assigned_to,t.received_by,t.started_by,
    t.inspection_date,t.due_date,t.stage_status,
    u.display_name AS assigned_name
    FROM assets a LEFT JOIN task_state t ON t.asset_id=a.id AND t.tenant_id=a.tenant_id
    LEFT JOIN users u ON u.id=t.assigned_to AND u.tenant_id=t.tenant_id
    WHERE ${where} ORDER BY a.updated_at DESC LIMIT 50 OFFSET ?`,...params,offset);
  const today=todayWIB();
  return result({records:records.map(x=>({...x,role_owner:taskStage(x.status),sla:taskSla(x.due_date,today)})),total:total.total,offset,
   sla_policy:'2 weekdays following completed inspection; national/public holidays not yet configured. No automatic due date before completed inspection.'});
 }
 const match=path.match(/^\/api\/tasks\/([^/]+)\/(receive|start|inspection|assign)$/);
 if(!match||!['POST','PUT'].includes(request.method))return null;
 const [,id,operation]=match;
 must(request.method===(operation==='inspection'?'PUT':'POST'),'HTTP method tidak sesuai.',405);
 const input=operation==='inspection'||operation==='assign'?await data(request):null;
 return db.transaction(async tx=>{
  const {asset,task}=await lockedTask(tx,actor,id);
  must(task,'Task sudah selesai.',409);
  if(operation==='receive'){
   must(task.lane==='OPEN','Task tidak dalam Open Task.',409);
   must(canReceiveTask(actor,asset,task.assigned_to),'Task tidak boleh diterima oleh pengguna ini.');
   const updated=await run(tx,`UPDATE task_state SET lane='WAITING',received_by=?,assigned_to=?,
    updated_by=?,updated_at=datetime('now') WHERE asset_id=? AND tenant_id=? AND stage_status=? AND lane='OPEN'`,
    actor.id,actor.id,actor.id,id,actor.tenant_id,asset.status);
   must(updated.meta.changes===1,'Task telah diterima pihak lain.',409);
   await audit(tx,actor,id,'TASK_RECEIVE',{stage:asset.status});
   return result({ok:true,lane:'WAITING'});
  }
  if(operation==='start'){
   must(task.lane==='WAITING','Task harus diterima dahulu.',409);
   must(task.received_by===actor.id,'Hanya penerima task yang dapat memulai.');
   must(canReceiveTask(actor,asset,task.assigned_to),'Penerima tidak sesuai peran atau tenant.');
   const updated=await run(tx,`UPDATE task_state SET lane='ONGOING',started_by=?,updated_by=?,
    updated_at=datetime('now') WHERE asset_id=? AND tenant_id=? AND stage_status=? AND lane='WAITING'`,
    actor.id,actor.id,id,actor.tenant_id,asset.status);
   must(updated.meta.changes===1,'Task sudah berubah.',409);
   await audit(tx,actor,id,'TASK_START',{stage:asset.status});
   return result({ok:true,lane:'ONGOING'});
  }
  if(operation==='inspection'){
   must(actor.id===asset.created_by && actor.role==='MAKER' || actor.role==='ADMIN' && actor.id===asset.created_by,
     'Hanya Maker pembuat task yang mencatat inspeksi selesai.');
   must(['DRAFT','RETURNED'].includes(asset.status),'Tanggal inspeksi hanya dapat direkam sebelum submit.');
   must(!task.inspection_date,'Tanggal inspeksi sudah dicatat, tidak dapat direset.',409);
   must(task.lane==='ONGOING','Penyelesaian inspeksi memerlukan task Ongoing.',409);
   const date=required(input.date,'Tanggal inspeksi',10);
   parseInspectionDate(date);
   const due=inspectionDeadline(date);
   await run(tx,`UPDATE task_state SET inspection_date=?,due_date=?,updated_by=?,
    updated_at=datetime('now') WHERE asset_id=? AND tenant_id=? AND inspection_date IS NULL`,
    date,due,actor.id,id,actor.tenant_id);
   await audit(tx,actor,id,'INSPECTION_COMPLETED',{date,due_date:due,calendar:'weekdays_only'});
   return result({ok:true,inspection_date:date,due_date:due,calendar:'weekdays_only'});
  }
  if(operation==='assign'){
   must(actor.role==='ADMIN','Penugasan saat ini khusus Admin.');
   must(task.lane==='OPEN','Penugasan hanya untuk Open Task.',409);
   const userId=required(input.user_id,'Pengguna',100);
   const target=await row(tx,'SELECT id,role,active FROM users WHERE tenant_id=? AND id=?',actor.tenant_id,userId);
   const expected=taskStage(asset.status);
   must(target && target.active===1 && target.role===expected,'User tujuan harus aktif dan sesuai peran/tenant.');
   must(userId!==asset.created_by || expected==='MAKER','Maker tidak boleh menjadi reviewer.');
   must(expected!=='MAKER'||userId===asset.created_by,'Task Maker hanya boleh diberikan kepada pembuat.');
   await run(tx,`UPDATE task_state SET assigned_to=?,updated_by=?,
    updated_at=datetime('now') WHERE tenant_id=? AND asset_id=? AND lane='OPEN'`,
    userId,actor.id,actor.tenant_id,id);
   await audit(tx,actor,id,'TASK_ASSIGN',{stage:asset.status,user_id:userId});
   return result({ok:true,assigned_to:userId});
  }
  return null;
 });
}
