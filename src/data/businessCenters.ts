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
  // Условия для арендаторов, найденные на официальном сайте БЦ (владелец,
  // 2026-09-05: "по нему нет объявлений на куфаре и realt, но у них на
  // сайте есть информация для арендаторов... пройдись по сайтам БЦ") —
  // собрано веб-поиском по офиц. сайту БЦ (Gemini через ProxyAPI — прямого
  // доступа к большинству таких сайтов из песочницы нет). Разбито на
  // логические разделы (не единый текст-простыня — первая версия была
  // нечитаемой "стеной текста", владелец: "верстка — пиздец, разбей на
  // логические блоки"), каждое поле независимо null, если по этому пункту
  // ничего не нашлось. null у всего объекта — сайта нет, недоступен был
  // при проверке, или на нём вообще нет такой информации (не выдумываем).
  rentalInfo: RentalInfo | null;
  // "Интересные факты" — история объекта, известные арендаторы, награды и
  // упоминания в СМИ, рейтинг/отзывы с карт (владелец, 2026-09-06: "давай
  // подтянем рейтинг из Яндекс.Карт, отзывы, другую инфу про БЦ... чтобы
  // страница была даже понятнее, чем официальный сайт"). История/арендаторы/
  // СМИ — собраны веб-поиском (Gemini+google_search), КАЖДЫЙ факт
  // перепроверен ОТДЕЛЬНЫМ независимым поиском перед публикацией — первая
  // попытка дала правдоподобные, но неподтверждённые детали, не взяли на
  // веру с одного ответа модели. rating/reviews — сознательно НЕ
  // автоматизировано: прямой доступ к Яндекс.Картам из песочницы
  // заблокирован, а "заземлённый" поиск, честно признавшись "не могу
  // открыть страницу", всё равно выдал правдоподобные цитаты отзывов с
  // именами и датами — то есть выдумал. Рейтинг/отзывы заполняются вручную
  // владельцем (копия/скриншот из его браузера, где Яндекс.Карты доступны).
  highlights: BusinessCenterHighlights | null;
  photos: string[];
  // 'built' по умолчанию. 'under_construction' — как МФЦ, ещё строится.
  status: 'built' | 'under_construction';
  // Порядок на публичной странице (изначально — примерно по частотности
  // поисковых запросов, не алфавитный — алфавит только в боковой навигации).
  // Управляется в админке (см. BusinessCentersAdminTab.tsx).
  sortOrder: number;
  createdAt: string;
}

// Разделы блока "Условия для арендаторов" — каждый рендерится своей
// подписанной строкой на BusinessCenterDetailPage.tsx (иконка + текст), а
// не одним абзацем. caveat — важная оговорка источника (сайт недоступен,
// БЦ на деле не сдаёт офисы и т.п.) показывается отдельным акцентным
// блоком наверху, если заполнена.
export interface RentalInfo {
  caveat: string | null;
  terms: string | null;
  rates: string | null;
  sizes: string | null;
  parking: string | null;
  contacts: string | null;
}

// "Интересные факты" — независимая от rentalInfo категория (не про условия
// аренды, а про сам объект как таковой). rating/reviews не автогенерятся
// (см. комментарий у BusinessCenter.highlights) — заполняются вручную.
export interface BusinessCenterHighlights {
  history: string | null;
  tenants: string | null;
  media: string | null;
  rating: string | null;
  reviews: string | null;
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
  rental_info: RentalInfo | null;
  highlights: BusinessCenterHighlights | null;
  photos: string[] | null;
  status: string | null;
  sort_order: number;
  created_at: string;
}

export const BUSINESS_CENTER_CLASSES = ['A', 'B+', 'B', 'C'] as const;
