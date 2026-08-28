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
  resend_message_id: string | null;
  created_at: string;
}
