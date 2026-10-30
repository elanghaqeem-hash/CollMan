import test from 'node:test';
import assert from 'node:assert/strict';
import {priceIndication,validateModel,backtest} from '../src/valuation-engine.js';
const ctx={category:'PROPERTY',region:'TEST_REGION',as_of:'2026-10-30'};
const source={reference:'Synthetic evidence only',as_of:'2026-10-29'};
const common={currency:'IDR',liquidation_amount:60,liquidation_basis:'Synthetic disposal estimate',bank_accepted_amount:50,bank_policy_ref:'Synthetic policy'};
const model=(method,category='PROPERTY')=>({...validateModel({name:'Synthetic',version:'1',method,category,region:'TEST_REGION',effective_from:'2026-01-01',effective_to:'2026-12-31',parameters:{min_comparables:2,max_source_age_days:30},methodology_ref:'Synthetic methodology'}),status:'DRAFT'});
test('pricing uses explicit sources and distinct market, liquidation, bank and regulatory outputs',()=>{
 const m=model('PROPERTY_COST'),r=priceIndication(m,{...common,land_area:2,land_unit_price:30,land_source:source,buildings:[{area:2,unit_cost:50,physical_loss:.2,functional_loss:.1,economic_loss:0,depreciation_basis:'Synthetic inspection',source}]},ctx);
 assert.equal(r.indicated_market_value,132);assert.equal(r.approved_market_value,null);assert.equal(r.liquidation_value,60);assert.equal(r.accepted_value,50);assert.equal(r.regulatory_value,null);assert.equal(r.automatic_final_valuation,false);
 assert.equal(r.model_validation_status,'DRAFT');assert.equal(r.lineage.length,2);
});
test('adjusted comparables, income and DCF reconcile independently calculated synthetic values',()=>{
 const a=priceIndication(model('ADJUSTED_COMPARABLE'),{...common,subject_units:2,comparables:[{price:100,unit_count:2,adjustment_pct:10,adjustment_basis:'Synthetic adjustment',price_kind:'OFFER',weight:1,source},{price:200,unit_count:4,adjustment_pct:-10,adjustment_basis:'Synthetic adjustment',price_kind:'TRANSACTION',weight:1,source:{...source,reference:'Synthetic second'}}]},ctx);
 assert.equal(a.indicated_market_value,100);assert.equal(a.components.contains_offers,true);
 assert.equal(priceIndication(model('INCOME_CAP'),{...common,annual_net_income:10,cap_rate:.1,source},ctx).indicated_market_value,100);
 assert.equal(priceIndication(model('DCF'),{...common,cashflows:[11,12.1],terminal_value:121,discount_rate:.1,source},ctx).indicated_market_value,120);
});
test('gold purity, quoted bond basis, blocked cash, cost obsolescence and receivable recovery',()=>{
 const cases=[['GOLD','PRECIOUS',{grams:10,purity:.75,fine_gold_price_per_gram:20,assay_ref:'Synthetic assay',source},150],
 ['QUOTED','SECURITIES',{units:200,unit_price:98,quote_divisor:100,quote_basis:'Per 100 nominal',source},196],
 ['NOMINAL','CASH',{balance:200,blocked_amount:150,source},150],
 ['COST','MACHINERY',{replacement_cost:200,physical_loss:.2,functional_loss:.1,economic_loss:.1,depreciation_basis:'Synthetic inspection',source},130],
 ['RECEIVABLE','RECEIVABLE',{invoices:[{outstanding:200,excluded:20,recovery_rate:.5,collectability_basis:'Synthetic aging',source}]},90]];
 for(const [method,category,input,want] of cases)assert.equal(priceIndication(model(method,category),{...common,...input},{...ctx,category}).indicated_market_value,want);
});
test('FX is sourced and guarantees never contribute a market or liquidation value',()=>{
 const m=model('GUARANTEE','GUARANTEE'),r=priceIndication(m,{currency:'USD',fx_rate:15000,fx_source:source,source,confirmed_limit:100,enforceability_ref:'Synthetic legal opinion'},{...ctx,category:'GUARANTEE'});
 assert.equal(r.guarantee_limit_idr,1500000);assert.equal(r.indicated_market_value,null);assert.equal(r.liquidation_value,null);
 assert.throws(()=>priceIndication(m,{currency:'USD',fx_rate:15000,source,confirmed_limit:100,enforceability_ref:'Synthetic'},{...ctx,category:'GUARANTEE'}));
});
test('fails closed on missing, stale, future, duplicate, insufficient or out-of-scope evidence',()=>{
 const m=model('NOMINAL','CASH'),c={...ctx,category:'CASH'},i={...common,balance:200,blocked_amount:100,source};
 for(const source of [null,{reference:'x',as_of:'2026-10-31'},{reference:'x',as_of:'2020-01-01'}])assert.throws(()=>priceIndication(m,{...i,source},c));
 for(const balance of [null,'',false,{},'NaN',-1])assert.throws(()=>priceIndication(m,{...i,balance},c));
 assert.throws(()=>priceIndication(m,i,{...c,region:'OUTSIDE'}));assert.throws(()=>priceIndication(m,{...i,liquidation_amount:101},c));
 assert.throws(()=>priceIndication(model('ADJUSTED_COMPARABLE'),{...common,subject_units:1,comparables:[{price:10}]},ctx));
});
test('backtesting computes MAPE, MdAPE and signed bias without inventing confidence',()=>{
 const r=backtest([{predicted:110,actual:100,realized_on:'2026-10-01',realization_ref:'Synthetic transaction A'},{predicted:180,actual:200,realized_on:'2026-10-02',realization_ref:'Synthetic transaction B'}]);
 assert.equal(r.mape_pct,10);assert.equal(r.mdape_pct,10);assert.equal(r.bias_pct,0);assert.equal(r.confidence_interval,null);
 assert.throws(()=>backtest([{predicted:10,actual:0,realized_on:'2026-10-01',realization_ref:'a'},{predicted:10,actual:10,realized_on:'2026-10-01',realization_ref:'b'}]));
 assert.throws(()=>backtest([{predicted:9e15,actual:Number.MIN_VALUE,realized_on:'2026-10-01',realization_ref:'a'},{predicted:10,actual:10,realized_on:'2026-10-01',realization_ref:'b'}]));
});
test('reconciliation uses explicit independent approach indications and weights',()=>{
 const r=priceIndication(model('RECONCILIATION'),{...common,approaches:[{method:'PROPERTY_COST',indicated_value:100,weight:.4,reconciliation_basis:'Synthetic reliability assessment',source},{method:'INCOME_CAP',indicated_value:200,weight:.6,reconciliation_basis:'Synthetic income evidence',source}]},ctx);
 assert.equal(r.indicated_market_value,160);assert.equal(r.automatic_final_valuation,false);
});
test('bootstrap confidence is deterministic, descriptive and only estimated with sufficient observations',()=>{
 const obs=Array.from({length:20},(_,i)=>({predicted:100+i,actual:100,realization_ref:'Synthetic '+i,realized_on:'2026-10-01'}));
 const r=backtest(obs);assert.equal(r.confidence_interval.level,.95);assert.equal(r.confidence_interval.replicates,1000);
 assert.deepEqual(r.confidence_interval,backtest(obs).confidence_interval);
 assert.ok(r.confidence_interval.mape_pct[0]<=r.mape_pct&&r.confidence_interval.mape_pct[1]>=r.mape_pct);
});
