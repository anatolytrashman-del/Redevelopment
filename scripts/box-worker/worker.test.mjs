import { describe, it, expect } from 'vitest';
import { createRateLimiter, backoffMs, classifyError } from './rateLimit.mjs';
import { processJob, createQueue } from './worker.mjs';
import { lastTextFromOpencodeJson } from './model.mjs';
import { parseJsonLoose } from './jobs.mjs';

function fakeQueue() {
  const calls = [];
  return {
    calls,
    complete: async (id, w, result) => { calls.push(['complete', id, result]); return true; },
    fail: async (id, w, error, retry, after) => { calls.push(['fail', id, error, retry, after]); return retry ? 'queued' : 'error'; },
  };
}
const noLimit = async () => {};

const INVOICES = [
  { id: 'inv1', answer: '{"isInvoice":true,"confidence":0.95,"price":125000,"currency":"RUB","supplierName":"ООО Ромашка","items":[]}', isInvoice: true },
  { id: 'inv2', answer: '```json\n{"isInvoice":true,"confidence":0.9,"price":48300.5,"currency":"RUB"}\n```', isInvoice: true },
  { id: 'inv3', answer: 'Вот ответ: {"isInvoice":false,"confidence":0.98}', isInvoice: false },
  { id: 'inv4', answer: '{"isInvoice":true,"price":3540,"currency":"BYN"}', isInvoice: true },
];

describe('box-worker: счета и встреча', () => {
  for (const inv of INVOICES) {
    it(`счёт ${inv.id}`, async () => {
      const q = fakeQueue();
      const handlers = {
        invoice_recognition: async (_p, { runModel }) => ({ ...(await import('../../api/_invoiceRecognition.js')).normalizeRecognized(parseJsonLoose(await runModel('x'))) }),
      };
      const r = await processJob({ id: inv.id, kind: 'invoice_recognition', payload: {} },
        { queue: q, worker: 'w', acquire: noLimit, runModel: async () => inv.answer, handlers, log: () => {} });
      expect(r.status).toBe('done');
      expect(q.calls[0][0]).toBe('complete');
      expect(q.calls[0][2].isInvoice).toBe(inv.isInvoice);
    });
  }

  it('встреча → саммери', async () => {
    const q = fakeQueue();
    let seen = '';
    const r = await processJob({ id: 'm1', kind: 'meeting_summary', payload: { transcript: '[00:01] Иван: обсудим смету на ремонт офиса, бюджет 2 млн.' } },
      { queue: q, worker: 'w', acquire: noLimit, runModel: async (p) => { seen = p; return '# Саммери встречи: смета'; }, log: () => {} });
    expect(r.status).toBe('done');
    expect(seen).toContain('Расшифровка');
    expect(q.calls[0][2].summary).toContain('Саммери');
  });

  it('429 → обратно в очередь с Retry-After', async () => {
    const q = fakeQueue();
    const e = Object.assign(new Error('Too Many Requests'), { status: 429, retryAfterS: 30 });
    const r = await processJob({ id: 'x', kind: 'meeting_summary', payload: { transcript: '[00:01] текст встречи достаточно длинный' } },
      { queue: q, worker: 'w', acquire: noLimit, runModel: async () => { throw e; }, log: () => {} });
    expect(r.status).toBe('queued');
    expect(q.calls[0]).toEqual(['fail', 'x', expect.stringContaining('rate_limit'), true, 30]);
  });

  it('401 → окончательная ошибка', async () => {
    const q = fakeQueue();
    const r = await processJob({ id: 'y', kind: 'meeting_summary', payload: { transcript: '[00:01] текст встречи достаточно длинный' } },
      { queue: q, worker: 'w', acquire: noLimit, runModel: async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); }, log: () => {} });
    expect(r.status).toBe('error');
  });

  it('неизвестный тип → error', async () => {
    const q = fakeQueue();
    expect((await processJob({ id: 'z', kind: 'nope' }, { queue: q, worker: 'w', acquire: noLimit, runModel: async () => '' })).status).toBe('error');
  });
});

describe('rate limit и backoff', () => {
  it('не больше N вызовов в минуту', async () => {
    let t = 0;
    const waits = [];
    const acquire = createRateLimiter({ perMinute: 2, minIntervalMs: 1000, now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } });
    await acquire(); await acquire(); await acquire();
    expect(waits).toEqual([1000, 59000]);
  });
  it('экспонента с потолком', () => {
    const r = () => 0.5;
    expect(backoffMs(1, { random: r })).toBe(60000);
    expect(backoffMs(3, { random: r })).toBe(240000);
    expect(backoffMs(20, { random: r })).toBe(3600000);
  });
  it('классификация', () => {
    expect(classifyError(Object.assign(new Error('Grok is not available in your region'), { status: 403 })).retry).toBe(true);
    expect(classifyError(new Error('fetch failed')).reason).toBe('network');
    expect(classifyError(Object.assign(new Error('x'), { status: 503 })).retry).toBe(true);
    expect(classifyError(Object.assign(new Error('forbidden'), { status: 403 })).retry).toBe(false);
  });
});

describe('обвязка', () => {
  it('последний text из opencode --format json', () => {
    const out = '{"type":"text","part":{"text":"a"}}\r\n{"type":"step_finish"}\n\u001b[0m{"type":"text","part":{"text":"{\\"ok\\":true}"}}\n';
    expect(lastTextFromOpencodeJson(out)).toBe('{"ok":true}');
    expect(() => lastTextFromOpencodeJson('{"type":"error","error":{"message":"429 rate limited"}}')).toThrow(/429/);
  });
  it('RPC идут с JWT роли воркера', async () => {
    const seen = [];
    const q = createQueue({ url: 'https://s', anonKey: 'anon', jwt: 'jwt', fetchImpl: async (u, i) => { seen.push([u, i.headers.Authorization, JSON.parse(i.body)]); return { ok: true, text: async () => '[]' }; } });
    await q.claim('w', 2);
    expect(seen[0]).toEqual(['https://s/rest/v1/rpc/ai_box_claim', 'Bearer jwt', { p_worker: 'w', p_limit: 2 }]);
  });
});
