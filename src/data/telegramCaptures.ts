// Копилка Telegram — то, что владелец пересылает боту из личных диалогов
// (юрист, сторител, блогеры-партнёры). Владелец, 2026-09-16: "я общаюсь там и
// со сторителем, и с юристом, по идее система могла бы из диалогов получать
// много инфы + вложения... Давай делать бот-копилку".
//
// Почему копилка, а не зеркало переписки: диалогов восемь, и лента чата
// внутри CRM была бы пустой страницей, на которую никто не заходит. Ценность
// не в переписке, а в файлах (редакция договора ищется через полгода) и в
// фактах из разговора. Пересылка вручную ещё и фильтрует вход: в базу
// попадает только то, что владелец сам счёл важным, а личная переписка не
// утекает туда вовсе.
//
// Серверная часть — api/_telegramCapture.js (разбор апдейта, файлы в бакет,
// выжимка через Haiku) плюс ветка вебхука в api/telegram-avatar.js.

export const telegramCaptureKinds = ['document', 'terms', 'deadline', 'contact', 'idea', 'chat'] as const;
export type TelegramCaptureKind = (typeof telegramCaptureKinds)[number];

export const telegramCaptureKindLabels: Record<string, string> = {
  document: 'Документ',
  terms: 'Условия',
  deadline: 'Срок',
  contact: 'Контакт',
  idea: 'Идея',
  chat: 'Разговор',
};

export const telegramCaptureStatuses = ['new', 'accepted', 'dismissed'] as const;
export type TelegramCaptureStatus = (typeof telegramCaptureStatuses)[number];

export interface TelegramCaptureFile {
  fileName: string;
  url: string;
  contentType: string;
  size: number;
}

export interface TelegramCapture {
  id: string;
  chatId: number;
  messageId: number;
  senderName: string;
  // forward — переслано из чужого диалога, direct — написано боту напрямую.
  sourceKind: 'forward' | 'direct';
  // Автор исходного сообщения. Пустое — не баг: у собеседника может стоять
  // запрет на ссылку при пересылке, тогда Telegram не отдаёт ни id, ни имени.
  sourceName: string;
  sourceUsername: string;
  sourceDate: string | null;
  text: string;
  files: TelegramCaptureFile[];
  // Разбор моделью. Пустые значения — штатное состояние: модель могла быть
  // недоступна, сообщение всё равно сохранено.
  kind: string;
  summary: string;
  facts: string[];
  dueDate: string | null;
  counterparty: string;
  status: TelegramCaptureStatus;
  // Мягкая привязка к карточке, без FK: копилка переживает удаление карточки.
  linkedType: string;
  linkedId: string | null;
  note: string;
  createdAt: string;
}

export interface TelegramCaptureRow {
  id: string;
  chat_id: number;
  message_id: number;
  sender_user_id: number | null;
  sender_name: string | null;
  source_kind: string | null;
  source_name: string | null;
  source_username: string | null;
  source_date: string | null;
  text: string | null;
  files: TelegramCaptureFile[] | null;
  kind: string | null;
  summary: string | null;
  facts: string[] | null;
  due_date: string | null;
  counterparty: string | null;
  status: string | null;
  linked_type: string | null;
  linked_id: string | null;
  note: string | null;
  created_at: string;
}

// Подпись собеседника в ленте. Порядок кандидатов не случайный: имя из
// пересылки точнее ника, ник точнее догадки модели, и только если нет
// ничего — честное "отправитель скрыт" (так Telegram ведёт себя при закрытой
// приватности пересылки, и это надо показывать словами, а не пустотой).
export function telegramCaptureTitle(capture: TelegramCapture): string {
  if (capture.sourceName) return capture.sourceName;
  if (capture.sourceUsername) return `@${capture.sourceUsername}`;
  if (capture.sourceKind === 'direct') return 'Заметка себе';
  if (capture.counterparty) return capture.counterparty;
  return 'Отправитель скрыт';
}

// Юзернейм бота-копилки — только для подсказки в пустой ленте ("перешлите
// боту @..."). Пусто — подсказка показывается без имени: бот заводится
// владельцем у @BotFather, и до этого момента врать конкретным именем хуже,
// чем промолчать.
export const TELEGRAM_CAPTURE_BOT = '';
