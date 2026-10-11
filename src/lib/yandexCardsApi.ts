// Рейтинг собственной карточки здания на Яндекс.Картах
// (business_center_yandex_cards). У ТЦ его нет в highlights списка — туда
// пишут факты ресёрча, а звёзды и число оценок лежат в этой таблице
// (scripts/capture-yandex-reviews.mjs). Публичная страница рейтинга ТЦ
// читает отсюда (или из /data/tc-ratings.json сборки).
import { supabase } from './supabase';
import { withRetry } from './withRetry';

export interface YandexCardRating {
  slug: string;
  rating: number;
  ratingCount: number;
}

export type YandexCardRatingIndex = Map<string, YandexCardRating>;

function indexFromRows(rows: { business_center_slug: string; rating: number | null; rating_count: number | null }[]): YandexCardRatingIndex {
  const map: YandexCardRatingIndex = new Map();
  for (const row of rows) {
    if (typeof row.business_center_slug !== 'string') continue;
    if (row.rating == null || row.rating_count == null) continue;
    if (!Number.isFinite(row.rating) || !Number.isFinite(row.rating_count) || row.rating_count <= 0) continue;
    map.set(row.business_center_slug, {
      slug: row.business_center_slug,
      rating: row.rating,
      ratingCount: row.rating_count,
    });
  }
  return map;
}

/** Файл сборки — без похода в базу на пререндере и на CDN. */
export async function loadTcRatingsFromBuild(): Promise<YandexCardRatingIndex | null> {
  try {
    const res = await fetch('/data/tc-ratings.json');
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const data = (await res.json()) as { rows?: { business_center_slug: string; rating: number | null; rating_count: number | null }[] };
    if (!Array.isArray(data.rows) || data.rows.length === 0) return null;
    return indexFromRows(data.rows);
  } catch {
    return null;
  }
}

/** Постранично: PostgREST молча режет выборки >1000. */
export async function fetchYandexCardRatings(): Promise<YandexCardRatingIndex> {
  return withRetry(async () => {
    const pageSize = 1000;
    const rows: { business_center_slug: string; rating: number | null; rating_count: number | null }[] = [];
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('business_center_yandex_cards')
        .select('business_center_slug,rating,rating_count')
        .not('rating', 'is', null)
        .order('business_center_slug', { ascending: true })
        .range(from, to);
      if (error) throw error;
      const chunk = data ?? [];
      rows.push(...chunk);
      if (chunk.length < pageSize) break;
    }
    return indexFromRows(rows);
  });
}

/** Сборка, иначе база. Пустой индекс — страница честно скажет «пока никого». */
export async function loadYandexCardRatings(): Promise<YandexCardRatingIndex> {
  const fromBuild = await loadTcRatingsFromBuild();
  if (fromBuild && fromBuild.size > 0) return fromBuild;
  return fetchYandexCardRatings();
}
