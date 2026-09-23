import type { BusinessCenter } from '../data/businessCenters';
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
import { mapRatingFromHighlights, shortName } from './businessCenterDisplay';

export const RATING_THRESHOLD = 4.5;
export const RATING_THRESHOLD_LABEL = '4,5';
export const MIN_RATING_COUNT = 50;

export interface RankedCenter {
  center: BusinessCenter;
  rating: number;
  ratingLabel: string;
  ratingCount: number;
}

// Здания вне городской черты. Проверяется по адресу и району, а не по
// координатам: границы города в базе не лежат, а адрес у всех 141 карточки
// заполнен и у минских начинается с «г. Минск». На 2026-09-22 под правило
// попадают три карточки каталога — «Аден» (индустриальный парк «Великий
// камень», Смолевичский район), плюс два объекта с адресом в Минской
// области и Минском районе.
export function isOutsideMinsk(center: BusinessCenter): boolean {
  const haystack = `${center.address} ${center.district ?? ''}`;
  return /Минская область|Минский район|Смолевичск|Великий камень/i.test(haystack);
}

export interface ExcludedCenter {
  center: BusinessCenter;
  reason: string;
}

// Здание выбранного класса сдано, но в рейтинг не попало — с проверяемой причиной. Нужен для
// FAQ: блок «кто не попал» владелец со страницы убрал (2026-09-22), но сам
// вопрос остался, и отвечать на него надо фактами из базы, а не текстом,
// который разъедется с данными.
export function buildExcludedForClasses(
  centers: BusinessCenter[],
  classes: NonNullable<BusinessCenter['businessClass']>[],
  threshold: number = RATING_THRESHOLD,
  minCount: number = MIN_RATING_COUNT,
): ExcludedCenter[] {
  return centers
    .filter((c) => c.businessClass != null && classes.includes(c.businessClass) && c.status !== 'under_construction')
    .map((center) => {
      if (isOutsideMinsk(center)) return { center, reason: 'не в черте Минска' };
      const rating = mapRatingFromHighlights(center.highlights);
      if (!rating) return { center, reason: 'рейтинг на Яндекс.Картах не распознан' };
      if (rating.value < threshold)
        return { center, reason: `рейтинг ${rating.label} из 5, ниже порога ${threshold.toLocaleString('ru-RU')}` };
      if (rating.count == null) return { center, reason: 'в карточке карт не указано число оценок' };
      if (rating.count < minCount) return { center, reason: `${rating.count} ${ratingsWord(rating.count)}, меньше порога ${minCount}` };
      return null;
    })
    .filter((e): e is ExcludedCenter => e !== null);
}

// Общая методика рейтингов: оценки Яндекс.Карт из highlights, не gisRating.
export function buildRankingForClasses(
  centers: BusinessCenter[],
  classes: NonNullable<BusinessCenter['businessClass']>[],
  threshold: number = RATING_THRESHOLD,
  minCount: number = MIN_RATING_COUNT,
): RankedCenter[] {
  return centers
    .filter((c) => c.businessClass != null && classes.includes(c.businessClass) && c.status !== 'under_construction' && !isOutsideMinsk(c))
    .map((c) => {
      const rating = mapRatingFromHighlights(c.highlights);
      if (!rating || rating.count == null) return null;
      return { center: c, rating: rating.value, ratingLabel: rating.label, ratingCount: rating.count };
    })
    .filter((r): r is RankedCenter => r !== null && r.rating >= threshold && r.ratingCount >= minCount)
    .sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
}

const nf = new Intl.NumberFormat('ru-RU');

// «161 оценка», «17 493 оценки», «445 оценок» — число оценок стоит в каждой
// строке рейтинга и в FAQ, и «17 493 оценок» бросается в глаза сразу.
export function ratingsWord(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'оценок';
  if (mod10 === 1) return 'оценка';
  if (mod10 >= 2 && mod10 <= 4) return 'оценки';
  return 'оценок';
}

export function ratingsCount(n: number): string {
  return `${nf.format(n)} ${ratingsWord(n)}`;
}

// Медиана приходит из базы как есть (21.14) — без форматирования в тексте
// FAQ получалось «$21.14/м²» с точкой рядом с «$13/м²» в строках.
export function money(value: number): string {
  return `$${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}/м²`;
}

// Для класса A исключений обычно 1-2 — их можно назвать поимённо в FAQ.
// У B/B+/C исключений порой несколько десятков (например, класс B — 29 из
// 60), и поимённый список превращает ответ в стену текста; сверх 5 штук
// сворачиваем в разбивку по причине, без имён зданий.
export function summarizeExclusions(excluded: ExcludedCenter[]): string {
  if (excluded.length === 0) return '';
  if (excluded.length <= 5) {
    return ` Не попали: ${excluded.map((e) => `«${shortName(e.center)}» — ${e.reason}`).join('; ')}.`;
  }
  const buckets = new Map<string, number>();
  for (const e of excluded) {
    let bucket: string;
    if (e.reason === 'не в черте Минска') bucket = 'не в черте Минска';
    else if (e.reason === 'рейтинг на Яндекс.Картах не распознан') bucket = 'рейтинг на картах не распознан';
    else if (e.reason.startsWith('рейтинг') && e.reason.includes('ниже порога')) bucket = 'рейтинг ниже порога';
    else if (e.reason === 'в карточке карт не указано число оценок') bucket = 'не указано число оценок';
    else if (e.reason.includes('меньше порога')) bucket = 'оценок меньше порога';
    else bucket = 'другое';
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const parts = [...buckets.entries()].map(([reason, count]) => `${count} — ${reason}`);
  return ` Не попали ${excluded.length}: ${parts.join(', ')}.`;
}

// Медиана ставки по зданию — из тех же месячных снимков рынка
// (market_snapshots, slice_type='building'), что показывает каталог: считать
// её здесь заново по business_center_offers значило бы показать на двух
// страницах два разных числа по одному зданию. Выборка по одному зданию
// почти всегда мала, поэтому рядом всегда стоит, по скольким объявлениям
// посчитано, а ниже порога надёжности (MIN_RELIABLE_N) число помечается как
// ориентировочное — тот же приём, что на страницах аналитики.
export function rentLabel(snapshot: MarketSnapshot | undefined): { label: string; value: string } | null {
  if (!snapshot || snapshot.median == null) return null;
  const reliable = snapshot.n >= MIN_RELIABLE_N;
  return {
    label: reliable ? `Аренда · ${snapshot.n} объявл.` : `Аренда · ориент., ${snapshot.n} объявл.`,
    value: money(snapshot.median),
  };
}
