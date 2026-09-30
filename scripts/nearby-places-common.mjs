// Общее ядро сбора «Инфраструктуры рядом» для двух путей сбора:
//   scripts/capture-yandex-nearby.mjs   — браузером на машине владельца
//                                          (основной путь: ключей API не
//                                          хватает на 141 здание);
//   scripts/sync-bc-nearby-places.mjs   — через API Яндекса, если ключи
//                                          когда-нибудь появятся.
// Радиусы, категории, дедупликация и запись в базу ОДНИ И ТЕ ЖЕ: разойдись
// они — два прогона по одному и тому же зданию дали бы разные карты.

export const SOURCE = 'yandex_maps';
export const PROJECT_REF = 'iohcdylttyuhwovztrbk';
export const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';

// Радиус на категорию. Верхняя граница колонки distance_meters — 3000
// (миграция 20260920), но саму метро-исключение владелец отменил
// (2026-09-22): БЦ на этой карточке накрывают несколько районов города,
// станция в 2 км — это уже не инфраструктура ЭТОГО здания, а просто
// ближайшее метро города. Метро теперь на общих основаниях с остальным —
// через 'default'.
//
// default был 500 м — на плотном куске центра (владелец, 2026-09-21: жалоба
// на «Проспект», Октябрьская/Купаловская) это отрезало реальные, действующие
// кафе и рестораны в 570–950 м просто потому, что следующая пачка заведений
// у Яндекса начиналась сразу за границей: парсер отработал верно, дело было
// в самом пороге. Поднят до 850 м — так же, как для остановок, это тоже
// не больше 10 минут пешком, и как раз накрывает ту пачку целиком (проверено
// на живой выдаче «Проспекта» 2026-09-21).
export const CATEGORY_RADIUS = {
  transport_stop: 800,
  default: 850,
};

export function radiusFor(category) {
  return CATEGORY_RADIUS[category] ?? CATEGORY_RADIUS.default;
}

// Порядок важен: «магазин продуктов» должен попасть в grocery, а не в shop,
// «банкомат» — в atm, а не в bank. Поэтому массив, а не объект.
//
// Кафе и рестораны сведены в одну категорию 'cafe' (владелец, 2026-09-21:
// «кафе и рестораны делай в одну категорию») — раньше это были 'cafe' и
// 'restaurant' раздельно. Кофейни, наоборот, выделены из общего 'cafe' в
// свою 'coffee' — по тому же решению («давай соберем кофейни отдельно»),
// правило на «кофейн» стоит ПЕРВЫМ в этой паре: у Яндекса частое сочетание
// рубрик «Кафе · кофейня · пекарня» (см. «Paul» на живой выдаче) должно
// уйти в кофейни, а не потеряться в общем кафе.
const RUBRIC_RULES = [
  [/метро|станция метро/i, 'metro'],
  [/остановк|автобус|троллейбус|трамвай|маршрутк/i, 'transport_stop'],
  [/банкомат/i, 'atm'],
  [/банк(?![\p{L}])|отделение банка/iu, 'bank'],
  [/аптек/i, 'pharmacy'],
  [/супермаркет|гипермаркет|продуктовый|продукты|гастроном|минимаркет/i, 'grocery'],
  [/кофейн/i, 'coffee'],
  [/кафе|кондитерск|пекарн|быстрое питание|фастфуд|ресторан|бар(?![\p{L}])|паб|пиццери|суши|столовая/iu, 'cafe'],
  [/фитнес|тренаж|спортзал|бассейн|йога|кроссфит/i, 'fitness'],
  [/торговый центр|магазин|супермаркет одежды|бутик/i, 'shop'],
];

// Рубрика точнее запроса: по запросу «магазин» приезжают и аптеки, и банки —
// у Яндекса это всё «магазин» только в тексте поиска, но не в рубрике.
export function categoryFromRubric(rubricText, fallbackCategory) {
  const text = String(rubricText ?? '');
  if (text.trim()) {
    for (const [pattern, category] of RUBRIC_RULES) {
      if (pattern.test(text)) return category;
    }
  }
  return fallbackCategory;
}

export function haversineMeters(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

// Одна и та же точка приезжает по нескольким запросам («кафе» и «ресторан»),
// а у остановок Яндекс часто не даёт id организации — тогда ключом служат
// координаты, иначе один и тот же павильон запишется пять раз.
export function placeKey(place) {
  return place.source_place_id || `${Number(place.lat).toFixed(5)},${Number(place.lng).toFixed(5)}`;
}

// Одна организация приезжает по нескольким запросам, и не всегда одинаково
// надёжно: прямое попадание несёт настоящую рубрику Яндекса («Ресторан ·
// кафе · бар»), а виджет «похожие рядом» на СОВСЕМ ДРУГОМ запросе — только
// машинный слаг без рубрики («kukhmistr · similar»), и тогда категория —
// это просто fallback того запроса, под которым виджет показался, а не
// настоящий тип места (найдено 2026-09-21: «Кухмистр», реальный ресторан,
// у запроса «кофейня» всплыл «похожим» и чуть не остался кофейней — запрос
// «кофейня» в списке идёт раньше «кафе»/«ресторан», расстояние одинаковое,
// и без этого правила побеждала бы просто первая запись). Прямое попадание
// побеждает всегда, а не только при равном расстоянии — оно и есть источник
// истины, remainder сравнивается по расстоянию как раньше. Флаг временный:
// в возвращаемых записях его нет, он не часть схемы таблицы.
function isBetterPlace(candidate, existing) {
  const candidateReliable = candidate._reliableCategory !== false;
  const existingReliable = existing._reliableCategory !== false;
  if (candidateReliable !== existingReliable) return candidateReliable;
  return candidate.distance_meters < existing.distance_meters;
}

export function dedupePlaces(places) {
  const byKey = new Map();
  for (const place of places) {
    const key = placeKey(place);
    const existing = byKey.get(key);
    if (!existing || isBetterPlace(place, existing)) byKey.set(key, place);
  }
  return [...byKey.values()]
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .map(({ _reliableCategory, ...place }) => place);
}

export function sqlLiteral(value) {
  if (value == null) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function runSql(query, accessToken) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export function buildWriteSql(slug, places) {
  const values = places
    .map(
      (place) => `(
      ${sqlLiteral(place.business_center_slug)}, ${sqlLiteral(placeKey(place))}, ${sqlLiteral(place.name)},
      ${sqlLiteral(place.category)}, ${sqlLiteral(place.subcategory)}, ${sqlLiteral(place.address)},
      ${place.lat}, ${place.lng}, ${place.distance_meters}, ${sqlLiteral(place.source)},
      ${sqlLiteral(place.source_url)}, ${sqlLiteral(place.collected_at)}::timestamptz
    )`,
    )
    .join(',');
  // Снимок конкретного БЦ и конкретного источника заменяется целиком: точка,
  // которой в Яндексе больше нет, должна исчезнуть и у нас. Пилотные строки
  // 2ГИС по «Порту» это условие не трогает.
  return `
    delete from public.business_center_nearby_places
      where business_center_slug = ${sqlLiteral(slug)} and source = ${sqlLiteral(SOURCE)};
    ${values ? `insert into public.business_center_nearby_places
      (business_center_slug, source_place_id, name, category, subcategory, address, lat, lng,
       distance_meters, source, source_url, collected_at) values ${values};` : ''}
  `;
}

// PostgREST отдаёт максимум 1000 строк за запрос (max_rows проекта) —
// .range(0, N) с большим N этот потолок НЕ обходит, только выше него
// сервер молча режет ответ до 1000 (см. CLAUDE.md, "PostgREST отдаёт
// максимум 1000 строк"). Настоящая постраничная выборка — цикл, пока
// страница не вернулась короче своего размера.
async function selectAllPages(buildQuery) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

// Читать и писать умеем двумя путями: service-role ключом (если он есть в
// окружении) и Management API по SUPABASE_ACCESS_TOKEN — в сессиях Claude
// доступен только второй, локально у владельца бывает первый.
// kind: 'bc' | 'tc' | 'all' — каталог (см. --kind в capture-yandex-nearby.mjs).
export async function readCenters({ supabase, accessToken, kind = 'bc' }) {
  if (supabase) {
    const centers = await selectAllPages(() =>
      supabase
        .from('business_centers')
        .select('slug,name,address,lat,lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .in('kind', kind === 'all' ? ['bc', 'tc'] : [kind])
        .order('slug'),
    );
    const snapshots = await selectAllPages(() =>
      supabase.from('business_center_nearby_places').select('business_center_slug,collected_at').eq('source', SOURCE),
    );
    const latest = new Map();
    for (const row of snapshots ?? []) {
      const current = latest.get(row.business_center_slug);
      if (!current || new Date(row.collected_at) > new Date(current)) latest.set(row.business_center_slug, row.collected_at);
    }
    return (centers ?? []).map((center) => ({ ...center, collected_at: latest.get(center.slug) ?? null }));
  }
  return runSql(
    `select bc.slug, bc.name, bc.address, bc.lat, bc.lng,
            (select max(p.collected_at) from public.business_center_nearby_places p
              where p.business_center_slug = bc.slug and p.source = ${sqlLiteral(SOURCE)}) as collected_at
       from public.business_centers bc
      where bc.lat is not null and bc.lng is not null
        and bc.kind in (${kind === 'all' ? "'bc','tc'" : sqlLiteral(kind)})
      order by bc.slug`,
    accessToken,
  );
}

// Слаги БЦ, у которых уже есть хотя бы один текстовый отзыв с Яндекс.Карт
// (business_center_review_snapshots, source='yandex_maps') — общий фильтр
// для capture-yandex-nearby.mjs (--only-missing-reviews /
// --exclude-missing-reviews) и capture-yandex-reviews.mjs (--missing-only),
// чтобы прогон инфраструктуры и прогон отзывов резали каталог по ОДНОМУ и
// тому же списку зданий, а не по двум отдельно посчитанным.
export async function slugsWithYandexReviews({ supabase, accessToken }) {
  if (supabase) {
    const rows = await selectAllPages(() =>
      supabase.from('business_center_review_snapshots').select('business_center_slug').eq('source', 'yandex_maps'),
    );
    return new Set(rows.map((row) => row.business_center_slug));
  }
  const rows = await runSql(
    "select distinct business_center_slug from public.business_center_review_snapshots where source = 'yandex_maps';",
    accessToken,
  );
  return new Set(rows.map((row) => row.business_center_slug));
}

export async function writePlaces({ supabase, accessToken, slug, places }) {
  if (supabase) {
    const { error: deleteError } = await supabase
      .from('business_center_nearby_places')
      .delete()
      .eq('business_center_slug', slug)
      .eq('source', SOURCE);
    if (deleteError) throw deleteError;
    if (places.length === 0) return;
    const { error: insertError } = await supabase
      .from('business_center_nearby_places')
      .insert(places.map((place) => ({ ...place, source_place_id: placeKey(place) })));
    if (insertError) throw insertError;
    return;
  }
  await runSql(buildWriteSql(slug, places), accessToken);
}
