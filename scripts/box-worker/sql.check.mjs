// Проверка SQL миграции очереди в PGlite (Postgres в WASM), без живой базы.
// Запуск: npm i --no-save @electric-sql/pglite && node scripts/box-worker/sql.check.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`create role authenticator; create role anon; create role authenticated; create role service_role;
create table meeting_summaries (id uuid primary key, content text default '');
create table supplier_offer_emails (id uuid primary key, extraction jsonb);`);
await db.exec(readFileSync(new URL('../../supabase/migrations/20261014-ai-box-worker-queue.sql', import.meta.url),'utf8').replace("notify pgrst, 'reload schema';",''));
// idempotent re-run
await db.exec(readFileSync(new URL('../../supabase/migrations/20261014-ai-box-worker-queue.sql', import.meta.url),'utf8').replace("notify pgrst, 'reload schema';",''));
const ok=(c,m)=>{ if(!c) {console.error('FAIL',m); process.exitCode=1;} else console.log('ok',m); };
const M='11111111-1111-1111-1111-111111111111', E='22222222-2222-2222-2222-222222222222', E2='33333333-3333-3333-3333-333333333333';
await q(`insert into meeting_summaries(id) values($1)`,[M]);
await q(`insert into supplier_offer_emails values($1,'{"status":"queued"}'),($2,'{"status":"queued"}')`,[E,E2]);
const enq = async (k,p)=> (await q(`select ai_box_enqueue($1,$2::jsonb) id`,[k,JSON.stringify(p)])).rows[0].id;
const jm = await enq('meeting_summary',{meetingId:M,transcript:'x'});
await q(`update meeting_summaries set ai_status='queued', ai_job_id=$1 where id=$2`,[jm,M]);
const j1 = await enq('invoice_recognition',{emailId:E,fileUrl:'u1',fileName:'a.pdf'});
const j2 = await enq('invoice_recognition',{emailId:E,fileUrl:'u2',fileName:'b.pdf'});
const j3 = await enq('invoice_recognition',{emailId:E2,fileUrl:'u3',fileName:'c.pdf'});
const claimed=(await q(`select id from ai_box_claim('w',5)`)).rows; ok(claimed.length===4,'claim 4');
await q(`select ai_box_complete($1,'w','{"summary":"# S"}'::jsonb)`,[jm]);
let m=(await q(`select * from meeting_summaries`)).rows[0]; ok(m.content==='# S'&&m.ai_status===null,'meeting applied');
ok((await q(`select applied_at from ai_box_jobs where id=$1`,[jm])).rows[0].applied_at,'meeting applied_at');
await q(`select ai_box_complete($1,'w','{"isInvoice":true,"price":10,"items":[]}'::jsonb)`,[j1]);
let e=(await q(`select extraction from supplier_offer_emails where id=$1`,[E])).rows[0].extraction; ok(e.status==='queued','waits for second attachment');
await q(`select ai_box_complete($1,'w','{"isInvoice":true,"price":20,"items":[]}'::jsonb)`,[j2]);
e=(await q(`select extraction from supplier_offer_emails where id=$1`,[E])).rows[0].extraction;
ok(e.status==='pending'&&e.boxPrefilled&&e.price===10&&e.sourceFile.fileName==='a.pdf'&&e.additionalInvoices.length===1&&e.additionalInvoices[0].price===20,'invoice prefilled');
ok((await q(`select count(*)::int c from ai_box_jobs where applied_at is null and kind='invoice_recognition' and payload->>'emailId'=$1`,[E])).rows[0].c===2,'invoice left for JS');
// stale: j3 running, push locked_at back; attempts=1 <4 -> requeue
await q(`update ai_box_jobs set locked_at=now()-interval '20 minutes' where id=$1`,[j3]);
await q(`select ai_box_sweep_stale()`); ok((await q(`select status from ai_box_jobs where id=$1`,[j3])).rows[0].status==='queued','stale requeued');
await q(`update ai_box_jobs set status='running', attempts=4, locked_at=now()-interval '20 minutes' where id=$1`,[j3]);
const c2=(await q(`select id from ai_box_claim('w',5)`)).rows; ok(c2.length===0,'exhausted not claimed');
ok((await q(`select status from ai_box_jobs where id=$1`,[j3])).rows[0].status==='error','exhausted -> error');
e=(await q(`select extraction from supplier_offer_emails where id=$1`,[E2])).rows[0].extraction;
ok(e.status==='manual'&&e.manualFiles[0].fileName==='c.pdf'&&e.error,'email manual');
// meeting fail without retry
const jm2=await enq('meeting_summary',{meetingId:M,transcript:'x'});
await q(`update meeting_summaries set ai_job_id=$1, ai_status='queued' where id=$2`,[jm2,M]);
await q(`select ai_box_claim('w',1)`); await q(`select ai_box_fail($1,'w','429',false)`,[jm2]);
m=(await q(`select * from meeting_summaries`)).rows[0]; ok(m.ai_status==='manual'&&m.ai_error==='429'&&m.content==='# S','meeting manual');
// manually handled email not overwritten
const E3='44444444-4444-4444-4444-444444444444';
await q(`insert into supplier_offer_emails values($1,'{"status":"confirmed"}')`,[E3]);
const j4=await enq('invoice_recognition',{emailId:E3,fileUrl:'u',fileName:'d.pdf'});
await q(`select ai_box_claim('w',1)`); await q(`select ai_box_complete($1,'w','{"isInvoice":true}'::jsonb)`,[j4]);
ok((await q(`select extraction->>'status' s from supplier_offer_emails where id=$1`,[E3])).rows[0].s==='confirmed','manual work kept');
