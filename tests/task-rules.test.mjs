import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionDeadline,taskStage,taskLaneAfterTransition,canReceiveTask,taskSla} from '../src/task-rules.js';
test('two business days after inspection, not after asset creation',()=>{
 assert.equal(inspectionDeadline('2026-10-30'),'2026-11-03'); // Friday -> Tuesday
 assert.equal(inspectionDeadline('2026-10-29'),'2026-11-02'); // Thursday -> Monday
 assert.equal(inspectionDeadline('2026-10-29',['2026-11-02']),'2026-11-03');
 assert.throws(()=>inspectionDeadline('2026-02-30'));
 assert.throws(()=>inspectionDeadline('2099-01-01'));
});
test('operational stages preserve maker-checker-reviewer-approver workflow',()=>{
 assert.equal(taskStage('DRAFT'),'MAKER');
 assert.equal(taskStage('SUBMITTED'),'CHECKER');
 assert.equal(taskStage('REVIEWED'),'REVIEWER');
 assert.equal(taskStage('RECOMMENDED'),'APPROVER');
 assert.equal(taskLaneAfterTransition('RETURNED'),'OPEN');
 assert.equal(taskLaneAfterTransition('APPROVED'),'FINISHED');
 assert.equal(taskStage('REJECTED'),null);
});
test('task receipt respects tenant, assignee and maker segregation',()=>{
 const asset={tenant_id:'T1',created_by:'maker1',status:'SUBMITTED'};
 const checker={tenant_id:'T1',id:'checker1',role:'CHECKER'};
 assert.equal(canReceiveTask(checker,asset,null),true);
 assert.equal(canReceiveTask({...checker,id:'checker2'},asset,'checker1'),false);
 assert.equal(canReceiveTask({...checker,tenant_id:'T2'},asset,null),false);
 assert.equal(canReceiveTask({...checker,id:'maker1'},asset,null),false);
 assert.equal(canReceiveTask({...checker,role:'AUDITOR'},asset,null),false);
 assert.equal(canReceiveTask({id:'maker1',tenant_id:'T1',role:'MAKER'},{...asset,status:'RETURNED'},null),true);
 assert.equal(canReceiveTask({...checker,role:'MAKER'}, {...asset,status:'DRAFT'},null),false);
});
test('SLA overdues only when an inspection completion date exists',()=>{
 assert.equal(taskSla(null,'2026-11-04'),'NOT_STARTED');
 assert.equal(taskSla('2026-11-03','2026-11-03'),'DUE_TODAY');
 assert.equal(taskSla('2026-11-03','2026-11-04'),'OVERDUE');
});
