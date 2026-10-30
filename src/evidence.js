/** Collateral evidence controls. Manual review is never official title verification. */
import {required, optional, problem} from './domain.js';
export const EVIDENCE_TYPES=Object.freeze(['LEGAL_DOCUMENT','OWNERSHIP','VALUATION_SUPPORT','SITE_SURVEY','SPATIAL_SCREEN','OCR_EXTRACTION','KJPP_REPORT']);
export const EVIDENCE_DECISIONS=Object.freeze(['REVIEWED_INTERNAL','DISPUTED']);
export function validateEvidenceInput(payload) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw problem('Metadata bukti tidak valid.');
  const type=required(payload.evidence_type,'Jenis bukti',40);
  if(!EVIDENCE_TYPES.includes(type))throw problem('Kategori bukti tidak didukung.');
  const source=required(payload.source_name,'Sumber bukti',200);
  const reference=required(payload.reference_no,'Referensi bukti',200);
  const notes=optional(payload.notes,1000);
  const digest=String(payload.digest_sha256??'').trim().toLowerCase();
  if(digest && !/^[a-f0-9]{64}$/.test(digest))throw problem('SHA-256 harus berupa 64 karakter heksadesimal.');
  // Only metadata and optional checksum; no raw OCR text, KTP, certificate image or document URL.
  return {evidence_type:type,source_name:source,reference_no:reference,notes,digest_sha256:digest||null};
}
export function validateEvidenceReview(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Review bukti tidak valid.');
  const decision=required(input.decision,'Keputusan review',30);
  if(!EVIDENCE_DECISIONS.includes(decision))throw problem('Keputusan review tidak dikenal.');
  const note=required(input.note,'Alasan review',1000);
  if(note.length<10)throw problem('Catatan review minimal 10 karakter.');
  return {decision,note};
}
export function mayReviewEvidence(actor,asset,evidence) {
  if(!actor||!asset||!evidence)return false;
  if(actor.tenant_id!==asset.tenant_id||actor.tenant_id!==evidence.tenant_id)return false;
  if(evidence.asset_id!==asset.id||evidence.review_status!=='PENDING_REVIEW')return false;
  if(actor.id===asset.created_by||actor.id===evidence.recorded_by)return false;
  return (actor.role==='CHECKER'&&asset.status==='SUBMITTED')
    ||(actor.role==='REVIEWER'&&asset.status==='REVIEWED');
}
