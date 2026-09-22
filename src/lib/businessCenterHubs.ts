import type { BusinessCenter } from '../data/businessCenters';

// Хаб-страницы по классу и по району (Fable-анализ SEO-блоков каталога БЦ,
// 2026-09-06 — "нужны страницы вида /minsk/bcminsk/class-a/,
// /minsk/bcminsk/centralny/... каждая со своим H1"). Статические карты
// slug<->значение — районов и классов конечное известное множество (9
// админ-районов Минска + "Великий камень" для объектов вне города, и 4
// деловых класса), не нужен динамический slugify на лету.
export const CLASS_SLUGS: Record<NonNullable<BusinessCenter['businessClass']>, string> = {
  A: 'a',
  'B+': 'b-plus',
  B: 'b',
  C: 'c',
};

export const CLASS_SLUG_TO_VALUE: Record<string, NonNullable<BusinessCenter['businessClass']>> = Object.fromEntries(
  Object.entries(CLASS_SLUGS).map(([value, slug]) => [slug, value as NonNullable<BusinessCenter['businessClass']>]),
);

export const DISTRICT_SLUGS: Record<string, string> = {
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

export const DISTRICT_SLUG_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(DISTRICT_SLUGS).map(([name, slug]) => [slug, name]),
);

// Предложный падеж района ("в Московском районе", не "в Московский районе")
// — нужен только для связного текста комбинированных хабов класс×район
// (владелец, 2026-09-06: "структура урлов [пересечений]"), на одноосевых
// хабах район используется как ярлык без предлога ("Минска: Московский
// район"), склонение не требовалось. Явная карта на 9 районов (конечное
// известное множество, как и сами DISTRICT_SLUGS) — надёжнее, чем угадывать
// суффикс регуляркой на разномастных окончаниях (-ский/-ой/-ный).
const DISTRICT_PREPOSITIONAL: Record<string, string> = {
  Центральный: 'Центральном',
  Октябрьский: 'Октябрьском',
  Советский: 'Советском',
  Фрунзенский: 'Фрунзенском',
  Заводской: 'Заводском',
  Первомайский: 'Первомайском',
  Партизанский: 'Партизанском',
  Московский: 'Московском',
  Ленинский: 'Ленинском',
};

export function districtPrepositional(district: string): string {
  return DISTRICT_PREPOSITIONAL[district] ?? district;
}

// Дательный падеж района («по Московскому району») — нужен фразе
// сравнения со срезом рынка в блоке предложений: «на 25% дороже, чем в
// среднем по Московскому району». Явная карта на конечное известное
// множество, как и у предложного падежа выше: падежные окончания этих
// прилагательных регуляркой не выводятся.
const DISTRICT_DATIVE: Record<string, string> = {
  Центральный: 'Центральному',
  Октябрьский: 'Октябрьскому',
  Советский: 'Советскому',
  Фрунзенский: 'Фрунзенскому',
  Заводской: 'Заводскому',
  Первомайский: 'Первомайскому',
  Партизанский: 'Партизанскому',
  Московский: 'Московскому',
  Ленинский: 'Ленинскому',
};

export function districtDative(district: string): string {
  return DISTRICT_DATIVE[district] ?? district;
}

export function districtHubUrl(district: string): string | null {
  const slug = DISTRICT_SLUGS[district];
  return slug ? `/minsk/bcminsk/raion/${slug}` : null;
}

export function classHubUrl(businessClass: NonNullable<BusinessCenter['businessClass']>): string {
  return `/minsk/bcminsk/class/${CLASS_SLUGS[businessClass]}`;
}

// Хаб-страницы по пересечению класс×район (владелец, 2026-09-06: "давай
// пока сделаем ту самую структуру урлов [дерево пересечений]... точечные
// страницы будут очень хорошо приняты поиском, увеличит количество страниц
// в выдаче" — идея была впервые предложена самим владельцем и записана как
// задел на будущее в BCMINSK_SEO_PLAN.md, теперь реализована). Схема
// `/minsk/bcminsk/class/:classSlug/raion/:districtSlug` — та же, что
// называл сам план. Метро×класс/метро×район из того же плана НЕ делаем —
// метро всё ещё свободный текст, не структурное поле (см. блокер в плане).
export function classDistrictHubUrl(
  businessClass: NonNullable<BusinessCenter['businessClass']>,
  district: string,
): string | null {
  const districtSlug = DISTRICT_SLUGS[district];
  if (!districtSlug) return null;
  return `/minsk/bcminsk/class/${CLASS_SLUGS[businessClass]}/raion/${districtSlug}`;
}

// Хабы по неформальным микрорайонам ("Уручье", "Малиновка" — как люди сами
// называют район, не официальный административный район), владелец,
// 2026-09-07: "можем делать ещё страницы по типу «Бизнес-центры Уручье»...
// от 1 БЦ". Список — не все микрорайоны, которые в принципе знает 2GIS
// (см. таблицу `minsk_microdistricts` — там шире, для будущего), а только
// те, где на сегодня есть хотя бы 1 БЦ (иначе хаб был бы пустой страницей,
// тонкий контент) — см. journal 2026-09-07 про сам point-in-polygon матчинг.
// Слаги — транслитерация вручную (конечный список, как и у DISTRICT_SLUGS).
export const MICRODISTRICT_SLUGS: Record<string, string> = {
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

export const MICRODISTRICT_SLUG_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(MICRODISTRICT_SLUGS).map(([name, slug]) => [slug, name]),
);

// Три топонима — одновременно и станция метро, и (плохо покрытый контуром
// 2GIS) микрорайон: Грушевка, Уручье, Каменная Горка/горка — у обеих осей
// один и тот же slug. Запрос вида «бц грушевка» не различает эти два смысла,
// а у нас на него отвечали 2 разные страницы, причём микрорайонная —
// заведомо беднее (проверка по базе 2026-09-21: 2 БЦ в микрорайоне против 6
// в радиусе станции для Грушевки, 2 против 5 для Уручья, 3 против 4 для
// Каменной Горки — станция всегда полнее). Решение — не плодить 2 слабые
// страницы под один и тот же запрос, а ссылаться и редиректить (см.
// vercel.json) на страницу станции; она же дособирает недостающие по 2GIS
// зданиями микрорайона через METRO_MICRODISTRICT_ALIAS ниже, чтобы редирект
// никого не терял.
const MICRODISTRICT_METRO_COLLISION_SLUGS = new Set(['grushevka', 'uruchye', 'kamennaya-gorka']);

// Сухарево — отдельный случай той же природы, но не по имени, а по составу:
// проверка по базе 2026-09-21 показала, что оба БЦ микрорайона и все БЦ
// улицы «ул. Лобанка» по городу — это буквально одни и те же 2 здания
// (единственная улица в городе с 2GIS-контуром микрорайона 1:1). Разные
// формулировки запроса («сухарево» / «на лобанка»), но содержимое страниц
// дословно совпало бы — тот же дубль, что и у метро, просто без коллизии
// в названии. Решение то же: /microrayon/suharevo редиректит на хаб улицы.
function microdistrictMergeUrl(microdistrict: string, slug: string): string | null {
  if (MICRODISTRICT_METRO_COLLISION_SLUGS.has(slug)) {
    const stationName = METRO_SLUG_TO_STATION[slug];
    if (stationName) return metroHubUrl(stationName);
  }
  if (microdistrict === 'Сухарево') return streetHubUrl('ул. Лобанка');
  return null;
}

export function microdistrictHubUrl(microdistrict: string): string | null {
  const slug = MICRODISTRICT_SLUGS[microdistrict];
  if (!slug) return null;
  return microdistrictMergeUrl(microdistrict, slug) ?? `/minsk/bcminsk/microrayon/${slug}`;
}

// Хабы по станциям метро (аудит поиска 2026-09-07, «новые срезы: по станциям
// метро») — /minsk/bcminsk/metro/:metroSlug. Источник — структурные
// расстояния 2GIS (`BusinessCenter.nearestMetroStations`), не свободный
// текст `metro`: БЦ попадает на страницу станции, если она в пределах
// METRO_HUB_MAX_DISTANCE_M по прямой (≈15–20 минут пешком) — один БЦ может
// быть на страницах двух соседних станций, это честно («у метро X» и «у
// метро Y» одновременно). 38 БЦ без структурных данных (у них в `metro`
// «более 3 остановок на транспорте» или пусто) ни на один хаб не попадают.
// Слаги — транслитерация вручную, конечный список станций Минского метро,
// встречающихся в данных; хаб генерируется только для станций с ≥1 БЦ
// (см. prerender.mjs / generate-sitemap.mjs — динамический список).
// Порог индексации ПРОИЗВОДНЫХ срезов каталога — улицы, микрорайона и
// «класс + район» (Ш2 плана docs/bc-catalog-seo-plan.md). Это подразделы, а
// не самостоятельные разделы: когда в таком срезе одно-два здания, страница
// почти дословно повторяет карточку БЦ — тот же адрес, та же фотография, те
// же цифры — и уходит в индекс конкурировать с ней же. Аудит 2026-09-22
// показал 19 таких срезов из 48 страниц раздела, на которые к тому же не
// вело ни одной внутренней ссылки. Район, класс, метро и «строящиеся» под
// порог НЕ попадают: у них собственный спрос в выдаче и свои входящие
// ссылки, даже когда зданий мало.
export const MIN_INDEXABLE_HUB_CENTERS = 3;

export const METRO_HUB_MAX_DISTANCE_M = 1500;

export const METRO_STATION_SLUGS: Record<string, string> = {
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

export const METRO_SLUG_TO_STATION: Record<string, string> = Object.fromEntries(
  Object.entries(METRO_STATION_SLUGS).map(([name, slug]) => [slug, name]),
);

export function metroHubUrl(station: string): string | null {
  const slug = METRO_STATION_SLUGS[station];
  return slug ? `/minsk/bcminsk/metro/${slug}` : null;
}

// Расстояние по прямой от БЦ до станции, если станция в радиусе хаба; иначе null.
export function metroHubDistance(center: Pick<BusinessCenter, 'nearestMetroStations'>, station: string): number | null {
  const match = center.nearestMetroStations.find((s) => s.name === station && s.distanceMeters <= METRO_HUB_MAX_DISTANCE_M);
  return match ? match.distanceMeters : null;
}

// Обратная сторона коллизии микрорайон/метро (см. MICRODISTRICT_METRO_COLLISION_SLUGS
// выше): станция и микрорайон физически один и тот же кусок города, но 2GIS
// не всем зданиям района проставляет расстояние до станции — реальный
// случай, БЦ «Каменногорский» помечен microdistrict='Каменная Горка', но в
// nearestMetroStations записи про станцию «Каменная горка» нет вовсе.
// Отдавая станции роль единственного хаба на этот топоним, нельзя молча
// терять такие здания — хаб станции берёт их в объединение по названию
// микрорайона, а не только по дистанции.
const METRO_MICRODISTRICT_ALIAS: Record<string, string> = {
  Грушевка: 'Грушевка',
  Уручье: 'Уручье',
  'Каменная горка': 'Каменная Горка',
};

export function metroHubIncludesMicrodistrict(center: Pick<BusinessCenter, 'microdistrict'>, station: string): boolean {
  const microdistrict = METRO_MICRODISTRICT_ALIAS[station];
  return microdistrict != null && center.microdistrict === microdistrict;
}

// Хабы по улицам (аудит поиска 2026-09-07, «новые срезы: по улицам/
// локациям») — /minsk/bcminsk/ulitsa/:streetSlug. Владелец спросил
// напрямую, не выйдет ли «1 БЦ = 1 улица» — проверено по реальным адресам
// перед стартом: из 92 улиц с БЦ в каталоге у 23 реально 2+ здания (74 БЦ
// из 143), остальные 69 — по одной улице, для них хаб не заводится (была
// бы дублем карточки самого здания). Слаги — транслитерация вручную,
// конечный список, тот же принцип, что у METRO_STATION_SLUGS/
// MICRODISTRICT_SLUGS. Улица вычисляется на лету функцией
// `streetOfAddress` (businessCenterDisplay.ts), не хранится отдельным
// полем — этот список просто фиксирует, у каких названий есть готовый slug.
export const STREET_SLUGS: Record<string, string> = {
  'пр-т Победителей': 'pr-t-pobediteley',
  'пр-т Независимости': 'pr-t-nezavisimosti',
  'пр-т Дзержинского': 'pr-t-dzerzhinskogo',
  'ул. Притыцкого': 'ul-pritytskogo',
  'ул. Сурганова': 'ul-surganova',
  'ул. Платонова': 'ul-platonova',
  'ул. Клары Цеткин': 'ul-klary-tsetkin',
  'пер. Козлова': 'per-kozlova',
  'пр-т Партизанский': 'pr-t-partizanskiy',
  'Логойский тракт': 'logoyskiy-trakt',
  'ул. Хоружей': 'ul-horuzhey',
  'ул. Филимонова': 'ul-filimonova',
  'ул. Немига': 'ul-nemiga',
  'ул. Мележа': 'ul-melezha',
  'ул. Толбухина': 'ul-tolbuhina',
  'ул. Железнодорожная': 'ul-zheleznodorozhnaya',
  'ул. Интернациональная': 'ul-internatsionalnaya',
  'ул. Лобанка': 'ul-lobanka',
  'ул. Ольшевского': 'ul-olshevskogo',
  'ул. Свердлова': 'ul-sverdlova',
  'ул. Скрыганова': 'ul-skryganova',
  'ул. Тимирязева': 'ul-timiryazeva',
  'ул. Скорины': 'ul-skoriny',
};

export const STREET_SLUG_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STREET_SLUGS).map(([name, slug]) => [slug, name]),
);

export function streetHubUrl(street: string): string | null {
  const slug = STREET_SLUGS[street];
  return slug ? `/minsk/bcminsk/ulitsa/${slug}` : null;
}
