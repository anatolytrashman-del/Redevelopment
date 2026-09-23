import type { BusinessCenterReview, BusinessCenterReviewRow } from '../data/businessCenterReviews';
import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { loadBcExtra } from './buildData';

function fromRow(row: BusinessCenterReviewRow): BusinessCenterReview {
  return {
    id: row.id,
    businessCenterSlug: row.business_center_slug,
    source: row.source,
    author: row.author,
    rating: row.rating,
    body: row.body,
    likes: row.likes,
    dislikes: row.dislikes,
    publishedAt: row.published_at,
  };
}

// Сортировка по нетто-голосам (лайки минус дизлайки) — вычисляемое
// выражение, PostgREST .order() по нему напрямую не умеет, поэтому берём
// весь (небольшой, обычно < 200 строк на здание) список и сортируем на
// клиенте — дешевле, чем заводить под это отдельную vIew/RPC.
export async function fetchBusinessCenterReviews(slug: string): Promise<BusinessCenterReview[]> {
  // Файл .extra здания из сборки (src/lib/buildData.ts); в базу — только
  // если его нет. Порядок наводится здесь, а не в выборке, — для обоих
  // источников одинаково.
  const fromBuild = (await loadBcExtra(slug))?.reviews as BusinessCenterReviewRow[] | undefined;
  const rows =
    fromBuild ??
    (await withRetry(async () => {
      const { data, error } = await supabase
        .from('business_center_review_snapshots')
        .select('*')
        .eq('business_center_slug', slug);
      if (error) throw error;
      return data as BusinessCenterReviewRow[];
    }));
  return rows.map(fromRow).sort((a, b) => b.likes - b.dislikes - (a.likes - a.dislikes));
}
