// Рейтинги каталога ТЦ: «лучшие» (оценка Яндекс.Карт) и «самые большие»
// (общая площадь). Методика как у БЦ (businessCenterRanking.ts), без
// делового класса — у торговых центров его нет.
import type { BusinessCenter } from '../data/businessCenters';
import { mapRatingFromHighlights } from './businessCenterDisplay';
import {
  isOutsideMinsk,
  MIN_RATING_COUNT,
  RATING_THRESHOLD,
  ratingsWord,
  type ExcludedCenter,
  type RankedCenter,
} from './businessCenterRanking';

export type { ExcludedCenter, RankedCenter };

export const TC_LARGEST_LIMIT = 20;

function isEligibleTc(center: BusinessCenter): boolean {
  return center.status !== 'under_construction' && !isOutsideMinsk(center);
}

/** Лучшие ТЦ: рейтинг Яндекс.Карт ≥ порога при достаточном числе оценок. */
export function buildTcRanking(
  centers: BusinessCenter[],
  threshold: number = RATING_THRESHOLD,
  minCount: number = MIN_RATING_COUNT,
): RankedCenter[] {
  return centers
    .filter(isEligibleTc)
    .map((c) => {
      const rating = mapRatingFromHighlights(c.highlights);
      if (!rating || rating.count == null) return null;
      return { center: c, rating: rating.value, ratingLabel: rating.label, ratingCount: rating.count };
    })
    .filter((r): r is RankedCenter => r !== null && r.rating >= threshold && r.ratingCount >= minCount)
    .sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
}

export function buildTcExcluded(
  centers: BusinessCenter[],
  threshold: number = RATING_THRESHOLD,
  minCount: number = MIN_RATING_COUNT,
): ExcludedCenter[] {
  return centers
    .filter((c) => c.status !== 'under_construction')
    .map((center) => {
      if (isOutsideMinsk(center)) return { center, reason: 'не в черте Минска' };
      const rating = mapRatingFromHighlights(center.highlights);
      if (!rating) return { center, reason: 'рейтинг на Яндекс.Картах не распознан' };
      if (rating.value < threshold)
        return { center, reason: `рейтинг ${rating.label} из 5, ниже порога ${threshold.toLocaleString('ru-RU')}` };
      if (rating.count == null) return { center, reason: 'в карточке карт не указано число оценок' };
      if (rating.count < minCount)
        return { center, reason: `${rating.count} ${ratingsWord(rating.count)}, меньше порога ${minCount}` };
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
