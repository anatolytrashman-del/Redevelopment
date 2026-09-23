// Дополняет dist/sitemap.xml карточками бизнес-центров (/minsk/bc/<slug>)
// и хабами по станциям метро (/minsk/bc/metro/<slug>, только непустые).
//
// Аудит поиска 2026-09-07: в sitemap были только каталог и хаб-страницы
// фильтров, ни одной карточки БЦ — Google знал 5 URL сайта, Яндекс 2, ни
// одна карточка не в индексе. Список слагов — из той же таблицы
// business_centers, что читает публичная страница (как и в prerender.mjs),
// не хардкожен: каталог растёт, статический файл в public/ отставал бы.
//
// Запускается в `npm run build` сразу после `vite build` (public/sitemap.xml
// уже скопирован в dist/). При сетевой ошибке НЕ валит сборку — sitemap
// остаётся статическим, как раньше (те же URL, что и до этой правки), а в
// лог уходит предупреждение.
//
// lastmod карточек — дата сборки: у business_centers нет updated_at, а сам
// снапшот карточки (prerender.mjs) пересобирается каждый деплой, плюс
// объявления Kufar/Realt внутри карточек обновляются ежемесячным синком.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fallbackRows } from './_buildFallback.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const SITE = 'https://redevelopment.pro';
const SITEMAP_PATH = resolve(process.cwd(), 'dist/sitemap.xml');

// Запрос к Supabase с повторами (2026-09-12) — та же защита, что в
// scripts/prerender.mjs: free-tier отдаёт разовые 504 на обычный select, и
// без повтора карточки БЦ (198 из 285 <loc>) молча выпадали из sitemap на
// весь следующий деплой (реальный случай — Build Logs сборки 11:59).
const SUPABASE_ATTEMPTS = 3;

async function supabaseSelect(query, what) {
  let lastError;
  for (let attempt = 1; attempt <= SUPABASE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Supabase вернул ${res.status} при запросе ${what}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < SUPABASE_ATTEMPTS) {
        const pauseMs = attempt * 2000;
        console.warn(
          `[generate-sitemap] ${what}: попытка ${attempt} не удалась (${err instanceof Error ? err.message : err}) — повтор через ${pauseMs / 1000}с`,
        );
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    }
  }
  const rows = fallbackRows(query, 'generate-sitemap');
  if (rows) return rows;
  throw lastError;
}

async function fetchBusinessCenterSlugs() {
  const rows = await supabaseSelect('business_centers?select=slug&order=slug.asc', 'business_centers.slug');
  return rows.map((r) => r.slug).filter((slug) => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug));
}


// Хабы по станциям метро (аудит поиска 2026-09-07) — та же карта slug'ов и
// тот же радиус 1500 м, что в src/lib/businessCenterHubs.ts
// (METRO_STATION_SLUGS / METRO_HUB_MAX_DISTANCE_M — продублировано, скрипт
// без TS-загрузчика). Хаб — только для станций с ≥1 БЦ в радиусе.
const METRO_HUB_MAX_DISTANCE_M = 1500;
const METRO_HUB_SLUG_BY_STATION = {
  Молодёжная: 'molodezhnaya',
  Фрунзенская: 'frunzenskaya',
  'Площадь Франтишка Богушевича': 'ploshchad-bogushevicha',
  'Академия наук': 'akademiya-nauk',
  Пушкинская: 'pushkinskaya',
  'Институт культуры': 'institut-kultury',
  Вокзальная: 'vokzalnaya',
  'Юбилейная площадь': 'yubileynaya-ploshchad',
  'Площадь Победы': 'ploshchad-pobedy',
  Купаловская: 'kupalovskaya',
  'Ковальская Слобода': 'kovalskaya-sloboda',
  Московская: 'moskovskaya',
  'Площадь Якуба Коласа': 'ploshchad-yakuba-kolasa',
  Михалово: 'mihalovo',
  'Площадь Ленина': 'ploshchad-lenina',
  Грушевка: 'grushevka',
  Восток: 'vostok',
  Петровщина: 'petrovshchina',
  Немига: 'nemiga',
  Аэродромная: 'aerodromnaya',
  Уручье: 'uruchye',
  Октябрьская: 'oktyabrskaya',
  'Борисовский тракт': 'borisovskiy-trakt',
  'Каменная горка': 'kamennaya-gorka',
  'Парк Челюскинцев': 'park-chelyuskintsev',
  Спортивная: 'sportivnaya',
  Кунцевщина: 'kuntsevshchina',
  Первомайская: 'pervomayskaya',
  'Тракторный завод': 'traktornyy-zavod',
  Партизанская: 'partizanskaya',
  Пролетарская: 'proletarskaya',
  Малиновка: 'malinovka',
  Автозаводская: 'avtozavodskaya',
  Могилёвская: 'mogilevskaya',
};

// Хабы по улицам (аудит поиска 2026-09-07) — тот же принцип, что и хабы
// метро выше: только улицы с 2+ БЦ (STREET_HUB_SLUG_BY_NAME), список
// продублирован из src/lib/businessCenterHubs.ts (скрипт без TS-загрузчика).
const STREET_HUB_SLUG_BY_NAME = {
  'пр-т Победителей': 'prospekt-pobediteley',
  'пр-т Независимости': 'prospekt-nezavisimosti',
  'пр-т Дзержинского': 'prospekt-dzerzhinskogo',
  'ул. Притыцкого': 'pritytskogo',
  'ул. Сурганова': 'surganova',
  'ул. Платонова': 'platonova',
  'ул. Клары Цеткин': 'klary-tsetkin',
  'пер. Козлова': 'pereulok-kozlova',
  'пр-т Партизанский': 'prospekt-partizanskiy',
  'Логойский тракт': 'logoyskiy-trakt',
  'ул. Хоружей': 'horuzhey',
  'ул. Филимонова': 'filimonova',
  'ул. Немига': 'nemiga',
  'ул. Мележа': 'melezha',
  'ул. Толбухина': 'tolbuhina',
  'ул. Железнодорожная': 'zheleznodorozhnaya',
  'ул. Интернациональная': 'internatsionalnaya',
  'ул. Лобанка': 'lobanka',
  'ул. Ольшевского': 'olshevskogo',
  'ул. Свердлова': 'sverdlova',
  'ул. Скрыганова': 'skryganova',
  'ул. Тимирязева': 'timiryazeva',
  'ул. Скорины': 'skoriny',
};

// Порог индексации производных срезов — тот же, что в
// src/lib/businessCenterHubs.ts (MIN_INDEXABLE_HUB_CENTERS), и карты слагов
// класса/района/микрорайона оттуда же: скрипт без TS-загрузчика, поэтому
// продублировано, как метро и улицы выше. Правится одна сторона — правится
// и вторая, иначе sitemap зовёт краулера на страницы, которые сам сайт
// отдаёт с noindex.
const MIN_INDEXABLE_HUB_CENTERS = 3;
const CLASS_SLUGS = { A: 'a', 'B+': 'b-plus', B: 'b', C: 'c' };
const DISTRICT_SLUGS = {
  Центральный: 'tsentralny',
  Октябрьский: 'oktyabrsky',
  Советский: 'sovetsky',
  Фрунзенский: 'frunzensky',
  Заводской: 'zavodskoy',
  Первомайский: 'pervomaysky',
  Партизанский: 'partizansky',
  Московский: 'moskovsky',
  Ленинский: 'leninsky',
  'Великий камень': 'velikiy-kamen',
};
const MICRODISTRICT_SLUGS = {
  Комаровка: 'komarovka',
  Чкаловский: 'chkalovsky',
  'Каменная Горка': 'kamennaya-gorka',
  Веснянка: 'vesnyanka',
  'Зелёный Луг': 'zelenyy-lug',
  Сухарево: 'suharevo',
  'Золотая Горка': 'zolotaya-gorka',
  Уручье: 'uruchye',
  Степянка: 'stepyanka',
  Барановщина: 'baranovschina',
  Магистр: 'magistr',
  Радужный: 'raduzhny',
  'Раковское Шоссе-1': 'rakovskoe-shosse-1',
  Лошица: 'loshitsa',
  'Великий Лес': 'velikiy-les',
  Грушевка: 'grushevka',
  Слепянка: 'slepyanka',
  'Михалово-2': 'mihalovo-2',
};

function shortAddressJs(a) {
  return a
    .replace(/^г\.\s*Минск,\s*/i, '')
    .replace(/^Минская\s+область,\s*/i, '')
    .replace(/^[А-ЯЁ][а-яё]+\s+район,\s*/, '')
    .trim();
}

function streetOfAddressJs(fullAddress) {
  const short = shortAddressJs(fullAddress);
  const parts = short.split(',').map((p) => p.trim());
  const houseIndex = parts.findIndex((p) => /^\d/.test(p));
  if (houseIndex > 0) return parts.slice(0, houseIndex).join(', ');
  if (houseIndex === 0) return short;
  return parts.length > 1 ? parts.slice(0, -1).join(', ') : short;
}

// Срезы каталога, которые ПУСКАЕМ в sitemap: улица, микрорайон и
// «класс + район» только от MIN_INDEXABLE_HUB_CENTERS зданий. Тот же порог,
// по которому сама страница ставит noindex (Ш2 плана
// docs/bc-catalog-seo-plan.md): на срезе из одного-двух зданий страница
// почти повторяет карточку БЦ, и звать на неё краулера, чтобы он прочитал
// там noindex, — впустую потраченный краулинговый бюджет.
async function fetchHubPaths() {
  const rows = await supabaseSelect(
    'business_centers?select=address,business_class,district,microdistrict',
    'business_centers.address/class/district/microdistrict',
  );
  const countBy = (key) => {
    const counts = new Map();
    for (const r of rows) {
      const value = key(r);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  };
  const big = (counts, value) => (counts.get(value) ?? 0) >= MIN_INDEXABLE_HUB_CENTERS;

  const streetCounts = countBy((r) => streetOfAddressJs(r.address));
  const microCounts = countBy((r) => r.microdistrict);
  const classDistrictCounts = countBy((r) => (r.business_class && r.district ? `${r.business_class}|${r.district}` : null));

  const streets = [...streetCounts.keys()]
    .filter((name) => STREET_HUB_SLUG_BY_NAME[name] && big(streetCounts, name))
    .map((name) => `/minsk/bc/street/${STREET_HUB_SLUG_BY_NAME[name]}`);
  const microdistricts = [...microCounts.keys()]
    .filter((name) => MICRODISTRICT_SLUGS[name] && big(microCounts, name))
    .map((name) => `/minsk/bc/area/${MICRODISTRICT_SLUGS[name]}`);
  const classDistricts = [...classDistrictCounts.keys()]
    .filter((key) => {
      const [cls, district] = key.split('|');
      return CLASS_SLUGS[cls] && DISTRICT_SLUGS[district] && big(classDistrictCounts, key);
    })
    .map((key) => {
      const [cls, district] = key.split('|');
      return `/minsk/bc/class/${CLASS_SLUGS[cls]}/district/${DISTRICT_SLUGS[district]}`;
    });

  return { keep: new Set([...streets, ...microdistricts, ...classDistricts]), streets };
}

// Убирает из готового sitemap срезы, которые не прошли порог: часть из них
// (микрорайоны, «класс + район») лежит в статическом public/sitemap.xml, и
// без этой чистки файл звал бы краулера на закрытые noindex'ом страницы.
function pruneThinHubs(xml, keep) {
  const derived = /\/minsk\/bc\/(street|area|class\/[a-z0-9-]+\/district)\//;
  let removed = 0;
  const out = xml.replace(/ {2}<url>\n(?:.*\n)*? {2}<\/url>\n/g, (block) => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
    const path = loc.replace(SITE, '');
    if (!derived.test(path) || keep.has(path)) return block;
    removed += 1;
    return '';
  });
  return { xml: out, removed };
}

async function fetchMetroHubStations() {
  const rows = await supabaseSelect(
    'business_centers?select=nearest_metro_stations&nearest_metro_stations=not.is.null',
    'nearest_metro_stations',
  );
  const slugs = new Set();
  for (const r of rows) {
    for (const s of Array.isArray(r.nearest_metro_stations) ? r.nearest_metro_stations : []) {
      const slug = METRO_HUB_SLUG_BY_STATION[s?.name];
      if (slug && typeof s.distanceMeters === 'number' && s.distanceMeters <= METRO_HUB_MAX_DISTANCE_M) slugs.add(slug);
    }
  }
  return [...slugs];
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function main() {
  let slugs;
  try {
    slugs = await fetchBusinessCenterSlugs();
  } catch (err) {
    console.warn(`[generate-sitemap] карточки БЦ не добавлены: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const xml = readFileSync(SITEMAP_PATH, 'utf8');
  const existing = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const today = new Date().toISOString().slice(0, 10);
  let metroSlugs = [];
  try {
    metroSlugs = await fetchMetroHubStations();
  } catch (err) {
    console.warn(`[generate-sitemap] хабы метро не добавлены: ${err instanceof Error ? err.message : err}`);
  }
  let hubs = null;
  try {
    hubs = await fetchHubPaths();
  } catch (err) {
    console.warn(`[generate-sitemap] срезы каталога не пересчитаны: ${err instanceof Error ? err.message : err}`);
  }
  const entries = [
    ...metroSlugs.map((slug) => `${SITE}/minsk/bc/metro/${slug}`),
    ...(hubs ? hubs.streets.map((path) => `${SITE}${path}`) : []),
    ...slugs.map((slug) => `${SITE}/minsk/bc/${slug}`),
  ]
    .filter((url) => !existing.has(url))
    .map(
      (url) =>
        `  <url>\n    <loc>${escapeXml(url)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`,
    );
  const closing = xml.lastIndexOf('</urlset>');
  if (closing === -1) throw new Error('dist/sitemap.xml: не найден закрывающий </urlset>');
  const withEntries = entries.length ? `${xml.slice(0, closing)}${entries.join('\n')}\n</urlset>\n` : xml;
  // Чистка идёт последней и по всему файлу: тонкие срезы есть и среди
  // добавленных сейчас, и среди статических записей public/sitemap.xml.
  const { xml: pruned, removed } = hubs ? pruneThinHubs(withEntries, hubs.keep) : { xml: withEntries, removed: 0 };
  writeFileSync(SITEMAP_PATH, pruned);
  const total = [...pruned.matchAll(/<loc>/g)].length;
  console.log(
    `[generate-sitemap] добавлено URL (хабы метро/улиц + карточки БЦ): ${entries.length}, убрано тонких срезов: ${removed} (всего <loc>: ${total})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
