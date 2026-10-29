import assert from "node:assert/strict";
import worker,{calculate} from "../deploy/cloudflare/worker.mjs";
const base="https://collman.elang-haqeem.workers.dev";
const r=await worker.fetch(new Request(base+"/health"));
assert.equal(r.status,200);
const data=await r.json();
assert.equal(data.bank_production_ready,false);
assert.equal(data.pii_storage,false);
assert.equal((await worker.fetch(new Request(base+"/"))).status,401);
assert.equal((await worker.fetch(new Request(base+"/calculate",{method:"POST",body:"x=1"}))).status,401);
const inputs=new URLSearchParams({
 biaya:"4763836",lantai:"1",wilayah:"0.828",fee:"0.03",izin:"0.015",
 profit:"0.10",ppn:"0.11",umur:"3",ekonomis:"30"
});
const out=calculate(inputs);
assert.equal(out.find(x=>x[0]==="BRB / m² dibulatkan")[1],"5.010.000");
assert.equal(out.find(x=>x[0]==="NP Bangunan / m²")[1],"4.509.000");
assert.throws(()=>calculate(new URLSearchParams({...Object.fromEntries(inputs),ekonomis:"0"})),/nol/);
console.log("7 CVS restricted pilot checks passed");
