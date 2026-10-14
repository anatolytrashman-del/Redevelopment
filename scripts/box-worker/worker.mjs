// ИИ-воркер на боксе: берёт задания из ai_box_jobs (миграция
// 20261014-ai-box-worker-queue.sql) и выполняет их через Grok (opencode).
//
// Доступ к базе — только через RPC ai_box_claim/complete/fail под ролью
// ai_box_worker (JWT в AI_BOX_WORKER_JWT). service_role воркеру не нужен.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... AI_BOX_WORKER_JWT=... \
//     node scripts/box-worker/worker.mjs [--once]
//
// Проверка без базы на локальных файлах:
//   node scripts/box-worker/worker.mjs --local invoice <файл>...
//   node scripts/box-worker/worker.mjs --local meeting <расшифровка.txt>
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { HANDLERS } from './jobs.mjs';
import { runModel as realRunModel } from './model.mjs';
import { createRateLimiter, classifyError, defaultSleep } from './rateLimit.mjs';

export function createQueue({ url, anonKey, jwt, fetchImpl = fetch }) {
  async function rpc(name, body) {
    const r = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) { const e = new Error(`RPC ${name}: ${r.status} ${text.slice(0, 200)}`); e.status = r.status; throw e; }
    return text ? JSON.parse(text) : null;
  }
  return {
    claim: (worker, limit = 1) => rpc('ai_box_claim', { p_worker: worker, p_limit: limit }),
    complete: (id, worker, result) => rpc('ai_box_complete', { p_id: id, p_worker: worker, p_result: result }),
    fail: (id, worker, error, retry, retryAfterS = null) =>
      rpc('ai_box_fail', { p_id: id, p_worker: worker, p_error: error, p_retry: retry, p_retry_after_s: retryAfterS }),
  };
}

// Одно задание: лимит частоты перед вызовом модели, классификация ошибки,
// при 429/403-регион/5xx/сети — обратно в очередь с паузой (её считает
// ai_box_fail), иначе — окончательная ошибка.
export async function processJob(job, { queue, worker, acquire, runModel, handlers = HANDLERS, log = console.log }) {
  const handler = handlers[job.kind];
  if (!handler) {
    await queue.fail(job.id, worker, `Неизвестный тип задания: ${job.kind}`, false);
    return { id: job.id, status: 'error' };
  }
  const limited = async (prompt, opts) => { await acquire(); return runModel(prompt, opts); };
  try {
    const result = await handler(job.payload ?? {}, { runModel: limited, readLocal: (p) => readFile(p) });
    await queue.complete(job.id, worker, result);
    log(`[box-worker] ${job.kind} ${job.id}: готово`);
    return { id: job.id, status: 'done', result };
  } catch (err) {
    const c = classifyError(err);
    const msg = `${c.reason}: ${err instanceof Error ? err.message : String(err)}`;
    const status = await queue.fail(job.id, worker, msg, c.retry, c.retryAfterS ?? null);
    log(`[box-worker] ${job.kind} ${job.id}: ${msg} → ${status}`);
    return { id: job.id, status: status ?? 'error', error: msg, reason: c.reason };
  }
}

export async function runLoop({ queue, worker, acquire, runModel, once = false, idleMs = 30_000, sleep = defaultSleep, log = console.log }) {
  let idle = idleMs;
  for (;;) {
    let jobs = [];
    try {
      jobs = (await queue.claim(worker, 1)) ?? [];
      idle = idleMs;
    } catch (err) {
      // База недоступна — не долбим её: пауза растёт до 10 минут.
      log(`[box-worker] claim: ${err.message}`);
      idle = Math.min(idle * 2, 600_000);
    }
    for (const job of jobs) await processJob(job, { queue, worker, acquire, runModel, log });
    if (once) return;
    if (!jobs.length) await sleep(idle);
  }
}

async function main(argv) {
  const acquire = createRateLimiter({ perMinute: Number(process.env.BOX_WORKER_RPM || 6) });
  const li = argv.indexOf('--local');
  if (li !== -1) {
    const kind = argv[li + 1];
    const files = argv.slice(li + 2);
    const results = [];
    for (const f of files) {
      const job = kind === 'meeting'
        ? { id: basename(f), kind: 'meeting_summary', payload: { transcript: await readFile(f, 'utf8') } }
        : { id: basename(f), kind: 'invoice_recognition', payload: { localPath: f, fileName: basename(f) } };
      const t = Date.now();
      const local = { complete: async () => true, fail: async (_i, _w, _e, retry) => (retry ? 'queued' : 'error') };
      const r = await processJob(job, { queue: local, worker: 'local', acquire, runModel: realRunModel, log: () => {} });
      results.push({ file: basename(f), ms: Date.now() - t, ...r });
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  const { SUPABASE_URL, SUPABASE_ANON_KEY, AI_BOX_WORKER_JWT } = process.env;
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AI_BOX_WORKER_JWT'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Не заданы: ${missing.join(', ')}`);
    process.exit(2);
  }
  const queue = createQueue({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, jwt: AI_BOX_WORKER_JWT });
  await runLoop({ queue, worker: `box:${hostname()}:${process.pid}`, acquire, runModel: realRunModel, once: argv.includes('--once') });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
