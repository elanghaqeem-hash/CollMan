/**
 * CollMan source-aware pre-screening primitives.
 * No official registry, third-party spatial data, OCR provider or AI model
 * is called here. These helpers never change a bank's legal or credit decision.
 */
import {RISK_FLAGS, problem} from './domain.js';

const safeNumber = (value, label, min, max) => {
  if (value === null || value === undefined || String(value).trim() === '') throw problem(label + ' wajib diisi.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw problem(label + ' tidak valid.');
  return n;
};
const median = numbers => {
  const a = [...numbers].sort((x,y)=>x-y);
  return a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1] + a[a.length/2])/2;
};
export function integrationReadiness(env = {}) {
  const enabled = (url,key) => Boolean(typeof url==='string' && url.startsWith('https://') && typeof key==='string' && key.length>=16);
  // "CONFIGURED_UNVERIFIED" is not a connectivity or authorization claim.
  return {
    atr_bpn: {status:enabled(env.ATR_BPN_VERIFY_URL,env.ATR_BPN_API_KEY)?'CONFIGURED_UNVERIFIED':'NOT_CONFIGURED',live_verified:false},
    ocr: {status:enabled(env.OCR_PROVIDER_URL,env.OCR_API_KEY)?'CONFIGURED_UNVERIFIED':'NOT_CONFIGURED',live_verified:false},
    ai_appraisal: {status:enabled(env.AI_APPRAISAL_URL,env.AI_APPRAISAL_API_KEY)?'CONFIGURED_UNVERIFIED':'NOT_CONFIGURED',live_verified:false},
    spatial_provider: {status:enabled(env.SPATIAL_PROVIDER_URL,env.SPATIAL_API_KEY)?'CONFIGURED_UNVERIFIED':'NOT_CONFIGURED',live_verified:false}
  };
}
export function analyzeComparableOffers(records) {
  if (!Array.isArray(records) || records.length>500) throw problem('Data pembanding tidak valid.');
  const included = records.filter(c => (c.included===1 || c.included===true) &&
    Number.isSafeInteger(Number(c.offering_price)) && Number(c.offering_price)>0);
  if (included.length<3) return {
    status:'INSUFFICIENT_EVIDENCE',count:included.length,minimum_required:3,
    auto_decision:false,notice:'Minimal tiga harga penawaran yang dipilih diperlukan; bukan nilai pasar atau nilai agunan.'
  };
  const prices=included.map(x=>Number(x.offering_price)).sort((a,b)=>a-b);
  return {
    status:'UNADJUSTED_ASKING_PRICES',count:prices.length,
    lowest_offer:prices[0],median_offer:Math.round(median(prices)),highest_offer:prices.at(-1),
    source_type:'USER_ENTERED_COMPARABLES',auto_decision:false,
    notice:'Statistik harga penawaran manual, belum disesuaikan untuk lokasi, waktu, luas, kondisi, diskon transaksi, dan bukan AI appraisal atau nilai pasar tersertifikasi.'
  };
}
export function screenSpatialEvidence(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw problem('Lokasi tidak valid.');
  const lat=safeNumber(input.latitude,'Latitude',-90,90);
  const lon=safeNumber(input.longitude,'Longitude',-180,180);
  if (!Array.isArray(input.hazards) || input.hazards.length>100) throw problem('Daftar objek risiko maksimum 100.');
  const hits=[];
  for (const h of input.hazards) {
    if (!h || !RISK_FLAGS.includes(h.type)) throw problem('Kategori risiko spasial tidak dikenal.');
    const hlat=safeNumber(h.latitude,'Latitude risiko',-90,90);
    const hlon=safeNumber(h.longitude,'Longitude risiko',-180,180);
    const source=String(h.source??'').trim();
    if(!source || source.length>300)throw problem('Sumber bukti risiko wajib diisi (maksimal 300 karakter).');
    const radius=safeNumber(h.radius_m??0,'Radius risiko',0,10000);
    const rad=Math.PI/180,deltaLat=(hlat-lat)*rad,deltaLon=(hlon-lon)*rad;
    const a=Math.sin(deltaLat/2)**2+Math.cos(lat*rad)*Math.cos(hlat*rad)*Math.sin(deltaLon/2)**2;
    const distance=Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a))));
    hits.push({type:h.type,distance_m:distance,radius_m:radius,within_radius:distance<=radius,source});
  }
  return {latitude:lat,longitude:lon,flags:Object.fromEntries(RISK_FLAGS.map(f=>[f,hits.some(h=>h.type===f && h.within_radius)])),
    objects:hits,source_type:'MANUAL_COORDINATES',verified:false,auto_decision:false,
    notice:'Jarak dihitung dari koordinat yang disuplai pengguna. Bukan peta batas resmi, zonasi ATR/BPN, atau validasi legal. Wajib review manusia.'};
}
const OCR_FIELDS = new Set(['certificate_type','certificate_no','nib','ownership_name','land_area','building_area','address']);
export function normalizeOcrReview(raw) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw problem('Hasil OCR harus object.');
  const suggestions=[];
  for (const [field,entry] of Object.entries(raw)) {
    if (!OCR_FIELDS.has(field)) continue;
    if (!entry || typeof entry!=='object' || Array.isArray(entry)) throw problem('Field OCR tidak valid.');
    let value=String(entry.value??'').trim();
    if (!value || value.length>500) throw problem('Nilai OCR tidak valid.');
    const confidence=safeNumber(entry.confidence,'Confidence OCR',0,1);
    if (field==='land_area'||field==='building_area') value=String(safeNumber(value,'Luas OCR',0,1e9));
    suggestions.push({field,value,confidence,review_status:'NEEDS_MANUAL_CONFIRMATION'});
  }
  if(suggestions.length===0)throw problem('Tidak ada field OCR yang dikenal.');
  return {suggestions,source_type:'USER_SUPPLIED_OCR_OUTPUT',verified:false,applied:false,
    notice:'Pratinjau ekstraksi OCR dari input pengguna; tidak mengubah data resmi atau mengesahkan sertifikat.'};
}
