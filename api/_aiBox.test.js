import { describe, expect, it, vi } from 'vitest';
import { applyFinishedBoxJobs, buildExtractionFromJobs, enqueueInvoiceJobs, serverAiEnabled } from './_aiBox.js';
import { queueSummary } from './meeting-ai.js';

const inv = (over = {}) => ({ isInvoice: true, price: 1000, currency: 'RUB', items: [{ name: 'Плитка', qty: 1, price: 1000 }], supplierInn: null, recognizedAt: 't', ...over });
const job = (id, fileName, over = {}) => ({
  id,
  kind: 'invoice_recognition',
  status: 'done',
  payload: { fileUrl: `https://f/${fileName}`, fileName, emailId: 'e1' },
  result: inv(),
  error: null,
  applied_at: null,
  ...over,
});

function deps(over = {}) {
  return {
    enqueue: vi.fn(async (kind) => `job-${kind}`),
    listFinished: vi.fn(async () => []),
    listEmailJobs: vi.fn(async () => []),
    markApplied: vi.fn(async () => null),
    getEmail: vi.fn(async () => ({ id: 'e1', offer_id: 'o1', order_id: null, subject: 'Счёт', extraction: { status: 'queued' } })),
    updateEmailExtraction: vi.fn(async () => null),
    updateMeeting: vi.fn(async () => null),
    applyRecognizedInvoice: vi.fn(async ({ sourceFile }) => ({ quoteId: `q-${sourceFile.fileName}`, itemIds: [] })),
    ...over,
  };
}

describe('INVOICE_AI', () => {
  it('по умолчанию выключен — сервер модель не зовёт', () => {
    expect(serverAiEnabled({})).toBe(false);
    expect(serverAiEnabled({ INVOICE_AI: 'off' })).toBe(false);
    expect(serverAiEnabled({ INVOICE_AI: 'ON ' })).toBe(true);
  });
});

describe('enqueue', () => {
  it('ставит задание на каждого кандидата и возвращает extraction queued', async () => {
    const d = deps();
    const ex = await enqueueInvoiceJobs(
      { emailId: 'e1', offerId: 'o1', orderId: null, subject: 'КП', body: 'тело', candidates: [{ url: 'u1', fileName: 'a.pdf' }, { url: 'u2', fileName: 'b.png' }] },
      d,
    );
    expect(d.enqueue).toHaveBeenCalledTimes(2);
    expect(d.enqueue.mock.calls[0]).toEqual([
      'invoice_recognition',
      { fileUrl: 'u1', fileName: 'a.pdf', emailContext: { subject: 'КП', body: 'тело' }, emailId: 'e1', offerId: 'o1', orderId: null },
    ]);
    expect(ex.status).toBe('queued');
    expect(ex.boxJobs.map((j) => j.fileName)).toEqual(['a.pdf', 'b.png']);
  });

  it('очередь недоступна — сразу «Разобрать вручную»', async () => {
    const d = deps({ enqueue: vi.fn(async () => { throw new Error('down'); }) });
    const ex = await enqueueInvoiceJobs({ emailId: 'e1', offerId: 'o1', candidates: [{ url: 'u1', fileName: 'a.pdf' }] }, d);
    expect(ex.status).toBe('manual');
    expect(ex.error).toContain('down');
  });

  it('саммери встречи: задание + пометка queued на встрече', async () => {
    const d = deps();
    const id = await queueSummary({ meetingId: 'm1', transcript: '[00:01] привет' }, d);
    expect(id).toBe('job-meeting_summary');
    expect(d.enqueue).toHaveBeenCalledWith('meeting_summary', { meetingId: 'm1', transcript: '[00:01] привет' });
    expect(d.updateMeeting).toHaveBeenCalledWith('m1', { ai_status: 'queued', ai_error: null, ai_job_id: 'job-meeting_summary' });
  });
});

describe('buildExtractionFromJobs', () => {
  it('первый счёт в корне, второй в additionalInvoices, копии схлопываются', () => {
    const ex = buildExtractionFromJobs([
      job('1', 'schet.pdf'),
      job('2', 'zakaz.pdf'),
      job('3', 'other.pdf', { result: inv({ price: 5, items: [{ name: 'Цемент' }] }) }),
    ]);
    expect(ex.status).toBe('pending');
    expect(ex.sourceFile.fileName).toBe('schet.pdf');
    expect(ex.duplicateFiles.map((f) => f.fileName)).toEqual(['zakaz.pdf']);
    expect(ex.additionalInvoices).toHaveLength(1);
    expect(ex.additionalInvoices[0].sourceFile.fileName).toBe('other.pdf');
  });

  it('ошибка бокса или «не счёт» → manual с файлами для ручного разбора', () => {
    const ex = buildExtractionFromJobs([job('1', 'a.pdf', { status: 'error', result: null, error: '403' }), job('2', 'b.pdf', { result: inv({ isInvoice: false }) })]);
    expect(ex.status).toBe('manual');
    expect(ex.manualFiles.map((f) => f.fileName)).toEqual(['a.pdf', 'b.pdf']);
    expect(ex.error).toBeTruthy();
  });
});

describe('applyFinishedBoxJobs', () => {
  it('записывает счёт в карточку тем же applyRecognizedInvoice и помечает задания', async () => {
    const jobs = [job('1', 'a.pdf')];
    const d = deps({ listFinished: vi.fn(async () => jobs), listEmailJobs: vi.fn(async () => jobs) });
    await applyFinishedBoxJobs({}, d);
    expect(d.applyRecognizedInvoice).toHaveBeenCalledTimes(1);
    expect(d.applyRecognizedInvoice.mock.calls[0][0]).toMatchObject({ emailId: 'e1', offerId: 'o1', sourceFile: { fileName: 'a.pdf' } });
    const ex = d.updateEmailExtraction.mock.calls[0][1];
    expect(ex).toMatchObject({ status: 'confirmed', appliedAutomatically: true, applied: { quoteId: 'q-a.pdf' } });
    expect(d.markApplied).toHaveBeenCalledWith(['1'], null);
  });

  it('ждёт, пока не разобраны все вложения письма', async () => {
    const jobs = [job('1', 'a.pdf'), job('2', 'b.pdf', { status: 'running' })];
    const d = deps({ listFinished: vi.fn(async () => [jobs[0]]), listEmailJobs: vi.fn(async () => jobs) });
    await applyFinishedBoxJobs({}, d);
    expect(d.updateEmailExtraction).not.toHaveBeenCalled();
    expect(d.markApplied).not.toHaveBeenCalled();
  });

  it('не перетирает письмо, которое уже разобрали руками', async () => {
    const jobs = [job('1', 'a.pdf')];
    const d = deps({
      listFinished: vi.fn(async () => jobs),
      listEmailJobs: vi.fn(async () => jobs),
      getEmail: vi.fn(async () => ({ id: 'e1', offer_id: 'o1', subject: '', extraction: { status: 'confirmed' } })),
    });
    await applyFinishedBoxJobs({}, d);
    expect(d.updateEmailExtraction).not.toHaveBeenCalled();
    expect(d.markApplied).toHaveBeenCalledWith(['1'], null);
  });

  it('встреча: саммери в content, ошибка — «Разобрать вручную»', async () => {
    const ok = { id: 'm-ok', kind: 'meeting_summary', status: 'done', payload: { meetingId: 'm1' }, result: { summary: '# Саммери' } };
    const bad = { id: 'm-bad', kind: 'meeting_summary', status: 'error', payload: { meetingId: 'm2' }, result: null, error: '429' };
    const d = deps({ listFinished: vi.fn(async () => [ok, bad]) });
    await applyFinishedBoxJobs({}, d);
    expect(d.updateMeeting).toHaveBeenCalledWith('m1', { content: '# Саммери', ai_status: null, ai_error: null, ai_job_id: null });
    expect(d.updateMeeting).toHaveBeenCalledWith('m2', { ai_status: 'manual', ai_error: '429' });
    expect(d.markApplied).toHaveBeenCalledTimes(2);
  });

  it('дописывает КП в письмо, которое триггер уже заполнил (boxPrefilled)', async () => {
    const jobs = [job('1', 'a.pdf')];
    const d = deps({
      listFinished: vi.fn(async () => jobs),
      listEmailJobs: vi.fn(async () => jobs),
      getEmail: vi.fn(async () => ({ id: 'e1', offer_id: 'o1', subject: '', extraction: { status: 'pending', boxPrefilled: true } })),
    });
    await applyFinishedBoxJobs({}, d);
    const ex = d.updateEmailExtraction.mock.calls[0][1];
    expect(ex.status).toBe('confirmed');
    expect(ex.boxPrefilled).toBeUndefined();
  });

  it('сбой записи в карточку: письмо остаётся pending для ручного подтверждения', async () => {
    const jobs = [job('1', 'a.pdf')];
    const d = deps({
      listFinished: vi.fn(async () => jobs),
      listEmailJobs: vi.fn(async () => jobs),
      applyRecognizedInvoice: vi.fn(async () => { throw new Error('db'); }),
    });
    await applyFinishedBoxJobs({}, d);
    expect(d.updateEmailExtraction.mock.calls[0][1].status).toBe('pending');
  });
});
