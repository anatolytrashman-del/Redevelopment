// Шаблоны title хабов malllist.pro (владелец, 2026-10-31):
//   «{N} {тип во мн. ч.} {где} — независимый обзор | {месяц} {год}»
// N — реальное число объектов на странице; при N=1 цифру не пишем, слова
// согласуются с числом. Не длиннее ~65 знаков: сначала «торговые центры» →
// «ТЦ», потом убираем «Минска»/«в Минске»; месяц и «независимый обзор» —
// всегда. Месяц тот же, что у карточек (src/lib/tcReviewTitle.ts), в
// статическом HTML его каждый месяц подменяет middleware.ts.
import { pluralRu } from './pluralRu';
import { REVIEW_MARKER, reviewMonthLabel } from './tcReviewTitle';

export const TC_HUB_TITLE_MAX_CHARS = 65;

/** Род. падеж района: «Фрунзенский» → «Фрунзенского района», «Минский район» → «Минского района». */
export function districtGenitive(district: string): string {
  const base = district.replace(/\s+район$/u, '').trim();
  const gen = base.replace(/ий$/u, 'ого').replace(/ой$/u, 'ого').replace(/ый$/u, 'ого');
  return `${gen} района`;
}

/** «4 » или «» при N=1. */
function countPrefix(n: number): string {
  return n === 1 ? '' : `${n} `;
}

function capitalize(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

/** «ТЦ» не склоняется; согласуем прилагательное: 1 недорогой ТЦ, 2/5 недорогих ТЦ. */
function adjTc(n: number, one: string, many: string): string {
  return `${n % 10 === 1 && n % 100 !== 11 ? one : many} ТЦ`;
}

/** Фраза подборки /with/<slug> c числом в начале; null — подборка неизвестна. */
export function tcTopicHubPhrase(slug: string, n: number): string | null {
  const p = countPrefix(n);
  switch (slug) {
    case 'shopping':
      return `${p}ТЦ Минска с одеждой`;
    case 'railway-station':
      return `${p}ТЦ у вокзала в Минске`;
    case 'underground':
      return `${p}${adjTc(n, 'подземный', 'подземных')} Минска`;
    case 'center':
      return `${p}ТЦ в центре Минска`;
    case 'metro':
      return `${p}ТЦ рядом с метро в Минске`;
    case 'belarusian':
      return `${p}ТЦ Минска с белорусскими товарами`;
    case 'cinema':
      return `${p}ТЦ Минска с кинотеатром`;
    case 'kids':
      return `${p}ТЦ Минска для детей`;
    case 'entertainment':
      return `${p}ТЦ Минска с развлечениями`;
    case 'foodcourt':
      return `${p}ТЦ Минска с фудкортом`;
    case 'parking':
      return `${p}ТЦ Минска с парковкой`;
    case 'free-parking':
      return `${p}ТЦ Минска с бесплатной парковкой`;
    case 'budget':
      return `${p}${adjTc(n, 'недорогой', 'недорогих')} Минска`;
    case 'shoes':
      return `${p}ТЦ Минска с обувью`;
    case 'menswear':
      return `${p}ТЦ Минска с мужской одеждой`;
    case 'ice-rink':
      return `${p}ТЦ Минска с катком`;
    default:
      return null;
  }
}

/** /format/<slug>: «12 рынков Минска», «Аутлет Минска». plural — из TC_FORMAT_HUBS. */
export function tcFormatHubPhrase(plural: (n: number) => string, n: number): string {
  return `${countPrefix(n)}${plural(n)} Минска`;
}

export function tcMetroHubPhrase(station: string, n: number): string {
  return `${countPrefix(n)}ТЦ у метро ${station}`;
}

export function tcDistrictHubPhrase(district: string, n: number): string {
  return `${countPrefix(n)}ТЦ ${districtGenitive(district)}`;
}

/** Укорачивание по правилу 3: «торговые центры» → «ТЦ», затем без «Минска». */
function shortenings(phrase: string): string[] {
  const tc = phrase
    .replace(/торговых центров|торговых центра|торговые центры|торговый центр/giu, 'ТЦ')
    .replace(/^тЦ/u, 'ТЦ');
  // \b в JS не видит границ кириллических слов — граница через lookahead.
  const noCity = tc.replace(/\s+в Минске(?=\s|$)/u, '').replace(/\s+Минска(?=\s|$)/u, '');
  return [phrase, tc, noCity];
}

/** Итоговый title хаба: «{фраза} — независимый обзор | ноябрь 2026». */
export function tcHubTitle(phrase: string, now: Date = new Date(), marker: string = REVIEW_MARKER): string {
  const tail = ` — ${marker} ${reviewMonthLabel(now)}`;
  const variants = shortenings(capitalize(phrase)).map((v) => `${capitalize(v)}${tail}`);
  return variants.find((v) => v.length <= TC_HUB_TITLE_MAX_CHARS) ?? variants[variants.length - 1];
}

/** Корень malllist.pro: «Все 139 ТЦ Минска — независимый справочник | ноябрь 2026». */
export function tcRootTitle(total: number, now: Date = new Date()): string {
  return tcHubTitle(`Все ${total} ТЦ Минска`, now, 'независимый справочник |');
}

/** /minsk/tc: «Торговые центры Минска — каталог всех 139 ТЦ» (без месяца). */
export function tcCatalogTitle(total: number): string {
  return `Торговые центры Минска — каталог всех ${total} ТЦ`;
}

export function tcCountWord(n: number): string {
  return pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров');
}
