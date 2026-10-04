// Рейтинги каталога ТЦ: «лучшие» (оценка Яндекс.Карт) и «самые большие»
// (общая площадь). Методика как у БЦ (businessCenterRanking.ts), без
// делового класса — у торговых центров его нет.
//
// Звёзды ТЦ — не из highlights (там факты ресёрча), а из
// business_center_yandex_cards / /data/tc-ratings.json (см. yandexCardsApi).
import type { BusinessCenter } from '../data/businessCenters';
import {
  isOutsideMinsk,
  MIN_RATING_COUNT,
  RATING_THRESHOLD,
  ratingsWord,
  type ExcludedCenter,
  type RankedCenter,
} from './businessCenterRanking';
import type { YandexCardRatingIndex } from './yandexCardsApi';

export type { ExcludedCenter, RankedCenter };

/** Топ-списки ТЦ — не больше 10 карточек (владелец, 2026-10-04). */
export const TC_RANKING_LIMIT = 10;
export const TC_LARGEST_LIMIT = TC_RANKING_LIMIT;

/** В рейтинг «Лучшие» только классические ТЦ/ТРЦ — без рынков, авто, мебели и т.п. (владелец, 2026-10-04). */
export const TC_RANKING_FORMATS = ['ТЦ', 'ТРЦ'] as const;

function isEligibleTc(center: BusinessCenter): boolean {
  return center.status !== 'under_construction' && !isOutsideMinsk(center);
}

/** Формат именно «ТЦ» или «ТРЦ» — не «районный ТЦ», не гипермаркет, не рынок. */
export function isTcRankingFormat(center: BusinessCenter): boolean {
  return center.retailFormat != null && (TC_RANKING_FORMATS as readonly string[]).includes(center.retailFormat);
}

function ratingLabel(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Лучшие ТЦ: только форматы ТЦ/ТРЦ, рейтинг Яндекс.Карт ≥ порога при достаточном числе оценок. */
export function buildTcRanking(
  centers: BusinessCenter[],
  ratings: YandexCardRatingIndex,
  threshold: number = RATING_THRESHOLD,
  minCount: number = MIN_RATING_COUNT,
): RankedCenter[] {
  return centers
    .filter((c) => isEligibleTc(c) && isTcRankingFormat(c))
    .map((c) => {
      const card = ratings.get(c.slug);
      if (!card) return null;
      return {
        center: c,
        rating: card.rating,
        ratingLabel: ratingLabel(card.rating),
        ratingCount: card.ratingCount,
      };
    })
    .filter((r): r is RankedCenter => r !== null && r.rating >= threshold && r.ratingCount >= minCount)
    .sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount)
    .slice(0, TC_RANKING_LIMIT);
}

export function buildTcExcluded(
  centers: BusinessCenter[],
  ratings: YandexCardRatingIndex,
  threshold: number = RATING_THRESHOLD,
  minCount: number = MIN_RATING_COUNT,
): ExcludedCenter[] {
  return centers
    .filter((c) => c.status !== 'under_construction')
    .map((center) => {
      if (isOutsideMinsk(center)) return { center, reason: 'не в черте Минска' };
      if (!isTcRankingFormat(center)) {
        return {
          center,
          reason: center.retailFormat ? `формат «${center.retailFormat}», не ТЦ/ТРЦ` : 'формат не ТЦ/ТРЦ',
        };
      }
      const card = ratings.get(center.slug);
      if (!card) return { center, reason: 'рейтинг на Яндекс.Картах не найден' };
      if (card.rating < threshold)
        return {
          center,
          reason: `рейтинг ${ratingLabel(card.rating)} из 5, ниже порога ${threshold.toLocaleString('ru-RU')}`,
        };
      if (card.ratingCount < minCount)
        return { center, reason: `${card.ratingCount} ${ratingsWord(card.ratingCount)}, меньше порога ${minCount}` };
      return null;
    })
    .filter((e): e is ExcludedCenter => e !== null);
}

/** Сданные ТЦ в черте Минска с известной общей площадью, по убыванию. */
export function buildTcLargestEligible(centers: BusinessCenter[]): BusinessCenter[] {
  return centers
    .filter((c) => isEligibleTc(c) && c.totalArea != null)
    .sort((a, b) => (b.totalArea ?? 0) - (a.totalArea ?? 0));
}

export function buildTcLargest(centers: BusinessCenter[], limit: number = TC_LARGEST_LIMIT): BusinessCenter[] {
  return buildTcLargestEligible(centers).slice(0, limit);
}
