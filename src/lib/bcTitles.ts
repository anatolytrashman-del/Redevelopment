// Шаблоны title officelist.pro (владелец, 2026-10-31, «officelist titles»):
//   карточка БЦ с объявлениями аренды или ставками в данных:
//     «БЦ {Название} — независимый обзор и арендные ставки | {месяц} {год}»
//   остальные карточки: «БЦ {Название} — независимый обзор | {месяц} {год}»
//   хабы: «{N} БЦ {где} — независимый обзор | {месяц} {год}»
//   рейтинги: «{название без хвоста} — независимый рейтинг | {месяц} {год}»
//   страницы Минск-Мира: текст как был + « | {месяц} {год}», только если ≤70.
// Месяц — месяц СБОРКИ по Минску (тот же, что у malllist, см.
// src/lib/tcReviewTitle.ts): title, бейдж «Обновлено» и dateModified берут
// одну дату. N — реальное число зданий; при N=1 цифру не пишем. H1 не трогаем.
// Длина ~65–70: длиннее 70 — сначала без «Минска»/«в Минске», затем (у
// карточек) без «БЦ »; месяц и «независимый обзор» остаются всегда.
import { pluralRu } from './pluralRu';
import { contentDate, reviewMonthLabel } from './tcReviewTitle';
import { districtGenitive } from './tcHubTitle';

export const BC_TITLE_MAX_CHARS = 70;
const REVIEW = 'независимый обзор';

function countPrefix(n: number): string {
  return n === 1 ? '' : `${n} `;
}

function capitalize(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function dropCity(phrase: string): string {
  // \b не видит границ кириллицы — граница через lookahead.
  return phrase.replace(/\s+в Минске(?=\s|$)/u, '').replace(/\s+Минска(?=\s|$)/u, '');
}

/** «{фраза} — независимый обзор | октябрь 2026», ≤70 знаков, если можно. */
export function bcHubTitle(phrase: string, now: Date = contentDate()): string {
  const tail = ` — ${REVIEW} | ${reviewMonthLabel(now)}`;
  const variants = [phrase, dropCity(phrase)].map((v) => `${capitalize(v)}${tail}`);
  return variants.find((v) => v.length <= BC_TITLE_MAX_CHARS) ?? variants[variants.length - 1];
}

/** Корень каталога (/, /minsk/bc): «140 бизнес-центров Минска». */
export function bcCatalogPhrase(n: number): string {
  return `${countPrefix(n)}${pluralRu(n, 'бизнес-центр', 'бизнес-центра', 'бизнес-центров')} Минска`;
}

/** Район в родительном падеже; «Великий камень» — индустриальный парк, не район. */
function bcDistrictGenitive(district: string): string {
  if (district === 'Великий камень') return 'парка «Великий камень»';
  return districtGenitive(district);
}

export function bcDistrictPhrase(district: string, n: number): string {
  return `${countPrefix(n)}БЦ ${bcDistrictGenitive(district)}`;
}

export function bcMetroPhrase(station: string, n: number): string {
  return `${countPrefix(n)}БЦ у метро ${station}`;
}

/**
 * Улица — как в данных, с её сокращением («ул.», «пр-т», «пер.»). Названия
 * без сокращения склоняем явно: «на Логойском тракте», а не «на Логойский тракт».
 */
const STREET_PREPOSITIONAL: Record<string, string> = {
  'Логойский тракт': 'Логойском тракте',
};

export function bcStreetPhrase(street: string, n: number): string {
  return `${countPrefix(n)}БЦ на ${STREET_PREPOSITIONAL[street] ?? street}`;
}

export function bcAreaPhrase(microdistrict: string, n: number): string {
  return `${countPrefix(n)}БЦ района ${microdistrict}`;
}

export function bcClassPhrase(businessClass: string, n: number): string {
  return `${countPrefix(n)}БЦ класса ${businessClass} в Минске`;
}

export function bcClassDistrictPhrase(businessClass: string, district: string, n: number): string {
  return `${countPrefix(n)}БЦ класса ${businessClass} ${bcDistrictGenitive(district)}`;
}

/**
 * Карточка БЦ. withRates — у здания есть хотя бы одно объявление аренды
 * (business_center_offers, deal = 'rent') или заполнено поле rental_info.rates.
 */
export function bcCardTitle(name: string, withRates: boolean, now: Date = contentDate()): string {
  const tail = ` — ${REVIEW}${withRates ? ' и арендные ставки' : ''} | ${reviewMonthLabel(now)}`;
  const full = `БЦ ${name}${tail}`;
  // «БЦ » снимаем только перед собственным именем с заглавной буквы: у
  // зданий без имени title иначе начинался бы со строчного «на Жуковского…».
  // Если и так длиннее 70 — оставляем (такие перечислены в отчёте сборки).
  const startsUpper = /^[A-ZА-ЯЁ0-9«"]/u.test(name);
  return full.length > BC_TITLE_MAX_CHARS && startsUpper ? `${name}${tail}` : full;
}

/** Правило «реальные объявления или ставки» — одно на карточку и на списки A/B. */
export function bcHasRentData(
  rentOfferCount: number,
  rentalInfo: { rates: string | null } | null | undefined,
): boolean {
  return rentOfferCount > 0 || Boolean(rentalInfo?.rates?.trim());
}

/** Рейтинги: «Лучшие БЦ Минска классов B и C — независимый рейтинг | октябрь 2026». */
export function bcRatingTitle(base: string, now: Date = contentDate()): string {
  return `${base} — независимый рейтинг | ${reviewMonthLabel(now)}`;
}

/** Минск-Мир: текст не меняем; « | месяц год» — только если итог ≤70. */
export function withMonthIfFits(title: string, now: Date = contentDate()): string {
  const next = `${title} | ${reviewMonthLabel(now)}`;
  return next.length <= BC_TITLE_MAX_CHARS ? next : title;
}
