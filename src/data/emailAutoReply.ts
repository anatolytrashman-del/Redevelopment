// Автоответы на письма поставщиков (владелец, 2026-09-14: "мне приходят
// десятки писем от поставщиков, многие имеют однозначную и типовую реакцию
// и формат ответа... человеческий ответ задействовать только для спорных
// вопросов").
//
// Кто именно принимает решение — важная деталь, от неё зависит вся форма
// этих таблиц. Разбирает входящие НЕ серверная функция и НЕ ProxyAPI
// (владелец прямым текстом: "Haiku не подойдет, давай делать ответы на
// Opus и делать их также по автоматическому запросу, как сейчас настроен
// sentry. Чтобы тратились не токены proxyapi, а токены моего клода"), а
// почасовая Claude-сессия — Routine в аккаунте владельца, по тому же
// образцу, что проверка ошибок Sentry. Она читает эти таблицы через
// Supabase Management API и вызывает SQL-функцию auto_reply_apply.
//
// Отсюда два следствия для типов ниже:
//   1. criteria — не regexp и не набор флажков, а описание ситуации
//      человеческими словами: его читает модель, а не парсер. Владелец
//      заводит ситуации сам из интерфейса.
//   2. Приложение эти правила только ПОКАЗЫВАЕТ и РЕДАКТИРУЕТ — никакой
//      фронтовой/серверной логики "применить правило" в репозитории нет.

// Чем отвечаем: 'template' — ровно этим текстом (плейсхолдеры {компания},
// {запрос}, {материалы}, {контакт} — те же, что у шаблонов писем, см.
// lib/emailTemplates.ts); 'ai' — reply_body это инструкция, а сам текст
// ответа модель пишет под конкретное письмо.
export type AutoReplyKind = 'template' | 'ai';

// Что делаем с готовым ответом: 'draft' — кладём черновиком в переписку,
// человек жмёт "Отправить"; 'auto' — уходит само, без подтверждения.
export type AutoReplyMode = 'draft' | 'auto';

export interface EmailAutoReplyRule {
  id: string;
  name: string;
  criteria: string;
  replyKind: AutoReplyKind;
  replySubject: string;
  replyBody: string;
  mode: AutoReplyMode;
  // Ограничение по категории Ресерча (SupplierRequest) — null означает
  // "любая категория", как и у шаблонов писем.
  requestId: string | null;
  enabled: boolean;
  // Чем меньше число, тем раньше правило проверяется: если под письмо
  // подходят два правила, выигрывает то, что выше в списке.
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAutoReplyRuleRow {
  id: string;
  name: string;
  criteria: string | null;
  reply_kind: string | null;
  reply_subject: string | null;
  reply_body: string | null;
  mode: string | null;
  request_id: string | null;
  enabled: boolean;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

// Общий рубильник. enabled=false — почасовая сессия не трогает почту
// вообще, чем бы ни были заполнены правила (именно в этом состоянии всё
// заводится: владелец сначала настраивает ситуации, потом включает).
export interface EmailAutoReplySettings {
  enabled: boolean;
  // Не отвечать раньше, чем письмо пролежало столько минут (владелец:
  // "отвечаем на письмо не ранее, чем через 20 минут после получения
  // письма"). Мгновенный ответ выдаёт робота, а заодно не оставляет
  // времени вмешаться руками.
  minDelayMinutes: number;
}

export interface EmailAutoReplySettingsRow {
  id: boolean;
  enabled: boolean;
  min_delay_minutes: number | null;
  updated_at: string;
}

// Решение по одному входящему письму. Строка появляется на КАЖДОЕ
// разобранное письмо, включая те, где решено промолчать ('skipped') —
// иначе вопрос "почему на это письмо не ответили" остаётся без ответа, а
// сессия следующего часа разбирала бы его заново.
export type AutoReplyDecision = 'sent' | 'draft' | 'skipped';
export type AutoReplyReviewAction = 'sent' | 'edited' | 'rejected';

export interface EmailAutoReplyLogEntry {
  id: string;
  emailId: string;
  ruleId: string | null;
  ruleName: string;
  decision: AutoReplyDecision;
  confidence: string | null;
  reason: string;
  draftSubject: string;
  draftBody: string;
  replyEmailId: string | null;
  reviewedAt: string | null;
  reviewedAction: AutoReplyReviewAction | null;
  createdAt: string;
}

export interface EmailAutoReplyLogRow {
  id: string;
  email_table: string;
  email_id: string;
  rule_id: string | null;
  rule_name: string | null;
  decision: string;
  confidence: string | null;
  reason: string | null;
  draft_subject: string | null;
  draft_body: string | null;
  reply_email_id: string | null;
  reviewed_at: string | null;
  reviewed_action: string | null;
  created_at: string;
}

export const autoReplyModeLabel: Record<AutoReplyMode, string> = {
  draft: 'Черновик на проверку',
  auto: 'Отправлять автоматически',
};

export const autoReplyKindLabel: Record<AutoReplyKind, string> = {
  template: 'Готовый текст',
  ai: 'ИИ пишет по инструкции',
};

// Подпись под автоответом — то же имя, которым подписаны письма владельца
// (см. emailSignature в SupplierCorrespondenceTab). Отдельной константой,
// потому что её читает не только приложение: тот же текст подставляет
// почасовая сессия, когда правило просит модель написать ответ самой.
export const AUTO_REPLY_SENDER_NAME = 'ИИ-закупщик';
