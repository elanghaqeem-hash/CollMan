import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationReadiness,analyzeComparableOffers,screenSpatialEvidence,normalizeOcrReview} from '../src/integrations.js';

test('external connectors never claim readiness without verified evidence',()=>{
 const r=integrationReadiness({});
 assert.ok(Object.values(r).every(x=>x.status==='NOT_CONFIGURED' && x.live_verified===false));
 const configured=integrationReadiness({ATR_BPN_VERIFY_URL:'https://api.partner.example/verify',ATR_BPN_API_KEY:'example-only-key-123456'});
 assert.equal(configured.atr_bpn.status,'CONFIGURED_UNVERIFIED');
 assert.equal(configured.atr_bpn.live_verified,false);
 assert.equal(JSON.stringify(configured).includes('example-only-key'),false);
});
test('manual comparables are never passed off as AI or certified market value',()=>{
 assert.equal(analyzeComparableOffers([{included:1,offering_price:100}]).status,'INSUFFICIENT_EVIDENCE');
 const x=analyzeComparableOffers([{included:1,offering_price:100},{included:1,offering_price:300},
  {included:1,offering_price:200},{included:0,offering_price:1000000}]);
 assert.equal(x.median_offer,200);assert.equal(x.highest_offer,300);assert.equal(x.auto_decision,false);
});
test('spatial risk proximity and trusted source attribution require explicit inputs',()=>{
 const x=screenSpatialEvidence({latitude:-6.2,longitude:106.8,hazards:[
  {type:'banjir',latitude:-6.2,longitude:106.8,radius_m:100,source:'survei berkas internal'},
  {type:'sutet',latitude:-6.4,longitude:107,radius_m:20,source:'survei berkas internal'}]});
 assert.equal(x.flags.banjir,true);assert.equal(x.flags.sutet,false);
 assert.equal(x.verified,false);assert.equal(x.source_type,'MANUAL_COORDINATES');
 assert.throws(()=>screenSpatialEvidence({latitude:91,longitude:0,hazards:[]}));
 assert.throws(()=>screenSpatialEvidence({latitude:0,longitude:0,hazards:[{type:'banjir',latitude:0,longitude:0}]}));
});
test('OCR extraction is a review-only candidate and rejects unknown confidence',()=>{
 const x=normalizeOcrReview({nib:{value:'001234',confidence:0.91},danger:{value:'x',confidence:1}});
 assert.equal(x.suggestions[0].value,'001234');
 assert.equal(x.suggestions.length,1);
 assert.equal(x.applied,false);
 assert.throws(()=>normalizeOcrReview({certificate_no:{value:'SHM 2',confidence:1.4}}));
});
