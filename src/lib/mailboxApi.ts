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

export function fetchMailboxEmails(): Promise<MailboxEmail[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('mailbox_emails')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAILBOX_PAGE_SIZE);
    if (error) throw error;
    // Внутри лент удобнее хронологический порядок — разворачиваем один раз
    // здесь, чтобы страница не пересортировывала на каждый рендер.
    return (data as MailboxEmailRow[]).map(fromRow).reverse();
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
