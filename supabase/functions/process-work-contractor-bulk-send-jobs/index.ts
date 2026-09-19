// Массовая рассылка подрядчикам по категории (владелец, 2026-09-19:
// "сделай мне возможность массовой отправки письма по категории, включая
// прикрепление файла") — Supabase Edge Function, один в один архитектура
// process-bulk-send-jobs (поставщики), но своя пара таблиц
// (work_contractor_bulk_send_jobs/_items): там bulk_send_job_items.offer_id
// not null и концептуально привязан к supplier_research_offers, подрядчика
// в неё не положить без правки чужой схемы.
//
// Темп отправки — тот же, что у поставщиков: 25-35 секунд между письмами,
// чтобы рассылка не выглядела машинной. pg_cron дёргает раз в минуту (см.
// второй блок supabase/migrations/20260919-work-contractors-fields.sql,
// выполняется отдельно после деплоя этой функции).
//
// Письмо захватывается атомарно (UPDATE ... WHERE status='pending'), плюс
// уникальный индекс work_contractor_emails_bulk_job_item_uniq — тот же
// двойной рубеж от дубля, что и у поставщиков (см.
// 20260912-bulk-send-no-duplicates.sql, где 38 поставщиков однажды получили
// письмо дважды из-за одновременного запуска двух воркеров).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const RESEND_FROM_NAME = 'Анатолий Трэшмен';
const ATTACHMENTS_BUCKET = 'object-documents';
const MIN_DELAY_MS = 25000;
const MAX_DELAY_MS = 35000;
const MAX_EMAILS_PER_RUN = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
const emailAddress = (shortCode: string) => `zakupki+${shortCode}@redevelopment.pro`;

function emailHtml(body: string): string {
  const escaped = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#14151a;white-space:pre-wrap;">${escaped}</div>`;
}

// Название компании — то же приоритетное правило, что и на фронте
// (workContractorTitle в src/data/workContractors.ts): companyName, иначе
// хвост ссылки на Авито, иначе email. Продублировано намеренно — Deno-
// функция не может импортировать TS из src/ (тот же случай, что и api/*.js,
// см. CLAUDE.md про файлы-близнецы).
function avitoSlug(url: string): string {
  if (!url) return '';
  try {
    const path = new URL(url.startsWith('http') ? url : `https://${url}`).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    return last === 'profile' ? (path.split('/').filter(Boolean).at(-2) ?? '') : last;
  } catch {
    return '';
  }
}

function contractorTitle(contractor: any): string {
  if (contractor.company_name) return contractor.company_name;
  const fromAvito = avitoSlug(contractor.avito_url ?? '');
  if (fromAvito) return fromAvito;
  return contractor.email || 'Без названия';
}

// Подстановка плейсхолдеров — тот же синтаксис {…}, что и в
// src/data/workContractorTemplates.ts (не импортируется по той же причине
// файлов-близнецов).
function renderTemplate(text: string, contractor: any): string {
  return String(text).replace(/\{([^{}]*)\}/g, (match, rawKey) => {
    const key = String(rawKey).trim().toLowerCase();
    if (key === 'компания') return contractorTitle(contractor);
    if (key === 'категория') return contractor.category || match;
    if (key === 'email') return contractor.email || match;
    return match;
  });
}

const fileExtension = (fileName: string) => {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? (parts.pop() as string).toLowerCase() : 'bin';
};
const sanitizeFileName = (fileName: string) => String(fileName).replace(/[\\/]/g, '_');

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Копия вложения в Storage — чтобы файл был виден в ленте переписки
// подрядчика, а не только улетел в почтовый ящик.
async function uploadAttachmentToStorage(bytes: Uint8Array, contentType: string, fileName: string) {
  const path = `work-contractor-bulk-send/${crypto.randomUUID()}.${fileExtension(fileName)}`;
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${ATTACHMENTS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: bytes,
  });
  if (!resp.ok) throw new Error(`Не удалось загрузить вложение: ${(await resp.text()).slice(0, 200)}`);
  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/${ATTACHMENTS_BUCKET}/${path}`,
    fileName: sanitizeFileName(fileName),
  };
}

async function sendOneEmail(job: any, item: any, contractor: any) {
  // Второй рубеж против дубля (первый — атомарный захват строки задания в
  // основном цикле): по каждой строке задания в переписке может быть только
  // одно письмо — см. уникальный индекс work_contractor_emails_bulk_job_item_uniq.
  const { data: alreadySent } = await supabase
    .from('work_contractor_emails')
    .select('id')
    .eq('bulk_job_item_id', item.id)
    .limit(1);
  if ((alreadySent ?? []).length > 0) {
    console.log(`  письмо по строке задания ${item.id} уже отправлено, повтор не шлём`);
    return;
  }

  const subject = renderTemplate(job.subject, contractor).trim();
  const body = renderTemplate(job.body, contractor);

  const resendAttachments: { filename: string; content: string }[] = [];
  const storedFiles: { url: string; fileName: string }[] = [];
  if (job.attachment?.contentBase64 && job.attachment?.fileName) {
    resendAttachments.push({ filename: job.attachment.fileName, content: job.attachment.contentBase64 });
    try {
      storedFiles.push(
        await uploadAttachmentToStorage(
          base64ToBytes(job.attachment.contentBase64),
          job.attachment.contentType,
          job.attachment.fileName,
        ),
      );
    } catch (err) {
      console.error('  не удалось сохранить вложение в Storage:', err instanceof Error ? err.message : err);
    }
  }

  const fromAddress = emailAddress(contractor.short_code);
  // Idempotency-Key на строку задания — если связь оборвётся ПОСЛЕ того, как
  // Resend принял письмо, но ДО записи строки в work_contractor_emails,
  // следующий тик пойдёт по этой же строке заново; Resend по ключу вернёт
  // уже принятое письмо вместо повторной отправки (тот же приём, что и у
  // поставщиков после инцидента с задвоением 2026-09-12).
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `wc-bulk-item-${item.id}`,
    },
    body: JSON.stringify({
      from: `${RESEND_FROM_NAME} <${fromAddress}>`,
      to: [contractor.email],
      subject: subject || 'Письмо',
      html: emailHtml(body),
      ...(resendAttachments.length > 0 ? { attachments: resendAttachments } : {}),
    }),
  });
  if (!resendResp.ok) throw new Error(`Resend: ${(await resendResp.text()).slice(0, 300)}`);
  const resendJson = await resendResp.json();

  const { error } = await supabase.from('work_contractor_emails').insert({
    contractor_id: contractor.id,
    direction: 'out',
    from_address: fromAddress,
    to_address: contractor.email,
    subject,
    body,
    files: storedFiles,
    resend_message_id: resendJson?.id ?? null,
    bulk_job_item_id: item.id,
    sent_by_profile_id: job.created_by_profile_id ?? null,
    sent_by_name: job.created_by_name ?? null,
  });
  if (error) throw error;
}

async function closeFinishedJobs() {
  const { data: jobs } = await supabase.from('work_contractor_bulk_send_jobs').select('id').eq('status', 'queued');
  for (const job of jobs ?? []) {
    const { count } = await supabase
      .from('work_contractor_bulk_send_job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .in('status', ['pending', 'sending']);
    if (count === 0) await supabase.from('work_contractor_bulk_send_jobs').update({ status: 'done' }).eq('id', job.id);
  }
}

Deno.serve(async () => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY не задан в секретах функции' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const summary = { sent: 0, failed: 0, errors: [] as string[] };

  const { data: jobs } = await supabase
    .from('work_contractor_bulk_send_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });

  outer: for (const job of jobs ?? []) {
    const { data: items } = await supabase
      .from('work_contractor_bulk_send_job_items')
      .select('*')
      .eq('job_id', job.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    for (const item of items ?? []) {
      if (summary.sent + summary.failed >= MAX_EMAILS_PER_RUN) break outer;

      // Атомарный захват: если строку уже взял другой вызов — пропускаем.
      const { data: claimed } = await supabase
        .from('work_contractor_bulk_send_job_items')
        .update({ status: 'sending' })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id');
      if ((claimed?.length ?? 0) === 0) continue;

      const { data: contractor } = await supabase
        .from('work_contractors')
        .select('*')
        .eq('id', item.contractor_id)
        .maybeSingle();
      if (!contractor || !contractor.email) {
        await supabase
          .from('work_contractor_bulk_send_job_items')
          .update({ status: 'error', error_message: 'Подрядчик не найден или без email' })
          .eq('id', item.id);
        summary.failed++;
        continue;
      }

      if (summary.sent + summary.failed > 0) await sleep(randomDelay());

      try {
        await sendOneEmail(job, item, contractor);
        await supabase
          .from('work_contractor_bulk_send_job_items')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', item.id);
        summary.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabase
          .from('work_contractor_bulk_send_job_items')
          .update({ status: 'error', error_message: message.slice(0, 400) })
          .eq('id', item.id);
        summary.errors.push(`${contractorTitle(contractor)}: ${message.slice(0, 150)}`);
        summary.failed++;
      }
    }
  }

  await closeFinishedJobs();
  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } });
});
