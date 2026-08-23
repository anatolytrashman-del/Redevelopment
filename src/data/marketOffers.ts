// Сырые объявления коммерческой недвижимости (Kufar, Realt) — см.
// scripts/sync-kufar-market-offers.mjs, scripts/sync-realt-market-offers.mjs
// и SEO_PLAN.md. Строка — одно объявление, не готовый агрегат: таблица на
// гиде района и страница верификации (/admin/market-offers) считают сводки
// прямо из этих строк, чтобы правки владельца сразу отражались везде.

export interface MarketOffer {
  id: number;
  source: string;
  adId: string;
  dealType: 'sale' | 'rent';
  propertyType: string;
  size: number;
  pricePerSqm: number;
  finishStatus: string;
  // Отдельно от finishStatus: обработал ли владелец эту строку вручную —
  // не только статус отделки, а вообще ("проверил цену/тип/площадь и всё
  // верно" тоже ставит reviewed=true, даже если отделку не трогали).
  // Одновременно это же поле защищает строку от перезаписи при следующем
  // месячном синке (см. scripts/sync-kufar-market-offers.mjs).
  reviewed: boolean;
  // Не у всех объявлений заполнен — используется только как доп. сигнал
  // при поиске дублей (dedupKey), в остальном не критичен.
  floor: number | null;
  address: string | null;
  adLink: string | null;
  updatedAt: string;
}

export interface MarketOfferRow {
  id: number;
  source: string;
  ad_id: string;
  deal_type: string;
  property_type: string;
  size: number;
  price_per_sqm: number;
  finish_status: string;
  reviewed: boolean;
  floor: number | null;
  address: string | null;
  ad_link: string | null;
  updated_at: string;
}

// Порядок площадей в таблице.
export const AREA_BUCKET_ORDER = ['<40 м²', '40–80 м²', '80–150 м²', '150+ м²'];

export function areaBucket(size: number): string {
  if (size < 40) return '<40 м²';
  if (size < 80) return '40–80 м²';
  if (size < 150) return '80–150 м²';
  return '150+ м²';
}

export const FINISH_STATUSES = ['с отделкой', 'без отделки', 'не указано'] as const;
export type FinishStatus = (typeof FINISH_STATUSES)[number];

// Типы помещений, которые реально приходят с Kufar/Realt — офисы первыми
// (это сегмент Red One), используется и порядком строк таблицы на гиде
// района, и списком вариантов в форме редактирования на /admin/market-offers.
// "Общепит" встречается только у Realt (restorant-cafe) — у Kufar это
// часть "Прочая коммерческая", отдельно не выделяется.
export const MARKET_PROPERTY_TYPES = [
  'Офисы',
  'Магазины, торговые помещения',
  'Сфера услуг',
  'Общепит',
  'Склады',
  'Промышленные помещения',
  'Прочая коммерческая',
];

// Один и тот же реальный объект может лежать в базе дважды — один и тот же
// продавец публикует его и на Kufar, и на Realt, а форматы адреса у них
// разные ("Михаила Савицкого ул, 24Н, Минск" у Kufar vs "Минск Савицкого
// ул. 24" у Realt — Realt часто отбрасывает имя/титул перед фамилией
// улицы, порядок слов другой, знаки препинания другие). Точное сравнение
// строк тут бесполезно, поэтому грубый ключ: последнее слово перед "ул"
// (обычно и есть узнаваемая "фамилия" улицы что у Kufar, что у Realt) +
// номер дома (первое число в адресе) + округлённая площадь + тип сделки.
//
// Этаж — обязательная часть ключа, когда он известен у обеих сторон. Без
// него бизнес-центры с одинаковыми по площади кабинетами на разных этажах
// (а их в Минск Мире много — у Red One та же модель) ложно считались одной
// огромной группой дублей: например, ул. Алфёрова 14 — 16 объявлений с
// одинаковой площадью, которые на деле как минимум 3 разных помещения
// (владелец проверил вручную, август 2026). Этаж неизвестен — не повод
// разделять группу (используем sentinel '?', а не пустой — иначе тот же
// эффект, что раньше без этажа вообще), просто менее надёжный сигнал.
//
// Специально не автоматизируем удаление — только группируем и подсвечиваем
// в /admin/market-offers, решение остаётся за владельцем (может быть и
// два разных объявления на две разные секции одного дома на одном этаже).
export function dedupKey(offer: Pick<MarketOffer, 'dealType' | 'size' | 'address' | 'floor'>): string | null {
  if (!offer.address) return null;
  const normalized = offer.address.toLowerCase().replace(/ё/g, 'е').replace(/[.,]/g, ' ');
  // (?![а-я]) вместо \b — \b в JS считает границей слова только [A-Za-z0-9_],
  // с кириллицей после "ул" он не срабатывает вообще (проверено вручную).
  const streetMatch = normalized.match(/([а-я-]+)\s+ул(?![а-я])/);
  const houseMatch = normalized.match(/ул\S*\s+(\d+)/);
  if (!streetMatch || !houseMatch) return null;
  const floorKey = offer.floor ?? '?';
  return `${offer.dealType}|${streetMatch[1]}|${houseMatch[1]}|${Math.round(offer.size)}|${floorKey}`;
}
