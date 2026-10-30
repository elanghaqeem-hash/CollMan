/** Input remains outside this public repository. Never commit workbook contents or test output with prices/PII. */
import {readFile} from 'node:fs/promises';
import {priceIndication} from '../src/valuation-engine.js';
const path=process.env.COLLMAN_PRIVATE_GOLDEN_FILE;
if(!path)throw new Error('COLLMAN_PRIVATE_GOLDEN_FILE must identify an approved private case file outside the repository');
const cases=JSON.parse(await readFile(path,'utf8'));
if(!Array.isArray(cases)||cases.length<2)throw new Error('At least two source workbook reconciliation cases required');
let passed=0;
for(const item of cases){
 if(!/^[a-f0-9]{64}$/.test(item.source_sha256))throw new Error('Missing source digest');
 const actual=priceIndication(item.model,item.input,item.context);
 if(actual.indicated_market_value!==item.expected_market_value)throw new Error('Workbook equation reconciliation failed (source values withheld)');
 passed++;
}
console.log(JSON.stringify({status:'PASS',equation_cases:passed,scope:'Selected cached workbook equations only; not full workbook/model validation',contains_source_values:false}));
