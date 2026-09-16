// Дожим молчащих поставщиков — Supabase Edge Function, крон раз в час.
// Шаг 8 плана закупок (docs/procurement-product-steps.md).
//
// Зачем. Письмо ушло — и дальше тишина. Никто не считает, сколько дней
// поставщик молчит, и никто ему не напоминает: закупщица либо помнит это в
// голове, либо не помнит. В воронке при этом «отправлено 40, ответили 12», а
// что с остальными двадцатью восемью — неизвестно.
//
// Что делает функция: раз в час смотрит карточки, которым мы писали и которые
// не ответили, и через reply_due_days дней (поле категории, по умолчанию 3)
// отправляет напоминание № 1, ещё через столько же — № 2, а ещё через
// столько же ставит исход «без ответа» и больше не пишет.
//
// Чего специально НЕ делает:
//   — не пишет тем, кто хоть раз ответил (дальше ведёт человек, и напоминать
//     тому, кто и так пишет, — худшее, что можно сделать);
//   — не пишет тем, от кого уже есть КП (offer.items/price), даже если
//     письмом они ничего не ответили: счёт и есть ответ;
//   — не пишет компаниям из стоп-листа (suppliers.blocked_reason) и
//     карточкам с исходом или удалённым;
//   — ничего не делает, пока не включён рубильник
//     email_auto_reply_settings.followups_enabled (по умолчанию ВЫКЛЮЧЕН,
//     как и автоответы: сначала владелец смотрит тексты, потом включает).
//
// Само письмо эта функция не отправляет: она кладёт его в переписку со
// статусом 'queued' и ставит задание в outgoing_email_jobs — дальше та же
// очередь, что у автоответов и у обычной отправки из интерфейса
// (process-outgoing-emails). Поэтому здесь нет ни Resend, ни пауз между
// письмами, ни разбора ошибок отправки.
//
// ВАЖНО: пороги дожима продублированы на фронте — offerFollowupState в
// src/data/supplierResearch.ts (тот же случай, что src/data/vat.ts ↔
// api/_vat.js). Правится одно — правится и второе, иначе интерфейс покажет
// «пора напомнить», а функция промолчит.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DAY_MS = 24 * 60 * 60 * 1000;
// Потолок на один тик. Крон часовой, так что это заодно и темп рассылки:
// напоминания уходят не пачкой на всю категорию сразу.
const MAX_REMINDERS_PER_RUN = 5;
// Автор письма — тот же, что у автоответов (см. AUTO_REPLY_SENDER_NAME в
// src/data/emailAutoReply.ts): напоминание пишет ИИ-закупщик, не человек.
const SENDER_NAME = 'ИИ-закупщик';
const DEFAULT_REPLY_DUE_DAYS = 3;

const emailAddress = (shortCode: string) => `zakupki+${shortCode}@redevelopment.pro`;

// PostgREST отдаёт максимум 1000 строк (см. CLAUDE.md): любая выборка, где
// строк может быть больше, — постранично, иначе хвост теряется МОЛЧА.
// Карточек поставщиков на 16.09 уже 1141.
async function selectAll<T>(table: string, columns: string, apply?: (q: any) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// Плейсхолдеры те же, что у шаблонов писем и массовой рассылки — четвёртая
// копия десяти строк (см. комментарий в process-bulk-send-jobs).
function formatRequestItemsText(items: any[], fallback: string): string {
  if (!items || items.length === 0) return fallback;
  return items
    .map((i) => {
      const qty = i.quantity ? ` (${i.quantity}${i.unit ? ` ${i.unit}` : ''})` : '';
      const note = i.note && String(i.note).trim() ? ` — ${String(i.note).trim()}` : '';
      return `${i.name}${qty}${note}`;
    })
    .join(', ');
}

function renderTemplate(text: string, offer: any, request: any): string {
  return String(text ?? '').replace(/\{([^{}]*)\}/g, (match, rawKey) => {
    const key = String(rawKey).trim().toLowerCase();
    if (key === 'компания') return offer.name ?? '';
    if (key === 'запрос') return request?.title ?? '';
    if (key === 'материалы') return formatRequestItemsText(request?.items ?? [], request?.title ?? '');
    if (key === 'контакт') return offer.contact ?? '';
    return match;
  });
}

interface Aggregate {
  lastOutAt: string | null;
  lastOutSubject: string;
  hasIncoming: boolean;
}

Deno.serve(async () => {
  const summary = { reminded: 0, closed: 0, skipped: 0, errors: [] as string[] };

  const { data: settings } = await supabase
    .from('email_auto_reply_settings')
    .select('followups_enabled, signature')
    .eq('id', true)
    .maybeSingle();
  if (!settings?.followups_enabled) {
    return new Response(JSON.stringify({ ...summary, note: 'дожим выключен в настройках' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const signature = String(settings.signature ?? '').trim();

  // 1. Переписка: кто когда получил от нас последнее письмо и отвечал ли.
  //    Письма со статусом 'failed' не в счёт — они до поставщика не дошли,
  //    и «молчит с тех пор» про них неправда.
  const emails = await selectAll<any>('supplier_offer_emails', 'offer_id, direction, created_at, subject, send_status');
  const byOffer = new Map<string, Aggregate>();
  for (const e of emails) {
    if (!e.offer_id) continue;
    const agg = byOffer.get(e.offer_id) ?? { lastOutAt: null, lastOutSubject: '', hasIncoming: false };
    if (e.direction === 'in') agg.hasIncoming = true;
    else if (e.direction === 'out' && e.send_status !== 'failed') {
      if (!agg.lastOutAt || e.created_at > agg.lastOutAt) {
        agg.lastOutAt = e.created_at;
        agg.lastOutSubject = e.subject ?? '';
      }
    }
    byOffer.set(e.offer_id, agg);
  }

  const waiting = [...byOffer.entries()].filter(([, a]) => a.lastOutAt && !a.hasIncoming).map(([id]) => id);
  if (waiting.length === 0) {
    return new Response(JSON.stringify({ ...summary, note: 'некого дожимать' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Сами карточки — только те, что ждут ответа, порциями по 200 id.
  const offers: any[] = [];
  for (let i = 0; i < waiting.length; i += 200) {
    const { data, error } = await supabase
      .from('supplier_research_offers')
      .select('id, request_id, name, contact, email, short_code, supplier_id, verified, deleted_at, outcome, reminder_stage, price, items')
      .in('id', waiting.slice(i, i + 200));
    if (error) throw error;
    offers.push(...(data ?? []));
  }

  const { data: requestRows } = await supabase
    .from('supplier_research_requests')
    .select('id, title, items, reply_due_days');
  const requests = new Map((requestRows ?? []).map((r: any) => [r.id, r]));

  const { data: templateRows } = await supabase
    .from('email_templates')
    .select('subject, body, request_id, kind')
    .not('kind', 'is', null);
  // Шаблон категории важнее общего.
  function templateFor(kind: string, requestId: string | null) {
    const all = (templateRows ?? []).filter((t: any) => t.kind === kind);
    return all.find((t: any) => t.request_id === requestId) ?? all.find((t: any) => !t.request_id) ?? null;
  }

  const { data: blockedRows } = await supabase.from('suppliers').select('id').not('blocked_reason', 'is', null);
  const blocked = new Set((blockedRows ?? []).map((r: any) => r.id));

  const now = Date.now();

  for (const offer of offers) {
    if (summary.reminded >= MAX_REMINDERS_PER_RUN) break;
    if (offer.deleted_at || offer.outcome || !offer.email || !offer.verified) continue;
    // Счёт — это ответ, даже если письмом поставщик ничего не написал.
    if ((offer.price ?? 0) > 0 || (Array.isArray(offer.items) && offer.items.length > 0)) continue;
    if (offer.supplier_id && blocked.has(offer.supplier_id)) continue;

    const agg = byOffer.get(offer.id);
    if (!agg?.lastOutAt) continue;
    const request = requests.get(offer.request_id);
    const due = Number(request?.reply_due_days) > 0 ? Number(request.reply_due_days) : DEFAULT_REPLY_DUE_DAYS;
    const daysSilent = Math.floor((now - new Date(agg.lastOutAt).getTime()) / DAY_MS);
    if (daysSilent < due) continue;

    const stage = Number(offer.reminder_stage ?? 0);

    // Два напоминания ушли, и после второго поставщик молчал ещё срок —
    // дальше писать некуда. Молчание признаётся ответом ровно здесь и
    // только здесь: раньше третьего срока карточка остаётся «в дожиме».
    if (stage >= 2) {
      const { error } = await supabase
        .from('supplier_research_offers')
        .update({ outcome: 'no_answer', outcome_at: new Date().toISOString() })
        .eq('id', offer.id)
        .is('outcome', null);
      if (error) summary.errors.push(`${offer.name}: ${error.message}`);
      else summary.closed++;
      continue;
    }

    const kind = stage === 0 ? 'reminder_1' : 'reminder_2';
    const template = templateFor(kind, offer.request_id);
    if (!template) {
      summary.skipped++;
      summary.errors.push(`${offer.name}: нет шаблона «${kind}»`);
      continue;
    }

    // Атомарный захват ступени: два одновременных вызова (крон и ручной
    // прогон) не пришлют поставщику два одинаковых напоминания. Тот же
    // приём, что у захвата строки массовой рассылки — там его завели после
    // реального задвоения писем 38 поставщикам (2026-09-12).
    const { data: claimed, error: claimError } = await supabase
      .from('supplier_research_offers')
      .update({ reminder_stage: stage + 1, reminder_sent_at: new Date().toISOString() })
      .eq('id', offer.id)
      .eq('reminder_stage', stage)
      .select('id');
    if (claimError) {
      summary.errors.push(`${offer.name}: ${claimError.message}`);
      continue;
    }
    if ((claimed?.length ?? 0) === 0) continue;

    try {
      const fromAddress = emailAddress(offer.short_code);
      const rendered = renderTemplate(template.body ?? '', offer, request);
      const body = signature ? `${rendered.trimEnd()}\n\n${signature}` : rendered;
      const subjectFromTemplate = renderTemplate(template.subject ?? '', offer, request).trim();
      const subject =
        subjectFromTemplate ||
        (agg.lastOutSubject
          ? agg.lastOutSubject.toLowerCase().startsWith('re:')
            ? agg.lastOutSubject
            : `Re: ${agg.lastOutSubject}`
          : 'Напоминание по запросу');

      const { data: inserted, error: insertError } = await supabase
        .from('supplier_offer_emails')
        .insert({
          offer_id: offer.id,
          order_id: null,
          direction: 'out',
          from_address: fromAddress,
          to_address: offer.email,
          subject,
          body,
          files: [],
          send_status: 'queued',
          sent_by_name: SENDER_NAME,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      const { error: jobError } = await supabase.from('outgoing_email_jobs').insert({
        email_table: 'supplier_offer_emails',
        email_id: inserted.id,
        from_address: fromAddress,
        to_address: offer.email,
        subject,
        body,
        attachments: [],
        // Ключ детерминированный: повтор того же напоминания той же карточке
        // Resend не примет второй раз, даже если ступень как-то откатят.
        idempotency_key: `followup-${offer.id}-${stage + 1}`,
      });
      if (jobError) throw jobError;
      summary.reminded++;
    } catch (err) {
      // Ступень уже сдвинута — напоминание этой карточке больше не уйдёт.
      // Это сознательный размен: лучше не отправить одно письмо, чем
      // отправить два одинаковых. Причина остаётся в ответе функции.
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${offer.name}: ${message.slice(0, 200)}`);
    }
  }

  return new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } });
});
