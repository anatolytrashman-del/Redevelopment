import type { DocumentFile } from './contractorDocuments';

// Одно письмо в переписке по конкретному предложению Ресерча поставщиков —
// см. data/supplierResearch.ts (supplierOfferEmailAddress) и
// api/purchase-send-email.js/purchase-email-webhook.js (несмотря на имя,
// обрабатывают оба направления переписки — закупки и Ресерч, см. комментарий
// в самих файлах). Один в один PurchaseEmail (data/purchaseEmails.ts),
// просто своя таблица — переписка по предложению до выбора поставщика и
// переписка по уже оформленной закупке концептуально разные вещи (RFQ vs
// твёрдый заказ), поэтому не смешиваем в одной таблице.
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
  // Когда письмо отмечено прочитанным — только для direction='in' (см.
  // markSupplierOfferEmailsRead в lib/supplierOfferEmailsApi.ts), у
  // исходящих всегда null. Непрочитанные входящие — вкладка "Переписка"
  // (src/pages/Suppliers.tsx) и колокольчик уведомлений.
  readAt: string | null;
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
  read_at: string | null;
  created_at: string;
}
