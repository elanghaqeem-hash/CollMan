/** Deterministic indications only. Prices, calibration and bank policy are never seeded. */
import {problem,required} from './domain.js';
import {validDate} from './collateral.js';

export const MODEL_METHODS={
 ADJUSTED_COMPARABLE:['PROPERTY','VEHICLE','MACHINERY','VESSEL','AIRCRAFT'],
 PROPERTY_COST:['PROPERTY'], COST:['VEHICLE','MACHINERY','VESSEL','AIRCRAFT','BIOLOGICAL','OTHER'],
 INCOME_CAP:['PROPERTY','VESSEL','BIOLOGICAL','INTANGIBLE','OTHER'],
 DCF:['PROPERTY','VESSEL','AIRCRAFT','BIOLOGICAL','INTANGIBLE','OTHER'],
 QUOTED:['SECURITIES','INVENTORY','WAREHOUSE','BIOLOGICAL'], NOMINAL:['CASH'],
 GOLD:['PRECIOUS'], RECEIVABLE:['RECEIVABLE'], SPECIALIST:['AIRCRAFT','VESSEL','BIOLOGICAL','INTANGIBLE','OTHER','FINANCIAL_RIGHT'],
 GUARANTEE:['GUARANTEE'], RECONCILIATION:['PROPERTY','VEHICLE','MACHINERY','VESSEL','AIRCRAFT','BIOLOGICAL','INTANGIBLE','OTHER']
};
const object=x=>{if(!x||typeof x!=='object'||Array.isArray(x))throw problem('Objek input diperlukan.');return x;};
export function numeric(x,label,min=0,max=9e15){
 if(x===null||x===undefined||typeof x==='boolean'||typeof x==='object'||String(x).trim()==='')throw problem(label+' wajib angka.');
 const n=Number(x);if(!Number.isFinite(n)||n<min||n>max)throw problem(label+' di luar batas.');return n;
}
const money=(x,label='Nilai')=>{if(!Number.isFinite(x)||x<0||x>9e15)throw problem(label+' di luar batas aman.');return Math.round(x);};
const ratio=(x,label)=>numeric(x,label,0,1);
const list=(x,label)=>{if(!Array.isArray(x)||x.length<1||x.length>500)throw problem(label+' membutuhkan 1–500 baris.');return x;};
export function validateModel(input){
 const d=object(input),method=required(d.method,'Metode',40),category=required(d.category,'Kategori',40);
 if(!MODEL_METHODS[method]?.includes(category))throw problem('Metode tidak sesuai kategori.');
 const p=object(d.parameters),parameters={max_source_age_days:numeric(p.max_source_age_days,'Batas umur sumber (hari)',0,3660)};
 if(!Number.isInteger(parameters.max_source_age_days))throw problem('Umur sumber harus hari bulat.');
 if(method==='ADJUSTED_COMPARABLE'){
  parameters.min_comparables=numeric(p.min_comparables,'Jumlah pembanding minimum',2,100);
  if(!Number.isInteger(parameters.min_comparables))throw problem('Jumlah pembanding harus bulat.');
 }
 const effective_from=validDate(d.effective_from,'Mulai berlaku'),effective_to=validDate(d.effective_to,'Akhir berlaku');
 if(effective_to<effective_from)throw problem('Periode model tidak valid.');
 return {name:required(d.name,'Nama model',120),version:required(d.version,'Versi model',40),method,category,
  region:required(d.region,'Wilayah validasi',100),effective_from,effective_to,parameters,
  methodology_ref:required(d.methodology_ref,'Referensi metodologi',500)};
}
function source(s,asOf,maxAge){
 object(s);const reference=required(s.reference,'Sumber harga / data',500),date=validDate(s.as_of,'Tanggal sumber');
 const age=(Date.parse(asOf)-Date.parse(date))/86400000;
 if(age<0||age>maxAge)throw problem('Sumber masa depan / kedaluwarsa.');
 return {reference,as_of:date};
}
export function priceIndication(model,input,context){
 object(input);const asOf=validDate(context.as_of,'Tanggal valuasi');
 if(model.category!==context.category||model.region!==context.region)throw problem('Kategori / wilayah di luar cakupan model.');
 if(asOf<model.effective_from||asOf>model.effective_to)throw problem('Model tidak berlaku pada tanggal valuasi.');
 const method=model.method,trace=[],p=model.parameters,src=s=>{const v=source(s,asOf,p.max_source_age_days);trace.push(v);};
 let value,components={};
 // IDR is the common output. Conversion needs a dated price source as well.
 const currency=required(input.currency,'Mata uang',3).toUpperCase();
 if(!/^[A-Z]{3}$/.test(currency))throw problem('Mata uang tidak valid.');
 let fx=1;if(currency!=='IDR'){fx=numeric(input.fx_rate,'Kurs ke IDR',Number.MIN_VALUE,1e9);src(input.fx_source);}
 if(method==='RECONCILIATION'){
  const approaches=list(input.approaches,'Pendekatan rekonsiliasi');
  if(approaches.length<2)throw problem('Rekonsiliasi memerlukan minimal dua pendekatan.');
  const methods=new Set();let total=0,weight=0;
  const componentsList=approaches.map(a=>{
   if(!MODEL_METHODS[a.method]?.includes(context.category)||['RECONCILIATION','GUARANTEE'].includes(a.method)||methods.has(a.method))throw problem('Pendekatan rekonsiliasi tidak valid / duplikat.');
   methods.add(a.method);src(a.source);required(a.reconciliation_basis,'Dasar bobot rekonsiliasi',1000);
   const w=numeric(a.weight,'Bobot pendekatan',Number.MIN_VALUE,1),v=numeric(a.indicated_value,'Indikasi pendekatan');
   total+=w*v;weight+=w;return {method:a.method,weight:w,indicated_value:v};
  });value=total/weight;components={approaches:componentsList};
 }else if(method==='ADJUSTED_COMPARABLE'){
  const comps=list(input.comparables,'Pembanding');
  if(comps.length<p.min_comparables)throw problem('Data pembanding tidak cukup; perlu penilaian manual / spesialis.',422);
  const refs=new Set();let weighted=0,weights=0;
  const rows=comps.map(c=>{
   src(c.source);const key=c.source.reference+'|'+c.source.as_of;
   if(refs.has(key))throw problem('Sumber pembanding duplikat.');refs.add(key);
   const area=numeric(c.unit_count,'Kuantitas / luas pembanding',Number.MIN_VALUE),price=numeric(c.price,'Harga pembanding',Number.MIN_VALUE);
   const a=numeric(c.adjustment_pct,'Penyesuaian total (%)',-100,1000);
   required(c.adjustment_basis,'Dasar penyesuaian',1000);
   if(!['TRANSACTION','OFFER'].includes(c.price_kind))throw problem('Jenis sumber harus transaksi atau penawaran.');
   const w=numeric(c.weight,'Bobot pembanding',Number.MIN_VALUE,1),unit=price/area*(1+a/100);
   weighted+=unit*w;weights+=w;return {adjusted_unit_price:unit,weight:w,price_kind:c.price_kind};
  });
  const unit=weighted/weights;value=unit*numeric(input.subject_units,'Kuantitas / luas objek',Number.MIN_VALUE);
  components={adjusted_unit_price:unit,comparables:rows,contains_offers:rows.some(x=>x.price_kind==='OFFER')};
 }else if(method==='PROPERTY_COST'){
  src(input.land_source);const land=numeric(input.land_area,'Luas tanah')*numeric(input.land_unit_price,'Harga tanah per m²');
  const buildings=list(input.buildings,'Komponen bangunan').map(b=>{
   src(b.source);const replacement=numeric(b.area,'Luas bangunan')*numeric(b.unit_cost,'Biaya per m²');
   const loss=ratio(b.physical_loss,'Susut fisik'),functional=ratio(b.functional_loss,'Keusangan fungsional'),economic=ratio(b.economic_loss,'Keusangan ekonomi');
   required(b.depreciation_basis,'Dasar penyusutan',1000);
   const unit=numeric(b.unit_cost,'Biaya per m²')*(1-loss)*(1-functional)*(1-economic);
   const quantum=b.unit_rounding===undefined?null:numeric(b.unit_rounding,'Pembulatan per unit',Number.MIN_VALUE);
   const rounded=quantum===null?unit:Math.round(unit/quantum)*quantum;
   return {replacement_cost:replacement,depreciated_unit_cost:rounded,unit_rounding:quantum,depreciated_cost:numeric(b.area,'Luas bangunan')*rounded};
  });
  components={land_value:land,buildings};value=land+buildings.reduce((s,b)=>s+b.depreciated_cost,0);
 }else if(method==='COST'){
  src(input.source);required(input.depreciation_basis,'Dasar penyusutan / kondisi',1000);
  const replacement=numeric(input.replacement_cost,'Biaya pengganti');
  value=replacement*(1-ratio(input.physical_loss,'Susut fisik'))*(1-ratio(input.functional_loss,'Keusangan fungsional'))*(1-ratio(input.economic_loss,'Keusangan ekonomi'));
  components={replacement_cost:replacement,depreciated_cost:value};
 }else if(method==='INCOME_CAP'){
  src(input.source);const income=numeric(input.annual_net_income,'Pendapatan bersih tahunan'),rate=numeric(input.cap_rate,'Tingkat kapitalisasi',Number.MIN_VALUE,1);
  value=income/rate;components={annual_net_income:income,cap_rate:rate};
 }else if(method==='DCF'){
  src(input.source);const rate=numeric(input.discount_rate,'Discount rate',0,10);
  const flows=list(input.cashflows,'Arus kas').map(x=>numeric(x,'Arus kas',-9e15));
  const terminal=numeric(input.terminal_value,'Nilai terminal');
  value=flows.reduce((sum,x,i)=>sum+x/(1+rate)**(i+1),0)+terminal/(1+rate)**flows.length;
  components={cashflows:flows,discount_rate:rate,terminal_value:terminal,period_unit:'YEAR'};
 }else if(method==='QUOTED'){
  src(input.source);required(input.quote_basis,'Basis kuotasi (termasuk NAV / per 100 nominal)',250);
  value=numeric(input.units,'Unit')*numeric(input.unit_price,'Harga per basis kuotasi')/numeric(input.quote_divisor,'Pembagi kuotasi',Number.MIN_VALUE);
 }else if(method==='NOMINAL'){
  src(input.source);const balance=numeric(input.balance,'Saldo terkonfirmasi'),blocked=numeric(input.blocked_amount,'Saldo diblokir');
  if(blocked>balance)throw problem('Blokir melebihi saldo.');value=blocked;
 }else if(method==='GOLD'){
  src(input.source);required(input.assay_ref,'Referensi uji kadar',500);
  value=numeric(input.grams,'Berat gram')*ratio(input.purity,'Kemurnian 0–1')*numeric(input.fine_gold_price_per_gram,'Harga emas murni per gram');
 }else if(method==='RECEIVABLE'){
  const invoices=list(input.invoices,'Piutang');value=invoices.reduce((sum,r)=>{
   src(r.source);required(r.collectability_basis,'Dasar kolektibilitas / aging',500);
   const gross=numeric(r.outstanding,'Outstanding'),excluded=numeric(r.excluded,'Pengecualian');
   if(excluded>gross)throw problem('Pengecualian melebihi outstanding.');
   return sum+(gross-excluded)*ratio(r.recovery_rate,'Estimasi recovery 0–1');
  },0);
 }else if(method==='SPECIALIST'){
  src(input.source);required(input.specialist_ref,'Referensi laporan spesialis',500);value=numeric(input.amount,'Nilai hasil penilai spesialis');
 }else if(method==='GUARANTEE'){
  src(input.source);required(input.enforceability_ref,'Referensi kajian enforceability',500);
  return {kind:'GUARANTEE',guarantee_limit_idr:money(numeric(input.confirmed_limit,'Limit penjaminan')*fx),
   indicated_market_value:null,approved_market_value:null,liquidation_value:null,accepted_value:null,regulatory_value:null,
   regulatory_status:'NOT_CONFIGURED',confidence:{status:'NOT_ESTIMATED'},data_sufficiency:'SOURCE_PRESENT',lineage:trace,model_validation_status:model.status||'DRAFT',automatic_final_valuation:false};
 }else throw problem('Metode tidak didukung.');
 const market=money(value*fx),liquidation=money(numeric(input.liquidation_amount,'Estimasi likuidasi dalam mata uang objek')*fx);
 if(liquidation>market)throw problem('Estimasi likuidasi melebihi indikasi pasar.');
 const basis=required(input.liquidation_basis,'Dasar estimasi likuidasi',1000);
 const accepted=money(numeric(input.bank_accepted_amount,'Nilai diterima bank dalam mata uang objek')*fx);
 if(accepted>liquidation)throw problem('Nilai diterima bank melebihi estimasi likuidasi.');
 const policy=required(input.bank_policy_ref,'Referensi kebijakan bank',500);
 return {kind:'ASSET',indicated_market_value:market,approved_market_value:null,liquidation_value:liquidation,liquidation_basis:basis,
  accepted_value:accepted,bank_policy_ref:policy,regulatory_value:null,regulatory_status:'NOT_CONFIGURED',
  confidence:{status:'NOT_ESTIMATED',reason:'Independent backtesting and segment coverage required'},data_sufficiency:'REQUIRED_INPUTS_PRESENT',
  model_validation_status:model.status||'DRAFT',automatic_final_valuation:false,components,lineage:trace};
}
export function backtest(observations){
 const rows=list(observations,'Transaksi realization');
 if(rows.length<2)throw problem('Minimal dua observasi untuk statistik deskriptif; kecukupan validasi ditetapkan reviewer.');
 const refs=new Set(),dates=[],today=new Date().toISOString().slice(0,10);
 let documentedPredictions=0;
 const errors=rows.map(r=>{
  const ref=required(r.realization_ref,'Sumber transaksi / realization',500);if(refs.has(ref))throw problem('Observasi duplikat.');refs.add(ref);
  const realizedOn=validDate(r.realized_on,'Tanggal realization');
  if(realizedOn>today)throw problem('Tanggal realisasi belum terjadi; observasi tidak boleh memakai hasil masa depan.');
  dates.push(realizedOn);
  if(r.predicted_on!==undefined||r.prediction_ref!==undefined){
   const predictedOn=validDate(r.predicted_on,'Tanggal prediksi historis');
   required(r.prediction_ref,'Referensi prediksi historis',500);
   if(predictedOn>realizedOn)throw problem('Prediksi tidak boleh dibuat setelah realisasi.');
   documentedPredictions++;
  }
  const error=(numeric(r.predicted,'Prediksi')-numeric(r.actual,'Realisasi',Number.MIN_VALUE))/Number(r.actual);
  if(!Number.isFinite(error))throw problem('Rasio backtest melebihi batas angka aman.');
  return error;
 });
 const abs=errors.map(Math.abs).sort((a,b)=>a-b),n=rows.length;
 let confidence_interval=null;
 if(n>=20){
  // Fixed-seed percentile bootstrap. Descriptive iid interval; representativeness still requires independent review.
  let seed=73421;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const mape=[],bias=[];
  for(let b=0;b<1000;b++){let a=0,e=0;for(let i=0;i<n;i++){const v=errors[Math.floor(random()*n)];a+=Math.abs(v);e+=v;}mape.push(a/n*100);bias.push(e/n*100);}
  const interval=x=>{x.sort((a,b)=>a-b);return [x[24],x[974]];};
  confidence_interval={level:.95,method:'PERCENTILE_BOOTSTRAP_IID',replicates:1000,mape_pct:interval(mape),bias_pct:interval(bias),limitation:'Assumes independent representative observations; does not establish segment coverage.'};
 }
 return {n,mape_pct:abs.reduce((s,x)=>s+x,0)/n*100,mdape_pct:(n%2?abs[(n-1)/2]:(abs[n/2-1]+abs[n/2])/2)*100,
  bias_pct:errors.reduce((s,x)=>s+x,0)/n*100,confidence_interval,confidence_interval_status:confidence_interval?'DESCRIPTIVE_IID_ONLY':'NOT_ESTIMATED_INSUFFICIENT_DISTRIBUTIONAL_EVIDENCE',
  observation_period:{from:dates.slice().sort()[0],to:dates.slice().sort().at(-1)},
  historical_prediction_evidence:documentedPredictions===n?'COMPLETE':'INCOMPLETE',documented_predictions:documentedPredictions};
}
