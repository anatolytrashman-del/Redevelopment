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

// Откуда взялась ситуация: 'manual' — владелец завёл её руками в админке,
// 'learned' — её вывел разбор почты из живого ответа владельца (см.
// docs/auto-reply-routine.md, раздел про обучение). Выученные заводятся
// всегда в режиме 'draft': сначала показывают черновик, и только после
// нескольких одобрений подряд им предлагают отвечать самостоятельно.
export type AutoReplySource = 'manual' | 'learned';

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
  source: AutoReplySource;
  // Письмо, из ответа на которое ситуация выучена (для 'learned').
  originEmailId: string | null;
  // Живые формулировки поставщиков, по строке на пример: их дописывает
  // разбор почты, когда ситуация не узнала очередной вариант вопроса.
  // Читает их та же модель, что и criteria — это "память" ситуации.
  examples: string;
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
  source: string | null;
  origin_email_id: string | null;
  examples: string | null;
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
  // Чем подписаны автоответы. Владелец, 2026-09-14: "Ко всем письмам пишем
  // подпись: Анатолий Трэшмен" — подпись НЕ дублируется в тексте каждой
  // ситуации, её подставляет SQL-функция auto_reply_apply на отправке.
  signature: string;
  // Дожим молчащих поставщиков (шаг 8 плана закупок): ИИ-закупщик сам
  // отправляет напоминание через reply_due_days дней после нашего письма.
  // Рубильник отдельный от enabled намеренно: отвечать на входящее и писать
  // первым — разные по риску вещи. По умолчанию выключено, как и автоответы.
  followupsEnabled: boolean;
}

export interface EmailAutoReplySettingsRow {
  id: boolean;
  enabled: boolean;
  min_delay_minutes: number | null;
  signature: string | null;
  followups_enabled?: boolean | null;
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
  // Разбор почты с владельцем: что именно у него спросили, какой ответ
  // предложили (смысловая часть, без приветствия и подписи — в отличие от
  // draftBody, где лежит уже собранное письмо), когда спросили и что он
  // ответил. answeredAt закрывает письмо: закрытое повторно не спрашивают
  // и второй раз не отправляют.
  question: string;
  proposal: string;
  askedAt: string | null;
  answeredAt: string | null;
  ownerAnswer: string;
  learnedRuleId: string | null;
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
  question: string | null;
  proposal: string | null;
  asked_at: string | null;
  answered_at: string | null;
  owner_answer: string | null;
  learned_rule_id: string | null;
  created_at: string;
}

// Сколько раз ситуация срабатывала и чем это кончилось — из представления
// email_auto_reply_rule_stats. Нужно ровно для одного: видеть в админке, на
// что система уже насмотрелась, а что владелец каждый раз переписывает.
export interface EmailAutoReplyRuleStats {
  ruleId: string;
  firedTotal: number;
  autoSent: number;
  drafts: number;
  approvedAsIs: number;
  edited: number;
  rejected: number;
  lastFiredAt: string | null;
}

export interface EmailAutoReplyRuleStatsRow {
  rule_id: string;
  fired_total: number | string | null;
  auto_sent: number | string | null;
  drafts: number | string | null;
  approved_as_is: number | string | null;
  edited: number | string | null;
  rejected: number | string | null;
  last_fired_at: string | null;
}

export const autoReplySourceLabel: Record<AutoReplySource, string> = {
  manual: 'Заведена вручную',
  learned: 'Выучена из вашего ответа',
};

export const autoReplyModeLabel: Record<AutoReplyMode, string> = {
  draft: 'Черновик на проверку',
  auto: 'Отправлять автоматически',
};

export const autoReplyKindLabel: Record<AutoReplyKind, string> = {
  template: 'Готовый текст',
  ai: 'ИИ пишет по инструкции',
};

// Имя, которым помечены автоответы в ленте переписки (колонка sent_by_name
// исходящего письма) — не подпись в тексте письма, а отметка "это писал не
// человек". Ту же строку ставит SQL-функция auto_reply_apply.
export const AUTO_REPLY_SENDER_NAME = 'ИИ-закупщик';

// Подпись по умолчанию, если в настройках её стёрли.
export const DEFAULT_AUTO_REPLY_SIGNATURE = 'Анатолий Трэшмен';
