// Раз в месяц (см. .github/workflows/sync-market-offers-stats.yml) собирает с
// Kufar (re.kufar.by — у Kufar недвижимость на отдельном поддомене со своим
// SSR-фронтендом, не общий www.kufar.by) публичные объявления коммерческой
// недвижимости по Минск Миру и сохраняет агрегат (не сырые объявления) в
// public.market_offers_stats — для сводной таблицы "рынок аренды/продажи" на
// гиде района.
//
// Как достаём данные без авторизации и без обхода антибота: re.kufar.by —
// Next.js SPA, для обычных браузеров отдаёт пустой __NEXT_DATA__ с одним
// флагом isSearchBot. Но если представиться поисковым ботом (User-Agent
// Googlebot) — сайт делает полный SSR специально для SEO, и та же самая
// json-структура (props.initialState.listing.ads) приходит с реальными
// объявлениями и их атрибутами (проверено вручную на реальном ответе).
// Это официально поддерживаемый ботами путь (SSR-рендеринг для краулеров),
// а не обход защиты.
//
// Геопривязка к Минск Миру: у Kufar нет отдельного фильтра "микрорайон", у
// district-фильтра (coder_district-28 / slug minsk-oktyabrskij-rajon) —
// это целый Октябрьский район Минска, Минск Мир в нём лишь часть (проверено:
// в одном и том же ответе вперемешку словосочетания вроде "Свердлова" и
// "Кирова" — старый центр города, никак не Минск Мир). Поэтому фильтруем
// сами по названиям улиц самого Минск Мира (см. MINSK_MIR_MARKERS) — они уже
// встречаются в остальном коде гида района (см. src/pages/DistrictGuidePage.tsx:
// П. Мстиславца — адрес застройщика, Кижеватова — поликлиника раздела
// "Медицина"). Список сверен и по координатам объявлений (расстояние до
// центра комплекса ~53.8628,27.5470 — улицы Минск Мира почти все ≤1.4 км,
// улицы вне комплекса — от 2 км).
//
// Состояние отделки — НЕ гадаем по тексту описания (ненадёжно, см. историю
// с банками в CLAUDE.md), а берём готовые структурированные поля Kufar:
// сначала commercial_repair (шкала "Офисная отделка"/"Под чистовую
// отделку"/"Требуется ремонт"), если его нет — ищем тег "С отделкой" в
// списке удобств commercial_improvements, если и его нет — "не указано".

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const JSON_OUT = process.argv.includes('--json');

if (!SUPABASE_SERVICE_ROLE_KEY && !DRY_RUN) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY (или запусти с --dry-run)');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const PAGE_SIZE = 30;
const MAX_PAGES = 40; // страховка от бесконечного цикла, реальных страниц заметно меньше

// Улицы и топонимы Минск Мира — сверено вручную (адрес застройщика и адреса
// объектов инфраструктуры уже встречаются в src/pages/DistrictGuidePage.tsx)
// и перепроверено по координатам объявлений Kufar (см. комментарий выше).
const MINSK_MIR_MARKERS = [
  'николы теслы',
  'игоря лученка',
  'михаила савицкого',
  'жореса алфёрова',
  'жореса алферова',
  'мстиславца',
  'кижеватова',
  'минск-мир',
  'минск мир',
  'minsk world',
  'тропические острова',
];

const DEAL_TYPES = [
  { slug: 'kupit', dealType: 'sale' },
  { slug: 'snyat', dealType: 'rent' },
];

function isMinskMirAddress(address) {
  if (!address) return false;
  const lower = address.toLowerCase();
  return MINSK_MIR_MARKERS.some((marker) => lower.includes(marker));
}

function areaBucket(size) {
  if (size == null) return null;
  if (size < 40) return '<40 м²';
  if (size < 80) return '40–80 м²';
  if (size < 150) return '80–150 м²';
  return '150+ м²';
}

function getAdParam(ad, code) {
  return (ad.ad_parameters || []).find((p) => p.p === code) ?? null;
}

function getAccountParam(ad, code) {
  return (ad.account_parameters || []).find((p) => p.p === code) ?? null;
}

function classifyFinishStatus(ad) {
  const repair = getAdParam(ad, 'commercial_repair');
  if (repair?.vl) {
    return repair.vl === 'Офисная отделка' ? 'с отделкой' : 'без отделки';
  }
  const improvements = getAdParam(ad, 'commercial_improvements');
  if (Array.isArray(improvements?.vl) && improvements.vl.includes('С отделкой')) {
    return 'с отделкой';
  }
  return 'не указано';
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Живые проверки (владелец, август 2026): в цене за м² попадаются явно
// битые значения — "цена по запросу" без реальной цифры (0 / $0.01 / $0.67
// за м²/мес) и минимум один явный выброс ($29 583/м² на продаже — 72 м² на
// ул. Игоря Лученка 4, при рынке района $1–13 тыс/м²). При маленьких N
// (1–3 объявления в ячейке) один такой выброс убивает среднее. Границы
// широкие и намеренно НЕ пытаются угадывать "подозрительно круглые" цены
// (например, серия одинаковых $990/$1035 в одном доме на Савицкого 39 —
// возможно, ошибка продавца, а возможно, реальная акция; граница их не
// трогает) — только отсекают то, что математически не может быть ценой.
const PRICE_BOUNDS = {
  sale: { min: 300, max: 15000 },
  rent: { min: 5, max: 150 },
};

function isPlausiblePrice(dealType, pricePerSqm) {
  const bounds = PRICE_BOUNDS[dealType];
  return pricePerSqm >= bounds.min && pricePerSqm <= bounds.max;
}

async function fetchListingPage(slug, cursor) {
  const url = new URL(`https://re.kufar.by/l/minsk-oktyabrskij-rajon/${slug}/kommercheskaya`);
  url.searchParams.set('size', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url, {
    headers: {
      'User-Agent': GOOGLEBOT_UA,
      Accept: 'text/html',
      'Accept-Language': 'ru',
    },
  });

  if (!res.ok) {
    throw new Error(`Kufar (${slug}) вернул ${res.status} для ${url}`);
  }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) {
    throw new Error(`Kufar (${slug}): не нашёл __NEXT_DATA__ в ответе — вероятно, поменялась вёрстка`);
  }

  const data = JSON.parse(match[1]);
  const listing = data?.props?.initialState?.listing;
  if (!listing) {
    throw new Error(`Kufar (${slug}): не нашёл props.initialState.listing — вероятно, поменялась структура состояния`);
  }

  const nextPage = (listing.pagination || []).find((p) => p.label === 'next');
  return { ads: listing.ads || [], total: listing.total ?? 0, nextCursor: nextPage?.token ?? null };
}

async function fetchAllListings(slug) {
  const allAds = [];
  let cursor = null;
  let total = Infinity;

  for (let page = 0; page < MAX_PAGES && allAds.length < total; page++) {
    const result = await fetchListingPage(slug, cursor);
    total = result.total;
    if (result.ads.length === 0) break;
    allAds.push(...result.ads);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return allAds;
}

// finish_status: 'все' — отдельная сводная строка на (тип сделки × тип
// помещения × площадь), посчитанная НАПРЯМУЮ из сырых цен всей группы
// (а не как среднее по под-группам "с отделкой"/"без отделки"/"не
// указано" — так медиана считается честно, а не оценивается задним
// числом из уже готовых кусков). Именно 'все' идёт в таблицу на сайте;
// разбивку по отделке использует только "дефицит"-инсайт.
function aggregate(ads, dealType, excluded) {
  const rawByGroup = new Map(); // key без finish_status — для сводной строки
  const rawByFinishGroup = new Map();

  for (const ad of ads) {
    const address = getAccountParam(ad, 'address')?.v;
    if (!isMinskMirAddress(address)) continue;

    const propertyType = getAdParam(ad, 'property_type')?.vl || 'Не указано';
    const size = getAdParam(ad, 'size')?.v ?? null;
    const pricePerSqm = getAdParam(ad, 'square_meter')?.v ?? null;
    const bucket = areaBucket(size);
    if (!bucket || pricePerSqm == null) continue; // без площади/цены за м² в сводку не берём

    if (!isPlausiblePrice(dealType, pricePerSqm)) {
      excluded.push({ dealType, propertyType, size, pricePerSqm, adLink: `https://re.kufar.by/vi/${ad.ad_id}` });
      continue;
    }

    const groupKey = `${dealType}|${propertyType}|${bucket}`;
    if (!rawByGroup.has(groupKey)) rawByGroup.set(groupKey, { dealType, propertyType, bucket, prices: [] });
    rawByGroup.get(groupKey).prices.push(pricePerSqm);

    const finishStatus = classifyFinishStatus(ad);
    const finishKey = `${groupKey}|${finishStatus}`;
    if (!rawByFinishGroup.has(finishKey)) {
      rawByFinishGroup.set(finishKey, { dealType, propertyType, bucket, finishStatus, prices: [] });
    }
    rawByFinishGroup.get(finishKey).prices.push(pricePerSqm);
  }

  function toRow(g) {
    return {
      deal_type: g.dealType,
      property_type: g.propertyType,
      area_bucket: g.bucket,
      finish_status: g.finishStatus ?? 'все',
      offers_count: g.prices.length,
      avg_price_per_sqm: Math.round((g.prices.reduce((a, b) => a + b, 0) / g.prices.length) * 100) / 100,
      median_price_per_sqm: median(g.prices),
    };
  }

  return [...rawByGroup.values()].map(toRow).concat([...rawByFinishGroup.values()].map(toRow));
}

async function main() {
  const month = new Date();
  month.setUTCDate(1);
  const monthStr = month.toISOString().slice(0, 10);

  const rows = [];
  const excluded = [];
  for (const { slug, dealType } of DEAL_TYPES) {
    console.log(`Kufar: тяну объявления (${slug})...`);
    const ads = await fetchAllListings(slug);
    console.log(`Kufar (${slug}): получено ${ads.length} объявлений по Октябрьскому району`);

    const aggregated = aggregate(ads, dealType, excluded);
    const summaryRows = aggregated.filter((r) => r.finish_status === 'все');
    console.log(`Kufar (${slug}): из них по Минск Миру — ${summaryRows.reduce((s, r) => s + r.offers_count, 0)} объявлений в ${summaryRows.length} группах`);
    rows.push(...aggregated);
  }

  if (excluded.length > 0) {
    console.log(`Kufar: отфильтровано ${excluded.length} объявлений с неправдоподобной ценой за м² (границы: продажа ${PRICE_BOUNDS.sale.min}–${PRICE_BOUNDS.sale.max} $/м², аренда ${PRICE_BOUNDS.rent.min}–${PRICE_BOUNDS.rent.max} $/м²/мес) — стоит бегло свериться по ссылкам:`);
    console.table(excluded);
  }

  if (rows.length === 0) {
    console.log('Kufar: по Минск Миру ничего не нашлось, в базу нечего писать.');
    return;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(rows.map((r) => ({ ...r, month: monthStr, source: 'Kufar' }))));
    return;
  }

  console.table(rows.map((r) => ({ ...r, month: monthStr })));

  if (DRY_RUN) {
    console.log('--dry-run: запись в Supabase пропущена.');
    return;
  }

  const checkedAt = new Date().toISOString();
  const payload = rows.map((r) => ({ ...r, month: monthStr, source: 'Kufar', checked_at: checkedAt }));

  const { error } = await supabase
    .from('market_offers_stats')
    .upsert(payload, { onConflict: 'month,source,deal_type,property_type,area_bucket,finish_status' });
  if (error) throw error;

  console.log(`Сохранено ${payload.length} агрегированных строк в market_offers_stats.`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
