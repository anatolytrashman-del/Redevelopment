import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { authFetch } from './authFetch';
import { emailSendStatusFromRow } from '../data/emailSendStatus';
import type { WorkContractorEmail, WorkContractorEmailRow } from '../data/workContractorEmails';

function fromRow(row: WorkContractorEmailRow): WorkContractorEmail {
  return {
    id: row.id,
    contractorId: row.contractor_id,
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

// Вся переписка по всем подрядчикам разом — объём маленький (вкладка только
// заведена), один запрос без пагинации, как и у поставщиков.
export function fetchAllWorkContractorEmails(): Promise<WorkContractorEmail[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('work_contractor_emails')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as WorkContractorEmailRow[]).map(fromRow);
  });
}

// Отметить прочитанными входящие письма подрядчика — при открытии его
// переписки. Обычная клиентская запись (RLS authenticated_all), не
// privileged-операция.
export function markWorkContractorEmailsRead(contractorId: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('work_contractor_emails')
      .update({ read_at: new Date().toISOString() })
      .eq('contractor_id', contractorId)
      .eq('direction', 'in')
      .is('read_at', null);
    if (error) throw error;
  });
}

// Отправка — через тот же api/purchase-send-email.js, что и письма закупкам
// и поставщикам (см. комментарий в самом файле: на Hobby-плане Vercel лимит
// 12 serverless-функций, отдельный эндпоинт под подрядчиков не поместился бы).
// contractorId отличает этот случай от purchaseId/offerId.
//
// attachments — только то, что владелец прикрепил руками в композере
// (2026-09-14: "никаких автоматических файлов к письму не прикрепляется").
export async function sendWorkContractorEmail(input: {
  contractorId: string;
  toAddress: string;
  subject: string;
  body: string;
  attachments?: { fileName: string; contentType: string; contentBase64: string }[];
}): Promise<WorkContractorEmail> {
  const res = await authFetch('/api/purchase-send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Не удалось отправить письмо');
  return fromRow(json.email as WorkContractorEmailRow);
}
