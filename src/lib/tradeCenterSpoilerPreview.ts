// Подписи свёрнутых CategorySpoiler на карточке ТЦ: в шапке — факты,
// а не повтор счётчика и не общая фраза. Чистые функции — для тестов и FAQ.
import type {
  DeveloperInfo,
  MediaMention,
  RetailAwardEntry,
  RetailFigureEntry,
  RetailPitch,
  RetailRankingEntry,
  RetailVacancyEntry,
} from '../data/businessCenters';
import type { HighlightRatingEntry } from './businessCenterDisplay';
import type { DealStats } from './businessCenterOfferStats';
import { formatAreaValue } from './businessCenterOfferStats';
import { pluralRu } from './pluralRu';
import {
  rankingBadge,
  shortAwardTitle,
  shortRankingTitle,
  sortAwardTiles,
  sortRankingTiles,
} from './tradeCenterAwards';
import { leasingFormats } from './tradeCenterBusiness';
import type { ReviewThemes } from './tradeCenterFactsReviews';

function lowerFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLocaleLowerCase('ru-RU') + text.slice(1);
}

function joinParts(parts: Array<string | null | undefined>, limit = 3): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).slice(0, limit).join(' · ');
}

function topTheme(items: ReviewThemes['praise']): string | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => b.share - a.share)[0]?.theme ?? null;
}

/** «4,7 ★ · хвалят: удобное расположение · жалуются: очереди в туалеты». */
export function reviewThemesPreview(
  themes: ReviewThemes,
  rating?: HighlightRatingEntry | null,
): string {
  const parts: string[] = [];
  if (rating?.value) parts.push(`${rating.value} ★`);
  const praise = topTheme(themes.praise);
  const complaint = topTheme(themes.complaints);
  if (praise) parts.push(`хвалят: ${lowerFirst(praise)}`);
  if (complaint) parts.push(`жалуются: ${lowerFirst(complaint)}`);
  if (parts.length) return joinParts(parts, 3);
  const count = themes.reviewCount ?? themes.reviews;
  if (count) return `${count.toLocaleString('ru-RU')} отзывов`;
  return 'Темы из отзывов в Яндекс Картах';
}

/** «№1 — крупнейший ТЦ по GLA · «Битва ТЦ» Onliner 2016». */
export function awardsRankingPreview(
  ranking: RetailRankingEntry[],
  awards: RetailAwardEntry[],
): string {
  const parts: string[] = [];
  const topRank = sortRankingTiles(ranking)[0];
  if (topRank) {
    const badge = rankingBadge(topRank);
    const place = badge.sub ? `${badge.main} ${badge.sub}` : badge.main;
    parts.push(`${place} — ${shortRankingTitle(topRank)}`);
  }
  const topAward = sortAwardTiles(awards)[0];
  if (topAward) {
    parts.push(joinParts([shortAwardTitle(topAward), topAward.year], 2));
  }
  return joinParts(parts, 2) || 'Места в рейтингах и отраслевые премии';
}

/** «Onliner · CityDog · Tut.by · ещё 2». */
export function mediaMentionsPreview(mentions: MediaMention[]): string {
  const outlets = [...new Set(mentions.map((m) => m.outlet.trim()).filter(Boolean))];
  if (!outlets.length) {
    const n = mentions.length;
    return `${n} ${pluralRu(n, 'материал', 'материала', 'материалов')}`;
  }
  const shown = outlets.slice(0, 4);
  const rest = outlets.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} · ещё ${rest}` : shown.join(' · ');
}

/** Первый факт; если короткий — второй через «·». */
export function factCardsPreview(facts: Array<{ headline: string }>): string {
  if (!facts.length) return 'Короткие детали, которых нет в шапке';
  const first = facts[0].headline.trim();
  if (!first) return 'Короткие детали, которых нет в шапке';
  if (facts.length === 1 || first.length > 72) return first;
  const second = facts[1]?.headline.trim();
  if (!second) return first;
  if (first.length + second.length <= 96) return `${first} · ${second}`;
  return first;
}

/**
 * Парковка + площадь + этажи / год — до трёх опорных фактов.
 * `rows` — уже собранные строки «Параметры здания».
 */
export function techParamsPreview(input: {
  parkingShort?: string | null;
  parkingFallback?: string | null;
  rows?: Array<{ label: string; value: string | null }>;
  totalArea?: number | null;
  yearBuilt?: number | string | null;
  architectureLead?: string | null;
}): string {
  const parts: string[] = [];
  const parking = input.parkingShort?.trim()
    || (input.parkingFallback && input.parkingFallback.length <= 56 ? input.parkingFallback : null);
  if (parking) parts.push(`Парковка · ${parking}`);

  const row = (label: string) => input.rows?.find((r) => r.label === label)?.value?.trim() || null;
  const area = row('Общая площадь')
    || (input.totalArea != null && input.totalArea > 0
      ? `${Math.round(input.totalArea).toLocaleString('ru-RU')} м²`
      : null);
  if (area) parts.push(area);

  const floors = row('Количество этажей');
  if (floors) parts.push(/этаж/iu.test(floors) ? floors : `${floors} эт.`);

  if (parts.length < 3) {
    const year = row('Год ввода') || (input.yearBuilt != null ? String(input.yearBuilt) : null);
    if (year) parts.push(year);
  }
  if (parts.length < 2 && input.architectureLead) parts.push(input.architectureLead);

  return joinParts(parts, 3) || 'Площадь, этажи, парковка и факты о здании';
}

/** ««Табак-инвест» · розница и девелопмент · 12 объектов». */
export function developerPreview(
  info: DeveloperInfo,
  mainName: string | null,
): string {
  const parts: string[] = [];
  if (mainName) parts.push(mainName);

  const business = info.profile?.business?.trim();
  if (business) {
    const clause = business.match(/^[\s\S]{1,64}?(?:[.!?](?=\s|$)|$)/)?.[0]
      ?.replace(/[.!?]\s*$/, '')
      .trim();
    if (clause && clause !== mainName) parts.push(clause);
  } else if (info.profile?.founded) {
    parts.push(/^\d{4}$/.test(info.profile.founded)
      ? `с ${info.profile.founded}`
      : info.profile.founded);
  }

  const scale = info.profile?.scale?.[0];
  if (scale && parts.length < 3) parts.push(`${scale.value} ${lowerFirst(scale.label)}`);

  const portfolio = info.portfolio?.length ?? 0;
  if (portfolio > 0 && parts.length < 3) {
    parts.push(`${portfolio} ${pluralRu(portfolio, 'объект', 'объекта', 'объектов')} в портфеле`);
  }

  const companies = info.companies?.length ?? 0;
  if (companies > 1 && parts.length < 3) {
    parts.push(`${companies} ${pluralRu(companies, 'участник', 'участника', 'участников')} проекта`);
  }

  return joinParts(parts, 3)
    || info.description?.trim()
    || 'Кто построил комплекс';
}

export function developerPreviewMeta(info: DeveloperInfo): string | null {
  const portfolio = info.portfolio?.length ?? 0;
  if (portfolio > 0) {
    return `${portfolio} ${pluralRu(portfolio, 'объект', 'объекта', 'объектов')}`;
  }
  const companies = info.companies?.length ?? 0;
  if (companies > 0) {
    return `${companies} ${pluralRu(companies, 'роль', 'роли', 'ролей')}`;
  }
  return 'Застройщик';
}

/** «Аренда · 45–320 м² · 4 лота · острова и корнеры». */
export function leasingPreview(input: {
  leasing: RetailPitch | null;
  sale: DealStats | null;
  rent: DealStats | null;
  listed: RetailVacancyEntry[];
  name: string;
}): string {
  const parts: string[] = [];
  const deal = input.rent ?? input.sale;
  if (deal) {
    const label = deal.deal === 'rent' ? 'Аренда' : 'Продажа';
    const size = deal.sizeMin === deal.sizeMax
      ? `${formatAreaValue(deal.sizeMin)} м²`
      : `${formatAreaValue(deal.sizeMin)}–${formatAreaValue(deal.sizeMax)} м²`;
    parts.push(`${label} · ${size}`);
    parts.push(`${deal.count} ${pluralRu(deal.count, 'лот', 'лота', 'лотов')}`);
  } else if (input.listed.length) {
    const sizes = input.listed
      .map((v) => v.size)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
    const sizePart = sizes.length
      ? (() => {
        const min = Math.min(...sizes);
        const max = Math.max(...sizes);
        return min === max
          ? `${formatAreaValue(min)} м²`
          : `${formatAreaValue(min)}–${formatAreaValue(max)} м²`;
      })()
      : null;
    parts.push(joinParts([
      `${input.listed.length} ${pluralRu(input.listed.length, 'помещение', 'помещения', 'помещений')} от ТЦ`,
      sizePart,
    ], 2));
  }

  const formats = leasingFormats(input.leasing);
  if (formats.length) {
    parts.push(formats.slice(0, 2).map((f) => f.title).join(', '));
  } else if (input.leasing?.contacts && !parts.length) {
    return `Отдел аренды · управляющая компания ${input.name}`;
  }

  return joinParts(parts, 3) || 'Свободные площади и отдел аренды';
}

export function leasingPreviewMeta(input: {
  sale: DealStats | null;
  rent: DealStats | null;
  listed: RetailVacancyEntry[];
  leasing: RetailPitch | null;
}): string {
  const count = (input.rent?.count ?? 0) + (input.sale?.count ?? 0) + input.listed.length;
  if (count > 0) return `${count} ${pluralRu(count, 'лот', 'лота', 'лотов')}`;
  if (input.leasing?.contacts) return 'Отдел аренды';
  return 'Для бизнеса';
}

/** «75 000 м² · 30 тыс. посетителей в день». */
export function numbersPreview(numbers: RetailFigureEntry[]): string {
  if (!numbers.length) return 'Площадь, трафик и другие опорные цифры';
  return joinParts(
    numbers.slice(0, 3).map((entry) => `${entry.value} — ${lowerFirst(entry.label)}`),
    3,
  );
}

/** «2011 — открытие · 2014 — расширение» или годы диапазона + якорь. */
export function timelinePreview(
  entries: Array<{
    date?: string | null;
    year?: string | number | null;
    name?: string | null;
    title?: string | null;
    text?: string | null;
  }>,
): string {
  if (!entries.length) return 'Первые бренды, форматы и знаковые события';
  const label = (entry: (typeof entries)[number]) => {
    const year = entry.year != null
      ? String(entry.year)
      : entry.date?.match(/\d{4}/)?.[0] ?? null;
    const title = (entry.name ?? entry.title ?? entry.text ?? '').trim();
    const short = title.length > 42 ? `${title.slice(0, 40).trim()}…` : title;
    return year && short ? `${year} — ${lowerFirst(short)}` : year || short || null;
  };
  const first = label(entries[0]);
  const last = entries.length > 1 ? label(entries[entries.length - 1]) : null;
  return joinParts([first, last], 2) || 'Первые бренды, форматы и знаковые события';
}
