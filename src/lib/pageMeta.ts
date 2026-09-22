// Сайт — SPA с одним index.html на все роуты, а его <title>/description/og
// заточены под Red One статически (см. docs/session-journal.md про SEO). Для остальных
// публичных лендингов объектов (сейчас — Red Storage, в будущем — новые)
// это выдавало бы чужой заголовок в поиске и соцсетях. setObjectPageMeta
// подменяет теги на актуальные при монтировании ObjectLandingPage — статика
// в index.html остаётся верным дефолтом до первой перерисовки и для ботов,
// которые не выполняют JS (у Яндекса это менее надёжно, чем у Google).
import { pluralRu } from './pluralRu';
import { fullName, shortAddress, shortName } from './businessCenterDisplay';
import { fitsSerpTitle } from './serpTitleWidth';

export interface PageMeta {
  title: string;
  description: string;
}

// Вручную подобранные title/description под целевые поисковые запросы —
// заполняются по мере проработки SEO для конкретных объектов (см. docs/session-journal.md).
// У остальных — сгенерированные из данных объекта (см. fallbackObjectMeta),
// корректные, но без ручной подгонки под ключевые слова.
const SEO_OVERRIDES: Record<string, PageMeta> = {
  one: {
    title: 'Офисы и помещения в Минск Мире — деловой центр Red One',
    description:
      'Офисы и помещения в Минск Мире: приватные кабинеты и фиксированные рабочие места от $12 000 в клубном деловом центре Red One',
  },
};

export function fallbackObjectMeta(input: {
  name: string;
  address: string;
  status: string;
  area: number;
  startPrice: number;
}): PageMeta {
  const title = input.name ? `${input.name} — ${input.address}` : input.address;
  const parts = [input.status || 'Объект недвижимости', input.address];
  if (input.area) parts.push(`${input.area} м²`);
  if (input.startPrice) parts.push(`от $${Math.round(input.startPrice).toLocaleString('ru-RU')}`);
  return { title, description: parts.join(' · ') };
}

// Для клиентских ссылок, которые не должны попадать в индекс (токен-страницы
// вида /plan/:token, /tz/:token, /summary/:token — рассылаются в мессенджеры/
// почту и могут содержать данные конкретного клиента) и для soft-404 (когда
// /:slug не совпал ни с одним объектом, но роут отдаёт 200, см. App.tsx).
// Именно noindex, а не Disallow в robots.txt — закрытая в robots страница не
// получит noindex-тег и всё равно может попасть в индекс по внешней ссылке.
// Вызывающий код обязан сбросить тег при размонтировании (см. useNoIndex).
export function setNoIndex() {
  setMetaContent('meta[name="robots"]', 'noindex, nofollow');
}

export function clearNoIndex() {
  setMetaContent('meta[name="robots"]', 'index, follow');
}

// Google отключил FAQ rich results (май 2026), эта разметка не ради
// сниппета — её читают AI-краулеры/Яндекс/Bing (см. SEO_PLAN.md, Э1-7).
export function setFaqJsonLd(items: { question: string; answer: string }[]) {
  const ld = document.getElementById('faq-json-ld');
  if (!ld) return;
  // Пустой список — это «FAQ у страницы нет», а не «FAQ из нуля вопросов»:
  // до 2026-09-22 сюда уезжал скелет {"@type":"FAQPage","mainEntity":[]},
  // и страница без вопросов (soft-404, состояние каталога под фильтром,
  // любой SPA-переход на страницу без FAQ) отдавала валидатору пустую
  // разметку FAQPage вместо отсутствия разметки. Тот же приём, что у
  // setItemListJsonLd/setBreadcrumbJsonLd ниже.
  if (items.length === 0) {
    ld.textContent = '';
    return;
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  });
}

// Общая og/twitter-заглушка (см. index.html) — на неё сбрасываем og:image,
// когда у страницы нет собственной картинки, чтобы при SPA-переходах не
// оставалась картинка предыдущей страницы.
const DEFAULT_OG_IMAGE = 'https://redevelopment.pro/og-image.png';

// Для контентных страниц вне сущности "объект" (гиды, будущий кластер
// поддержки — Э3-1/Э3-3 в SEO_PLAN.md) — та же подмена тегов, что у
// setObjectPageMeta, но без RealEstateListing/offers, которых у гида нет.
// object-json-ld при этом очищается — иначе на гиде осталась бы разметка
// последнего открытого объекта. image/ogType — опциональны: гид передаёт
// собственное превью (иначе в соцсетях/мессенджерах уходит заглушка
// Red One, нерелевантная контентной странице) и og:type='article'.
export function setGenericPageMeta(meta: PageMeta & { url: string; image?: string; ogType?: 'website' | 'article' }) {
  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setLinkHref('link[rel="canonical"]', meta.url);

  setMetaContent('meta[property="og:type"]', meta.ogType ?? 'website');
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', meta.url);
  setMetaContent('meta[property="og:image"]', meta.image ?? DEFAULT_OG_IMAGE);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  setMetaContent('meta[name="twitter:image"]', meta.image ?? DEFAULT_OG_IMAGE);
  setMetaContent('meta[name="robots"]', 'index, follow');

  const objectLd = document.getElementById('object-json-ld');
  setOrganizationJsonLd(false);
  setItemListJsonLd(null);
  if (objectLd) objectLd.textContent = '';
  // Страничные JSON-LD (крошки/Article/FAQ) страница задаёт сама ПОСЛЕ этого
  // вызова — здесь сбрасываем, чтобы при SPA-переходе на страницу без
  // собственной разметки не остались данные предыдущей (например, FAQ гида
  // на хабе /minsk).
  setBreadcrumbJsonLd(null);
  clearPageJsonLd();
}

function clearPageJsonLd() {
  for (const id of ['article-json-ld', 'faq-json-ld']) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  }
}

// BreadcrumbList — цепочка "Минск → страница" для сниппетов Google/Яндекса
// (оба поддерживают; Яндексу помогает и с пониманием структуры сайта).
// Последний элемент по спецификации может быть без item (текущая страница).
export function setBreadcrumbJsonLd(items: { name: string; url?: string }[] | null) {
  const ld = document.getElementById('breadcrumb-json-ld');
  if (!ld) return;
  if (!items || items.length === 0) {
    ld.textContent = '';
    return;
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  });
}

// Свежесть страницы — часть смысла гидов (Э3-1): датированный контент
// весомее для цитирования AI-системами. dateModified обновлять вручную
// при каждом квартальном пересмотре текста. publisher/author — Organization
// Redevelopment (Google просит их у Article для полного сниппета; отдельной
// страницы компании пока нет — url ведёт на корень, этого достаточно).
export function setArticleJsonLd(article: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  image?: string;
}) {
  const ld = document.getElementById('article-json-ld');
  if (!ld) return;
  const org = { '@type': 'Organization', name: 'Redevelopment', url: 'https://redevelopment.pro' };
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.headline,
    description: article.description,
    url: article.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
    inLanguage: 'ru',
    datePublished: article.datePublished,
    dateModified: article.dateModified,
    ...(article.image ? { image: [article.image] } : {}),
    author: org,
    publisher: org,
  });
}

// Organization — только на хабе /minsk (аудит поиска 2026-09-07: «Organization
// на главной»). Отдельный слот в index.html, не article-json-ld — у хаба
// нет статьи, а у гидов/каталога Article нужен сам по себе. Остальные
// страницы вызывают с false при монтировании (через setGenericPageMeta/
// setObjectPageMeta/setBusinessCenterPageMeta), чтобы при SPA-переходе с
// хаба разметка организации не оставалась на чужой странице.
// ItemList — для рейтинговых/подборочных страниц (аудит поиска 2026-09-07,
// «Лучшие бизнес-центры Минска — с методикой и датой»): каждый пункт —
// ссылка на настоящую карточку БЦ с её позицией в списке. Единственный
// потребитель — BusinessCentersRankingPage, но слот и чистка централизованы
// здесь же, тем же паттерном, что и Organization (см. ниже) — на любой
// другой странице (setGenericPageMeta/setObjectPageMeta/
// setBusinessCenterPageMeta) слот принудительно очищается, чтобы при
// SPA-переходе не осталась разметка чужого рейтинга.
export function setItemListJsonLd(items: { name: string; url: string }[] | null) {
  const ld = document.getElementById('itemlist-json-ld');
  if (!ld) return;
  if (!items || items.length === 0) {
    ld.textContent = '';
    return;
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  });
}

// Place — разметка здания на карточке БЦ (Б12 плана
// docs/bc-catalog-redesign-plan.md). Именно Place, а не LocalBusiness:
// бизнес-центр — это объект на карте, а не наша организация и не
// организация владельца, о работе которой мы ничего не утверждаем.
// AggregateRating сюда НЕ кладётся сознательно (решение из
// BCMINSK_SEO_PLAN.md): чужие оценки мы показываем, но не выдаём за свои
// агрегаты и не размечаем как рейтинг страницы.
export function setPlaceJsonLd(
  place: {
    name: string;
    altNames?: string[];
    url: string;
    address: string;
    image?: string;
    lat?: number | null;
    lng?: number | null;
    amenities?: string[];
  } | null,
) {
  const ld = document.getElementById('place-json-ld');
  if (!ld) return;
  if (!place) {
    ld.textContent = '';
    return;
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: place.name,
    // alternateName — стандартное место для второго имени здания (БЦ «V» =
    // «Столица»): тот же объект, а не отдельное место на карте.
    ...(place.altNames && place.altNames.length > 0
      ? { alternateName: place.altNames.length === 1 ? place.altNames[0] : place.altNames }
      : {}),
    url: place.url,
    ...(place.image ? { image: place.image } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.address,
      addressLocality: 'Минск',
      addressCountry: 'BY',
    },
    ...(place.lat != null && place.lng != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lng } }
      : {}),
    ...(place.amenities && place.amenities.length > 0
      ? {
          amenityFeature: place.amenities.map((name) => ({
            '@type': 'LocationFeatureSpecification',
            name,
            value: true,
          })),
        }
      : {}),
  });
}

export function setOrganizationJsonLd(enabled: boolean) {
  const ld = document.getElementById('organization-json-ld');
  if (!ld) return;
  if (!enabled) {
    ld.textContent = '';
    return;
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Redevelopment',
    url: 'https://redevelopment.pro',
    logo: 'https://redevelopment.pro/apple-touch-icon.png',
    image: DEFAULT_OG_IMAGE,
    description:
      'Редевелопмент коммерческой недвижимости в Минске: справочник бизнес-центров, гиды по районам и аналитика рынка.',
    areaServed: { '@type': 'City', name: 'Минск' },
  });
}

// Dataset — для бенчмарк-страниц аналитики рынка (ANALYTICSPLAN.md §4.1,
// п.13): сигнализирует AI-обзорам/поисковикам, что цифры на странице —
// не просто текст, а размеченный набор данных с датой сбора и лицензией.
export function setDatasetJsonLd(dataset: {
  name: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
  measurementTechnique?: string;
} | null) {
  const ld = document.getElementById('dataset-json-ld');
  if (!ld) return;
  if (!dataset) {
    ld.textContent = '';
    return;
  }
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: dataset.name,
    description: dataset.description,
    url: dataset.url,
    license: 'https://redevelopment.pro/minsk/analytics/metodika',
    creator: { '@type': 'Organization', name: 'Redevelopment', url: 'https://redevelopment.pro' },
    datePublished: dataset.datePublished,
    dateModified: dataset.dateModified,
    temporalCoverage: dataset.dateModified,
    ...(dataset.measurementTechnique ? { measurementTechnique: dataset.measurementTechnique } : {}),
  });
}

function setMetaContent(selector: string, content: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

function setLinkHref(selector: string, href: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute('href', href);
}

// Отдельная страница бизнес-центра (/minsk/bcminsk/:slug, владелец,
// 2026-09-04: "в идеале бы, чтобы у страницы был отдельный урл... для SEO
// лучше хаб + отдельная страница на каждый БЦ") — та же механика подмены
// тегов, что и у setObjectPageMeta, но данные не из "объектов", а из
// business_centers (см. data/businessCenters.ts), и RealEstateListing без
// offers (там нет цены/сделки, это справочная карточка здания, не лендинг
// бронирования).
//
// Формат сниппета задал владелец 2026-09-22, увидев страницу в выдаче
// Google: title — «Бизнес-центр <имя> — полный обзор <год>», description —
// «Актуальная аналитика бизнес-центра <имя>. Обновляется ежемесячно.
// <что внутри>». До этого адрес в title стоял ДВАЖДЫ («Бизнес-центр на
// Жуковского, 11А — г. Минск, ул. Жуковского, 11А»), и Google переписывал
// заголовок сам, а description («Класс C, 4 794 м², сдан в 2016 г.»)
// выбрасывал и собирал свой из FAQ — оба признака того, что теги его не
// устроили.
//
// Три вещи в формуле держатся не на вкусе, а на замерах, снимать их нельзя:
//  1. Перечисляем ТОЛЬКО разделы, которые у этого здания реально есть
//     (предложения — у 107 из 141, отзывы — у меньшей части). Обещание
//     того, чего на странице нет, Google снимает, подменяя описание своим.
//  2. В двух пунктах стоят числа. Полностью одинаковое описание на 141
//     странице — это duplicate meta descriptions, ровно та причина, по
//     которой описание и переписывают; имя плюс числа делают каждое своим.
//  3. Адрес идёт сразу за именем: в запросе человек печатает либо имя,
//     либо адрес, и совпадение слов запроса с описанием — главное, что
//     удерживает Google от подмены.
//
// Ширина title считается в ПИКСЕЛЯХ, а не в символах (Arial 20px, порог
// ~600px на десктопе): «Бизнес-центр Terrum — полный обзор» — 357px, оно же
// с «(обновляется ежемесячно)» — 614px, то есть обрезалось бы у КАЖДОГО
// здания каталога. Поэтому «обновляется ежемесячно» живёт в описании, где
// бюджет 160 знаков. Проверка формулы по всему каталогу —
// `node scripts/check-bc-snippets.mjs` (печатает переполнения по пикселям).
//
// «Полный обзор <год>» и «Обновляется ежемесячно» — обещания, которые
// обязан подтверждать пререндер: он пересобирается только при изменении
// кода публичных страниц или сохранении БЦ, поэтому 1-го числа каждого
// месяца pg_cron ставит отметку в deploy_debounce с scope='business_centers'
// (миграция 20260922-monthly-prerender-refresh.sql) — иначе в выдаче
// повиснет прошлогодний год.
export interface BusinessCenterComposition {
  organizationCount: number;
  infrastructure: string[];
  // Ниже — присутствие блоков на самой странице. Источник у всех один:
  // pageSections в BusinessCenterDetailPage.tsx, то есть описание не может
  // пообещать раздел, которого человек не увидит, перейдя по ссылке.
  rentOfferCount?: number;
  saleOfferCount?: number;
  hasReviews?: boolean;
  hasNearbyInfrastructure?: boolean;
}

// Вторые названия здания в кавычках-ёлочках: «Столица» или «Столица», «Виктория».
function quoteNames(names: string[]): string {
  return names.map((name) => `«${name.replace(/^[«"']|[»"']$/gu, '')}»`).join(', ');
}

// Бюджет описания: десктопная выдача обрезает примерно здесь. Меньше — не
// страшно, больше — хвост не доедет до читателя.
const DESCRIPTION_BUDGET = 160;

// Заголовочная форма имени: «Бизнес-центр Terrum», «Бизнес-центр МФЦ
// (Минск Мир)», а у зданий без собственного имени — «Бизнес-центр на
// Жуковского, 11А» (эту форму из адреса в скобках собирает fullName).
// Кавычек-ёлочек вокруг имени тут нет сознательно: в заголовке они стоят
// 10 пикселей и ничего не проясняют, а формат задан владельцем как
// «Бизнес-центр Terrum — полный обзор».
function headingName(center: { slug?: string; name: string }): string {
  const full = fullName(center);
  if (full.startsWith('Бизнес-центр на ')) return full;
  return `Бизнес-центр ${shortName({ slug: center.slug ?? '', name: center.name })}`;
}

export function fallbackBusinessCenterMeta(
  center: {
    slug?: string;
    name: string;
    altNames?: string[];
    address: string;
    businessClass: string | null;
    totalArea: number | null;
    yearBuilt: number | null;
    status: string;
    // Есть ли в каталоге другое здание с таким же коротким именем (см.
    // заголовок ниже). Знает об этом только страница, держащая весь список.
    ambiguousName?: boolean;
  },
  composition?: BusinessCenterComposition | null,
): PageMeta {
  // Второе имя обязано стоять в title: по Wordstat «бизнес центр столица
  // минск» ищут чаще, чем это же здание под его основным именем «V», а до
  // 2026-09-20 слова «Столица» на странице не было вовсе.
  const altNames = (center.altNames ?? []).filter((name) => name.trim());
  const alsoKnown = altNames.length > 0 ? ` (${quoteNames(altNames)})` : '';
  const heading = headingName(center);
  const named = !heading.startsWith('Бизнес-центр на ');
  // Год берётся из даты сборки, а не зашит константой: страницу пререндерит
  // Vercel, и 1 января заголовок должен смениться сам.
  const year = new Date().getFullYear();
  // В каталоге есть два РАЗНЫХ здания с одним именем («Порт» на
  // Независимости, 177 и «Порт» на Шафарнянской, 11). Заголовок без адреса
  // сделал бы их страницы неразличимыми — две страницы с одинаковым title
  // конкурируют между собой в выдаче и обе проигрывают. Признак приходит от
  // страницы: она одна видит весь каталог, отдельная запись — нет.
  // Уточнение в скобках («пр-т Независимости, 177 (мкр. Уручье)») из
  // заголовка снимается: различить тёзок хватает улицы с домом, а скобка
  // стоит 160 пикселей — ровно настолько заголовок и вылезал за обрезку.
  const addressForTitle = shortAddress(center.address).replace(/\s*\([^)]*\)\s*$/u, '');
  const disambiguated = named && center.ambiguousName ? `${heading}, ${addressForTitle}` : heading;
  // Заголовок собирается от самого полного варианта к самому короткому, и
  // берётся первый, который не выходит за обрезку выдачи: обрезка съедает
  // именно хвост, то есть ровно то, ради чего формат и задумывался
  // («…— полный обз…»). Порядок уступок — сначала второе имя здания, потом
  // слово «полный». Второе имя у выпавших зданий остаётся в описании, а
  // адрес у зданий-тёзок не снимается никогда: без него вернётся дубль.
  const bases = [`${disambiguated}${alsoKnown}`, disambiguated];
  const candidates = [` — полный обзор ${year}`, ` — обзор ${year}`].flatMap((tail) =>
    bases.map((base) => `${base}${tail}`),
  );
  const title = candidates.find(fitsSerpTitle) ?? candidates[candidates.length - 1];

  // «Бизнес-центр на Жуковского, 11А» в родительном падеже — это
  // «бизнес-центра на Жуковского, 11А»: адрес уже внутри имени, второй раз
  // его дописывать не нужно. У именованного здания адрес идёт отдельно.
  // Адрес идёт через запятую, а не с предлогом «на»: названия улиц в базе
  // лежат в именительном падеже («ул. Московская, 22»), и «на ул. Московская»
  // — брак, а склонять их кодом нельзя (Жуковского, Мясникова, Гамарника,
  // Логойский тракт — четыре разные модели). У безымянного здания адрес уже
  // внутри имени («бизнес-центра на Жуковского, 11А»), второй раз не нужен.
  const subject = named
    ? `бизнес-центра ${shortName({ slug: center.slug ?? '', name: center.name })}${alsoKnown}, ${shortAddress(center.address)}`
    : `бизнес-центра ${heading.slice('Бизнес-центр '.length)}`;

  // Порядок пунктов — владельца (отзывы → арендаторы → инфраструктура →
  // помещения → здание). Пункт встаёт в строку только если соответствующий
  // блок на странице есть.
  const items: { kind: string; text: string }[] = [];
  if (composition?.hasReviews) items.push({ kind: 'reviews', text: 'отзывы' });
  const tenants = composition?.organizationCount ?? 0;
  if (tenants > 0) {
    items.push({
      kind: 'tenants',
      text: `каталог из ${tenants} ${pluralRu(tenants, 'арендатора', 'арендаторов', 'арендаторов')}`,
    });
  }
  if (composition?.hasNearbyInfrastructure) items.push({ kind: 'nearby', text: 'инфраструктура рядом' });
  const rent = composition?.rentOfferCount ?? 0;
  const sale = composition?.saleOfferCount ?? 0;
  const lots = (n: number) => pluralRu(n, 'помещение', 'помещения', 'помещений');
  const offers =
    rent > 0 && sale > 0
      ? `${rent} ${lots(rent)} в аренду и ${sale} на продажу`
      : rent > 0
        ? `${rent} ${lots(rent)} в аренду`
        : sale > 0
          ? `${sale} ${lots(sale)} на продажу`
          : null;
  if (offers) items.push({ kind: 'offers', text: offers });

  // Последним пунктом — «информация о здании». Где класс и площадь
  // заполнены, они подставляются прямо в него: у здания без предложений и
  // без отзывов это единственные числа в описании, а без единого числа
  // описания 141 страницы различались бы только именем.
  const facts: string[] = [];
  if (center.businessClass) facts.push(`класс ${center.businessClass}`);
  if (center.totalArea) facts.push(`${center.totalArea.toLocaleString('ru-RU')} м²`);
  items.push({
    kind: 'building',
    text: facts.length > 0 ? `информация о здании: ${facts.join(', ')}` : 'информация о здании',
  });

  const head = `Актуальная аналитика ${subject}. Обновляется ежемесячно.`;
  // Порядок ПЕЧАТИ — владельца, порядок ВЫБЫВАНИЯ — обратный ценности:
  // пять пунктов с адресом в бюджет не помещаются никогда, и если снимать
  // просто с конца, то первым всегда выпадало бы «N помещений в аренду» —
  // единственная строка, ради которой на такую страницу приходят из поиска.
  // Уходят сначала самые общие: информация о здании, потом инфраструктура.
  const dropOrder = ['building', 'nearby', 'reviews', 'tenants', 'offers'];
  const shown = [...items];
  const assemble = () => `${head} ${capitalizeFirst(shown.map((i) => i.text).join(', '))}.`;
  for (const kind of dropOrder) {
    if (shown.length <= 1 || assemble().length <= DESCRIPTION_BUDGET) break;
    const index = shown.findIndex((item) => item.kind === kind);
    if (index >= 0) shown.splice(index, 1);
  }

  return { title, description: assemble() };
}

// Описание подборки каталога — тот же формат, что у карточки БЦ (владелец,
// 2026-09-22): «Актуальная аналитика … Обновляется ежемесячно. <что внутри>».
// До этого у всех подборок описание было одним и тем же скелетом («адреса,
// деловой класс, площадь, метро»), и на четырёх десятках страниц это
// duplicate meta descriptions — ровно та причина, по которой Google
// подменяет описание своим текстом. Число зданий делает каждую подборку
// своей и заодно отвечает на вопрос, ради которого на неё и заходят.
// `subject` — родительный падеж («бизнес-центров класса B+ в Минске»),
// `count` — null, пока каталог не загружен.
const HUB_SNIPPET_ITEMS = [
  'цены аренды и продажи',
  'отзывы',
  'каталоги арендаторов',
  'инфраструктура рядом',
  'класс, площадь и метро',
];

export function businessCenterHubDescription(subject: string, count: number | null): string {
  const head = `Актуальная аналитика ${count === null ? '' : `${count} `}${subject}. Обновляется ежемесячно.`;
  // Пункты снимаются с конца, пока строка не влезет в бюджет: у подборки
  // все они равноценны (это оглавление раздела, а не находки конкретного
  // здания), поэтому приоритета выбывания тут, в отличие от карточки, нет.
  const shown = [...HUB_SNIPPET_ITEMS];
  const assemble = () => `${head} ${capitalizeFirst(shown.join(', '))}.`;
  while (shown.length > 1 && assemble().length > DESCRIPTION_BUDGET) shown.pop();
  return assemble();
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function setBusinessCenterPageMeta(
  slug: string,
  center: {
    name: string;
    altNames?: string[];
    address: string;
    businessClass: string | null;
    totalArea: number | null;
    yearBuilt: number | null;
    status: string;
    ambiguousName?: boolean;
  },
  image?: string,
  composition?: BusinessCenterComposition | null,
) {
  // slug приходит отдельным аргументом, а shortName() (через
  // fallbackBusinessCenterMeta) ждёт его внутри записи — у одного здания,
  // «МФЦ (Минск Мир)», короткое имя задано именно по слагу.
  const meta = fallbackBusinessCenterMeta({ ...center, slug }, composition);
  const url = `https://redevelopment.pro/minsk/bcminsk/${slug}`;
  // Фото БЦ хранятся локальными путями (public/images/business-centers/...,
  // см. data/businessCenters.ts), не абсолютными URL, как у Supabase Storage
  // объектов — og:image/JSON-LD image по спецификации должны быть абсолютными
  // (соцсети/краулеры фетчат их напрямую, не относительно страницы).
  const absoluteImage = image ? new URL(image, 'https://redevelopment.pro').toString() : undefined;

  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setLinkHref('link[rel="canonical"]', url);

  setMetaContent('meta[property="og:type"]', 'website');
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[property="og:image"]', absoluteImage ?? DEFAULT_OG_IMAGE);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  setMetaContent('meta[name="twitter:image"]', absoluteImage ?? DEFAULT_OG_IMAGE);
  setMetaContent('meta[name="robots"]', 'index, follow');

  clearPageJsonLd();
  // Крошки задаёт сам вызывающий код СРАЗУ после этого вызова (нужен
  // shortName() центра, которого эта функция не знает) — здесь только сброс,
  // тот же порядок, что и у setObjectPageMeta.
  setBreadcrumbJsonLd(null);

  const ld = document.getElementById('object-json-ld');
  setOrganizationJsonLd(false);
  setItemListJsonLd(null);
  if (ld) {
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: fullName(center),
      description: meta.description,
      url,
      image: absoluteImage ?? DEFAULT_OG_IMAGE,
      address: {
        '@type': 'PostalAddress',
        streetAddress: center.address,
        addressCountry: 'BY',
      },
    });
  }
}

// slug — ключ в SEO_OVERRIDES (не обязательно совпадает с текущим URL: вызывающий
// код сам решает, что передавать). image — если есть, подменяет og:image/twitter:image
// на реальное фото объекта вместо общей заглушки og-image.png.
export function setObjectPageMeta(
  slug: string,
  object: { name: string; address: string; status: string; area: number; startPrice: number },
  image?: string,
) {
  const meta = SEO_OVERRIDES[slug] ?? fallbackObjectMeta(object);
  const url = `https://redevelopment.pro/minsk/${slug}`;

  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setLinkHref('link[rel="canonical"]', url);

  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  setMetaContent('meta[property="og:type"]', 'website');
  setMetaContent('meta[property="og:image"]', image ?? DEFAULT_OG_IMAGE);
  setMetaContent('meta[name="twitter:image"]', image ?? DEFAULT_OG_IMAGE);
  setBreadcrumbJsonLd(null);
  // ObjectLandingPage задаёт свой FAQ (setFaqJsonLd) сразу после этого
  // вызова — а Article-разметка гида на странице объекта неуместна всегда.
  clearPageJsonLd();

  // Публичная страница объекта найдена — сбрасываем возможный noindex,
  // оставшийся от предыдущего слага, если это не полный remount компонента
  // (например, переход между двумя лендингами объектов в рамках SPA).
  setMetaContent('meta[name="robots"]', 'index, follow');

  const ld = document.getElementById('object-json-ld');
  setOrganizationJsonLd(false);
  setItemListJsonLd(null);
  if (ld) {
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: meta.title,
      description: meta.description,
      url,
      image: image ?? 'https://redevelopment.pro/og-image.png',
      address: {
        '@type': 'PostalAddress',
        streetAddress: object.address,
        addressCountry: 'BY',
      },
      offers: object.startPrice
        ? {
            '@type': 'Offer',
            priceCurrency: 'USD',
            price: String(Math.round(object.startPrice)),
            availability: 'https://schema.org/InStock',
          }
        : undefined,
    });
  }
}
