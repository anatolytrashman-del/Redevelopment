// Первичный рынок Минск Мира (bir.by, портал застройщика Dana Holdings) —
// владелец попросил построить блок аналитики (2026-08-24): "апарты и
// остальная коммерция" — обычные квартиры (vid=Квартира) сознательно НЕ
// собираем, только бизнес-апартаменты + коммерческие помещения (торговые/
// офисы по этажу) + кладовые + машиноместа. Машиноместа этот скрипт НЕ
// собирает сам (тот же исходный срез уже был спарсен для блока "Паркинги"
// на этой же странице раньше в сессии, per-объявление данные лежали в
// scratchpad, а не в этом скрипте) — в primary_market_offers они
// дозагружены отдельным разовым запуском по сохранённым сырым данным
// (категории 'Машиноместа (крытые)'/'Машиноместа (подземные)', та же
// граница по цене 9900 → 13000 €, что определяет деление в "Паркинги").
// Карточки в "Паркинги" (parkingSegments/parkingAddresses) остаются
// статическими агрегатами count/area — цены там убраны намеренно
// (владелец), сравнение цены за м² теперь только в таблице
// "Первичный рынок".
//
// bir.by рендерит таблицу через AJAX (сама HTML-страница отдаёт пустой
// <tbody>, наполняется JS) — эндпоинт найден в инлайновом <script> каждой
// категорийной страницы: POST bir.by/ajax/get-search-objects-new/
// (type=live — квартиры/апартаменты, type=pantry — кладовые) и
// POST bir.by/ajax/get-search-objects-com/ (type=com — коммерческие).
// Один запрос с большим limit отдаёт весь срез сразу — домен открыт
// напрямую, без обхода защиты (проверено на машиноместах в этой же
// сессии, см. журнал SEO_PLAN.md).
//
// Терраса — только у коммерческих (у квартир/апартаментов/кладовых этот
// столбец в разметке bir.by закомментирован, данных там нет). У
// коммерческих bir.by отдаёт три числа: общая площадь (с террасой),
// "Помещение м²" (чистая) и "Терраса м²" отдельно — сохраняем общую
// площадь + террасу отдельно (тот же паттерн size/hasTerrace/terraceArea,
// что у market_offers для Kufar/Realt, см. src/data/marketOffers.ts),
// чистая площадь и цена за чистый м² считаются на лету в коде читателя,
// не хранятся отдельно. На реальной записи проверено: официальная "Цена
// за м²" bir.by считается по ОБЩЕЙ площади (с террасой) — то же
// искажение, что у Kufar/Realt, только здесь его можно поправить
// автоматически (данные уже структурированы), без ручной верификации в
// админке — владелец подтвердил, что она тут не нужна.
//
// Торговые/офисы — bir.by сам не делит коммерческие по этажу, делим сами
// по полю "Этаж" при записи: 1 этаж = торговые помещения, 2 и выше —
// офисы (владелец).
//
// Сданные дома — не отдельная категория, а статус ("Сдано"/"Строится") у
// тех же апартаментов (владелец: "сданные дома фиксируем и выводим
// отдельно, по ним стоит сравнивать цену с вторичкой") — два отдельных
// запроса с фильтром stage[], статус пишется в колонку `stage`.
//
// Ссылка на объявление сохраняется у каждой строки (owner: "у каждого
// помещения есть своя ссылка, эту ссылку нужно фиксировать") — общая
// практика проекта для внешних источников, не только на случай террас.

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

const BASE = 'https://bir.by/';
const LIMIT = 6000; // страховка — реальных объявлений на порядок меньше (проверено на машиноместах)

// Комплекс фиксированный, не парсится из строки — каждый запрос уже
// отфильтрован по object[]=Minsk World, а сама разметка комплекса в
// разных строках слегка отличается (промо-бейдж/пробелы), не стабильна
// для регулярки.
const COMPLEX_NAME = '«Минск-Мир»';
const ID_RE = /data-loadobject="([a-f0-9-]+)"/;
const HOUSE_RE = /class="tableRowLink housename"[^>]*>([^<]*)<span>([^<]*)<\/span>/;
const PLAIN_CELL_RE = /<td class="table-search__item[^"]*"[^>]*>([^<]*)<\/td>/g;
// Только общая цена — цена за м² не хранится, считается читателем от
// площади (тот же принцип netSize/netPricePerSqm, что у market_offers).
const PRICE_TOTAL_RE = /<p class="costNum">([^<]*)<i[^>]*><\/i><\/p><span class="tprice[^"]*">([^<]*)<\/span>/;
const LINK_RE = /href="(\/object\/[a-f0-9-]+)"/;

function parseNum(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/ /g, ' ').replace(/[^\d.,]/g, '').replace(',', '.').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function splitRows(html) {
  return html.split(/(?=<tr[^>]*data-loadobject=)/).filter((r) => r.includes('data-loadobject'));
}

// Разбирает одну строку таблицы в набор сырых полей — общий для всех
// категорий (квартиры/апартаменты и кладовые дают 4 "простых" ячейки
// между домом и ценой — №/этаж/площадь/год; коммерческие дают 6 — №/этаж/
// площадь общая/площадь чистая/терраса/год), маппинг конкретных полей
// решает вызывающий код по количеству ячеек.
function parseRow(rowHtml) {
  const idMatch = rowHtml.match(ID_RE);
  if (!idMatch) return null;
  const houseMatch = rowHtml.match(HOUSE_RE);
  const plainCells = [...rowHtml.matchAll(PLAIN_CELL_RE)].map((m) => m[1].trim());
  const priceTotalMatch = rowHtml.match(PRICE_TOTAL_RE);
  const linkMatch = rowHtml.match(LINK_RE);
  return {
    id: idMatch[1],
    complex: COMPLEX_NAME,
    house: houseMatch ? houseMatch[1].trim() || null : null,
    address: houseMatch ? houseMatch[2].trim() || null : null,
    plainCells,
    priceTotalByn: priceTotalMatch ? parseNum(priceTotalMatch[1]) : null,
    priceTotalEur: priceTotalMatch ? parseNum(priceTotalMatch[2]) : null,
    link: linkMatch ? BASE + linkMatch[1].replace(/^\//, '') : null,
  };
}

async function fetchSearch(endpoint, params) {
  const body = new URLSearchParams({ limit: String(LIMIT), ...params });
  const res = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  });
  if (!res.ok) throw new Error(`bir.by ${endpoint} → HTTP ${res.status}`);
  const html = await res.text();
  return splitRows(html).map(parseRow).filter(Boolean);
}

// --- Бизнес-апартаменты (vid=Апартаменты), два прохода по stage[] ---
async function fetchApartments() {
  const rows = [];
  for (const stage of ['Сдано', 'Строится']) {
    const parsed = await fetchSearch('ajax/get-search-objects-new/', {
      type: 'live',
      'object[]': 'Minsk World',
      'vid[]': 'Апартаменты',
      'stage[]': stage,
    });
    for (const r of parsed) {
      // plainCells: [№, этаж, площадь, год]
      const [, floor, area, year] = r.plainCells;
      if (r.priceTotalByn == null || area == null) continue;
      rows.push({
        source: 'bir.by',
        external_id: r.id,
        category: 'Бизнес-апартаменты',
        complex: r.complex,
        house: r.house,
        unit_number: r.plainCells[0] ?? null,
        floor: parseNum(floor),
        area_m2: parseNum(area),
        terrace_area_m2: null,
        year_handover: parseNum(year),
        stage,
        price_total_byn: r.priceTotalByn,
        price_total_eur: r.priceTotalEur,
        ad_link: r.link,
      });
    }
  }
  return rows;
}

// --- Кладовые (type=pantry) — та же форма строки, что у апартаментов, без stage ---
async function fetchPantry() {
  const parsed = await fetchSearch('ajax/get-search-objects-new/', {
    type: 'pantry',
    'object[]': 'Minsk World',
  });
  return parsed
    .filter((r) => r.priceTotalByn != null && r.plainCells[1] != null)
    .map((r) => {
      const [unit, , area, year] = r.plainCells;
      return {
        source: 'bir.by',
        external_id: r.id,
        category: 'Кладовые',
        complex: r.complex,
        house: r.house,
        unit_number: unit ?? null,
        floor: null,
        area_m2: parseNum(area),
        terrace_area_m2: null,
        year_handover: parseNum(year),
        stage: null,
        price_total_byn: r.priceTotalByn,
        price_total_eur: r.priceTotalEur,
        ad_link: r.link,
      };
    });
}

// --- Коммерческие (type=com) — 6 простых ячеек (№, этаж, площадь общая,
// площадь чистая, терраса, год); делим на Торговые/Офисы по этажу ---
async function fetchCommercial() {
  const parsed = await fetchSearch('ajax/get-search-objects-com/', {
    type: 'com',
    'object[]': 'Minsk World',
  });
  return parsed
    .filter((r) => r.priceTotalByn != null && r.plainCells[2] != null)
    .map((r) => {
      const [unit, floor, areaTotal, , terrace, year] = r.plainCells;
      const floorNum = parseNum(floor);
      const category = floorNum === 1 ? 'Торговые помещения' : 'Офисы';
      return {
        source: 'bir.by',
        external_id: r.id,
        category,
        complex: r.complex,
        house: r.house,
        unit_number: unit ?? null,
        floor: floorNum,
        area_m2: parseNum(areaTotal),
        terrace_area_m2: parseNum(terrace),
        year_handover: parseNum(year),
        stage: null,
        price_total_byn: r.priceTotalByn,
        price_total_eur: r.priceTotalEur,
        ad_link: r.link,
      };
    });
}

async function main() {
  const [apartments, pantry, commercial] = await Promise.all([fetchApartments(), fetchPantry(), fetchCommercial()]);
  const offers = [...apartments, ...pantry, ...commercial];

  const byCategory = offers.reduce((acc, o) => {
    acc[o.category] = (acc[o.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log('bir.by: собрано по категориям —', JSON.stringify(byCategory));

  if (JSON_OUT) {
    console.log(JSON.stringify(offers));
  }

  if (DRY_RUN) {
    console.log('--dry-run: запись в Supabase пропущена.');
    return;
  }

  if (offers.length === 0) {
    console.log('bir.by: ничего не нашлось, в базу нечего писать.');
    return;
  }

  const { error } = await supabase
    .from('primary_market_offers')
    .upsert(offers, { onConflict: 'source,external_id' });
  if (error) throw error;
  console.log(`Сохранено ${offers.length} объявлений в primary_market_offers.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
