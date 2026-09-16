import type { DocumentFile } from './contractorDocuments';
import type { EmailSendStatus } from './emailSendStatus';

// Общий почтовый ящик компании — страница "Почта" в админке (владелец,
// 2026-09-16: "мне нужен общий блок с email-ящиком в интерфейсе, ставь
// после блока Команда. Ящик — a@redevelopment.pro. И внутри сделай
// записную книжку с названием, категорией, именем человека и самим
// email-адресом").
//
// Чем отличается от трёх уже существующих переписок (закупки, поставщики,
// подрядчики): там письмо всегда привязано к карточке и уходит с
// plus-адреса, по которому ответ находит свою ветку. Здесь карточки нет —
// это обычный почтовый ящик: один адрес на компанию, произвольные
// собеседники, лента группируется по адресу собеседника. Отправку и приём
// обслуживают те же два эндпоинта (api/purchase-send-email.js с флагом
// mailbox:true и ветка общего ящика в api/purchase-email-webhook.js) — на
// Hobby-плане Vercel лимит 12 serverless-функций выбран полностью.
export const SHARED_MAILBOX_ADDRESS = 'a@redevelopment.pro';

export interface MailboxEmail {
  id: string;
  direction: 'in' | 'out';
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  // Вложения: у входящих — то, что прислали (Resend Inbound перезаливает их
  // в бакет object-documents), у исходящих — то, что прикрепили руками.
  files: DocumentFile[];
  resendMessageId: string | null;
  readAt: string | null;
  // Судьба исходящего письма по данным почтового сервера (события Resend,
  // api/_emailEvents.js). Прочитано — это открытие письма получателем, а не
  // наше «прочитал владелец»: для этого есть readAt выше. Открытия видны
  // только при включённом на домене open tracking (включён 2026-09-16) и
  // только если почтовый клиент получателя подгрузил картинки — отсутствие
  // отметки НЕ означает «не прочитали».
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  sentByProfileId: string | null;
  sentByName: string | null;
  sendStatus: EmailSendStatus;
  sendError: string | null;
  createdAt: string;
}

export interface MailboxEmailRow {
  id: string;
  direction: string;
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  files: DocumentFile[] | null;
  resend_message_id: string | null;
  read_at: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  sent_by_profile_id: string | null;
  sent_by_name: string | null;
  send_status: string | null;
  send_error: string | null;
  created_at: string;
}

// Запись в записной книжке ящика. Ровно четыре поля, как просил владелец:
// название (обычно организация), категория, имя человека и сам адрес.
// Категория — открытый список (AddableSelect + пресет ниже), как
// requirement/clientType у лидов: заранее все варианты не угадать.
export interface MailboxContact {
  id: string;
  title: string;
  category: string;
  personName: string;
  email: string;
  // Заметка — пятое поле сверх тех четырёх, что просил владелец (2026-09-16,
  // импорт списка журналистов): в присланном списке у каждого контакта был
  // хвост, который больше некуда девать — телефон, телеграм, оговорка вида
  // "личный адрес не найден, использован общий" или "перепроверить перед
  // отправкой". Без этого поля половина смысла списка терялась бы при
  // переносе в книжку.
  note: string;
  createdAt: string;
}

export interface MailboxContactRow {
  id: string;
  title: string | null;
  category: string | null;
  person_name: string | null;
  email: string | null;
  note: string | null;
  created_at: string;
}

export const mailboxContactCategories = [
  'Журналисты',
  'Клиенты',
  'Поставщики',
  'Подрядчики',
  'Банки и лизинг',
  'Госорганы',
  'Аренда',
  'Сервисы и подписки',
  'Прочее',
];

// Адрес собеседника у письма: у входящего это отправитель, у исходящего —
// получатель. По нему лента ящика и группируется в треды.
export function mailboxCounterparty(email: MailboxEmail): string {
  return parseEmailAddress(email.direction === 'in' ? email.fromAddress : email.toAddress);
}

// Голый адрес из строки вида «Имя <адрес>» или просто «адрес», в нижнем
// регистре — почтовые клиенты подставляют и то, и другое, а для группировки
// и для поиска по записной книжке нужен один ключ.
export function parseEmailAddress(raw: string): string {
  const match = String(raw || '').match(/<([^>]+)>/);
  const address = (match ? match[1] : String(raw || '')).trim().toLowerCase();
  // У входящего письма в "to" может лежать список получателей через запятую —
  // берём первый адрес, остальное в ключ треда не годится.
  return address.split(',')[0].trim();
}

// Отображаемое имя отправителя из строки «Имя <адрес>» — пусто, если имени
// в заголовке нет.
export function parseEmailDisplayName(raw: string): string {
  const value = String(raw || '').trim();
  if (!value.includes('<')) return '';
  return value.slice(0, value.indexOf('<')).trim().replace(/^["']|["']$/g, '');
}

export function countUnreadMailboxEmails(emails: MailboxEmail[]): number {
  return emails.filter((e) => e.direction === 'in' && !e.readAt).length;
}

// Как называть собеседника в списке: сначала записная книжка (там имя
// заведено человеком), потом имя из заголовка письма, в последнюю очередь
// сам адрес.
export function counterpartyTitle(
  address: string,
  contacts: MailboxContact[],
  fallbackName = '',
): string {
  const contact = contacts.find((c) => parseEmailAddress(c.email) === address);
  if (contact) {
    const person = contact.personName.trim();
    const title = contact.title.trim();
    if (title && person) return `${title} — ${person}`;
    if (title || person) return title || person;
  }
  return fallbackName.trim() || address;
}
