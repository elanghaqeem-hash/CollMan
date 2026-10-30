import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPS,BUILTIN_TYPES} from '../public/collateral-catalog.js';
import {collateralCategories,collateralTypes,groupForType,typesInGroup,searchCollateralTypes} from '../public/collateral-picker.js';
import {validateAsset,TYPES} from '../src/domain.js';

const legacy=['Tanah Kosong','Rumah Tinggal','Ruko','Gudang','Pabrik','Kios','Apartemen','Lainnya'];
const sample={borrower:'Bank Test Synthetic',address:'Lokasi penyimpanan UAT',land_area:0,building_area:0};
test('One catalog is shared by UI and server; all legacy types remain valid',()=>{
 assert.equal(GROUPS.length,16);
 assert.equal(collateralCategories.length,16);
 assert.ok(BUILTIN_TYPES.length>=70);
 assert.equal(collateralTypes.length,BUILTIN_TYPES.length);
 assert.deepEqual(new Set(TYPES),new Set(BUILTIN_TYPES.map(t=>t.name)));
 assert.equal(new Set(BUILTIN_TYPES.map(t=>t.name)).size,BUILTIN_TYPES.length,'type names must be unique');
 for(const t of legacy){
  assert.ok(TYPES.includes(t),t+' must remain valid');
  assert.equal(validateAsset({...sample,asset_type:t}).asset_type,t);
 }
});
test('Every group has selection options and back-end accepts records in all groups',()=>{
 for(const group of GROUPS){
  const choices=typesInGroup(group.code);
  assert.ok(choices.length>0,group.code);
  const first=choices[0];
  assert.equal(groupForType(first.name),group.code);
  const record=validateAsset({...sample,asset_type:first.name});
  assert.equal(record.legal_status,'BELUM_DIVERIFIKASI');
  assert.equal(record.asset_type,first.name);
 }
});
test('Search is case-insensitive, category aware and requires minimum 2 characters',()=>{
 assert.deepEqual(searchCollateralTypes('d'),[]);
 assert.ok(searchCollateralTypes('DEPOSITO').some(t=>t.name==='Deposito'&&t.group==='CASH'));
 assert.ok(searchCollateralTypes('kendaraan').some(t=>t.group==='VEHICLE'));
 assert.ok(searchCollateralTypes('piutang').some(t=>t.group==='RECEIVABLE'));
 assert.ok(searchCollateralTypes('emas').some(t=>t.name.includes('Emas')));
 assert.ok(searchCollateralTypes('properti').some(t=>t.group==='PROPERTY'));
 assert.ok(searchCollateralTypes('a',100).length===0);
 assert.ok(searchCollateralTypes('an',100).length<=50);
});
test('Unregistered types remain blocked by server; form alone never implies eligible',()=>{
 assert.throws(()=>validateAsset({...sample,asset_type:'Jenis yang tidak ada'}),/tidak dikenal/);
 assert.equal(validateAsset({...sample,asset_type:'Bank Guarantee'}).legal_status,'BELUM_DIVERIFIKASI');
});
