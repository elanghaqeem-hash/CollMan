import {validateAsset,required,optional,numberIn,problem,calculateValuation,RISK_FLAGS} from './domain.js';
import {GROUPS,BUILTIN_TYPES,catalogTypes,typeFor,groupFor,METHODS,SECURITY_TYPES,SECURITY_STATUS,DOCUMENT_STATUS,POLICIES,ELIGIBILITY} from '../public/collateral-catalog.js';
const object=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw problem(`${label} harus berupa objek.`);return value;};
const enumValue=(value,options,label)=>{if(!Object.hasOwn(options,value))throw problem(`${label} tidak valid.`);return value;};
const present=x=>x!==undefined&&x!==null&&String(x).trim()!=='';
export function validDate(value,label){const s=required(value,label,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw problem(`${label} tidak valid.`);return s;}
export function validateCatalog(data) {
 object(data,'Katalog');const custom=data.custom_types??[];if(!Array.isArray(custom)||custom.length>100)throw problem('Maksimal 100 jenis tambahan.');
 const codes=new Set(BUILTIN_TYPES.map(t=>t.code)),names=new Set(BUILTIN_TYPES.map(t=>t.name.toLowerCase()));
 const custom_types=custom.map(t=>{
  object(t,'Jenis tambahan');const code=required(t.code,'Kode jenis',60),name=required(t.name,'Nama jenis',100);
  if(!/^CUSTOM_[A-Z0-9_]+$/.test(code)||codes.has(code)||names.has(name.toLowerCase()))throw problem('Kode CUSTOM_ atau nama jenis duplikat / tidak valid.');
  const group=GROUPS.find(g=>g.code===t.group);if(!group)throw problem('Kelompok jenis tambahan tidak dikenal.');
  codes.add(code);names.add(name.toLowerCase());return {code,name,group:group.code,kind:group.kind||'ASSET',enabled:true,policy:'REVIEW'};
 });
 const policies={};object(data.policies??{},'Kebijakan');
 for(const [key,p] of Object.entries(data.policies??{})){
  if(!codes.has(key))throw problem('Jenis pada kebijakan tidak dikenal.');object(p,'Kebijakan jenis');
  if(typeof p.enabled!=='boolean')throw problem('Status aktif jenis harus boolean.');
  policies[key]={enabled:p.enabled,policy:enumValue(p.policy,POLICIES,'Kebijakan penerimaan')};
 }
 return {custom_types,policies};
}
export function assetProfile(asset,types=BUILTIN_TYPES){
 const type=typeFor(asset.asset_type,types);if(!type)throw problem('Jenis agunan tidak dikenal.');
 return {type,group:groupFor(type)};
}
export function validateCollateralAsset(data,types=BUILTIN_TYPES) {
 const base=validateAsset(data,types.map(t=>t.name)),{type,group}=assetProfile(base,types);
 if(!type.enabled||type.policy==='BLOCKED')throw problem('Jenis agunan dinonaktifkan / tidak diterima menurut kebijakan bank.');
 const raw=object(data.collateral_details??{},'Detail agunan'),details={};
 const legacy={land_right:base.certificate_type,title_no:base.certificate_no,title_holder:base.ownership_name,land_area:base.land_area||'',building_area:base.building_area||''};
 for(const key of Object.keys(raw))if(!group.fields.some(f=>f.key===key))throw problem(`Atribut ${key} tidak sesuai jenis agunan.`);
 for(const field of group.fields){
  const val=raw[field.key]??(group.code==='PROPERTY'?legacy[field.key]:undefined);if(!present(val))continue;
  if(typeof val==='boolean'||typeof val==='object')throw problem('Nilai atribut harus teks atau angka.');
  details[field.key]=field.type==='number'?numberIn(val,0,9e15,field.label):field.type==='year'?numberIn(val,1800,new Date().getUTCFullYear()+2,field.label):field.type==='date'?validDate(val,field.label):optional(val,500);
  if(field.type==='year'&&!Number.isInteger(details[field.key]))throw problem('Tahun harus bilangan bulat.');
 }
 const docs=object(data.document_checklist??{},'Referensi dokumen'),documents={};
 for(const [key,doc] of Object.entries(docs)){
  if(!group.documents.some(d=>d.key===key))throw problem('Jenis dokumen tidak sesuai agunan.');object(doc,'Dokumen');
  documents[key]={status:enumValue(doc.status,DOCUMENT_STATUS,'Status dokumen'),reference:optional(doc.reference,250),expires_on:present(doc.expires_on)?validDate(doc.expires_on,'Masa berlaku dokumen'):''};
  if(documents[key].status==='VERIFIED'&&!documents[key].reference)throw problem('Dokumen terverifikasi harus memiliki referensi.');
 }
 const security=enumValue(data.security_type??'REVIEW',SECURITY_TYPES,'Jenis pengikatan');
 if(security!=='REVIEW'&&!group.security.includes(security))throw problem('Jenis pengikatan memerlukan pilihan yang sesuai kelompok objek.');
 const status=enumValue(data.security_status??'PENDING',SECURITY_STATUS,'Status pengikatan');
 const ref=optional(data.security_reference,250);if(status==='PERFECTED'&&(!ref||security==='REVIEW'))throw problem('Pengikatan selesai memerlukan jenis dan referensi hasil verifikasi.');
 // Retain the property wire fields for historical reports. Non-property objects have no artificial land area.
 const currency=String(data.currency_code||'IDR').toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw problem('Mata uang objek harus kode 3 huruf.');
 return {...base,currency_code:currency,certificate_type:group.code==='PROPERTY'?(details.land_right||base.certificate_type):'',certificate_no:group.code==='PROPERTY'?(details.title_no||base.certificate_no):'',ownership_name:group.code==='PROPERTY'?(details.title_holder||base.ownership_name):'',land_area:group.code==='PROPERTY'?(details.land_area??0):0,building_area:group.code==='PROPERTY'?(details.building_area??0):0,nib:group.code==='PROPERTY'?base.nib:'',category_code:group.code,collateral_kind:type.kind,collateral_details:details,document_checklist:documents,security_type:security,security_status:status,security_reference:ref};
}
export function submissionIssues(asset,types=BUILTIN_TYPES,today=new Date().toISOString().slice(0,10)) {
 const {type,group}=assetProfile(asset,types),issues=[];
 if(!type.enabled||type.policy==='BLOCKED')issues.push('Jenis agunan tidak diterima / dinonaktifkan oleh bank.');
 if(asset.legal_status!=='SESUAI')issues.push('Legalitas harus sesuai dan telah diperiksa.');
 const details=asset.collateral_details||{};
 for(const field of group.fields){if(field.required&&!present(details[field.key]))issues.push(`${field.label} wajib dilengkapi.`);else if(field.required&&field.type==='number'&&field.key!=='aging'&&Number(details[field.key])<=0)issues.push(`${field.label} harus lebih besar dari nol.`);}
 if(group.code==='PROPERTY'&&!(Number(details.land_area)>0||Number(details.building_area)>0))issues.push('Luas tanah atau bangunan wajib lebih besar dari nol.');
 for(const key of ['maturity_date','title_expiry'])if(details[key]&&details[key]<today)issues.push('Hak / instrumen telah kedaluwarsa.');
 for(const doc of group.documents){const item=asset.document_checklist?.[doc.key];if(item?.status!=='VERIFIED'||!item.reference)issues.push(`${doc.label} belum terverifikasi.`);else if(item.expires_on&&item.expires_on<today)issues.push(`${doc.label} telah kedaluwarsa.`);}
 if(asset.security_status==='INVALID')issues.push('Pengikatan bermasalah.');
 if(group.code==='CASH'&&Number(details.blocked_amount)>Number(details.balance))issues.push('Nominal blokir melebihi saldo.');
 return issues;
}
export function validateEligibility(data){
 const status=enumValue(data.eligibility_status,ELIGIBILITY,'Kelayakan bank');
 return {eligibility_status:status,eligibility_notes:required(data.eligibility_notes,'Dasar kajian kelayakan bank',2000)};
}
export function calculateCollateralValuation(data,asset,types,weights={}) {
 const {group}=assetProfile(asset,types),method=data.valuation_method||'MANUAL_MARKET';
 if(!group.methods.includes(method))throw problem('Metode penilaian tidak sesuai kategori agunan.');
 const source=required(data.valuation_reference,'Referensi laporan / sumber penilaian',500),raw=object(data.valuation_inputs??{},'Input penilaian'),inputs={};
 const num=(key,label,max=9e15)=>{if(!present(raw[key]))throw problem(`${label} wajib diisi.`);if(typeof raw[key]==='boolean'||typeof raw[key]==='object')throw problem(`${label} harus angka.`);const n=numberIn(raw[key],0,max,label);inputs[key]=n;return n;};
 let value;
 const currency=String(raw.currency||asset.currency_code||'IDR').toUpperCase();if(currency!==(asset.currency_code||'IDR'))throw problem('Mata uang penilaian harus sama dengan mata uang objek.');if(!/^[A-Z]{3}$/.test(currency))throw problem('Kode mata uang harus 3 huruf.');
 inputs.currency=currency;
 const fx=currency==='IDR'?1:num('fx_rate','Kurs ke IDR',1e9);if(fx<=0)throw problem('Kurs harus lebih besar dari nol.');inputs.fx_rate=fx;
 if(method==='QUOTED')value=num('quantity','Kuantitas')*num('unit_price','Harga per unit')*fx;
 else if(method==='NOMINAL'){
  value=num('amount','Nominal terblokir')*fx;
  const blocked=asset.collateral_details?.blocked_amount;
  if(present(blocked)&&inputs.amount>Number(blocked))throw problem('Nilai melebihi nominal terblokir yang dicatat.');
 }else if(method==='COST')value=num('replacement_cost','Biaya pengganti')*(1-num('depreciation_pct','Penyusutan (%)',100)/100)*fx;
 else if(method==='RECEIVABLE'){
  const gross=num('gross','Piutang bruto'),excluded=num('excluded','Piutang tidak memenuhi syarat');if(excluded>gross)throw problem('Pengecualian melebihi piutang bruto.');
  if(present(asset.collateral_details?.outstanding)&&gross>Number(asset.collateral_details.outstanding))throw problem('Piutang bruto melebihi outstanding tercatat.');
  value=(gross-excluded)*fx;
 }else value=num('amount',method==='GUARANTEE'?'Nilai jaminan':method==='SURRENDER'?'Nilai tunai bersih':'Nilai hasil penilai')*fx;
 if(method==='GUARANTEE'&&present(asset.collateral_details?.limit)&&inputs.amount>Number(asset.collateral_details.limit))throw problem('Nilai melebihi batas penjaminan tercatat.');
 if(method==='SURRENDER'&&present(asset.collateral_details?.surrender_value)&&inputs.amount>Number(asset.collateral_details.surrender_value))throw problem('Nilai melebihi nilai tunai terkonfirmasi.');
 if(!Number.isFinite(value)||value>9e15)throw problem('Hasil penilaian melebihi batas angka aman.');
 const location=new Set(['banjir','sutet','tpu','jalur_hijau','akses_jalan','perubahan_ilegal']);
 for(const key of RISK_FLAGS)if(!group.locationRisk&&location.has(key)&&data.risk_flags?.[key]===true)throw problem('Risiko lokasi tidak berlaku untuk kategori ini.');
 const result=calculateValuation({...data,market_value:Math.round(value)},weights);
 return {...result,valuation_method:method,valuation_inputs:inputs,valuation_reference:source};
}
