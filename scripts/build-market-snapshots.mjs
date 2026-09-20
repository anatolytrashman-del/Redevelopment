// Собирает business_center_offers (объявления о продаже/аренде помещений
// внутри конкретных БЦ, см. sync-business-center-offers.mjs) в месячные
// агрегаты — public.market_snapshots — для раздела аналитики рынка
// (ANALYTICSPLAN.md, спринт 1). Один снимок = (период, сегмент, сделка,
// срез, ключ среза) → n/медиана/p25/p75, без перезаписи истории (снимки
// за прошлые месяцы не трогаются, только upsert по текущему периоду).
//
// Два сегмента с реальными данными:
// - 'ofisy_bc' (офисы в бизнес-центрах, city-wide) — из
//   business_center_offers, привязка к business_centers.business_class/
//   district; срезы city/class/district/building (building — slug БЦ, по
//   зданию выборка почти всегда мала, поэтому читать её нужно вместе с n,
//   см. MIN_RELIABLE_N на фронте). Дедупликация одного лота с нескольких
//   площадок — см. dedupeBcOffers ниже; тот же принцип, что во фронтовом
//   src/lib/businessCenterOfferDuplicates.ts (файлы-близнецы, см. CLAUDE.md —
//   этот скрипт голый JS и TS из src/ импортировать не умеет). До
//   2026-09-19 её не было вовсе — с двумя источниками (Kufar тогда отдавал
//   только продажу) пересечение было небольшим; после починки аренды
//   Kufar и добавления Domovita один лот стал попадать в снимок до 3 раз,
//   заметно смещая медиану в сторону самых растиражированных объявлений.
// - 'torgovye' (торговые помещения, city-wide) — из citywide_offers
//   (см. sync-citywide-retail-offers.mjs), срезы city/district/building_type
//   (building_type — не у всех строк заполнен, см. её же комментарий про
//   разницу Kufar/Realt). Дедупликация Kufar↔Realt тут ЕСТЬ, но уже сделана
//   в самом sync-скрипте на этапе сбора, не здесь.
// - 'sklady' (склады, city-wide) — из citywide_offers (см.
//   sync-citywide-warehouse-offers.mjs), срезы city/district ТОЛЬКО — без
//   building_type: у складов оно почти всегда пусто (358 из 474 на первом
//   реальном прогоне) и, когда заполнено, малоинформативно для складов
//   конкретно (то же общее поле commercial_building, что и у розницы, не
//   специализированное под складской класс/направление — тех данных у
//   источников нет вовсе, см. комментарий в самом sync-скрипте).
// - 'mashinomesta' (машиноместа, city-wide, только Kufar — см.
//   sync-citywide-parking-offers.mjs) — ЦЕНА ЗА ОБЪЕКТ ЦЕЛИКОМ, не за м²:
//   агрегируется по полю price_total (не price_per_sqm), unit снимков —
//   'usd_total'. Срезы city/district/building_type (последнее — тип
//   парковки: Подземная/Многоуровневая/Наземная/Открытая/На крыше).
// Остальные сегменты плана (офисы вне БЦ/первичка/ГАБ) не собираются — для
// них нет ни скрапа, ни таблицы (ANALYTICSPLAN.md §3.1 п.2).
//
// Перед агрегацией внутри каждого среза — фильтр price_per_sqm>0 и обрезка
// по 5–95 перцентилю (ANALYTICSPLAN.md §3.1 п.4), но только при n≥8 — на
// совсем маленьких выборках обрезка перцентилями съедает и так скудные
// данные, смысла в ней нет.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const JSON_OUT = process.argv.includes('--json');

if (!SUPABASE_SERVICE_ROLE_KEY && !DRY_RUN) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY (или запусти с --dry-run)');
  process.exit(1);
}

const PUBLIC_ANON_KEY = 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ?? PUBLIC_ANON_KEY);

const MIN_N_FOR_TRIM = 8;

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  const frac = idx - lo;
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * frac;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  let trimmed = sorted;
  if (sorted.length >= MIN_N_FOR_TRIM) {
    const lo = percentile(sorted, 0.05);
    const hi = percentile(sorted, 0.95);
    trimmed = sorted.filter((v) => v >= lo && v <= hi);
    if (trimmed.length === 0) trimmed = sorted;
  }
  return {
    n: trimmed.length,
    median: round2(percentile(trimmed, 0.5)),
    p25: round2(percentile(trimmed, 0.25)),
    p75: round2(percentile(trimmed, 0.75)),
  };
}

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}

// Схлопывает один и тот же лот, выложенный сразу на нескольких площадках
// (Kufar/Realt/Domovita) — тот же принцип и те же допуски, что во
// фронтовом src/lib/businessCenterOfferDuplicates.ts (файл-близнец,
// см. комментарий у вызова выше и CLAUDE.md про файлы-близнецы). Считаем
// совпавшим по зданию+сделке при площади до 0,1 м² и цене за м² до 10% —
// источники округляют/пересчитывают ставку по-разному (Kufar считает её
// из цены в долларах, Realt отдаёт готовой). Схлопываем только записи
// РАЗНЫХ источников: два объявления внутри одного источника — это два
// разных помещения (несколько одинаковых кабинетов по одной ставке у
// одного собственника — обычное дело, см. пример с «Центрополем» в
// комментарии businessCenterOfferDuplicates.ts).
// Правило одинаковое с src/lib/businessCenterOfferDuplicates.ts (эта
// функция — её файл-близнец, голый JS не импортирует TS). ВАЖНО (правка
// 2026-09-20, найдено на «Футурисе» — см. комментарий в TS-версии за
// подробным разбором и цифрами по всей базе, 77 групп/98 лишних строк):
// источник блокирует слияние только ВМЕСТЕ с совпавшей категорией
// (property_type). Один источник, но РАЗНАЯ категория при том же
// размере/цене — это не разные кабинеты, а один и тот же лот,
// протолкнутый в несколько категорий ради охвата поиска.
const VAGUE_BC_TYPES = new Set(['Без категории', 'Не указано', null, '']);
function dedupeBcOffers(rows) {
  const SIZE_TOLERANCE = 0.05;
  const PRICE_TOLERANCE = 0.1;
  const samePrice = (a, b) => {
    const max = Math.max(a, b);
    if (max <= 0) return a === b;
    return Math.abs(a - b) / max <= PRICE_TOLERANCE;
  };
  const sorted = [...rows].sort((a, b) => (a.source ?? '').localeCompare(b.source ?? ''));
  const clusters = [];
  for (const row of sorted) {
    if (row.size == null || row.price_per_sqm == null) {
      clusters.push([row]);
      continue;
    }
    const cluster = clusters.find(
      (c) =>
        c[0].business_center_slug === row.business_center_slug &&
        c[0].deal_type === row.deal_type &&
        c[0].size != null &&
        c[0].price_per_sqm != null &&
        Math.abs(c[0].size - row.size) <= SIZE_TOLERANCE &&
        samePrice(c[0].price_per_sqm, row.price_per_sqm) &&
        // Блокирует слияние только полное совпадение источник+категория —
        // см. комментарий выше.
        c.every((o) => !(o.source === row.source && o.property_type === row.property_type)),
    );
    if (cluster) cluster.push(row);
    else clusters.push([row]);
  }
  // Из кластера остаётся не первый попавшийся, а самый содержательный по
  // категории: "Без категории"/null — почти всегда СЛЕДСТВИЕ того самого
  // проталкивания в несколько категорий (Kufar честно ставит осмысленную
  // категорию первому объявлению и оставляет "Без категории" копиям), и
  // без этого выбора officeOnlyOffers ниже мог бы молча потерять реальный
  // офис, если кластер собрался в порядке "Без категории" раньше "Офисы".
  return clusters.map((c) => c.find((o) => !VAGUE_BC_TYPES.has(o.property_type)) ?? c[0]);
}

function firstOfMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// Общая агрегация: rows — объекты с deal_type + числовым полем-значением
// (по умолчанию price_per_sqm, но для машиномест — price_total, см.
// сегмент 'mashinomesta' ниже: там цена за объект целиком, не за м², своя
// единица 'usd_total' записывается в новую колонку market_snapshots.unit)
// + произвольным набором доп. полей для среза (extraSlices описывает,
// какие поля и в какой slice_type превращать). Всегда добавляет срез city
// ('all').
function buildSnapshotsForSegment(rows, segment, period, extraSlices, options = {}) {
  const valueField = options.valueField ?? 'price_per_sqm';
  const unit = options.unit ?? 'usd_per_sqm';
  const snapshots = [];
  for (const deal of ['rent', 'sale']) {
    const dealRows = rows.filter((r) => r.deal_type === deal && r[valueField] != null && Number(r[valueField]) > 0);
    if (dealRows.length === 0) continue;

    const citySummary = summarize(dealRows.map((r) => Number(r[valueField])));
    snapshots.push({ period, segment, deal, slice_type: 'city', slice_key: 'all', currency: 'USD', unit, ...citySummary });

    for (const { sliceType, field } of extraSlices) {
      const grouped = new Map();
      for (const r of dealRows) {
        const key = r[field];
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(Number(r[valueField]));
      }
      for (const [key, values] of grouped) {
        snapshots.push({ period, segment, deal, slice_type: sliceType, slice_key: key, currency: 'USD', unit, ...summarize(values) });
      }
    }
  }
  return snapshots;
}

async function main() {
  const period = firstOfMonth();
  const snapshots = [];

  // --- Сегмент 'ofisy_bc' ---
  const { data: centers, error: centersError } = await supabase
    .from('business_centers')
    .select('slug,business_class,district');
  if (centersError) throw centersError;

  // PostgREST отдаёт максимум 1000 строк за запрос (см. CLAUDE.md) —
  // объявлений в БЦ уже 618 и их число растёт с каждым синком, а хвост
  // терялся бы МОЛЧА, занижая медианы. Листаем .range() до конца, как
  // ниже у citywide_offers.
  const bcOffers = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('business_center_offers')
        .select('business_center_slug,source,deal_type,size,price_per_sqm,property_type')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      bcOffers.push(...data);
      if (data.length < PAGE) break;
    }
  }

  // Сегмент называется "офисы в бизнес-центрах" — но само здание может
  // сдавать/продавать не только офисные помещения (магазин на первом
  // этаже, сфера услуг, кладовая и т.п.). Раньше в медиану шли ВСЕ строки
  // business_center_offers без разбора property_type — на реальном срезе
  // (2026-09-08, 618 объявлений по 70 зданиям) это оказалось не мелочью:
  // 183 из 618 (30%) не "Офисы" — искажали медиану заметно. Фильтруем
  // только здесь, для расчёта СНИМКА офисного сегмента; сама таблица
  // business_center_offers не трогается — "Объявления с Kufar и Realt" на
  // карточке конкретного БЦ по-прежнему показывает все помещения здания,
  // не только офисные, там фильтр по типу не нужен.
  const dedupedBcOffers = dedupeBcOffers(bcOffers);
  const officeOnlyOffers = dedupedBcOffers.filter((o) => o.property_type === 'Офисы');
  const centerBySlug = new Map(centers.map((c) => [c.slug, c]));
  const officeRows = officeOnlyOffers.map((o) => ({
    deal_type: o.deal_type,
    price_per_sqm: o.price_per_sqm,
    class: centerBySlug.get(o.business_center_slug)?.business_class ?? null,
    district: centerBySlug.get(o.business_center_slug)?.district ?? null,
    // Срез по конкретному зданию (Д3 плана docs/bc-catalog-redesign-plan.md).
    // Даёт две вещи, которых нет сейчас: сортировку каталога по ставке и
    // сравнение «ставка здания против медианы класса/района/города» на
    // карточке БЦ — обе стороны сравнения тогда считаны одинаково (те же
    // «только офисы», та же обрезка перцентилями), а не из разных источников.
    // building_center_offers синк полностью заменяет — истории у самих
    // объявлений нет, поэтому месячный снимок здесь и есть единственная
    // сохраняемая история по зданию.
    building: centerBySlug.has(o.business_center_slug) ? o.business_center_slug : null,
  }));
  console.log(
    `Загружено ${centers.length} БЦ, ${bcOffers.length} объявлений в БЦ (${dedupedBcOffers.length} после схлопывания одного лота с нескольких площадок, ${officeOnlyOffers.length} из них — офисы, остальные отфильтрованы из снимка сегмента).`,
  );
  snapshots.push(
    ...buildSnapshotsForSegment(officeRows, 'ofisy_bc', period, [
      { sliceType: 'class', field: 'class' },
      { sliceType: 'district', field: 'district' },
      { sliceType: 'building', field: 'building' },
    ]),
  );

  // --- Сегменты из citywide_offers ('torgovye', 'sklady') ---
  // Схлопывания дублей здесь, в отличие от business_center_offers выше,
  // НЕТ — и это не забытый кусок работы. Городские сегменты собираются
  // скриптами sync-citywide-*-offers.mjs, а те схлопывают один лот с
  // разных площадок ДО записи (`dedupeAcrossSources` в
  // scripts/lib/citywideExtraSources.mjs, то же правило, что у
  // dedupeBcOffers ниже) — в таблице дублей между источниками уже нет.
  // С business_center_offers иначе: туда строки кладутся как есть, от всех
  // площадок, потому что карточка БЦ показывает их списком и схлопывает
  // при отрисовке. Заводится новый источник городского сегмента — дедуп
  // правится в citywideExtraSources.mjs, не тут.
  // PostgREST по умолчанию отдаёт не больше 1000 строк за запрос —
  // citywide_offers уже больше (проверено вживую: без пагинации
  // "Загружено 1000" при реальных 1817 для 'torgovye'), поэтому листаем
  // .range() до конца.
  async function fetchCitywideOffers(segment) {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('citywide_offers')
        .select('deal_type,price_per_sqm,price_total,district,building_type')
        .eq('segment', segment)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  const retailOffers = await fetchCitywideOffers('torgovye');
  console.log(`Загружено ${retailOffers.length} объявлений торговых помещений (citywide_offers).`);
  if (retailOffers.length > 0) {
    snapshots.push(
      ...buildSnapshotsForSegment(retailOffers, 'torgovye', period, [
        { sliceType: 'district', field: 'district' },
        { sliceType: 'building_type', field: 'building_type' },
      ]),
    );
  }

  // 'ofisy' — city-wide офисы (sync-citywide-office-offers.mjs), НЕ то же
  // самое, что 'ofisy_bc' выше (тот — только объявления внутри 143 БЦ из
  // нашего каталога). Оба сегмента сосуществуют: этот даёт непредвзятую
  // картину по всему рынку офисов Минска, 'ofisy_bc' — более узкий и
  // глубокий срез именно по каталогизированным бизнес-центрам.
  const officeCitywideOffers = await fetchCitywideOffers('ofisy');
  console.log(`Загружено ${officeCitywideOffers.length} объявлений офисов по всему городу (citywide_offers).`);
  if (officeCitywideOffers.length > 0) {
    snapshots.push(
      ...buildSnapshotsForSegment(officeCitywideOffers, 'ofisy', period, [
        { sliceType: 'district', field: 'district' },
        { sliceType: 'building_type', field: 'building_type' },
      ]),
    );
  }

  const warehouseOffers = await fetchCitywideOffers('sklady');
  console.log(`Загружено ${warehouseOffers.length} объявлений складов (citywide_offers).`);
  if (warehouseOffers.length > 0) {
    snapshots.push(...buildSnapshotsForSegment(warehouseOffers, 'sklady', period, [{ sliceType: 'district', field: 'district' }]));
  }

  // Машиноместа — цена за объект целиком (price_total), не за м²
  // (price_per_sqm у этого сегмента всегда NULL, см. sync-citywide-parking-
  // offers.mjs). building_type тут хранит тип парковки (Подземная/
  // Многоуровневая/...) — распределение живое, не вырожденное, как у
  // складов, поэтому срез оставлен.
  const parkingOffers = await fetchCitywideOffers('mashinomesta');
  console.log(`Загружено ${parkingOffers.length} объявлений машиномест (citywide_offers).`);
  if (parkingOffers.length > 0) {
    snapshots.push(
      ...buildSnapshotsForSegment(
        parkingOffers,
        'mashinomesta',
        period,
        [
          { sliceType: 'district', field: 'district' },
          { sliceType: 'building_type', field: 'building_type' },
        ],
        { valueField: 'price_total', unit: 'usd_total' },
      ),
    );
  }

  console.log(`Посчитано ${snapshots.length} срезов за ${period}.`);

  if (JSON_OUT) {
    console.log(JSON.stringify(snapshots));
  }

  if (DRY_RUN) {
    console.log('--dry-run: запись в Supabase пропущена.');
    return;
  }

  const { error: upsertError } = await supabase
    .from('market_snapshots')
    .upsert(snapshots, { onConflict: 'period,segment,deal,slice_type,slice_key' });
  if (upsertError) throw upsertError;

  console.log(`Сохранено ${snapshots.length} снимков в market_snapshots.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
