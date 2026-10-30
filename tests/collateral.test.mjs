import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPS,BUILTIN_TYPES,catalogTypes} from '../public/collateral-catalog.js';
import {validateCollateralAsset,validateCatalog,submissionIssues,calculateCollateralValuation,validDate} from '../src/collateral.js';
import {completeAsset,valuationInput} from './collateral-fixtures.mjs';
import {findCollateralTypes,universalAssetForm,typeOptions} from '../public/collateral-ui.js';

test('every built-in type round trips, has a usable form schema and only applicable valuation methods',()=>{
 assert.equal(GROUPS.length,16);assert.ok(BUILTIN_TYPES.length>70);
 for(const type of BUILTIN_TYPES){const data=validateCollateralAsset(completeAsset(type.name));assert.equal(data.category_code,type.group);assert.deepEqual(submissionIssues(data),[]);const group=GROUPS.find(g=>g.code===type.group);for(const method of group.methods){const v=calculateCollateralValuation(valuationInput(method),data,BUILTIN_TYPES);assert.ok(v.market_value>0);assert.ok(v.liquidation_value<=v.market_value);}}
});
test('drafts can be incomplete; submissions require legal, attributes and verified unexpired references',()=>{
 const draft=validateCollateralAsset({borrower:'Example',asset_type:'Deposito',address:'Custodian'});
 assert.ok(submissionIssues(draft).length>5);
 const asset=validateCollateralAsset(completeAsset('Deposito'));
 asset.legal_status='TIDAK_SESUAI';asset.document_checklist.balance.expires_on='2020-01-01';asset.collateral_details.maturity_date='2020-01-01';asset.collateral_details.blocked_amount=101;
 assert.match(submissionIssues(asset).join(' '),/Legalitas/);assert.match(submissionIssues(asset).join(' '),/kedaluwarsa/);assert.match(submissionIssues(asset).join(' '),/saldo/);
});
test('exact nominal, quotes, cost, receivable and FX calculations; no universal property haircut',()=>{
 const deposit=validateCollateralAsset(completeAsset('Deposito'));
 assert.equal(calculateCollateralValuation(valuationInput('NOMINAL'),deposit,BUILTIN_TYPES).liquidation_value,90);
 const machine=validateCollateralAsset(completeAsset('Alat Berat'));
 assert.equal(calculateCollateralValuation(valuationInput('COST'),machine,BUILTIN_TYPES).market_value,800);
 const invoice=validateCollateralAsset(completeAsset('Invoice'));
 assert.equal(calculateCollateralValuation(valuationInput('RECEIVABLE'),invoice,BUILTIN_TYPES).market_value,80);
 const gold=validateCollateralAsset({...completeAsset('Emas Batangan'),currency_code:'USD'});
 const v=calculateCollateralValuation(valuationInput('QUOTED',{valuation_inputs:{currency:'USD',quantity:2,unit_price:10,fx_rate:15000},base_haircut_pct:0}),gold,BUILTIN_TYPES);
 assert.equal(v.market_value,300000);assert.equal(v.liquidation_value,300000);
});
test('invalid methods, stale property flags, invented fields, missing references and unsafe values are rejected',()=>{
 const car=validateCollateralAsset(completeAsset('Mobil'));
 for(const data of [valuationInput('NOMINAL'),valuationInput('MANUAL_MARKET',{risk_flags:{banjir:true}}),valuationInput('MANUAL_MARKET',{valuation_reference:''}),valuationInput('COST',{valuation_inputs:{replacement_cost:9e15,depreciation_pct:0,currency:'USD',fx_rate:1e9}})])assert.throws(()=>calculateCollateralValuation(data,car,BUILTIN_TYPES));
 assert.throws(()=>validateCollateralAsset({...completeAsset('Mobil'),collateral_details:{land_area:9}}));
 assert.throws(()=>validDate('2026-02-30','Date'));
 const nominal=validateCollateralAsset(completeAsset('Deposito'));
 assert.throws(()=>calculateCollateralValuation(valuationInput('NOMINAL',{valuation_inputs:{amount:101}}),nominal,BUILTIN_TYPES),/terblokir/);
});
test('tenant-specific additional types inherit category and cannot spoof kind, schemas or policy',()=>{
 const config=validateCatalog({custom_types:[{code:'CUSTOM_TRACTOR',name:'Traktor Pertanian',group:'MACHINERY',kind:'GUARANTEE'}],policies:{PROPERTY_1:{enabled:false,policy:'BLOCKED'}}});
 const types=catalogTypes(config);assert.equal(types.find(t=>t.name==='Traktor Pertanian').kind,'ASSET');
 assert.deepEqual(submissionIssues(validateCollateralAsset(completeAsset('Traktor Pertanian',types),types),types),[]);
 assert.throws(()=>validateCollateralAsset(completeAsset('Tanah Kosong'),types),/dinonaktifkan/);
 assert.throws(()=>validateCatalog({custom_types:[{code:'CUSTOM_X',name:'Ruko',group:'PROPERTY'}]}),/duplikat/);
 assert.throws(()=>validateCatalog({policies:{PROPERTY_1:{enabled:true,policy:'AUTO_APPROVE'}}}));
});
test('non-property objects have no artificial land or building area; guarantees remain distinct',()=>{
 const a=validateCollateralAsset({...completeAsset('Corporate Guarantee'),land_area:500});assert.equal(a.land_area,0);assert.equal(a.collateral_kind,'GUARANTEE');
 const property=validateCollateralAsset({borrower:'Historic',asset_type:'Ruko',address:'A',certificate_no:'ABC',certificate_type:'SHM',land_area:120});assert.equal(property.collateral_details.title_no,'ABC');assert.equal(property.land_area,120);
});

test('searchable collateral picker covers 16 categories without offering blocked types',()=>{
 assert.equal(GROUPS.length,16);
 const html=universalAssetForm({},BUILTIN_TYPES);
 assert.match(html,/id="asset-type-search"/);
 assert.match(html,/id="asset-type-results"/);
 for(const name of ['Tanah Kosong','Deposito','Emas Batangan','Mobil','Invoice','Resi Gudang','Personal Guarantee','Pesawat Udara']){
  const result=findCollateralTypes(BUILTIN_TYPES,name);
  assert.ok(result.some(x=>x.name===name),name);
 }
 assert.ok(findCollateralTypes(BUILTIN_TYPES,'surat berharga').some(x=>x.name==='Saham'));
 assert.deepEqual(findCollateralTypes(BUILTIN_TYPES,'a'),[]);
 const disabled=BUILTIN_TYPES.map(x=>x.name==='Mobil'?{...x,enabled:false}:x);
 assert.ok(!findCollateralTypes(disabled,'mobil').some(x=>x.name==='Mobil'));
 const blocked=BUILTIN_TYPES.map(x=>x.name==='Deposito'?{...x,policy:'BLOCKED'}:x);
 assert.ok(!findCollateralTypes(blocked,'deposito').some(x=>x.name==='Deposito'));
 const property=typeOptions(BUILTIN_TYPES,'','PROPERTY');
 assert.match(property,/Tanah Kosong/);
 assert.doesNotMatch(property,/Deposito/);
});
