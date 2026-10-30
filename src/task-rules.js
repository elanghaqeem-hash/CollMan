/** Operational task semantics adapted from CIIS BRD pages 8-10.
 * Two business days after an actually completed inspection: Mon-Fri only.
 * Indonesian public holidays require an approved institutional calendar later.
 * Never infer inspection completion from asset creation.
 */
import {problem} from './domain.js';
export const TASK_LANES=Object.freeze(['OPEN','WAITING','ONGOING','FINISHED']);
export const TASK_ROLE_BY_STATUS=Object.freeze({
 DRAFT:'MAKER',RETURNED:'MAKER',SUBMITTED:'CHECKER',REVIEWED:'REVIEWER',
 RECOMMENDED:'APPROVER',APPROVED:null,REJECTED:null
});
const ISO=/^\d{4}-\d{2}-\d{2}$/;
export function parseInspectionDate(date){
 if(typeof date!=='string'||!ISO.test(date))throw problem('Tanggal inspeksi wajib YYYY-MM-DD.');
 const d=new Date(date+'T00:00:00.000Z');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==date)throw problem('Tanggal inspeksi tidak valid.');
 if(d.getTime()>Date.now())throw problem('Tanggal inspeksi selesai tidak boleh di masa depan.');
 return d;
}
export function inspectionDeadline(date,excludedDates=[]){
 const start=parseInspectionDate(date);
 if(!Array.isArray(excludedDates)||excludedDates.length>500||
   excludedDates.some(x=>typeof x!=='string'||!ISO.test(x)))throw problem('Kalender hari libur tidak valid.');
 const skip=new Set(excludedDates);
 let n=0;
 while(n<2){
  start.setUTCDate(start.getUTCDate()+1);
  const day=start.getUTCDay(),iso=start.toISOString().slice(0,10);
  if(day!==0&&day!==6&&!skip.has(iso))n++;
 }
 return start.toISOString().slice(0,10);
}
export function taskStage(status){
 if(!Object.prototype.hasOwnProperty.call(TASK_ROLE_BY_STATUS,status))throw problem('Status agunan tidak valid.');
 return TASK_ROLE_BY_STATUS[status];
}
export function canReceiveTask(actor,asset,assignedTo){
 const requiredRole=taskStage(asset.status);
 return Boolean(requiredRole && actor.tenant_id===asset.tenant_id &&
  ((actor.role===requiredRole)||(actor.role==='ADMIN')) &&
  (!assignedTo || assignedTo===actor.id) &&
  (requiredRole!=='MAKER'||actor.id===asset.created_by) &&
  (!['CHECKER','REVIEWER','APPROVER'].includes(requiredRole)||asset.created_by!==actor.id));
}
export function taskSla(dueDate,currentDate){
 if(!dueDate)return 'NOT_STARTED';
 if(!ISO.test(dueDate)||!ISO.test(currentDate))throw problem('Tanggal SLA tidak valid.');
 return currentDate>dueDate?'OVERDUE':currentDate===dueDate?'DUE_TODAY':'ON_TRACK';
}
export function taskLaneAfterTransition(next){return taskStage(next)?'OPEN':'FINISHED';}
