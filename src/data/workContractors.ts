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
// Полей намеренно было ровно два на старте: владелец просил основу, а не
// готовую карточку. 2026-09-19 остальное добавлено тем же паттерном, что и
// у остальных сущностей проекта — сначала под контакты аренды строительных
// лесов (см. supabase/migrations/20260919-work-contractors-fields.sql), но
// поля общие для любого подрядчика, не только лесов.
export interface WorkContractor {
  id: string;
  avitoUrl: string;
  email: string;
  // Локальная часть адреса переписки: zakupki+<shortCode>@redevelopment.pro.
  // Генерируется в БД (default), приложение его только читает — ответ
  // подрядчика матчится по нему в api/purchase-email-webhook.js.
  shortCode: string;
  companyName: string;
  website: string;
  phone: string;
  // "Типы лесов / услуги" в присланной владельцем таблице — общее название
  // оставлено нейтральным, подрядчики бывают не только по лесам.
  services: string;
  address: string;
  note: string;
  // Растущий тег (см. workContractorCategories ниже) — по нему фильтруется
  // карточка и массовая рассылка "по категории".
  category: string;
  // Доп. email'ы компании сверх основного (email) — только отображаются,
  // переписка всегда идёт с основного адреса.
  extraEmails: string[];
  createdAt: string;
}

// Пресет категорий + то, что реально встречается у подрядчиков (обычный
// паттерн растущих полей проекта, см. AddableSelect и CLAUDE.md). "ВК" —
// тег для контактов, заведённых до появления категорий (владелец,
// 2026-09-19: "все текущие контакты, которым отправлены письма, сохрани
// как ВК"), "Аренда лесов" — 33 контакта из присланной таблицы.
export const workContractorCategories = ['ВК', 'Аренда лесов'];

// Адрес, с которого уходят письма этому подрядчику и на который прилетают
// его ответы. Один в один supplierOfferEmailAddress (data/supplierResearch.ts)
// — тот же префикс zakupki+ для всей переписки закупок, конкретную таблицу
// на приёме определяет не префикс, а то, где реально нашёлся short_code.
export function workContractorEmailAddress(shortCode: string): string {
  return `zakupki+${shortCode}@redevelopment.pro`;
}

// Название компании — если есть (контакты, заведённые не с одной только
// ссылки на Авито, см. companyName выше) — иначе хвост ссылки на Авито
// (обычно это и есть имя продавца/название бригады), иначе email, иначе
// заглушка. Чисто отображение, порядок приоритета в базе не хранится.
export function workContractorTitle(c: Pick<WorkContractor, 'avitoUrl' | 'email' | 'companyName'>): string {
  if (c.companyName) return c.companyName;
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
  company_name: string | null;
  website: string | null;
  phone: string | null;
  services: string | null;
  address: string | null;
  note: string | null;
  category: string | null;
  extra_emails: string[] | null;
  created_at: string;
}
