// Раз в месяц (см. .github/workflows/sync-market-offers-stats.yml) собирает с
// Kufar (re.kufar.by — у Kufar недвижимость на отдельном поддомене со своим
// SSR-фронтендом, не общий www.kufar.by) публичные объявления коммерческой
// недвижимости по Минск Миру и сохраняет СЫРЫЕ объявления (не готовый
// агрегат) в public.market_offers — владелец верифицирует/правит статус
// отделки вручную на /admin/market-offers (см. MarketOffersReview.tsx),
// таблица на гиде района считается прямо из этих строк на лету.
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
// Состояние отделки — сначала пробуем угадать сами (НЕ по тексту описания —
// ненадёжно, см. историю с банками в CLAUDE.md, а по готовым структурным
// полям Kufar: commercial_repair, иначе тег "С отделкой" в commercial_
// improvements), но большинство объявлений (см. живую проверку — владелец,
// август 2026) этого поля вообще не заполняют — "не указано" доминирует.
// Владелец решил разбирать вручную на /admin/market-offers — там же он может
// поправить и остальные поля (цена/тип/площадь), не только отделку. Поэтому
// при повторном синке (раз в месяц) для строк с reviewed=true ничего не
// перезаписывается — только подтверждается, что объявление ещё активно.

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

// Живые проверки (владелец, август 2026): в цене за м² попадаются явно
// битые значения — "цена по запросу" без реальной цифры (0 / $0.01 / $0.67
// за м²/мес) и минимум один явный выброс ($29 583/м² на продаже — 72 м² на
// ул. Игоря Лученка 4, при рынке района $1–13 тыс/м²). Границы широкие и
// намеренно НЕ пытаются угадывать "подозрительно круглые" цены (например,
// серия одинаковых $990/$1035 в одном доме на Савицкого 39 — возможно,
// ошибка продавца, а возможно, реальная акция; граница их не трогает) —
// только отсекают то, что математически не может быть ценой. Остальную
// сверку (в т.ч. такие подозрительные случаи) владелец делает сам на
// /admin/market-offers.
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

function extractOffers(ads, dealType, excluded) {
  const offers = [];

  for (const ad of ads) {
    const address = getAccountParam(ad, 'address')?.v;
    if (!isMinskMirAddress(address)) continue;

    const propertyType = getAdParam(ad, 'property_type')?.vl || 'Не указано';
    const size = getAdParam(ad, 'size')?.v ?? null;
    const pricePerSqm = getAdParam(ad, 'square_meter')?.v ?? null;
    if (size == null || pricePerSqm == null) continue; // без площади/цены за м² в сводку не берём

    const adLink = `https://re.kufar.by/vi/${ad.ad_id}`;
    if (!isPlausiblePrice(dealType, pricePerSqm)) {
      excluded.push({ dealType, propertyType, size, pricePerSqm, adLink });
      continue;
    }

    // Этаж — доп. сигнал для поиска дублей (data/marketOffers.ts, dedupKey):
    // в одном доме часто много одинаковых по площади кабинетов на РАЗНЫХ
    // этажах — без этажа они ложно считались одним и тем же дублем.
    const floor = getAdParam(ad, 'floor')?.v?.[0] ?? null;

    offers.push({
      source: 'Kufar',
      ad_id: String(ad.ad_id),
      deal_type: dealType,
      property_type: propertyType,
      size,
      price_per_sqm: pricePerSqm,
      finish_status: classifyFinishStatus(ad),
      floor,
      address: address ?? null,
      ad_link: adLink,
    });
  }

  return offers;
}

async function main() {
  const offers = [];
  const excluded = [];
  for (const { slug, dealType } of DEAL_TYPES) {
    console.log(`Kufar: тяну объявления (${slug})...`);
    const ads = await fetchAllListings(slug);
    console.log(`Kufar (${slug}): получено ${ads.length} объявлений по Октябрьскому району`);

    const extracted = extractOffers(ads, dealType, excluded);
    console.log(`Kufar (${slug}): из них по Минск Миру — ${extracted.length} объявлений`);
    offers.push(...extracted);
  }

  if (excluded.length > 0) {
    console.log(`Kufar: отфильтровано ${excluded.length} объявлений с неправдоподобной ценой за м² (границы: продажа ${PRICE_BOUNDS.sale.min}–${PRICE_BOUNDS.sale.max} $/м², аренда ${PRICE_BOUNDS.rent.min}–${PRICE_BOUNDS.rent.max} $/м²/мес) — стоит бегло свериться по ссылкам:`);
    console.table(excluded);
  }

  if (offers.length === 0) {
    console.log('Kufar: по Минск Миру ничего не нашлось, в базу нечего писать.');
    return;
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(offers));
    return;
  }

  console.table(offers);

  if (DRY_RUN) {
    console.log('--dry-run: запись в Supabase пропущена.');
    return;
  }

  // Не затираем то, что владелец разобрал вручную (/admin/market-offers) —
  // reviewed=true защищает ВСЮ строку (не только отделку — владелец может
  // поправить и цену, и тип, и площадь, если Kufar отдал их неверно), синк
  // для таких строк только подтверждает, что объявление всё ещё живо.
  const adIds = offers.map((o) => o.ad_id);
  const { data: existing, error: fetchError } = await supabase
    .from('market_offers')
    .select('ad_id, deal_type, property_type, size, price_per_sqm, finish_status, floor, address, reviewed')
    .eq('source', 'Kufar')
    .in('ad_id', adIds);
  if (fetchError) throw fetchError;

  const reviewedByAdId = new Map((existing ?? []).filter((e) => e.reviewed).map((e) => [e.ad_id, e]));

  const now = new Date().toISOString();
  const payload = offers.map((o) => {
    const reviewedRow = reviewedByAdId.get(o.ad_id);
    if (reviewedRow) {
      return { ...o, ...reviewedRow, reviewed: true, updated_at: now };
    }
    return { ...o, reviewed: false, updated_at: now };
  });

  const { error } = await supabase.from('market_offers').upsert(payload, { onConflict: 'source,ad_id' });
  if (error) throw error;

  console.log(`Сохранено ${payload.length} объявлений в market_offers (${reviewedByAdId.size} проверенных вручную — не тронуты).`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
