import type { WorkContractor } from './workContractors';
import { workContractorTitle } from './workContractors';

// Шаблон письма подрядчику (вкладка "Шаблоны" на странице "Подрядчики",
// владелец 2026-09-19: "сделай мне шаблоны писем, как на вкладке Почта").
// Отдельно от data/mailboxTemplates.ts (общий ящик) и data/emailTemplates.ts
// (переписка с поставщиками, привязана к запросу Ресерча) по той же причине,
// что развела те два набора: общего между тремя — только слово "шаблон",
// а выпадашки должны показывать каждому свой список (см. комментарий в
// supabase/migrations/20260916-mailbox-templates.sql).
export interface WorkContractorTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
}

export interface WorkContractorTemplateRow {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  created_at: string;
}

// Плейсхолдеры — тем же синтаксисом {…}, что у mailboxTemplates и у
// шаблонов поставщиков, чтобы не заводить в проекте второй язык подстановок.
export const WORK_CONTRACTOR_PLACEHOLDER_HINT = 'Доступны: {компания}, {категория}, {email}';

export interface WorkContractorTemplateContext {
  contractor: WorkContractor;
}

const RESOLVERS: Record<string, (ctx: WorkContractorTemplateContext) => string | null> = {
  компания: (ctx) => workContractorTitle(ctx.contractor) || null,
  категория: (ctx) => ctx.contractor.category || null,
  email: (ctx) => ctx.contractor.email || null,
};

// Неизвестный или нераскрывшийся плейсхолдер остаётся в тексте как есть —
// не падаем и не вырезаем молча, автор письма увидит {компания} в черновике
// и впишет название руками, а не отправит письмо с дырой в приветствии.
function substitute(text: string, ctx: WorkContractorTemplateContext): string {
  return text.replace(/\{([^{}]*)\}/g, (match, rawKey: string) => {
    const resolve = RESOLVERS[rawKey.trim().toLowerCase()];
    const value = resolve ? resolve(ctx) : null;
    return value ?? match;
  });
}

export function renderWorkContractorTemplate(
  template: { subject: string; body: string },
  ctx: WorkContractorTemplateContext,
): { subject: string; body: string } {
  return { subject: substitute(template.subject, ctx), body: substitute(template.body, ctx) };
}
