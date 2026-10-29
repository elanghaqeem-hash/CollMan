import assert from "node:assert/strict";
import worker from "../deploy/cloudflare/worker.mjs";
const base="https://collman.elang-haqeem.workers.dev";
const r=await worker.fetch(new Request(base+"/health"));assert.equal(r.status,200);
const data=await r.json();assert.equal(data.bank_production_ready,false);
assert.equal((await worker.fetch(new Request(base+"/"))).status,401);
assert.equal((await worker.fetch(new Request(base+"/calculate",{method:"POST",body:"x=1"}))).status,401);
console.log("3 smoke checks passed");
