import type { DocumentFile } from './contractorDocuments';

// Документы заказа поставщику (владелец, 2026-09-16: «появляются доп.
// документы по поставке, надо интерфейс для их загрузки и истории»).
//
// Одна строка = один загруженный файл, с типом, автором и датой. Отдельного
// журнала под документы нет: список, отсортированный по дате загрузки, и
// есть история — видно, что появилось позже и кто это принёс.
//
// Привязка к поставке необязательная: накладная относится к конкретному
// привозу, договор или спецификация — ко всему заказу.

export const PURCHASE_DOCUMENT_KINDS = [
  'waybill',
  'upd',
  'act',
  'invoice',
  'payment',
  'poa',
  'certificate',
  'claim',
  'other',
] as const;

export type PurchaseDocumentKind = (typeof PURCHASE_DOCUMENT_KINDS)[number];

export const PURCHASE_DOCUMENT_KIND_LABELS: Record<PurchaseDocumentKind, string> = {
  waybill: 'Накладная / ТТН',
  upd: 'УПД',
  act: 'Акт',
  invoice: 'Счёт',
  payment: 'Платёжка',
  poa: 'Доверенность',
  certificate: 'Сертификат / паспорт',
  claim: 'Рекламация',
  other: 'Другое',
};

export interface PurchaseDocument {
  id: string;
  orderId: string;
  // null — документ по заказу в целом, а не по конкретному привозу.
  deliveryId: string | null;
  kind: PurchaseDocumentKind;
  title: string;
  file: DocumentFile;
  uploadedBy: string;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/purchaseDocumentsApi.ts
export interface PurchaseDocumentRow {
  id: string;
  order_id: string;
  delivery_id: string | null;
  kind: string;
  title: string | null;
  file: DocumentFile;
  uploaded_by: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export function isPurchaseDocumentKind(value: string): value is PurchaseDocumentKind {
  return (PURCHASE_DOCUMENT_KINDS as readonly string[]).includes(value);
}
