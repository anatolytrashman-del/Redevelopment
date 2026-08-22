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
  const url = `https://redevelopment.pro/${slug}`;

  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setLinkHref('link[rel="canonical"]', url);

  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  if (image) {
    setMetaContent('meta[property="og:image"]', image);
    setMetaContent('meta[name="twitter:image"]', image);
  }

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
