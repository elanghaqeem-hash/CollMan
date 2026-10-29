import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateValuation,validateAsset,nextWorkflow,normalizeRiskFlags} from '../src/domain.js';
const sample={borrower:'PT Contoh',asset_type:'Ruko',address:'Jalan contoh',land_area:120,building_area:200};
test('asset record validates and normalizes',()=>{
 const a=validateAsset(sample); assert.equal(a.legal_status,'BELUM_DIVERIFIKASI'); assert.equal(a.land_area,120);
 assert.throws(()=>validateAsset({...sample,asset_type:'????'}));
});
test('liquidation uses user parameters, not hardcoded bank policy',()=>{
 const x=calculateValuation({market_value:1000000000,base_haircut_pct:20,risk_flags:{banjir:true}}, {banjir:5});
 assert.equal(x.liquidation_value,750000000);assert.equal(x.risk_haircut_pct,5);
});
test('haircut never makes liquidation value negative',()=>{
 const x=calculateValuation({market_value:500000,base_haircut_pct:80,risk_flags:{banjir:true}}, {banjir:60});
 assert.equal(x.liquidation_value,0);assert.equal(x.total_haircut_pct,100);
});
test('risk flags ignore unknown inputs',()=>assert.deepEqual(Object.keys(normalizeRiskFlags({unknown:true})).includes('unknown'),false));
test('maker cannot approve own property, even if assigned approver role',()=>{
 assert.throws(()=>nextWorkflow('APPROVE','RECOMMENDED','APPROVER','user1','user1'),/Segregation/);
 assert.equal(nextWorkflow('APPROVE','RECOMMENDED','APPROVER','user1','user2'),'APPROVED');
});
test('workflow order prevents jumping steps',()=>{
 assert.throws(()=>nextWorkflow('APPROVE','DRAFT','APPROVER','a','b'));
 assert.equal(nextWorkflow('SUBMIT','DRAFT','MAKER','a','a'),'SUBMITTED');
 assert.equal(nextWorkflow('CHECK','SUBMITTED','CHECKER','a','b'),'REVIEWED');
});
