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

// Контакт — вкладка «Контакты» на странице «Почта». Начиналась как записная
// книжка ящика из четырёх полей (название, категория, имя, адрес), а
// 2026-09-16 стала единым списком всех, с кем общаемся вне карточек:
// владелец заметил, что «Почта» и «Коллаборации» — две страницы под одну и ту
// же работу («в почте я написал журналистам, а блогеры попали в
// коллаборации»), и выбрал свести всё в почту. Поэтому здесь же живут поля
// из бывших коллабораций: telegram, ссылка на канал, подписчики, статус
// общения и договорённости. Категория и статус — открытые списки
// (AddableSelect + пресеты ниже), как requirement/clientType у лидов.
export interface MailboxContact {
  id: string;
  title: string;
  category: string;
  personName: string;
  // Email может быть пустым: с 2026-09-16 книжка — единый список всех, с кем
  // общаемся вне карточек (см. журнал, слияние с «Коллаборациями»), а у
  // блогеров почты часто нет вовсе, связь только в Telegram.
  email: string;
  telegram: string;
  // Ссылка на канал/сайт собеседника.
  link: string;
  // Подписчики канала, «≈». null = не выясняли (0 — это именно ноль, поэтому
  // не number, см. правило про числовые «нет данных» в CLAUDE.md).
  audienceSize: number | null;
  // Статус общения — открытый список (mailboxContactStatuses ниже).
  status: string;
  // О чём договариваемся — переехало из «Коллабораций» вместе с партнёрами.
  agreement: string;
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
  telegram: string | null;
  link: string | null;
  audience_size: number | null;
  status: string | null;
  agreement: string | null;
  note: string | null;
  created_at: string;
}

export const mailboxContactCategories = [
  'Журналисты',
  'Блогеры и паблики',
  'Клиенты',
  'Поставщики',
  'Подрядчики',
  'Банки и лизинг',
  'Госорганы',
  'Аренда',
  'Сервисы и подписки',
  'Прочее',
];

// Статус общения с контактом — открытый список, как категория выше: можно
// дописать свой прямо из формы. Первые три проставляются по факту переписки
// при заведении контакта, дальше владелец ведёт руками.
export const mailboxContactStatuses = [
  'Не связывались',
  'Написали',
  'Ответили',
  'Обсуждаем',
  'Договорились',
  'В работе',
  'Отказ',
  'Завершено',
];

// Цвет бейджа статуса. Не badgeColor (он красит по хешу строки, и
// «Не связывались» выходил зелёным — читается как «дело сделано»), а рабочая
// шкала из CLAUDE.md: серое «движения нет», жёлтое «в работе», зелёное
// «довели до конца», красное «есть проблема».
export function contactStatusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  const value = status.trim().toLowerCase();
  if (value === 'отказ') return 'danger';
  if (value === 'не связывались' || value === 'завершено') return 'neutral';
  if (value === 'договорились') return 'success';
  return 'warning';
}

// Подписчики в таблице — «32 000»: разряды по три цифры, обычным пробелом
// вместо неразрывного (toLocaleString ставит nbsp).
export function formatAudience(size: number | null): string {
  if (size === null || !Number.isFinite(size)) return '';
  return size.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}

// Как звать контакт в списке и в подтверждениях: название, имя человека,
// адрес — что первое нашлось.
export function contactLabel(contact: MailboxContact): string {
  return contact.title || contact.personName || contact.email || contact.telegram || 'без названия';
}

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
  // c.email может быть пустым (контакт только с Telegram) — такой контакт не
  // должен «прилипать» к треду, поэтому сначала проверяем, что адрес есть.
  const contact = contacts.find((c) => c.email && parseEmailAddress(c.email) === address);
  if (contact) {
    const person = contact.personName.trim();
    const title = contact.title.trim();
    if (title && person) return `${title} — ${person}`;
    if (title || person) return title || person;
  }
  return fallbackName.trim() || address;
}
