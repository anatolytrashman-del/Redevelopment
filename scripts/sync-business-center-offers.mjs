// Собирает с Kufar и Realt.by публичные объявления о продаже/аренде
// помещений ВНУТРИ конкретных бизнес-центров из справочника business_centers
// (владелец, 2026-09-05: "хочу спарсить объявления о продаже и аренде
// помещений в этих бизнес-центрах... эту инфу мы будем выводить в полной
// карточке") и сохраняет их в public.business_center_offers — по одной
// строке на объявление, привязанной к business_center_slug.
//
// В отличие от scripts/sync-kufar-market-offers.mjs / sync-realt-market-
// offers.mjs (те собирают ВЕСЬ рынок одного района — Минск Мир — для
// сводной таблицы гида района), здесь нужна точная привязка к КОНКРЕТНОМУ
// зданию по всему городу, поэтому источники данных получены по-разному:
//
// Kufar — есть полнотекстовый поиск по всему Минску (?query=...),
// проверено вживую: запрос "Клары Цеткин 24" вернул ровно объявления по
// этому адресу, ни одного постороннего. Поэтому по каждому БЦ — один
// точечный запрос "<улица> <дом>" (не название БЦ — многие называются
// обычными словами вроде "Порт"/"Волна"/"Титан", свободный поиск по имени
// ловил бы много лишнего; адрес — однозначный).
//
// Realt — отдельного поиска по ключевым словам не нашёл (несколько часов
// проб URL/API не дали результата, есть внутренний /api/objects/search,
// но обязательные параметры не разгаданы) — используем то же, что и
// district-скрипт: обзор по разделу/типу сделки, только не по одному
// микрорайону (у Realt нет микрорайона на каждый из 27 адресов), а по
// АДМИНИСТРАТИВНОМУ РАЙОНУ (slug вроде "centralnyj-rajon" — проверены
// вживую все 8 районов, что реально встречаются у наших БЦ; транслитерация
// не ГОСТ и не Википедия, а собственная схема Realt — угадана и
// перепроверена curl'ом, не выдумана). Дальше результаты фильтруются по
// адресу так же, как Kufar-скрипт фильтрует Минск Мир по MINSK_MIR_MARKERS.
//
// Никакого ручного review-флоу (как у market_offers/MarketOffersReview.tsx)
// сознательно нет — это не сводная аналитика с ручной проверкой каждой
// строки, а просто актуальный список объявлений на карточке БЦ. Каждый
// синк — полная замена данных по каждому источнику (упростили жизненный
// цикл: не нужно отслеживать "мёртвые" объявления отдельным HTTP-опросом,
// пропавшее объявление просто не попадёт в свежую выборку и будет удалено).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const JSON_OUT = process.argv.includes('--json');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;

if (!SUPABASE_SERVICE_ROLE_KEY && !DRY_RUN) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY (или запусти с --dry-run)');
  process.exit(1);
}

// В --dry-run без сервисного ключа под рукой (например, в песочнице
// разработки) читаем business_centers анонимным ключом — таблица открыта
// на select всем (см. RLS anon_select), запись в dry-run всё равно
// пропускается ниже.
const PUBLIC_ANON_KEY = 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ?? PUBLIC_ANON_KEY);

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const REALT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15';

// Та же логика, что и shortAddress()/парсинг улицы+дома — используется
// только внутри этого скрипта (обычный .mjs, не собирается вместе с src/,
// повторять небольшую регулярку проще, чем городить общий модуль между
// Vite-приложением и Node-скриптами, см. похожий выбор в prerender.mjs).
function shortAddress(fullAddress) {
  return fullAddress
    .replace(/^г\.\s*Минск,\s*/i, '')
    .replace(/^Минская\s+область,\s*/i, '')
    .replace(/^[А-ЯЁ][а-яё]+\s+район,\s*/, '')
    .trim();
}

// Улица + дом отдельно — дом нужен для точного поиска на Kufar и для
// пост-фильтра результатов Realt. Дом — последний сегмент через запятую,
// начинающийся с цифры; всё до него — улица. Без цифрового сегмента (МФЦ —
// ещё стройка без номера дома) вернёт house=null, такой БЦ просто
// пропускается (не выдумываем адрес, которого ещё физически нет).
function splitStreetHouse(shortAddr) {
  const parts = shortAddr.split(',').map((p) => p.trim());
  const houseIndex = parts.findIndex((p) => /^\d/.test(p));
  if (houseIndex === -1) return { street: shortAddr, house: null };
  const house = parts[houseIndex].replace(/\s*\([^)]*\)\s*$/, '').trim();
  const street = parts.slice(0, houseIndex).join(', ');
  return { street, house };
}

// Транслитерация административных районов Минска в slug'и Realt — угадана и
// проверена вживую curl'ом (HTTP 200 + реальные объявления на каждый), не
// официальная документация (Realt её не публикует). "Ленинский" сюда не
// включён — ни у одного текущего БЦ такого района нет, добавить по
// аналогии, если появится. "Великий камень" (Аден, вне Минска) — Realt не
// поддерживает районы за пределами города через эту схему, пропускаем.
const REALT_DISTRICT_SLUGS = {
  Центральный: 'centralnyj-rajon',
  Октябрьский: 'oktjabrskij-rajon',
  Партизанский: 'partizanskij-rajon',
  Первомайский: 'pervomajskij-rajon',
  Советский: 'sovetskij-rajon',
  Фрунзенский: 'frunzenskij-rajon',
  Заводской: 'zavodskoj-rajon',
  Московский: 'moskovskij-rajon',
};

const REALT_DEAL_TYPES = [
  { slug: 'sale', dealType: 'sale' },
  { slug: 'rent', dealType: 'rent' },
];

// Тот же сокращённый набор категорий, что и в sync-realt-market-offers.mjs
// (см. комментарий там про production/storages).
const REALT_CATEGORIES = [
  { slug: 'offices', propertyType: 'Офисы' },
  { slug: 'shops', propertyType: 'Торговые помещения' },
  { slug: 'services', propertyType: 'Сфера услуг' },
  { slug: 'warehouses', propertyType: 'Кладовые' },
  { slug: 'restorant-cafe', propertyType: 'Общепит' },
];

const MAX_PAGES = 10; // на один БЦ/район объявлений заметно меньше, чем на весь рынок

function normalizeForMatch(s) {
  return s.toLowerCase().replace(/[«»"'.]/g, '').replace(/\s+/g, ' ').trim();
}

// Поймано вживую на реальном прогоне: дом "1" (Аякс, ул. Могилёвская, 1)
// простым includes() совпадал и с "Могилёвская, 2к1" — "1" как подстрока
// внутри "2к1", ложное совпадение чужого дома на той же улице. Номер дома
// сверяем как отдельный токен (границы — не буква/цифра с обеих сторон),
// не подстрокой — "1" после этого совпадает только с "1", не с "21"/"2к1".
function addressMatchesBuilding(adAddress, street, house) {
  if (!adAddress) return false;
  const norm = normalizeForMatch(adAddress);
  const streetNorm = normalizeForMatch(street.replace(/^(ул\.|пр-т|просп\.|пер\.|пр\.)\s*/i, ''));
  if (!norm.includes(streetNorm)) return false;

  const houseNorm = normalizeForMatch(house);
  const escaped = houseNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const houseRe = new RegExp(`(^|[^a-zа-яё0-9])${escaped}([^a-zа-яё0-9]|$)`, 'i');
  return houseRe.test(norm);
}

// ---------- Kufar ----------

function getAdParam(ad, code) {
  return (ad.ad_parameters || []).find((p) => p.p === code) ?? null;
}
function getAccountParam(ad, code) {
  return (ad.account_parameters || []).find((p) => p.p === code) ?? null;
}

// Тот же принцип огрубления, что и в sync-kufar-market-offers.mjs.
const PROPERTY_TYPE_RENAME = {
  'Магазины, торговые помещения': 'Торговые помещения',
  Склады: 'Кладовые',
};
const UNCATEGORIZED_SOURCE_TYPES = new Set(['Промышленные помещения', 'Прочая коммерческая']);
function normalizePropertyType(rawType) {
  if (UNCATEGORIZED_SOURCE_TYPES.has(rawType)) return 'Без категории';
  return PROPERTY_TYPE_RENAME[rawType] ?? rawType;
}

// Те же широкие границы правдоподобности цены, что и в общерыночных
// скриптах — отсекают только математически невозможное ("цена по запросу").
const PRICE_BOUNDS = {
  sale: { min: 300, max: 15000 },
  rent: { min: 5, max: 150 },
};
function isPlausiblePrice(dealType, pricePerSqm) {
  const bounds = PRICE_BOUNDS[dealType];
  return pricePerSqm >= bounds.min && pricePerSqm <= bounds.max;
}

async function fetchKufarForQuery(query) {
  const all = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL('https://re.kufar.by/l/minsk/kommercheskaya');
    url.searchParams.set('query', query);
    url.searchParams.set('size', '30');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { 'User-Agent': GOOGLEBOT_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
    });
    if (!res.ok) throw new Error(`Kufar (query="${query}") вернул ${res.status}`);

    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!match) throw new Error(`Kufar (query="${query}"): не нашёл __NEXT_DATA__`);
    const data = JSON.parse(match[1]);
    const listing = data?.props?.initialState?.listing;
    if (!listing) throw new Error(`Kufar (query="${query}"): не нашёл listing`);

    all.push(...(listing.ads || []));
    const nextPage = (listing.pagination || []).find((p) => p.label === 'next');
    if (!nextPage?.token || listing.ads.length === 0) break;
    cursor = nextPage.token;
  }
  return all;
}

function extractKufarOffer(ad, slug, street, house) {
  const address = getAccountParam(ad, 'address')?.v;
  if (!addressMatchesBuilding(address, street, house)) return null;

  const dealType = ad.type === 'sell' ? 'sale' : ad.type === 'let' ? 'rent' : null;
  if (!dealType) return null;

  const propertyType = normalizePropertyType(getAdParam(ad, 'property_type')?.vl || 'Не указано');
  const size = getAdParam(ad, 'size')?.v ?? null;
  // price_usd — центы, строкой (см. комментарий в sync-kufar-market-offers.mjs
  // про тот же нюанс).
  const priceUsdCents = ad.price_usd != null ? Number(ad.price_usd) : NaN;
  const pricePerSqm = Number.isFinite(priceUsdCents) && size ? Math.round((priceUsdCents / 100 / size) * 100) / 100 : null;
  if (size == null || pricePerSqm == null || !isPlausiblePrice(dealType, pricePerSqm)) return null;

  const floor = getAdParam(ad, 'floor')?.v?.[0] ?? null;

  return {
    business_center_slug: slug,
    source: 'Kufar',
    ad_id: String(ad.ad_id),
    deal_type: dealType,
    property_type: propertyType,
    size,
    price_per_sqm: pricePerSqm,
    floor,
    address: address ?? null,
    ad_link: `https://re.kufar.by/vi/${ad.ad_id}`,
  };
}

async function collectKufarOffers(centers) {
  const offers = [];
  for (const center of centers) {
    const { street, house } = splitStreetHouse(shortAddress(center.address));
    if (!house) {
      console.log(`Kufar: пропускаю «${center.name}» — не удалось выделить номер дома из адреса`);
      continue;
    }
    const query = `${street} ${house}`;
    console.log(`Kufar: ищу «${query}» (${center.slug})...`);
    let ads;
    try {
      ads = await fetchKufarForQuery(query);
    } catch (err) {
      console.error(`Kufar (${center.slug}): ${err.message}`);
      continue;
    }
    for (const ad of ads) {
      const offer = extractKufarOffer(ad, center.slug, street, house);
      if (offer) offers.push(offer);
    }
    await new Promise((r) => setTimeout(r, 400)); // не спамить источник частыми запросами подряд
  }
  return offers;
}

// ---------- Realt ----------

function classifyRealtObject(o, dealType, propertyType, centersInDistrict) {
  const address = o.address ?? null;
  if (!address) return null;
  const match = centersInDistrict.find((c) => addressMatchesBuilding(address, c.street, c.house));
  if (!match) return null;

  const size = o.areaTotal ?? o.areaMax ?? o.areaMin ?? null;
  const pricePerSqm = o.priceRatesPerM2?.['840'] ?? null; // '840' = USD (ISO 4217)
  if (size == null || pricePerSqm == null || !isPlausiblePrice(dealType, pricePerSqm)) return null;

  return {
    business_center_slug: match.slug,
    source: 'Realt',
    ad_id: String(o.code),
    deal_type: dealType,
    property_type: propertyType,
    size,
    price_per_sqm: pricePerSqm,
    floor: o.storey ?? null,
    address,
  };
}

async function fetchRealtCategoryPage(districtSlug, dealSlug, categorySlug, page) {
  const url = new URL(`https://realt.by/${dealSlug}/${categorySlug}/minsk/${districtSlug}/`);
  if (page > 1) url.searchParams.set('page', String(page));

  const res = await fetch(url, {
    headers: { 'User-Agent': REALT_UA, Accept: 'text/html', 'Accept-Language': 'ru' },
  });
  if (res.status === 404) return { objects: [], totalCount: 0 };
  if (!res.ok) throw new Error(`Realt (${districtSlug}/${dealSlug}/${categorySlug}) вернул ${res.status}`);

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) throw new Error(`Realt (${districtSlug}/${dealSlug}/${categorySlug}): не нашёл __NEXT_DATA__`);
  const data = JSON.parse(match[1]);
  const pp = data?.props?.pageProps;
  if (!pp) throw new Error(`Realt (${districtSlug}/${dealSlug}/${categorySlug}): не нашёл pageProps`);
  return { objects: pp.objects || [], totalCount: pp.totalCount ?? 0 };
}

async function collectRealtOffers(centers) {
  const byDistrict = new Map();
  for (const center of centers) {
    const districtSlug = REALT_DISTRICT_SLUGS[center.district];
    if (!districtSlug) continue; // район вне схемы Realt (см. комментарий у REALT_DISTRICT_SLUGS) — пропускаем
    const { street, house } = splitStreetHouse(shortAddress(center.address));
    if (!house) continue;
    if (!byDistrict.has(districtSlug)) byDistrict.set(districtSlug, []);
    byDistrict.get(districtSlug).push({ slug: center.slug, street, house });
  }

  const offers = [];
  for (const [districtSlug, centersInDistrict] of byDistrict) {
    for (const { slug: dealSlug, dealType } of REALT_DEAL_TYPES) {
      for (const { slug: categorySlug, propertyType } of REALT_CATEGORIES) {
        console.log(`Realt: тяну ${districtSlug}/${dealSlug}/${categorySlug}...`);
        let totalCount = Infinity;
        const objects = [];
        for (let page = 1; page <= MAX_PAGES && objects.length < totalCount; page++) {
          let result;
          try {
            result = await fetchRealtCategoryPage(districtSlug, dealSlug, categorySlug, page);
          } catch (err) {
            console.error(err.message);
            break;
          }
          totalCount = result.totalCount;
          if (result.objects.length === 0) break;
          objects.push(...result.objects);
          await new Promise((r) => setTimeout(r, 300));
        }
        for (const o of objects) {
          const offer = classifyRealtObject(o, dealType, propertyType, centersInDistrict);
          if (offer) {
            offer.ad_link = `https://realt.by/${dealSlug}-${categorySlug}/object/${o.code}/`;
            offers.push(offer);
          }
        }
      }
    }
  }
  return offers;
}

// ---------- main ----------

async function main() {
  const { data: centers, error: centersError } = await supabase
    .from('business_centers')
    .select('slug, name, address, district');
  if (centersError) throw centersError;

  const scopedCenters = LIMIT ? centers.slice(0, LIMIT) : centers;
  console.log(`Загружено ${centers.length} бизнес-центров из справочника${LIMIT ? ` (ограничено до ${scopedCenters.length} для теста)` : ''}.`);

  const kufarOffers = await collectKufarOffers(scopedCenters);
  console.log(`Kufar: найдено ${kufarOffers.length} подходящих объявлений.`);

  const realtOffers = await collectRealtOffers(scopedCenters);
  console.log(`Realt: найдено ${realtOffers.length} подходящих объявлений.`);

  const offers = [...kufarOffers, ...realtOffers];

  if (JSON_OUT) {
    console.log(JSON.stringify(offers));
    return;
  }

  console.table(offers.map((o) => ({ ...o, address: (o.address || '').slice(0, 40) })));

  if (offers.length === 0) {
    console.log('Объявлений не найдено — в базу нечего писать.');
    return;
  }

  if (DRY_RUN) {
    console.log('--dry-run: запись в Supabase пропущена.');
    return;
  }

  const now = new Date().toISOString();
  const payload = offers.map((o) => ({ ...o, updated_at: now }));

  // Полная замена по каждому источнику разом (см. комментарий в шапке файла
  // — здесь нет ручной проверки строк, которую нужно было бы защищать от
  // перезаписи, поэтому проще снести старое и записать свежее одним upsert
  // + удалением того, что в этот раз не нашлось).
  const { error: upsertError } = await supabase
    .from('business_center_offers')
    .upsert(payload, { onConflict: 'business_center_slug,source,ad_id' });
  if (upsertError) throw upsertError;

  for (const source of ['Kufar', 'Realt']) {
    const idsThisRun = offers.filter((o) => o.source === source).map((o) => o.ad_id);
    const { error: deleteError } = await supabase
      .from('business_center_offers')
      .delete()
      .eq('source', source)
      .not('ad_id', 'in', `(${idsThisRun.length ? idsThisRun.map((id) => `"${id}"`).join(',') : '""'})`);
    if (deleteError) throw deleteError;
  }

  console.log(`Сохранено ${payload.length} объявлений в business_center_offers.`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
