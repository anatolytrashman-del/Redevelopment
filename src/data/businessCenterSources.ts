// Полный список внешних источников, из которых на сайте берутся данные.
// Владелец, 2026-09-22: «дополни список всеми источниками данных на сайте
// вообще, даже если это onliner или wikipedia» — то есть попап «Источники»
// (см. SourcesTrademarkNote) перестал быть списком только каталожных
// агрегаторов и описывает весь сайт: карты, площадки объявлений,
// отраслевую аналитику с публичных страниц /minsk/analytics/*, гид по
// району и СМИ, на которые ссылаются карточки зданий.
//
// Здесь лежат только ПОСТОЯННЫЕ источники, которых нет в базе. Сайты
// конкретных БЦ/застройщиков и издания из публикаций подтягиваются из
// business_centers на лету (src/lib/businessCenterSourcesApi.ts) — иначе
// список пришлось бы править руками после каждой новой карточки.

export interface DataSource {
  label: string;
  href: string;
  // Одной строкой — что именно источник даёт сайту. Без этого список
  // читается как набор логотипов «мы тут со всеми дружим», а не как
  // отчёт о происхождении цифр.
  note: string;
}

export interface DataSourceGroup {
  title: string;
  sources: DataSource[];
}

export const DATA_SOURCE_GROUPS: DataSourceGroup[] = [
  {
    title: 'Карты и справочники организаций',
    sources: [
      {
        label: 'Яндекс.Карты',
        href: 'https://yandex.by/maps/',
        note: 'рейтинг и отзывы о зданиях, арендаторы, места рядом',
      },
      {
        label: '2ГИС',
        href: 'https://2gis.by/',
        note: 'карточки зданий и организаций, рейтинг, координаты',
      },
      {
        label: 'prometr.by',
        href: 'https://prometr.by/',
        note: 'справочник бизнес-центров Минска: класс, площади, арендаторы',
      },
    ],
  },
  {
    title: 'Площадки объявлений',
    sources: [
      { label: 'Kufar', href: 'https://re.kufar.by/', note: 'объявления об аренде и продаже помещений' },
      { label: 'Realt.by', href: 'https://realt.by/', note: 'объявления об аренде и продаже помещений' },
      { label: 'Domovita.by', href: 'https://domovita.by/', note: 'объявления об аренде и продаже помещений' },
      { label: 'Megapolis-real.by', href: 'https://megapolis-real.by/', note: 'объявления об аренде и продаже помещений' },
      { label: 'Garantiruem.by', href: 'https://garantiruem.by/', note: 'объявления об аренде и продаже помещений' },
      { label: 'Pro-N.by', href: 'https://pro-n.by/', note: 'объявления об аренде и продаже помещений' },
      {
        label: 'bir.by',
        href: 'https://bir.by/',
        note: 'предложения застройщика на первичном рынке Минск Мира',
      },
    ],
  },
  {
    title: 'Отраслевая аналитика и официальная статистика',
    sources: [
      {
        label: '«Твоя столица»',
        href: 'https://www.t-s.by/analytics/',
        note: 'классификация бизнес-центров Минска, мониторинг ставок, обзор складов',
      },
      {
        label: 'Colliers International',
        href: 'https://www.colliers.com/',
        note: 'вакантность, общий объём и ввод офисных площадей по городу',
      },
      {
        label: '«Результативная недвижимость» (belretail.by)',
        href: 'https://belretail.by/',
        note: 'вакантность и ставки качественных БЦ, торговая недвижимость',
      },
      {
        label: 'NAI Belarus (через probusiness.io)',
        href: 'https://probusiness.io/',
        note: 'обзор складской недвижимости Минска и пригорода',
      },
      {
        label: 'Госкомимущество',
        href: 'https://gki.gov.by/',
        note: 'число зарегистрированных сделок и их оборот (по официальным публикациям)',
      },
    ],
  },
  {
    title: 'Энциклопедии и фотоматериалы',
    sources: [
      {
        label: 'Википедия',
        href: 'https://ru.wikipedia.org/',
        note: 'справочные факты о районах и крупных проектах',
      },
      {
        label: 'Instagram @promir_by',
        href: 'https://www.instagram.com/promir_by/',
        note: 'фотографии района Минск Мир',
      },
      {
        label: 'Domovita.by (карточка БЦ «Футурис»)',
        href: 'https://domovita.by/bc-bcfuturis',
        note: 'фото здания для дефолтной заглушки хаб-страниц каталога, когда у подборки нет своего фото',
      },
    ],
  },
];

// Хосты постоянных источников — чтобы издание или площадка, уже названные
// выше, не попали во второй раз в подтянутые из базы списки.
export const STATIC_SOURCE_HOSTS = new Set(
  DATA_SOURCE_GROUPS.flatMap((g) =>
    g.sources.map((s) => new URL(s.href).host.replace(/^www\./, '')),
  ).flatMap((host) => {
    // re.kufar.by и ru.wikipedia.org встречаются в ссылках и без
    // поддомена, и с другим — сверяем по домену второго уровня тоже.
    const parts = host.split('.');
    const second = parts.length > 2 ? parts.slice(-2).join('.') : host;
    return second === host ? [host] : [host, second];
  }),
);

// Издания, признанные в Беларуси экстремистскими, в публичном списке
// источников не показываем — владелец, 2026-09-22: «все, кроме запрещённых
// экстремистских ресурсов». Список публикаций подтягивается из базы, а
// значит одна невнимательная карточка завела бы такую ссылку на публичную
// страницу сама собой; отбор материалов в подборку «СМИ о здании» это же
// требование содержит (docs/bc-media-research-brief.md), фильтр здесь —
// второй рубеж на случай, если мимо него что-то прошло. Сверяется по
// домену второго уровня; пополняется руками, не из какого-либо реестра.
export const BLOCKED_SOURCE_HOSTS = new Set([
  'tut.by',
  'zerkalo.io',
  'nashaniva.com',
  'nn.by',
  'belsat.eu',
  'charter97.org',
  'svaboda.org',
  'euroradio.fm',
  'citydog.io',
  'kyky.org',
]);
