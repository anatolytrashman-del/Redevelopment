// Шаблоны писем поставщикам — EMAIL_CORRESPONDENCE_PLAN.md, этап 3.
// Владелец: "письма для поставщиков замков будут похожими, но всё равно
// нужна возможность кастомно менять каждое письмо" — шаблон только
// ПОДСТАВЛЯЕТ текст в форму отправки (EmailThread), дальше это обычный
// редактируемый черновик, шаблон ничего не "держит" и не блокирует правки.
//
// requestId — необязательная привязка "шаблон по умолчанию для этого
// запроса" (например, свой шаблон на запрос "Умные замки"); null — общий
// шаблон, показывается для любого запроса.
// Тип шаблона (шаг 8 плана закупок). null — обычный шаблон, его выбирает
// человек в композере. 'reminder_1'/'reminder_2' — тексты напоминаний,
// которые берёт воркер дожима (supabase/functions/process-followups): их
// человек в композере не выбирает, но правит здесь же.
export type EmailTemplateKind = 'reminder_1' | 'reminder_2' | null;

export const EMAIL_TEMPLATE_KIND_LABEL: Record<'reminder_1' | 'reminder_2', string> = {
  reminder_1: 'Напоминание № 1',
  reminder_2: 'Напоминание № 2',
};

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  requestId: string | null;
  kind: EmailTemplateKind;
  createdAt: string;
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  request_id: string | null;
  kind?: string | null;
  created_at: string;
}
