// Лог действий сотрудников — задел на будущее ("начнём со Светланы, а
// конкретно со сбора количества верифицированных карточек за день", запрос
// владельца). Строка — одно действие одного профиля в один момент времени;
// страница /admin/activity-log (видна только владельцу, см.
// RequireSuperAdmin) агрегирует их в разбивку по дням/сотрудникам прямо из
// сырых записей — тот же принцип, что и у остальной аналитики в проекте
// (см. DistrictGuidePage/MarketOffersReview): не хранить готовый агрегат,
// считать его на лету, чтобы ничего не рассинхронизировалось.
export interface ActivityLogEntry {
  id: number;
  profileId: string | null;
  profileName: string;
  action: string;
  createdAt: string;
}

export interface ActivityLogRow {
  id: number;
  profile_id: string | null;
  profile_name: string;
  action: string;
  created_at: string;
}

// Известные типы действий — просто для человеческих подписей на странице
// лога, само поле action в базе свободный text (см. logActivity в
// lib/activityLogApi.ts), чтобы добавлять новые виды действий не требовало
// миграции.
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  market_offer_verified: 'Верификация объявления (аналитика рынка)',
  supplier_offer_verified: 'Верификация поставщика (Ресерч)',
  // Снятая верификация. Владелец, 2026-09-15: «вычти их из баланса
  // ИИ-закупщика» — 115 карточек, помеченных роботом без email по слишком
  // мягкому правилу (см. миграции 20260915-verify-requires-email.sql и
  // 20260915-ai-buyer-verifications-rollback.sql). Строки не удалены, а
  // переименованы: событие было, но в счётчик «Верифицировано поставщиков»
  // на /admin/metrics оно больше не идёт — тот считает ровно
  // supplier_offer_verified.
  supplier_offer_verified_rolled_back: 'Верификация поставщика отменена (без email)',
  supplier_offer_added_manually: 'Добавление поставщика вручную (Ресерч)',
  supplier_invoice_confirmed: 'Подтверждение счёта/КП из письма (Ресерч → Письма)',
  supplier_web_search_started: 'Запуск веб-поиска поставщиков (Закупки → Поставщики)',
};

export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action;
}
