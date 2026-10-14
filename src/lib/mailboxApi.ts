import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { authFetch } from './authFetch';
import { emailSendStatusFromRow } from '../data/emailSendStatus';
import type { MailboxEmail, MailboxEmailRow } from '../data/mailbox';

function fromRow(row: MailboxEmailRow): MailboxEmail {
  return {
    id: row.id,
    direction: row.direction === 'in' ? 'in' : 'out',
    fromAddress: row.from_address,
    toAddress: row.to_address,
    subject: row.subject ?? '',
    body: row.body ?? '',
    files: row.files ?? [],
    resendMessageId: row.resend_message_id,
    readAt: row.read_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    openedAt: row.opened_at ?? null,
    bouncedAt: row.bounced_at ?? null,
    complainedAt: row.complained_at ?? null,
    sentByProfileId: row.sent_by_profile_id ?? null,
    sentByName: row.sent_by_name ?? null,
    sendStatus: emailSendStatusFromRow(row.send_status),
    sendError: row.send_error ?? null,
    createdAt: row.created_at,
  };
}

// Последние письма ящика, свежие первыми. Лимит осознанный: PostgREST всё
// равно отдаёт максимум 1000 строк за запрос (см. CLAUDE.md), а общий ящик —
// это лента, где старое читают из архива, а не листают в интерфейсе.
// Понадобится глубже — добавлять постраничность, как в suppliersApi, а не
// поднимать число.
const MAILBOX_PAGE_SIZE = 500;

// Без body (тяжёлое) — докачиваем только при открытии треда, как у supplier.
const MAILBOX_LIST_COLUMNS =
  'id, direction, from_address, to_address, subject, files, resend_message_id, read_at, delivered_at, opened_at, bounced_at, complained_at, sent_by_profile_id, sent_by_name, send_status, send_error, created_at';

export function fetchMailboxEmails(): Promise<MailboxEmail[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('mailbox_emails')
      .select(MAILBOX_LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(MAILBOX_PAGE_SIZE);
    if (error) throw error;
    // Внутри лент удобнее хронологический порядок — разворачиваем один раз
    // здесь, чтобы страница не пересортировывала на каждый рендер.
    return (data as MailboxEmailRow[]).map((row) => fromRow({ ...row, body: '' })).reverse();
  });
}

// Тела писем докачиваем чанками только для выбранного треда (ids).
// withRetry — один на весь цикл.
export function fetchMailboxEmailBodies(ids: string[]): Promise<{ id: string; body: string }[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return withRetry(async () => {
    const result: { id: string; body: string }[] = [];
    const chunkSize = 80;
    const pageSize = 1000;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from('mailbox_emails')
          .select('id, body')
          .in('id', chunk)
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data as Array<{ id: string; body: string | null }>) ?? [];
        for (const r of rows) {
          result.push({ id: r.id, body: r.body ?? '' });
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
    }
    return result;
  });
}

// Влить тела в уже загруженный список (по id), остальные поля не трогаем.
export function applyMailboxBodies(prev: MailboxEmail[], bodies: { id: string; body: string }[]): MailboxEmail[] {
  const byId = new Map(bodies.map((b) => [b.id, b] as const));
  return prev.map((p) => {
    const b = byId.get(p.id);
    if (!b) return p;
    return { ...p, body: b.body };
  });
}

// Сколько входящих писем в общем ящике ещё не открывали — для бейджика в
// боковом меню. Считаем на стороне базы (head + count), а не через
// fetchMailboxEmails: сайдбар висит на каждой странице админки и опрашивает
// счётчик по таймеру, тянуть ради числа пятьсот писем незачем.
export function fetchMailboxUnreadCount(): Promise<number> {
  return withRetry(async () => {
    const { count, error } = await supabase
      .from('mailbox_emails')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .is('read_at', null);
    if (error) throw error;
    return count ?? 0;
  });
}

// Отметить прочитанными входящие письма одного собеседника — при открытии
// его ленты. Адрес приходит уже нормализованным (parseEmailAddress), но в
// базе from_address лежит как есть, вместе с именем («Имя <адрес>»), поэтому
// сравниваем по вхождению, а не по равенству.
export function markMailboxEmailsRead(address: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('mailbox_emails')
      .update({ read_at: new Date().toISOString() })
      .eq('direction', 'in')
      .is('read_at', null)
      .ilike('from_address', `%${address}%`);
    if (error) throw error;
  });
}

// Отправка — через api/purchase-send-email.js с флагом mailbox:true (тот же
// эндпоинт, что и у трёх остальных переписок: на Hobby-плане Vercel лимит
// 12 serverless-функций выбран полностью, см. комментарий в самом файле).
export async function sendMailboxEmail(input: {
  toAddress: string;
  subject: string;
  body: string;
  attachments?: { fileName: string; contentType: string; contentBase64: string }[];
}): Promise<MailboxEmail> {
  const res = await authFetch('/api/purchase-send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, mailbox: true }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Не удалось отправить письмо');
  return fromRow(json.email as MailboxEmailRow);
}

export function deleteMailboxEmail(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('mailbox_emails').delete().eq('id', id);
    if (error) throw error;
  });
}
