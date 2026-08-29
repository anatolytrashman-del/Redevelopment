import type { DocumentFile } from './contractorDocuments';

// Одно письмо в переписке по конкретному предложению Ресерча поставщиков —
// см. data/supplierResearch.ts (supplierOfferEmailAddress) и
// api/supplier-offer-send-email.js/supplier-offer-email-webhook.js. Один в
// один PurchaseEmail (data/purchaseEmails.ts), просто своя таблица —
// переписка по предложению до выбора поставщика и переписка по уже
// оформленной закупке концептуально разные вещи (RFQ vs твёрдый заказ),
// поэтому не смешиваем в одной таблице.
export interface SupplierOfferEmail {
  id: string;
  offerId: string;
  direction: 'in' | 'out';
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  files: DocumentFile[];
  resendMessageId: string | null;
  createdAt: string;
}

export interface SupplierOfferEmailRow {
  id: string;
  offer_id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  files: DocumentFile[] | null;
  resend_message_id: string | null;
  created_at: string;
}
