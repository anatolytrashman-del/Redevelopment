// Бизнес-центры Минска — данные для публичной справочной страницы
// /minsk/bcminsk. Изначально (2026-09-04) список жил статическим массивом
// прямо в этом файле — владелец попросил завести админку ("Аналитика рынка"
// → вкладка "Бизнес-центры"), поэтому данные переехали в Supabase
// (таблица `business_centers`, RLS: anon select, authenticated — полный
// CRUD, тот же паттерн, что у `objects`). Публичная страница
// (BusinessCentersMinskPage.tsx) и админка (BusinessCentersAdminTab.tsx)
// читают/пишут через lib/businessCentersApi.ts.
//
// businessClass=null / district=null — "не указано", владелец: "где класс
// не указан, поставь тег «Не указан», укажем вручную" — не выдумывать
// значение, честно показывать как есть, дозаполнять со временем в админке.
export interface BusinessCenter {
  id: string;
  slug: string;
  name: string;
  address: string;
  // Административный район Минска (Центральный/Советский/Первомайский/...)
  // — открытый список, растёт из AddableSelect в форме. "За городом" — для
  // объектов физически вне Минска (см. "Аден").
  district: string | null;
  businessClass: 'A' | 'B+' | 'B' | 'C' | null;
  totalArea: number | null;
  // Для status='under_construction' — ожидаемый год сдачи, не факт постройки
  // (см. BusinessCentersMinskPage.tsx — подпись меняется в зависимости от status).
  yearBuilt: number | null;
  floors: number | null;
  developer: string | null;
  metro: string | null;
  parking: string | null;
  website: string | null;
  description: string | null;
  photos: string[];
  // 'built' по умолчанию. 'under_construction' — как МФЦ, ещё строится.
  status: 'built' | 'under_construction';
  // Порядок на публичной странице (изначально — примерно по частотности
  // поисковых запросов, не алфавитный — алфавит только в боковой навигации).
  // Управляется в админке (см. BusinessCentersAdminTab.tsx).
  sortOrder: number;
  createdAt: string;
}

// Форма строки в таблице Supabase (snake_case-колонки) — см. lib/businessCentersApi.ts
export interface BusinessCenterRow {
  id: string;
  slug: string;
  name: string;
  address: string;
  district: string | null;
  business_class: string | null;
  total_area: number | null;
  year_built: number | null;
  floors: number | null;
  developer: string | null;
  metro: string | null;
  parking: string | null;
  website: string | null;
  description: string | null;
  photos: string[] | null;
  status: string | null;
  sort_order: number;
  created_at: string;
}

export const BUSINESS_CENTER_CLASSES = ['A', 'B+', 'B', 'C'] as const;
