// Подрядчик на вкладке "Подрядчики" страницы "Закупки" (владелец,
// 2026-09-14: "заложить основу... на старте нужно всего два поля — ссылка на
// страницу на Авито и email подрядчика").
//
// Почему WorkContractor, а не Contractor: имя занято составом команды
// (data/contractors.ts, страница /admin/contractors, в меню "Команда").
// Рядом есть третья сущность — ResearchOffer из data/contractorResearch.ts
// (секция "Работы" внутри вкладки "Поставщики": сравнение предложений на
// услуги по цене). Эта — реестр подрядчиков с Авито, с которыми переписываемся;
// с теми двумя общих данных нет. Подробнее — в шапке миграции
// supabase/migrations/20260914-work-contractors.sql.
//
// Полей намеренно ровно два: владелец просил основу, а не готовую карточку.
// Всё остальное (название, специальность, телефон, статус) добавляется потом
// тем же паттерном, что и у остальных сущностей проекта.
export interface WorkContractor {
  id: string;
  avitoUrl: string;
  email: string;
  // Локальная часть адреса переписки: zakupki+<shortCode>@redevelopment.pro.
  // Генерируется в БД (default), приложение его только читает — ответ
  // подрядчика матчится по нему в api/purchase-email-webhook.js.
  shortCode: string;
  createdAt: string;
}

// Адрес, с которого уходят письма этому подрядчику и на который прилетают
// его ответы. Один в один supplierOfferEmailAddress (data/supplierResearch.ts)
// — тот же префикс zakupki+ для всей переписки закупок, конкретную таблицу
// на приёме определяет не префикс, а то, где реально нашёлся short_code.
export function workContractorEmailAddress(shortCode: string): string {
  return `zakupki+${shortCode}@redevelopment.pro`;
}

// Пока имени у подрядчика нет (полей ровно два), в списке его нужно чем-то
// подписать — берём хвост ссылки на Авито (обычно это как раз имя продавца
// или название бригады), иначе email, иначе заглушку. Чисто отображение,
// в базе ничего такого не хранится.
export function workContractorTitle(c: Pick<WorkContractor, 'avitoUrl' | 'email'>): string {
  const fromAvito = avitoSlug(c.avitoUrl);
  if (fromAvito) return fromAvito;
  if (c.email) return c.email;
  return 'Без названия';
}

// "https://www.avito.ru/user/abc123/profile?src=1" → "abc123".
// Кривую/неполную ссылку не разбираем — вернём пустую строку, вызывающий
// код сам решит, чем подписать карточку (см. workContractorTitle выше).
function avitoSlug(url: string): string {
  if (!url) return '';
  try {
    const path = new URL(url.startsWith('http') ? url : `https://${url}`).pathname;
    const last = path.split('/').filter(Boolean).pop() ?? '';
    return last === 'profile' ? (path.split('/').filter(Boolean).at(-2) ?? '') : last;
  } catch {
    return '';
  }
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. src/lib/workContractorsApi.ts
export interface WorkContractorRow {
  id: string;
  avito_url: string | null;
  email: string | null;
  short_code: string;
  created_at: string;
}
