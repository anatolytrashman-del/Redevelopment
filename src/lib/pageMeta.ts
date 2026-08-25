// Сайт — SPA с одним index.html на все роуты, а его <title>/description/og
// заточены под Red One статически (см. CLAUDE.md про SEO). Для остальных
// публичных лендингов объектов (сейчас — Red Storage, в будущем — новые)
// это выдавало бы чужой заголовок в поиске и соцсетях. setObjectPageMeta
// подменяет теги на актуальные при монтировании ObjectLandingPage — статика
// в index.html остаётся верным дефолтом до первой перерисовки и для ботов,
// которые не выполняют JS (у Яндекса это менее надёжно, чем у Google).
export interface PageMeta {
  title: string;
  description: string;
}

// Вручную подобранные title/description под целевые поисковые запросы —
// заполняются по мере проработки SEO для конкретных объектов (см. CLAUDE.md).
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

function setMetaContent(selector: string, content: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

function setLinkHref(selector: string, href: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute('href', href);
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
