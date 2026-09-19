// Импорт отзывов БЦ с Яндекс.Карт, разобранных в браузере из .webarchive/
// .html (см. src/lib/businessCenterSnapshotParser.ts, extractReviewsFromHtml)
// при сохранении формы в BusinessCentersAdminTab.tsx. Таблица
// business_center_review_snapshots закрыта RLS от анонимной записи (anon —
// только select, см. миграции 20260919-bc-yandex-review-snapshots.sql и
// 20260920-bc-reviews-anon-revoke.sql) — пишем сервисным ключом, чтобы
// со стороны анонимного посетителя нельзя было подсунуть поддельный отзыв
// напрямую в Supabase REST.
//
// Владелец, 2026-09-20: у Светланы уже есть рабочий процесс — открывает
// карточку БЦ в админке, прикладывает сохранённые веб-архивы. Отзывы — тот
// же файл, что и список организаций (вкладка «Отзывы» той же организации на
// Яндекс.Картах), поэтому отдельной формы загрузки не заводим: разбор в
// браузере уже пытается извлечь и то, и другое из каждого приложенного
// файла, сюда долетают только строки, которые реально нашлись.

const MAX_REVIEWS_PER_REQUEST = 500;

async function supabaseRequest(path, options = {}) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase ${path}: ${text}`);
  }
  return resp.status === 204 ? null : resp.json();
}

function validateReview(row) {
  if (typeof row?.body !== 'string' || !row.body.trim()) return null;
  if (typeof row?.publishedAt !== 'string' || Number.isNaN(Date.parse(row.publishedAt))) return null;
  const rating = row.rating == null ? null : Number(row.rating);
  if (rating != null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) return null;
  const likes = Number(row.likes ?? 0);
  const dislikes = Number(row.dislikes ?? 0);
  if (!Number.isFinite(likes) || likes < 0 || !Number.isFinite(dislikes) || dislikes < 0) return null;
  return {
    author: typeof row.author === 'string' && row.author.trim() ? row.author.trim().slice(0, 200) : null,
    rating,
    body: row.body.trim().slice(0, 5000),
    likes: Math.round(likes),
    dislikes: Math.round(dislikes),
    published_at: row.publishedAt,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { slug, reviews } = req.body ?? {};
  if (typeof slug !== 'string' || !slug.trim()) {
    res.status(400).json({ error: 'Не указан slug бизнес-центра' });
    return;
  }
  if (!Array.isArray(reviews) || reviews.length === 0) {
    res.status(400).json({ error: 'Пустой список отзывов' });
    return;
  }
  if (reviews.length > MAX_REVIEWS_PER_REQUEST) {
    res.status(400).json({ error: `Слишком много отзывов за один раз (${reviews.length}) — максимум ${MAX_REVIEWS_PER_REQUEST}` });
    return;
  }

  const rows = reviews
    .map(validateReview)
    .filter((r) => r !== null)
    .map((r) => ({ ...r, business_center_slug: slug, source: 'yandex_maps' }));

  if (rows.length === 0) {
    res.status(400).json({ error: 'Ни один отзыв не прошёл проверку формата' });
    return;
  }

  try {
    await supabaseRequest('business_center_review_snapshots?on_conflict=business_center_slug,author,published_at', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    res.status(200).json({ saved: rows.length, skipped: reviews.length - rows.length });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Не удалось сохранить отзывы' });
  }
}
