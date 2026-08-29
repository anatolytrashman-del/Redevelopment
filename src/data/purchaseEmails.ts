import type { DocumentFile } from './contractorDocuments';

// Одно письмо в переписке по закупке (входящее от поставщика или исходящее
// от нас) — см. data/purchases.ts (purchaseEmailAddress) и
// api/purchase-send-email.js/purchase-email-webhook.js.
export interface PurchaseEmail {
  id: string;
  purchaseId: string;
  direction: 'in' | 'out';
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  // Вложения входящего письма (счета/КП от поставщика) — скачиваются из
  // Resend Inbound на сервере и заливаются в тот же бакет object-documents,
  // что и у остальных документов проекта (purchase-email-webhook.js).
  files: DocumentFile[];
  // id письма в Resend — для справки/отладки, не используется в UI.
  resendMessageId: string | null;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/purchaseEmailsApi.ts
export interface PurchaseEmailRow {
  id: string;
  purchase_id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  files: DocumentFile[] | null;
  resend_message_id: string | null;
  created_at: string;
}
