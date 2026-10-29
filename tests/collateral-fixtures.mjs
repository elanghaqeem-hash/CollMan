import {BUILTIN_TYPES,groupFor,typeFor} from '../public/collateral-catalog.js';
export function completeAsset(name='Ruko',types=BUILTIN_TYPES) {
 const type=typeFor(name,types),group=groupFor(type),details={};
 for(const field of group.fields){if(field.type==='date')details[field.key]='2099-12-31';else if(field.type==='year')details[field.key]=2024;else if(field.type==='number')details[field.key]=100;else details[field.key]='Synthetic verification reference';}
 return {borrower:'Synthetic test only',asset_type:name,address:'Synthetic custody location',currency_code:'IDR',legal_status:'SESUAI',collateral_details:details,document_checklist:Object.fromEntries(group.documents.map(d=>[d.key,{status:'VERIFIED',reference:'SYNTHETIC-'+d.key,expires_on:'2099-12-31'}])),security_type:group.security[0],security_status:'PERFECTED',security_reference:'SYNTHETIC-LEGAL'};
}
export function valuationInput(method='MANUAL_MARKET',overrides={}){return {valuation_method:method,valuation_reference:'Synthetic valuation report',valuation_inputs:{amount:100,quantity:10,unit_price:100,replacement_cost:1000,depreciation_pct:20,gross:100,excluded:20,currency:'IDR'},base_haircut_pct:10,...overrides};}
