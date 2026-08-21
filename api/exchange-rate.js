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

const RATES_URL = 'https://bnb.by/kursy-valyut/nbrb/';
const FETCH_TIMEOUT_MS = 10000;

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
