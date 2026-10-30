import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvidenceInput,validateEvidenceReview,mayReviewEvidence} from '../src/evidence.js';
const basic={evidence_type:'LEGAL_DOCUMENT',source_name:'Dokumen hasil review internal',reference_no:'REF-UAT-01'};
const tenant='BANK-A',id='asset1';
const actor={id:'checker1',role:'CHECKER',tenant_id:tenant};
const asset={id,tenant_id:tenant,created_by:'maker1',status:'SUBMITTED'};
const evidence={asset_id:id,tenant_id:tenant,recorded_by:'maker1',review_status:'PENDING_REVIEW'};
test('evidence metadata is schema-limited and never accepts raw document objects',()=>{
 const x=validateEvidenceInput({...basic,digest_sha256:'A'.repeat(64)});
 assert.equal(x.digest_sha256,'a'.repeat(64));
 assert.deepEqual(Object.keys(x).sort(),['digest_sha256','evidence_type','notes','reference_no','source_name'].sort());
 assert.throws(()=>validateEvidenceInput({...basic,evidence_type:'OFFICIAL_ATR_BPN_VERIFIED'}));
 assert.throws(()=>validateEvidenceInput({...basic,digest_sha256:'bad'}));
 assert.throws(()=>validateEvidenceInput({...basic,source_name:''}));
});
test('review decision is internal-only and rationale mandatory',()=>{
 assert.deepEqual(validateEvidenceReview({decision:'REVIEWED_INTERNAL',note:'Data sesuai hasil penelaahan'}).decision,'REVIEWED_INTERNAL');
 assert.throws(()=>validateEvidenceReview({decision:'OFFICIALLY_VERIFIED',note:'Approved by actor'}));
 assert.throws(()=>validateEvidenceReview({decision:'DISPUTED',note:'short'}));
});
test('separate duties, tenant scope and workflow stage for evidence review',()=>{
 assert.equal(mayReviewEvidence(actor,asset,evidence),true);
 assert.equal(mayReviewEvidence({...actor,id:'maker1'},asset,evidence),false);
 assert.equal(mayReviewEvidence({...actor,tenant_id:'BANK-B'},asset,evidence),false);
 assert.equal(mayReviewEvidence({...actor,role:'MAKER'},asset,evidence),false);
 assert.equal(mayReviewEvidence({...actor,role:'AUDITOR'},asset,evidence),false);
 assert.equal(mayReviewEvidence(actor,{...asset,status:'DRAFT'},evidence),false);
 assert.equal(mayReviewEvidence({...actor,role:'REVIEWER'},asset,evidence),false);
 assert.equal(mayReviewEvidence({...actor,role:'REVIEWER'}, {...asset,status:'REVIEWED'},evidence),true);
 assert.equal(mayReviewEvidence(actor,asset,{...evidence,review_status:'REVIEWED_INTERNAL'}),false);
 assert.equal(mayReviewEvidence(actor,asset,{...evidence,recorded_by:'checker1'}),false);
});
