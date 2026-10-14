// Связка сервера с очередью ai_box_jobs (ИИ-воркер на боксе, см.
// scripts/box-worker/README.md и миграцию 20261014-ai-box-worker-queue.sql).
//
// Флаг INVOICE_AI (env Vercel): 'on' — как раньше, сервер сам зовёт модель
// (ProxyAPI). Всё остальное, в том числе пусто, — 'off': сервер модель НЕ
// зовёт, а ставит задание в очередь; результат с бокса переносится в
// карточку счёта / запись встречи функцией applyFinishedBoxJobs. Если бокс
// не справился (status error) — карточка получает пометку «Разобрать
// вручную» (extraction.status 'manual' / meeting_summaries.ai_status).
import { applyRecognizedInvoice, quoteTitle } from './_invoiceApply.js';

export function serverAiEnabled(env = process.env) {
  return String(env.INVOICE_AI ?? '').trim().toLowerCase() === 'on';
}

function restHeaders(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

async function rest(path, init = {}) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: restHeaders(init.headers) });
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

export const defaultDeps = {
  enqueue: (kind, payload) => rest('rpc/ai_box_enqueue', { method: 'POST', body: JSON.stringify({ p_kind: kind, p_payload: payload }) }),
  listFinished: (limit) =>
    rest(`ai_box_jobs?select=id,kind,status,payload,result,error&status=in.(done,error)&applied_at=is.null&order=updated_at.asc&limit=${limit}`),
  // Остальные задания того же письма — счёт письма собирается целиком, когда
  // разобраны все его вложения (как при серверном распознавании).
  listEmailJobs: (emailId) =>
    rest(`ai_box_jobs?select=id,kind,status,payload,result,error,applied_at&kind=eq.invoice_recognition&payload->>emailId=eq.${encodeURIComponent(emailId)}`),
  markApplied: (ids, applyError = null) =>
    rest(`ai_box_jobs?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ applied_at: new Date().toISOString(), apply_error: applyError }),
    }),
  getEmail: async (emailId) => (await rest(`supplier_offer_emails?id=eq.${emailId}&select=id,offer_id,order_id,subject,extraction`))?.[0] ?? null,
  updateEmailExtraction: (emailId, extraction) =>
    rest(`supplier_offer_emails?id=eq.${emailId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ extraction }) }),
  updateMeeting: (meetingId, patch) =>
    rest(`meeting_summaries?id=eq.${meetingId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }),
  applyRecognizedInvoice,
};

// ---------- постановка ----------

// Счёт: по заданию на каждое вложение-кандидата (выбор кандидатов тот же,
// что у серверного распознавания — pickInvoiceCandidates). Возвращает
// extraction со status 'queued' — его кладут в письмо сразу.
export async function enqueueInvoiceJobs({ emailId, offerId, orderId, subject, body, candidates }, deps = defaultDeps) {
  const emailContext = { subject: subject ?? '', body: String(body ?? '').slice(0, 2000) };
  const boxJobs = [];
  const errors = [];
  for (const c of candidates) {
    try {
      const id = await deps.enqueue('invoice_recognition', {
        fileUrl: c.url,
        fileName: c.fileName,
        emailContext,
        emailId,
        offerId: offerId ?? null,
        orderId: orderId ?? null,
      });
      boxJobs.push({ id, fileName: c.fileName, url: c.url });
    } catch (err) {
      errors.push(`${c.fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const base = { isInvoice: false, price: null, currency: null, items: [], supplierInn: null, sourceFile: null, recognizedAt: new Date().toISOString() };
  if (boxJobs.length === 0) {
    return { ...base, status: 'manual', error: errors.join('; ').slice(0, 300) || 'Нет вложений для распознавания' };
  }
  return { ...base, status: 'queued', boxJobs, ...(errors.length > 0 && { error: errors.join('; ').slice(0, 300) }) };
}

export async function enqueueMeetingSummary({ meetingId, transcript }, deps = defaultDeps) {
  return deps.enqueue('meeting_summary', { meetingId, transcript });
}

// ---------- применение ----------

function asFile(job) {
  return { url: job.payload.fileUrl, fileName: job.payload.fileName };
}

// Собирает extraction письма из готовых заданий в той же форме, что
// серверное распознавание в purchase-email-webhook.js: первый счёт в
// корне, остальные в additionalInvoices.
export function buildExtractionFromJobs(jobs) {
  const invoices = jobs.filter((j) => j.status === 'done' && j.result?.isInvoice);
  const attempts = jobs.map((j) => ({
    fileName: j.payload.fileName,
    outcome: j.status === 'error' ? `ошибка бокса: ${String(j.error ?? '').slice(0, 120)}` : j.result?.isInvoice ? 'счёт' : 'не счёт',
  }));
  if (invoices.length === 0) {
    const failed = jobs.some((j) => j.status === 'error');
    return {
      status: 'manual',
      isInvoice: false,
      price: null,
      currency: null,
      items: [],
      supplierInn: null,
      sourceFile: null,
      recognizedAt: new Date().toISOString(),
      attempts,
      skipped: [],
      manualFiles: jobs.map(asFile),
      ...(failed && { error: 'ИИ на боксе не смог разобрать вложения' }),
    };
  }
  // Один счёт двумя файлами (счёт + «заказ клиента») — как
  // invoiceIdentity в _invoiceRecognition.js: та же сумма и те же позиции.
  const identity = (r) => JSON.stringify([r.price ?? null, (r.items ?? []).map((it) => String(it.name ?? '').trim().toLowerCase())]);
  const groups = new Map();
  for (const j of invoices) {
    const key = identity(j.result);
    if (groups.has(key)) groups.get(key).duplicates.push(asFile(j));
    else groups.set(key, { job: j, duplicates: [] });
  }
  const [first, ...rest] = [...groups.values()].map((g) => ({ ...g.job, duplicates: g.duplicates }));
  return {
    status: 'pending',
    ...first.result,
    sourceFile: asFile(first),
    duplicateFiles: first.duplicates,
    recognizedAt: first.result.recognizedAt ?? new Date().toISOString(),
    attempts,
    ...(rest.length > 0 && {
      additionalInvoices: rest.map((j) => ({ ...j.result, sourceFile: asFile(j), duplicateFiles: j.duplicates, applied: null })),
    }),
  };
}

async function applyEmail(emailId, deps) {
  const jobs = (await deps.listEmailJobs(emailId)) ?? [];
  const unfinished = jobs.filter((j) => j.status !== 'done' && j.status !== 'error');
  if (unfinished.length > 0) return { emailId, waiting: unfinished.length, ids: [] };
  const ids = jobs.filter((j) => !j.applied_at).map((j) => j.id);
  const email = await deps.getEmail(emailId);
  if (!email) return { emailId, ids, error: 'Письмо не найдено' };
  // Человек уже разобрал письмо руками — не перетираем.
  const st = email.extraction?.status;
  if (st && st !== 'queued' && st !== 'manual') return { emailId, ids, skipped: st };
  let extraction = buildExtractionFromJobs(jobs);
  const invoices = (extraction.status === 'pending' ? [extraction, ...(extraction.additionalInvoices ?? [])] : []);
  const several = invoices.length > 1;
  const appliedByUrl = new Map();
  for (const inv of invoices) {
    try {
      const applied = await deps.applyRecognizedInvoice({
        emailId,
        offerId: email.offer_id,
        orderId: email.order_id,
        subject: email.subject ?? '',
        recognized: inv,
        sourceFile: inv.sourceFile,
        title: quoteTitle(email.subject ?? '', inv.sourceFile.fileName, several),
      });
      appliedByUrl.set(inv.sourceFile.url, applied);
    } catch (err) {
      console.error(`[aiBox] не удалось записать счёт ${inv.sourceFile.fileName} (останется ручное подтверждение):`, err);
    }
  }
  if (appliedByUrl.size > 0) {
    extraction = {
      ...extraction,
      status: appliedByUrl.size === invoices.length ? 'confirmed' : 'pending',
      appliedAutomatically: true,
      applied: appliedByUrl.get(extraction.sourceFile?.url) ?? null,
      ...(extraction.additionalInvoices && {
        additionalInvoices: extraction.additionalInvoices.map((inv) => ({ ...inv, applied: appliedByUrl.get(inv.sourceFile?.url) ?? null })),
      }),
    };
  }
  await deps.updateEmailExtraction(emailId, extraction);
  return { emailId, ids, status: extraction.status };
}

async function applyMeeting(job, deps) {
  const meetingId = job.payload?.meetingId;
  if (!meetingId) return { ids: [job.id], error: 'Нет meetingId' };
  const summary = job.status === 'done' ? String(job.result?.summary ?? '').trim() : '';
  if (summary) {
    await deps.updateMeeting(meetingId, { content: summary, ai_status: null, ai_error: null, ai_job_id: null });
    return { meetingId, ids: [job.id], status: 'done' };
  }
  await deps.updateMeeting(meetingId, { ai_status: 'manual', ai_error: String(job.error ?? 'Пустое саммери').slice(0, 300) });
  return { meetingId, ids: [job.id], status: 'manual' };
}

// Переносит готовые задания в карточки. Идемпотентна: задание помечается
// applied_at только после записи. Зовётся из meeting-ai (action
// apply-box-jobs: страница встреч, cron) и в конце вебхука почты.
export async function applyFinishedBoxJobs({ limit = 20 } = {}, deps = defaultDeps) {
  const jobs = (await deps.listFinished(limit)) ?? [];
  const results = [];
  const seenEmails = new Set();
  for (const job of jobs) {
    try {
      let r;
      if (job.kind === 'meeting_summary') {
        r = await applyMeeting(job, deps);
      } else {
        const emailId = job.payload?.emailId;
        if (!emailId) r = { ids: [job.id], error: 'Нет emailId' };
        else if (seenEmails.has(emailId)) continue;
        else {
          seenEmails.add(emailId);
          r = await applyEmail(emailId, deps);
        }
      }
      if (r.ids.length > 0) await deps.markApplied(r.ids, r.error ?? null);
      results.push(r);
    } catch (err) {
      console.error(`[aiBox] применение задания ${job.id} не удалось:`, err);
      results.push({ ids: [], jobId: job.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
