import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
const helper=process.env.HEARTHOS_RECOVERY_HELPER;
if(!helper||!process.argv[2])throw new Error('Explicit local recovery helper and encrypted archive required');
const {withLocalPostgres,restoreEncryptedArchive,fingerprintTables}=await import(pathToFileURL(helper));
const dir=await mkdtemp('/tmp/sms-trial-test-');
try {
 await build({entryPoints:['src/lib/sms-trial/store.ts'],bundle:true,platform:'node',format:'esm',outfile:`${dir}/store.mjs`});
 const {smsTrialStore}=await import(pathToFileURL(`${dir}/store.mjs`));
 await withLocalPostgres(async cluster=>{
  const archiveSha256=await restoreEncryptedArchive(cluster,process.argv[2]);
  const sql=cluster.sql, before=await fingerprintTables(sql);
  const migration=await readFile('scripts/sql/sms-trial.sql','utf8');
  cluster.psql(migration);cluster.psql(migration);
  assert.deepEqual(await fingerprintTables(sql,Object.keys(before)),before);
  const config={orgId:'ed0129d0-1ebb-4cd9-ab9a-25e3415600b3',employeeId:'d695d155-584f-4d57-88c2-92e99b8216c9',recipient:'+14175550100',accountSid:'test',authToken:'test',callbackOrigin:'https://example.test',enabled:true};
  const actor={orgId:config.orgId,employeeId:config.employeeId,role:'owner',clerkUserId:'test',name:'Colton',email:'test@example.test'};
  const store=smsTrialStore(sql,config);
  const jobId=await store.setup(actor);
  assert.equal(await store.setup(actor),jobId);
  const state=await store.state(actor);assert.equal(state.messages.length,1);
  const claimed=await store.claim(actor,jobId,'scheduled');assert.ok(claimed);
  assert.equal(await store.claim(actor,jobId,'scheduled'),null);
  await store.record(claimed.id,'delivered','SMtest',null);
  await store.record(claimed.id,'accepted','SMtest',null);
  assert.equal((await store.state(actor)).messages[0].status,'delivered');
  await assert.rejects(store.claim({...actor,orgId:randomUUID()},jobId,'on_my_way'));
  await assert.rejects(store.claim({...actor,role:'technician',employeeId:randomUUID()},jobId,'on_my_way'));
  await assert.rejects(store.claim(actor,randomUUID(),'on_my_way'));
  await store.toggle(actor,false);await assert.rejects(store.claim(actor,jobId,'on_my_way'));
  await store.toggle(actor,true);
  const [trial]=await sql`select * from hearth_sms_trial where org_id=${config.orgId}`;
  await sql`update customers set phone='+14175550999' where id=${trial.customer_id}`;
  await assert.rejects(store.claim(actor,jobId,'on_my_way'));
  await sql`update customers set phone=${config.recipient} where id=${trial.customer_id}`;
  // Exercise the cap without sending or reusing production appointments.
  for(let n=0;n<9;n++){const id=randomUUID();await sql`insert into hearth_jobs_store(id,job_number,status,payload) values(${id},${`TEST-LIMIT-${n}`},'scheduled','{}')`;await sql`insert into hearth_sms_messages(id,org_id,job_id,event,template,recipient,employee_id,attempted_at,status) values(${randomUUID()},${config.orgId},${id},'scheduled','sample',${config.recipient},${config.employeeId},now(),'failed')`;}
  await assert.rejects(store.claim(actor,jobId,'on_my_way'),/limit/);
  await sql`update hearth_sms_messages set attempted_at=now()-interval '2 days' where org_id=${config.orgId} and job_id<>${jobId}`;
  const tech={...actor,role:'technician'};
  const onWay=await store.claim(tech,jobId,'on_my_way');assert.ok(onWay);
  await store.record(onWay.id,'unknown',null,'CHECK_PROVIDER_BEFORE_RETRY');
  assert.equal(await store.claim(tech,jobId,'on_my_way'),null);
  const unchanged=Object.keys(before).filter(n=>!['customers','hearth_jobs_store','audit_logs'].includes(n));
  assert.deepEqual(await fingerprintTables(sql,unchanged),Object.fromEntries(unchanged.map(n=>[n,before[n]])));
  console.log(JSON.stringify({ok:true,archiveSha256,migrationReplays:2,originalTablesUnchangedByMigration:Object.keys(before).length,fixtureJob:jobId,guards:['tenant','role','job','recipient','kill-switch','daily-cap','duplicate','unknown-send','status-order']}));
 });
}finally{await rm(dir,{recursive:true,force:true});}
