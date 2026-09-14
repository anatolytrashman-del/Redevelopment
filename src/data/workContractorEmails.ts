import type { DocumentFile } from './contractorDocuments';
import type { EmailSendStatus } from './emailSendStatus';

// Одно письмо в переписке с подрядчиком (вкладка "Подрядчики" страницы
// "Закупки"). Урезанный SupplierOfferEmail (data/supplierOfferEmails.ts):
// без extraction — распознавание счетов сделано под поставщиков материалов,
// подрядчику мы пишем руками; без orderId — заявок на поставку у него нет.
// Отправку и приём обслуживают те же два эндпоинта, что и у поставщиков
// (api/purchase-send-email.js / api/purchase-email-webhook.js) — на Hobby-
// плане Vercel лимит 12 serverless-функций уже выбран, новые заводить некуда.
export interface WorkContractorEmail {
  id: string;
  contractorId: string;
  direction: 'in' | 'out';
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  // Вложения: у входящих — то, что прислал подрядчик (скачивается из Resend
  // Inbound в бакет object-documents), у исходящих — только то, что владелец
  // прикрепил руками. Владелец, 2026-09-14: "никаких автоматических файлов к
  // письму не прикрепляется" — ни карточки организации, ни ведомости, в
  // отличие от переписки с поставщиками.
  files: DocumentFile[];
  resendMessageId: string | null;
  // Когда письмо отмечено прочитанным — только для direction='in'.
  readAt: string | null;
  // Кто отправил (учёт работы с письмами по сотрудникам) — только у исходящих.
  sentByProfileId: string | null;
  sentByName: string | null;
  // Ушло ли письмо на самом деле (см. data/emailSendStatus.ts) — 'queued'
  // значит Resend отказал временно и письмо дошлёт Edge Function
  // process-outgoing-emails.
  sendStatus: EmailSendStatus;
  sendError: string | null;
  createdAt: string;
}

// Непрочитанные ответы подрядчиков — бейджик на вкладке, тем же способом,
// что countUnreadSupplierEmails у поставщиков.
export function countUnreadWorkContractorEmails(emails: WorkContractorEmail[]): number {
  return emails.filter((e) => e.direction === 'in' && !e.readAt).length;
}

export interface WorkContractorEmailRow {
  id: string;
  contractor_id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  files: DocumentFile[] | null;
  resend_message_id: string | null;
  read_at: string | null;
  sent_by_profile_id: string | null;
  sent_by_name: string | null;
  send_status: string | null;
  send_error: string | null;
  created_at: string;
}
