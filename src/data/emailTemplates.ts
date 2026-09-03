// Шаблоны писем поставщикам — EMAIL_CORRESPONDENCE_PLAN.md, этап 3.
// Владелец: "письма для поставщиков замков будут похожими, но всё равно
// нужна возможность кастомно менять каждое письмо" — шаблон только
// ПОДСТАВЛЯЕТ текст в форму отправки (EmailThread), дальше это обычный
// редактируемый черновик, шаблон ничего не "держит" и не блокирует правки.
//
// requestId — необязательная привязка "шаблон по умолчанию для этого
// запроса" (например, свой шаблон на запрос "Умные замки"); null — общий
// шаблон, показывается для любого запроса.
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  requestId: string | null;
  createdAt: string;
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  request_id: string | null;
  created_at: string;
}
