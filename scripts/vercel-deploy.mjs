/** Explicit target guard. Legacy infrastructure is retained for history, never selected by npm deploy. */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const expected={projectId:'prj_XfJOcY7dzut4OdM1Tx2cbyfpZflW',orgId:'team_Y6DNKOu4wHEjmSax8LeZ1B7J'};
let linked;try{linked=JSON.parse(await readFile('.vercel/project.json','utf8'));}catch{throw new Error('Link the existing Vercel collman project before deployment; no project will be created automatically.');}
if(linked.projectId!==expected.projectId||linked.orgId!==expected.orgId)throw new Error('Wrong Vercel project or team. Deployment refused.');
if(process.argv.includes('--prod'))throw new Error('Production deploy requires the documented database, bank sign-off and staged promotion procedure. This command creates preview only.');
const result=spawnSync('vercel',['deploy'],{stdio:'inherit',env:process.env});
if(result.error)throw new Error('Authenticated Vercel CLI is unavailable; use the connected Vercel project Git integration.');
process.exitCode=result.status??1;
