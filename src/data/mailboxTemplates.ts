import type { MailboxContact } from './mailbox';

// Шаблон письма общего ящика (вкладка "Шаблоны" на странице "Почта",
// владелец 2026-09-16: "мне нужны шаблоны писем"). Отдельно от
// data/emailTemplates.ts: та пара таблица+тип обслуживает переписку с
// поставщиками (шаблоны привязаны к запросу Ресерча, есть kind под дожим),
// и общий список там один на всех — питчи журналистам оказались бы в
// выпадашке у закупщика. Общего у двух наборов ничего, кроме слова
// "шаблон".
export interface MailboxTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

export interface MailboxTemplateRow {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  created_at: string;
}

// Плейсхолдеры берутся из записной книжки — тем же синтаксисом {…}, что и у
// шаблонов поставщиков (lib/emailTemplates.ts), чтобы не заводить в проекте
// второй язык подстановок.
export const MAILBOX_PLACEHOLDER_HINT = 'Доступны: {имя}, {название}, {категория}, {email}';

export interface MailboxTemplateContext {
  // Запись из книжки, если адресат в ней есть; иначе подставляем то, что
  // знаем (адрес), а остальные плейсхолдеры остаются как есть.
  contact: MailboxContact | null;
  address: string;
}

const RESOLVERS: Record<string, (ctx: MailboxTemplateContext) => string | null> = {
  имя: (ctx) => ctx.contact?.personName || null,
  название: (ctx) => ctx.contact?.title || null,
  категория: (ctx) => ctx.contact?.category || null,
  email: (ctx) => ctx.contact?.email || ctx.address || null,
};

// Неизвестный или нераскрывшийся плейсхолдер остаётся в тексте как есть —
// не падаем и не вырезаем молча: пусть автор письма увидит {имя} в черновике
// и впишет имя руками, а не отправит письмо с дырой посреди приветствия.
function substitute(text: string, ctx: MailboxTemplateContext): string {
  return text.replace(/\{([^{}]*)\}/g, (match, rawKey: string) => {
    const resolve = RESOLVERS[rawKey.trim().toLowerCase()];
    const value = resolve ? resolve(ctx) : null;
    return value ?? match;
  });
}

export function renderMailboxTemplate(
  template: { subject: string; body: string },
  ctx: MailboxTemplateContext,
): { subject: string; body: string } {
  return { subject: substitute(template.subject, ctx), body: substitute(template.body, ctx) };
}
