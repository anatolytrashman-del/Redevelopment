import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { supplierOfferEmailFromRow } from './supplierOfferEmailsApi';
import type { SupplierOfferEmail, SupplierOfferEmailRow } from '../data/supplierOfferEmails';
import type { UnmatchedIncomingEmail, UnmatchedIncomingEmailRow } from '../data/unmatchedIncomingEmails';

function fromRow(row: UnmatchedIncomingEmailRow): UnmatchedIncomingEmail {
  return {
    id: row.id,
    resendMessageId: row.resend_message_id,
    fromAddress: row.from_address ?? '',
    toAddress: row.to_address ?? '',
    subject: row.subject ?? '',
    body: row.body ?? '',
    files: row.files ?? [],
    headers: row.headers ?? null,
    candidateOfferIds: row.candidate_offer_ids ?? [],
    resolvedAt: row.resolved_at,
    resolvedOfferId: row.resolved_offer_id,
    resolvedByName: row.resolved_by_name,
    createdAt: row.created_at,
  };
}

// Только неразобранные: разобранное письмо уже лежит в переписке поставщика,
// второй его копией список засорять незачем.
export function fetchUnmatchedIncomingEmails(): Promise<UnmatchedIncomingEmail[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('unmatched_incoming_emails')
      .select('*')
      .is('resolved_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as UnmatchedIncomingEmailRow[]).map(fromRow);
  });
}

// Привязка руками: письмо переезжает в переписку выбранной карточки, а
// исходная запись помечается разобранной.
//
// Порядок именно такой — сначала вставка в переписку, потом отметка. Если
// оборвётся связь между шагами, письмо окажется в переписке И останется в
// очереди разбора: человек увидит его дважды и уберёт лишнее. Обратный
// порядок терял бы письмо совсем.
//
// Распознавание счёта во вложении здесь НЕ запускается (оно живёт в
// вебхуке, api/purchase-email-webhook.js, и работает по событию письма).
// Счёт из такого письма заносится обычной кнопкой «Распознать данные
// автоматически» в самой переписке.
export async function attachUnmatchedIncomingEmail(
  email: UnmatchedIncomingEmail,
  offerId: string,
  byName: string | null,
): Promise<SupplierOfferEmail> {
  return withRetry(async () => {
    const { data, error: insertError } = await supabase.from('supplier_offer_emails').insert({
      offer_id: offerId,
      direction: 'in',
      from_address: email.fromAddress,
      to_address: email.toAddress,
      subject: email.subject,
      body: email.body,
      files: email.files,
      resend_message_id: email.resendMessageId,
      send_status: 'sent',
    })
      .select()
      .single();
    if (insertError) throw insertError;

    const { error } = await supabase
      .from('unmatched_incoming_emails')
      .update({ resolved_at: new Date().toISOString(), resolved_offer_id: offerId, resolved_by_name: byName })
      .eq('id', email.id);
    if (error) throw error;
    return supplierOfferEmailFromRow(data as SupplierOfferEmailRow);
  });
}

// «Это не по делу» — реклама, спам, письмо не про закупки. Запись остаётся
// в базе (можно поднять, если ошиблись), но из очереди разбора уходит.
export function dismissUnmatchedIncomingEmail(id: string, byName: string | null): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase
      .from('unmatched_incoming_emails')
      .update({ resolved_at: new Date().toISOString(), resolved_offer_id: null, resolved_by_name: byName })
      .eq('id', id);
    if (error) throw error;
  });
}
