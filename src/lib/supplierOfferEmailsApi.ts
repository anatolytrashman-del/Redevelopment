import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { authFetch } from './authFetch';
import type { SupplierOfferEmail, SupplierOfferEmailRow } from '../data/supplierOfferEmails';

function fromRow(row: SupplierOfferEmailRow): SupplierOfferEmail {
  return {
    id: row.id,
    offerId: row.offer_id,
    direction: row.direction === 'in' ? 'in' : 'out',
    fromAddress: row.from_address,
    toAddress: row.to_address,
    subject: row.subject ?? '',
    body: row.body ?? '',
    files: row.files ?? [],
    resendMessageId: row.resend_message_id,
    createdAt: row.created_at,
  };
}

export function fetchSupplierOfferEmails(offerId: string): Promise<SupplierOfferEmail[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_offer_emails')
      .select('*')
      .eq('offer_id', offerId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as SupplierOfferEmailRow[]).map(fromRow);
  });
}

// Отправка — через api/purchase-send-email.js (общий эндпоинт с закупками,
// см. комментарий в файле — Vercel Hobby ограничен 12 serverless-функциями,
// отдельный файл на каждую пару send/receive не поместился бы).
export async function sendSupplierOfferEmail(input: {
  offerId: string;
  toAddress: string;
  subject: string;
  body: string;
}): Promise<SupplierOfferEmail> {
  const res = await authFetch('/api/purchase-send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Не удалось отправить письмо');
  return fromRow(json.email as SupplierOfferEmailRow);
}
