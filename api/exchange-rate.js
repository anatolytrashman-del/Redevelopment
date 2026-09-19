// Vercel serverless function: курс USD/EUR/RUB к BYN на сегодня, источник —
// вкладка "Курсы НБ РБ" на bnb.by (сайт БНБ-Банка), которая просто
// показывает официальный курс Нацбанка. У bnb.by нет архива по датам —
// страница всегда отдаёт "Курс на <сегодня>", поэтому курс транзакции
// фиксируется на дату сохранения записи, а не на дату самой транзакции
// (см. Transactions.tsx: rate_date проставляется только при создании).
//
// Кэш в таблице exchange_rates (по одной строке на календарный день, когда
// кто-то реально сохранял транзакцию — не полная ежедневная история):
// сначала проверяем, есть ли уже строка на сегодня, и только если нет —
// идём на bnb.by. Таблица закрыта RLS от анонимной записи (см. миграцию) —
// пишем сервисным ключом, чтобы никто не мог подсунуть поддельный курс
// через публичный anon-ключ.
//
// ВТОРАЯ РОЛЬ ЭТОГО ФАЙЛА (2026-09-20) — импорт отзывов БЦ из
// BusinessCentersAdminTab.tsx. Отдельного api/import-business-center-
// reviews.js быть не может: в api/ ровно 12 функций, потолок Vercel
// Hobby, тринадцатая роняет весь деплой (см. тот же приём и тот же
// комментарий в api/telegram-avatar.js, 2026-09-16 — тут копия того же
// решения). Разведены по методу запроса:
//   GET  /api/exchange-rate                    — курс валют (как раньше)
//   POST /api/import-business-center-reviews   — импорт отзывов (rewrite
//                                                 в vercel.json на этот файл)
// Общего у них только соседство в одном файле — не смешивать логику,
// импорт отзывов живёт в отдельной функции ниже и не трогает курсы.

const RATES_URL = 'https://bnb.by/kursy-valyut/nbrb/';
const FETCH_TIMEOUT_MS = 10000;
const MAX_REVIEWS_PER_REQUEST = 500;

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  return resp.json();
}

async function fetchCachedRate(date) {
  const rows = await supabaseRequest(`exchange_rates?date=eq.${date}&select=*`);
  return rows[0] ?? null;
}

// Строки таблицы на странице: "<td> USD</td><td>2.9829</td>", у RUB/CNY/PLN/
// GEL курс дан на кратность (100 RUB, 10 CNY...), а не на единицу — делим на
// множитель, чтобы получить курс за 1 единицу валюты.
function parseRatesHtml(html) {
  const rows = html.matchAll(/<td>\s*(\d+\s+)?([A-Z]{3})\s*<\/td>\s*<td>\s*([\d.]+)\s*<\/td>/g);
  const byCurrency = {};
  for (const match of rows) {
    const multiplier = match[1] ? Number(match[1].trim()) : 1;
    const code = match[2];
    const rate = Number(match[3]);
    if (Number.isFinite(rate) && multiplier > 0) byCurrency[code] = rate / multiplier;
  }
  if (!byCurrency.USD || !byCurrency.EUR || !byCurrency.RUB) {
    throw new Error('Не удалось найти USD/EUR/RUB в таблице курсов bnb.by — вёрстка страницы могла измениться');
  }
  return { usdByn: byCurrency.USD, eurByn: byCurrency.EUR, rubByn: byCurrency.RUB };
}

async function fetchRateFromBnb() {
  const resp = await fetchWithTimeout(RATES_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) throw new Error(`bnb.by вернул ${resp.status}`);
  const html = await resp.text();
  return parseRatesHtml(html);
}

// --- Импорт отзывов БЦ (см. комментарий у ВТОРОЙ РОЛИ ЭТОГО ФАЙЛА выше) ---
// Разбор в браузере — src/lib/businessCenterSnapshotParser.ts,
// extractReviewsFromHtml, вызывается из BusinessCentersAdminTab.tsx при
// сохранении формы. Таблица business_center_review_snapshots закрыта RLS от
// анонимной записи — пишем сервисным ключом тем же supabaseRequest, что и
// курсы валют выше.

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

async function handleImportReviews(req, res) {
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

// --- Курс валют (исходная роль файла) -------------------------------------

async function handleExchangeRate(req, res) {
  const date = todayIsoDate();

  try {
    const cached = await fetchCachedRate(date);
    if (cached) {
      res.status(200).json({ date, usdByn: Number(cached.usd_byn), eurByn: Number(cached.eur_byn), rubByn: Number(cached.rub_byn) });
      return;
    }

    const rates = await fetchRateFromBnb();
    const [saved] = await supabaseRequest('exchange_rates', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ date, usd_byn: rates.usdByn, eur_byn: rates.eurByn, rub_byn: rates.rubByn }),
    });

    res.status(200).json({ date, usdByn: Number(saved.usd_byn), eurByn: Number(saved.eur_byn), rubByn: Number(saved.rub_byn) });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Не удалось получить курс' });
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    await handleImportReviews(req, res);
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  await handleExchangeRate(req, res);
}
