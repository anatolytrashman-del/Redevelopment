import { tenantDirectionLabel } from '../data/tenantIndustries';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Accessibility,
  AlertTriangle,
  ArrowUpDown,
  ArrowLeft,
  Award,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  CreditCard,
  Dumbbell,
  DoorOpen,
  ExternalLink,
  FileText,
  Globe,
  HardHat,
  Info,
  Landmark,
  Leaf,
  Mail,
  MapPin,
  MessageSquareQuote,
  Newspaper,
  Palette,
  Phone,
  Presentation,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  UtensilsCrossed,
  Users,
  Waves,
} from 'lucide-react';
import { outletBrand } from '../data/mediaOutlets';
import { cn } from '../lib/cn';
import { renderBold } from '../lib/renderBold';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { PhotoBlock, FactTile } from '../components/businessCenters/BusinessCenterVisuals';
import { FavoriteButton } from '../components/businessCenters/FavoriteButton';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import {
  setBreadcrumbJsonLd,
  setFaqJsonLd,
  setNoIndex,
  clearNoIndex,
  setBusinessCenterPageMeta,
  setPlaceJsonLd,
} from '../lib/pageMeta';
import {
  fullName,
  shortAddress,
  shortName,
  sortByShortName,
  mapRatingFromHighlights,
  parseHighlightRatings,
  parseReviewQuote,
  streetOfAddress,
  withBcPhotoVersion,
} from '../lib/businessCenterDisplay';
import { nearestMetroStation } from '../lib/metroStations';
import {
  estimateTextLines,
  planRecommendationSlots,
  type PageSectionSize,
} from '../lib/businessCenterPageLayout';
import {
  metroHubDistance,
  metroHubUrl,
  streetHubUrl,
  districtPrepositional,
  classDistrictHubUrl,
  classHubUrl,
  districtHubUrl,
  microdistrictHubUrl,
} from '../lib/businessCenterHubs';
import type { BusinessCenter, HighlightIconKey } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import type { BusinessCenterNearbyPlace } from '../data/businessCenterNearbyPlaces';
import { fetchBusinessCenterNearbyPlaces } from '../lib/businessCenterNearbyPlacesApi';
import { hasNearbyContent, nearbyFaqLines } from '../lib/nearbyPlaces';
import type { BusinessCenterReview } from '../data/businessCenterReviews';
import { fetchBusinessCenterReviews } from '../lib/businessCenterReviewsApi';
import type { BusinessCenterOffer } from '../data/businessCenterOffers';
import { fetchBusinessCenterOffers } from '../lib/businessCenterOffersApi';
import { dedupeOffers } from '../lib/businessCenterOfferDuplicates';
import { buildDealStats, buildPriceBuckets, formatArea, formatMoney, formatRate } from '../lib/businessCenterOfferStats';
import { BuildingOffersSection } from '../components/businessCenters/BuildingOffersSection';
import { pluralRu } from '../lib/pluralRu';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import type { MarketSnapshot } from '../data/marketSnapshots';
import type {
  BusinessCenter2gisSnapshot,
  Gis2Schedule,
  Gis2ScheduleDay,
} from '../data/businessCenter2gis';
import { fetchBusinessCenter2gisSnapshot } from '../lib/businessCenter2gisApi';
import { fetchBusinessCenterTenantSnapshot } from '../lib/businessCenterTenantsApi';
import {
  buildFloorGroups,
  buildTenantsFromGis2,
  buildTenantsFromLegacyList,
  buildTenantsFromSnapshot,
  formatFloorLabel,
} from '../lib/businessCenterTenants';
import { TenantDirectory } from '../components/businessCenters/TenantDirectory';
import type { BusinessCenterTenantSnapshot } from '../data/businessCenterTenants';
import { buildOfferIndex, METRO_LINE_DOT_CLASS, metroLineId } from '../lib/businessCenterCatalogFilter';
import { buildMarketPosition, haversineMeters } from '../lib/businessCenterMarketPosition';
import { buildPriceComparison } from '../lib/businessCenterPriceCompare';
import {
  extractHistoryPoints,
  HistoryTimeline,
  MarketPositionBlock,
  PriceComparisonBlock,
  WhatTheySayBlock,
} from '../components/businessCenters/BusinessCenterMarketBlocks';
import { NearbyInfrastructureBlock } from '../components/businessCenters/BusinessCenterNeighbours';
import { buildRanking as buildBusinessCenterRanking } from './BusinessCentersRankingPage';

// Отдельная страница одного бизнес-центра (владелец, 2026-09-04: "для SEO
// лучше хаб + отдельная страница на каждый БЦ" — согласился с этим доводом
// и попросил именно так). Визуально — оверлей-«модалка» (та же стилистика,
// что у ImageLightbox.tsx: крестик-закрытие, стрелки влево/вправо по краям
// экрана), но технически обычная полноценная страница со своим URL —
// иначе AI-краулеры/Яндекс без выполнения JS не увидели бы контент, а
// title/canonical/JSON-LD не смогли бы быть уникальными под конкретный БЦ.
// "Закрытие" ведёт не назад в истории браузера, а явно на /minsk/bcminsk —
// так работает предсказуемо и при заходе по прямой ссылке из поиска, когда
// в истории браузера страницы хаба вообще нет.

// Подписи пунктов липкого меню «На странице» (Б7). Ключ — id блока в
// разметке; список самих пунктов собирается в pageSections по тому, какие
// блоки реально отрисованы.
const SECTION_LABELS: Record<string, string> = {
  awards: 'Награды',
  facts: 'Интересные факты',
  media: 'СМИ о здании',
  developer: 'Застройщик',
  market: 'Место среди конкурентов',
  map: 'Инфраструктура рядом',
  tech: 'Параметры здания',
  tenants: 'Каталог арендаторов',
  rental: 'Отдел аренды БЦ',
  offers: 'Что сдают и продают',
  history: 'История здания',
  reviews: 'Отзывы',
  faq: 'Частые вопросы',
};

// Демонстрация: FAQ «Порт», переписанный Codex/ChatGPT (gpt-6-astra, канал
// ChatGPT Pro, дешевле построчной тарификации ProxyAPI) — второй эксперимент
// после Gemini на «Альянс» (PR #457/#459), тот же формат: связный текст вместо
// перечислений через «;»/`\n`. Вопросы и факты — те же, что даёт вычисляемый
// faqItems ниже (сверено построчно, расхождений не найдено — Gemini один раз
// исказил название улицы в адресе, здесь такого нет). ТЗ — docs/codex-tasks/
// bc-faq-prose-port.md, черновик — docs/codex-tasks/port-faq-draft.json.
// Только для показа вживую на проде; убрать после решения владельца.
const PORT_FAQ_DEMO: { question: string; answer: string }[] = [
  {
    question: `Где находится «Порт»?`,
    answer: `Адрес бизнес-центра: г. Минск, пр-т Независимости, 177 (мкр. Уручье), Первомайский район.`,
  },
  {
    question: `Какой класс у «Порт»?`,
    answer: `«Порт» относится к классу B+. В нашем каталоге есть ещё 27 зданий этого класса, из них 5 — в Первомайском районе.`,
  },
  {
    question: `В каком году построен «Порт»?`,
    answer: `Здание сдано в 2011 году, его возраст — 15 лет. По сравнению с медианным зданием класса B+ оно старше на 5 лет.`,
  },
  {
    question: `Кто застройщик «Порт»?`,
    answer: `Застройщик — А1 Девелопмент, девелоперская компания полного цикла: она занимается проектированием, строительством и управлением недвижимостью. Компания работает на рынке коммерческой недвижимости Минска с начала 2000-х. В её портфеле — бизнес-центры класса A и B: «Порт» (три очереди на пр-те Независимости, Шафарнянской и Ложинской) и «Немига Сити» на ул. Немига. Связаться с застройщиком можно по тел. +375 17 393-07-00 или через сайт https://a1development.by. Адрес офиса: г. Минск, пр-т Независимости, 177, БЦ «Порт», 2-я секция, 4 этаж, офис 11.`,
  },
  {
    question: `Какие технические параметры у «Порт»?`,
    answer: `В здании 6 этажей, общая площадь — 35 000 м², что составляет около 5 833 м² на этаж. На офисы приходится 5 325 м², или 15% от общей площади. Площадь типового этажа указана отдельно — 1150 м², высота его потолков — 2.7 м. Планировка кабинетная и блочная, в здании 3 лифта. Управление БЦ — Товарищество собственников, интернет-провайдер — Соло.`,
  },
  {
    question: `Какая парковка у «Порт»?`,
    answer: `Парковка рассчитана примерно на 450 машиномест, в том числе около 153 гостевых. Обеспеченность составляет 2,1 маш./100 м² при медиане класса B+ 1,79 маш./100 м² — на 17% больше, чем у медианного здания этого класса.`,
  },
  {
    question: `Ставка аренды в «Порт» — это много или мало для своего класса?`,
    answer: `Ставка $13,21/м² на 17% дешевле, чем у медианного здания класса B+, где она составляет $15,85/м². Для сравнения: медиана по району Первомайский — $16,09/м², по городу — $13/м².`,
  },
  {
    question: `Какое метро рядом с «Порт» и это близко или далеко для своего класса?`,
    answer: `Ближайшая станция метро — «Уручье», до неё 310 м по прямой. Медиана для класса B+ составляет 500 м по прямой, так что метро здесь на 38% ближе, чем у медианного здания этого класса.`,
  },
  {
    question: `Высота потолков в «Порт» — это много или мало для своего класса?`,
    answer: `Высота потолков — 2,7 м. Это на 10% ниже медианы класса B+, которая составляет 3 м.`,
  },
  {
    question: `Лифты на 10 000 м² в «Порт» — это много или мало для своего класса?`,
    answer: `На 10 000 м² приходится 0,86 шт. лифтов при медиане класса B+ 2,26 шт. По этому показателю «Порт» на 62% ниже медианного здания своего класса.`,
  },
  {
    question: `Компаний-арендаторов в «Порт» — это много или мало для своего класса?`,
    answer: `Количество компаний-арендаторов в «Порт» — 68 шт. при медиане класса B+ 22 шт. Это в 3,1 раза больше, чем у медианного здания этого класса.`,
  },
  {
    question: `Какая инфраструктура есть рядом с «Порт»?`,
    answer: `В радиусе 2 км учтена 1 станция метро — «Уручье», в 241 м от здания. В радиусе 800 м есть 4 остановки, ближайшая — «Парк Уручье», в 129 м. Остальная инфраструктура учитывается в радиусе 500 м. Здесь 4 продуктовых магазина, ближайший — «Санта», в 307 м, и 9 аптек, ближайшая — «АльфаАптека», в 277 м. Из 9 банков ближе всего «Статусбанк» — 32 м, из 14 банкоматов — «Альфа-Банк», 47 м. Также рядом 6 кафе и 2 ресторана: ближайшие — «Сайгон» в 122 м и «Art Sushi» в 94 м соответственно. Для занятий фитнесом учтены 4 объекта, ближайший — «С-порт», в 75 м. Все расстояния указаны по прямой.`,
  },
  {
    question: `Что известно о здании «Порт» из других источников, помимо prometr.by?`,
    answer: `По данным Domovita.by, часть комплекса сдана в 2011 году, а весь проект полностью реализован к 2013 году.`,
  },
  {
    question: `Что есть внутри «Порт» кроме офисов?`,
    answer: `Кроме офисов, внутри есть банк, банкомат, кофепоинт, магазин, фитнес-центр и кафе.`,
  },
  {
    question: `Какие условия доступной среды указаны?`,
    answer: `Указаны пандус, широкий лифт и доступный вход для людей с инвалидностью.`,
  },
  {
    question: `Какие часы работы указаны?`,
    answer: `Указан круглосуточный режим работы.`,
  },
  {
    question: `Сколько активных предложений аренды и продажи?`,
    answer: `Сейчас активно 1 предложение аренды, предложений продажи — 0.`,
  },
  {
    question: `Какие площади и ставки аренды сейчас предлагаются?`,
    answer: `Площадь и ставка указаны у 1 лота: диапазон площади — 259–259 м², ставки — $13–$13/м² в месяц.`,
  },
  {
    question: `Какие помещения в «Порт» сейчас сдают и по какой цене?`,
    answer: `По офисам активно 1 объявление с площадью 259–259 м² и ставкой $13–$13/м². Медиана ставки составляет $13.`,
  },
  {
    question: `Сколько стоит помещение целиком по ставке объявления?`,
    answer: `Для помещения площадью 259,4 м² при ставке аренды $13,21/м² расчётная стоимость составляет около $3 427 в месяц. Это произведение площади и ставки, а не итоговый платёж: состав коммунальных, эксплуатационных и других платежей не раскрыт. Его нужно уточнить у автора объявления.`,
  },
  {
    question: `Какие награды есть у «Порт»?`,
    answer: `В 2014 году по итогам премии REALT GOLDEN KEY «Порт» признан «Лучшим действующим бизнес-центром».`,
  },
  {
    question: `Что писали о «Порт» в СМИ?`,
    answer: `Office Life, 11 июня 2021: «От «Порта» до «Титула». Топ-10 крупнейших офисных бизнес-центров Беларуси»
Realt.by, 10 апреля 2014: «Бизнес-центр «ПОРТ». На волне успеха»`,
  },
  {
    question: `Какие факты о здании опубликованы?`,
    answer: `Среди известных арендаторов упоминается EPAM — одна из крупнейших мировых IT-компаний. Она занимала целый этаж в одном из корпусов, что независимо подтверждено на нескольких площадках. Также указаны отделения Альфа-Банка, Абсолютбанка, БСБ Банка, фитнес-клуб «С-порт», туристическое агентство «Хомо Туристус» и компания «ИнтерКарго». На момент постройки комплекс считался одним из крупнейших по офисной площади в Беларуси: общая площадь трёх очередей составляла ~50 тыс. м², из них ~30 тыс. — офисы.`,
  },
  {
    question: `Что известно об истории здания?`,
    answer: `Комплекс строился очередями: 1-я очередь сдана в декабре 2011 года. В описании истории указано, что к весне 2013-го проект был завершён, а в 2014 году началась 3-я очередь.`,
  },
  {
    question: `Сколько организаций в здании и по каким направлениям?`,
    answer: `В списке Яндекс.Карт — 66 организаций. К направлению «Производство и оборудование» относятся 11, к категории «Другое» — 9, к направлению «Магазины и товары» — 7. По 6 организаций указано в направлениях «Финансы, юристы, бизнес» и «IT и связь», по 5 — в направлениях «Образование и работа» и «Стройка и недвижимость». Ещё по 4 относятся к направлениям «Авто» и «Логистика и транспорт», по 3 — к направлениям «Медицина и красота» и «Реклама и медиа». В направлении «Еда и досуг» указаны 2 организации, в направлении «Спорт и туризм» — 1. Эти сведения описывают соседей и сервисы, но не показывают загрузку здания или спрос.`,
  },
  {
    question: `На каких этажах сидят организации?`,
    answer: `Этаж известен у 25 организаций из 66. На 1 и 2 этажах указано по 4 организации, на 3 этаже — 2, на 4 этаже — 1, на 5 этаже — 5, на 6 этаже — 1, на 7 этаже — 2. Ещё 6 организаций указаны на цокольном этаже.`,
  },
  {
    question: `Какая оценка у «Порт» на картах?`,
    answer: `На сервисе Яндекс.Карты у «Порт» оценка 4,5 на основе 661 оценки.`,
  },
  {
    question: `Что пишут в отзывах?`,
    answer: `Николай Казючиц: «Отличное место для офиса: доступные услуги банков, питания, стоянки для транспорта, магазины для дома, стройки, отдыха»
Dave Nowatsky: «Там несколько таких Портов, могли бы уже как-то по-разному хотя бы назвать»
Сергей: «Парковка никакущая, указатели не информативные»
Юлия М.: жалуется на грубость сотрудника на ресепшене и неактуальную информацию о работе банка.
Николай Просто: «Отличное место для бизнеса, только имейте в виду — 4-7 этажи очень холодные, окна не герметичные»`,
  },
  {
    question: `Как исправить сведения о здании?`,
    answer: `Чтобы добавить, убрать или изменить информацию, напишите на a@redevelopment.pro. Укажите бизнес-центр и сведения, которые нужно поправить.`,
  },
];

const SECTION_ICONS: Record<string, typeof FileText> = {
  awards: Trophy,
  facts: Sparkles,
  media: Newspaper,
  developer: HardHat,
  market: Award,
  map: MapPin,
  tech: Building2,
  tenants: Users,
  rental: FileText,
  offers: Banknote,
  history: Clock,
  reviews: MessageSquareQuote,
  faq: Info,
};

// Блоки-выходы на другие БЦ. Здесь только то, ЧТО показывать и в каком
// порядке приоритета; ГДЕ поставить — решает planRecommendationSlots
// (src/lib/businessCenterPageLayout.ts), там же разбор двух предыдущих
// версий раскладки и замеры живых страниц.
//
// Порядок очереди = приоритет: чем богаче пул кандидатов, тем выше блок
// на странице. Два общегородских блока (класс, просто соседние) —
// исключение: они стоят в конце очереди независимо от размера пула,
// потому что они самые неспецифичные.
type RecommendationBlockId =
  | 'microdistrictCenters'
  | 'metroCenters'
  | 'ratingCenters'
  | 'classDistrictCenters'
  | 'streetCenters'
  | 'classCenters'
  | 'nearbyCenters';

interface RecommendationBlockData {
  id: RecommendationBlockId;
  title: string;
  centers: BusinessCenter[];
  catalogUrl: string;
  catalogLabel: string;
  stationName?: string;
  fallbackCenter?: BusinessCenter;
}

const EMPTY_NEARBY_PLACES: BusinessCenterNearbyPlace[] = [];
const EMPTY_REVIEWS: BusinessCenterReview[] = [];

export function BusinessCenterDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [offersResult, setOffersResult] = useState<{
    slug: string;
    offers: BusinessCenterOffer[] | null;
    error: boolean;
  } | null>(null);
  const rawOffers = offersResult && offersResult.slug === slug ? offersResult.offers : null;
  // Один и тот же лот приходит сразу с нескольких площадок — считаем его
  // одним (см. lib/businessCenterOfferDuplicates.ts). Схлопываем СРАЗУ
  // после загрузки, чтобы дальше — и в сводке, и в таблице, и в медиане
  // здания, и в FAQ — везде было одно и то же число.
  const offers = useMemo(() => (rawOffers === null ? null : dedupeOffers(rawOffers)), [rawOffers]);
  const [gis2Result, setGis2Result] = useState<{ slug: string; data: BusinessCenter2gisSnapshot | null } | null>(null);
  const gis2 = gis2Result?.slug === slug ? gis2Result?.data ?? null : null;
  const [officeSnapshots, setOfficeSnapshots] = useState<MarketSnapshot[] | null>(null);
  const [tenantSnapshotResult, setTenantSnapshotResult] = useState<{
    slug: string;
    data: BusinessCenterTenantSnapshot | null;
  } | null>(null);
  const tenantSnapshot = tenantSnapshotResult?.slug === slug ? tenantSnapshotResult?.data ?? null : null;
  const [nearbyPlacesResult, setNearbyPlacesResult] = useState<{
    slug: string;
    places: BusinessCenterNearbyPlace[];
  } | null>(null);
  const [reviewsResult, setReviewsResult] = useState<{ slug: string; reviews: BusinessCenterReview[] } | null>(null);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
  }, []);

  // Снапшот 2GIS (владелец подключил API в параллельной ветке, 2026-09-06:
  // "давай выведем на страницы вообще всю инфу, которую мы спарсили") —
  // отдельная таблица `business_center_2gis_snapshots`, тот же принцип
  // отдельного запроса по слагу, что и у business_center_offers ниже.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchBusinessCenter2gisSnapshot(slug)
      .then((data) => { if (!cancelled) setGis2Result({ slug, data }); })
      .catch(() => { if (!cancelled) setGis2Result({ slug, data: null }); });
    return () => { cancelled = true; };
  }, [slug]);

  // Организации в здании по Яндекс.Картам — основной источник арендаторов с
  // 2026-09-19 (Б13 в docs/bc-catalog-redesign-plan.md): 7608 организаций по
  // 139 зданиям против 4614 у 2GIS, плюс этаж, офис, рейтинг и ссылка на
  // карточку, которых у 2GIS нет. 2GIS ниже остаётся фолбэком.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchBusinessCenterTenantSnapshot(slug)
      .then((data) => { if (!cancelled) setTenantSnapshotResult({ slug, data }); })
      .catch(() => { if (!cancelled) setTenantSnapshotResult({ slug, data: null }); });
    return () => { cancelled = true; };
  }, [slug]);

  // Сохранённый снимок инфраструктуры: публичная страница никогда не
  // обращается к Places API напрямую и не расходует квоту на просмотры.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchBusinessCenterNearbyPlaces(slug)
      .then((places) => { if (!cancelled) setNearbyPlacesResult({ slug, places }); })
      .catch(() => { if (!cancelled) setNearbyPlacesResult({ slug, places: [] }); });
    return () => { cancelled = true; };
  }, [slug]);

  // Реальные отзывы с Яндекс.Карт (не ручные цитаты из highlights) — пока
  // собраны автоматическим разбором .webarchive/.html при сохранении
  // карточки БЦ для части БЦ (см. BusinessCentersAdminTab.tsx), у
  // остальных запрос просто вернёт пустой список, и WhatTheySayBlock
  // откатится на старые ручные цитаты.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchBusinessCenterReviews(slug)
      .then((reviews) => { if (!cancelled) setReviewsResult({ slug, reviews }); })
      .catch(() => { if (!cancelled) setReviewsResult({ slug, reviews: [] }); });
    return () => { cancelled = true; };
  }, [slug]);

  // Объявления о продаже/аренде из business_center_offers (владелец,
  // 2026-09-05: "хочу спарсить объявления... эту инфу мы будем выводить в
  // полной карточке" — см. scripts/sync-business-center-offers.mjs).
  // Отдельный запрос по слагу, не общий с fetchBusinessCenters — так при
  // переходе на следующий/предыдущий БЦ (тот же компонент, меняется только
  // slug) список объявлений сам перезапрашивается под новый БЦ.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setOffersResult(null);
    fetchBusinessCenterOffers(slug)
      .then((data) => {
        if (!cancelled) setOffersResult({ slug, offers: data, error: false });
      })
      .catch(() => {
        if (!cancelled) setOffersResult({ slug, offers: null, error: true });
      });
    return () => { cancelled = true; };
  }, [slug]);

  // Сравнение со средней по классу/району (ANALYTICSPLAN.md §4.2) — тот же
  // сегмент 'ofisy_bc', что и на каталоге/хабах. Грузится один раз, не по
  // slug — 23 строки на весь город, дешевле держать в памяти, чем
  // перезапрашивать при каждом переходе на следующий/предыдущий БЦ.
  useEffect(() => {
    fetchLatestMarketSnapshots('ofisy_bc')
      .then(setOfficeSnapshots)
      .catch(() => setOfficeSnapshots([]));
  }, []);

  // Порядок для "предыдущий/следующий" — тот же алфавит по короткому имени,
  // что и в боковом меню хаба, чтобы стрелки совпадали с порядком, который
  // пользователь уже видел в списке до перехода сюда.
  const sorted = useMemo(() => sortByShortName(centers ?? []), [centers]);
  const center = useMemo(() => sorted.find((c) => c.slug === slug) ?? null, [sorted, slug]);

  // Организации здания и оборудование (банкоматы, кофейные автоматы) —
  // разложены по разные стороны: см. buildTenantsFromSnapshot.
  //
  // Источника три, по убыванию полноты. Живой срез Яндекса
  // (business_center_tenant_source_snapshots) — единственный, где есть этаж,
  // офис и ссылка на карточку. Материализованный список в самой строке БЦ
  // (business_centers.tenant_organizations) — тот же Яндекс, но разложенный
  // по колонке раньше и без места в здании; остаётся для БЦ, которых в срезе
  // нет. 2GIS — последний: владелец отказался от платного API, но собранное
  // не выбрасываем, а отрасль там приходит готовой и ложится в ту же шкалу.
  const yandexTenants = useMemo(
    () =>
      tenantSnapshot
        ? buildTenantsFromSnapshot(tenantSnapshot.organizations, center?.name, center?.altNames ?? [])
        : null,
    [tenantSnapshot, center],
  );
  const legacyTenants = useMemo(
    () => (center ? buildTenantsFromLegacyList(center.tenantOrganizations, center.name, center.altNames) : null),
    [center],
  );
  const tenantSource: 'yandex_maps' | '2gis' =
    (yandexTenants?.tenants.length ?? 0) > 0 || (legacyTenants?.tenants.length ?? 0) > 0 ? 'yandex_maps' : '2gis';
  const tenantOrganizations = useMemo(() => {
    if (yandexTenants && yandexTenants.tenants.length > 0) return yandexTenants.tenants;
    if (legacyTenants && legacyTenants.tenants.length > 0) return legacyTenants.tenants;
    return gis2 ? buildTenantsFromGis2(gis2.tenantOrganizations) : [];
  }, [yandexTenants, legacyTenants, gis2]);
  const tenantAmenities = useMemo(() => {
    if (yandexTenants && yandexTenants.tenants.length > 0) return yandexTenants.amenities;
    if (legacyTenants && legacyTenants.tenants.length > 0) return legacyTenants.amenities;
    return [];
  }, [yandexTenants, legacyTenants]);

  const nearbyPlaces = nearbyPlacesResult?.slug === slug
    ? nearbyPlacesResult?.places ?? EMPTY_NEARBY_PLACES
    : EMPTY_NEARBY_PLACES;
  const reviews = reviewsResult?.slug === slug ? reviewsResult?.reviews ?? EMPTY_REVIEWS : EMPTY_REVIEWS;
  const index = center ? sorted.findIndex((c) => c.slug === center.slug) : -1;
  const prev = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;

  // Сводка по сделке (помещения, средняя цена, бюджет, скидка за объём) —
  // одни и те же цифры рисует блок «Что сейчас сдают и продают» и
  // пересказывает FAQ под ним.
  const saleStats = useMemo(() => buildDealStats(offers, 'sale'), [offers]);
  const rentStats = useMemo(() => buildDealStats(offers, 'rent'), [offers]);
  // Рейтинг Яндекс.Карт вынесен из общего списка фактов в короткий бейдж
  // рядом с заголовком. Подробный исходный текст не используется как tooltip.
  const mapRating = useMemo(() => mapRatingFromHighlights(center?.highlights ?? []), [center]);
  // Точное расстояние до метро из 2GIS (владелец подключает в параллельной
  // ветке, 2026-09-06) — по прямой, в метрах. Когда есть — показывается
  // ВМЕСТО center.metro (владелец, 2026-09-06: "дублируется метро... оставь
  // только данные 2GIS"), не вместе с ним — см. JSX ниже.
  const nearestMetro = useMemo(() => nearestMetroStation(center?.nearestMetroStations ?? []), [center]);
  const scheduleLines = useMemo(() => (gis2?.schedule ? formatSchedule(gis2.schedule) : []), [gis2]);
  // Расписание 2ГИС — единый источник режима доступа. Если подробного
  // расписания в публичном снимке нет, используем сохранённый из него же
  // признак 24/7, но всё равно показываем только одну строку.
  const accessHoursText =
    scheduleLines.length > 0
      ? scheduleLines.join('\n')
      : center?.is24x7 === true
        ? 'Круглосуточно'
        : center?.is24x7 === false
          ? 'Не круглосуточно'
          : null;
  // "Доступная среда" — единственная группа из gis2.attributeGroups, которую
  // владелец попросил оставить (2026-09-06, вместе с часами работы, при
  // упразднении отдельного блока "Данные 2ГИС") — остальные группы
  // (аренда помещений и т.п.) больше нигде не показываются.
  const accessibilityAttributes = useMemo(() => {
    const group = gis2?.attributeGroups.find((g) => g.name === 'Доступная среда');
    return group && group.attributes.length > 0 ? group.attributes.join(', ') : center?.accessibility.join(', ') || null;
  }, [gis2, center]);

  // Поля prometr.by больше не показываются общей выгрузкой. Здесь они
  // раскладываются между первым информационным блоком и отдельной карточкой
  // здания. Значения нескольких корпусов сохраняются с подписями корпусов.
  const redistributedTechnicalParams = useMemo(() => {
    const empty = {
      buildingInformationRows: [] as { label: string; value: string | null }[],
      firstBlockTechnicalRows: [] as { label: string; value: string }[],
      internalInfrastructureText: null as string | null,
      administrativeDistrictText: null as string | null,
      readinessText: null as string | null,
    };
    if (!center) return empty;

    const byLabel = new Map<string, { corpusLabel: string | null; value: string }[]>();
    for (const group of center.technicalParams) {
      for (const param of group.params) {
        const label = param.label.replace(/ \(по данным prometr\.by\)$/, '');
        const entries = byLabel.get(label) ?? [];
        entries.push({ corpusLabel: group.corpusLabel, value: param.value });
        byLabel.set(label, entries);
      }
    }

    const sourceValue = (label: string): string | null => {
      const entries = byLabel.get(label) ?? [];
      const unique = entries.filter(
        (entry, index) =>
          entries.findIndex(
            (candidate) =>
              candidate.corpusLabel === entry.corpusLabel && candidate.value === entry.value,
          ) === index,
      );
      if (unique.length === 0) return null;
      if (unique.length === 1) return unique[0].value;
      return unique
        .map((entry) => (entry.corpusLabel ? `${entry.corpusLabel}: ${entry.value}` : entry.value))
        .join('; ');
    };

    const layoutLabels: Record<string, string> = {
      cabinet: 'кабинетная',
      block: 'блочная',
      open_space: 'open-space',
    };
    const buildingInformationRows = [
      {
        label: 'Площадь типового этажа',
        value:
          sourceValue('Площадь типового этажа') ??
          (center.floorPlateArea != null ? `${center.floorPlateArea.toLocaleString('ru-RU')} м²` : null),
      },
      {
        label: 'Площадь офисов',
        value:
          sourceValue('Площадь офисов') ??
          (center.officeArea != null ? `${center.officeArea.toLocaleString('ru-RU')} м²` : null),
      },
      {
        label: 'Общая площадь',
        value:
          sourceValue('Общая площадь') ??
          (center.totalArea != null ? `${center.totalArea.toLocaleString('ru-RU')} м²` : null),
      },
      {
        label: 'Высота потолков типового этажа, м',
        value:
          sourceValue('Высота потолков типового этажа, м') ??
          (center.ceilingHeight != null ? center.ceilingHeight.toLocaleString('ru-RU') : null),
      },
      {
        label: 'Тип планировки',
        value:
          sourceValue('Тип планировки') ??
          (center.layoutTypes.length > 0
            ? center.layoutTypes.map((type) => layoutLabels[type] ?? type).join(', ')
            : null),
      },
      {
        label: 'Количество этажей',
        value:
          sourceValue('Количество этажей') ??
          (center.floors != null ? String(center.floors) : null),
      },
      {
        label: 'Количество лифтов',
        value:
          sourceValue('Количество лифтов') ??
          (center.elevators != null ? String(center.elevators) : null),
      },
      {
        label: 'Обеспеченность парковкой (маш./100 м²)',
        value:
          sourceValue('Обеспеченность парковкой (маш./100 м²)') ??
          (center.parkingRatio != null ? center.parkingRatio.toLocaleString('ru-RU') : null),
      },
      {
        label: 'Управление БЦ',
        value: sourceValue('Управление БЦ'),
      },
      {
        label: 'Интернет-провайдеры',
        value: sourceValue('Интернет-провайдеры'),
      },
      {
        label: 'Система кондиционирования',
        value: sourceValue('Система кондиционирования'),
      },
    ];

    const buildingLabels = new Set(buildingInformationRows.map((row) => row.label));
    const removedLabels = new Set(['Свободные площади', 'Инфраструктура в шаговой доступности']);
    const firstBlockTechnicalRows: { label: string; value: string }[] = [];
    for (const label of byLabel.keys()) {
      if (
        buildingLabels.has(label) ||
        removedLabels.has(label) ||
        label === 'Внутренняя инфраструктура' ||
        label === 'Административный район' ||
        label === 'Степень готовности'
      ) continue;
      if (label === 'Класс бизнес-центра' && center.businessClass) continue;
      if ((label === 'Станция метро' || label === 'Удалённость от метро') && (nearestMetro || center.metro)) continue;
      const value = sourceValue(label);
      if (value) firstBlockTechnicalRows.push({ label, value });
    }

    return {
      buildingInformationRows: buildingInformationRows.filter(
        (row): row is { label: string; value: string } => row.value != null && row.value.trim() !== '',
      ),
      firstBlockTechnicalRows,
      internalInfrastructureText:
        center.infraInternal.length > 0
          ? center.infraInternal.join(', ')
          : sourceValue('Внутренняя инфраструктура'),
      administrativeDistrictText: sourceValue('Административный район') ?? center.district,
      readinessText: sourceValue('Степень готовности'),
    };
  }, [center, nearestMetro]);

  // «В здании» раньше показывал ровно то, что владелец вручную набрал в
  // infraInternal, — у большинства БЦ это поле пустое, хотя список
  // организаций (tenantOrganizations/tenantAmenities) уже лежит в базе и
  // содержит те же банки/кафе/магазины/банкоматы. Владелец, 2026-09-20:
  // "обогатил бы этот блок на основе инфы из базы", "не расширял бы
  // количество новых категорий" — поэтому категорий ровно пять, те же, что
  // уже умеет красить иконкой InternalInfrastructureRow ниже, и достраиваем
  // только то, чего в ручном тексте ещё нет (иначе "банк" и "банкомат"
  // задвоятся, если владелец уже вписал оба). Границу слова проверяем
  // lookahead'ом, а не /\b/ (CLAUDE.md — \b не видит границу кириллического
  // слова): без неё "банк" ловит "банкетный зал", а "кафе" — "кафедра".
  const derivedInternalInfrastructureText = useMemo(() => {
    const manualItems = (redistributedTechnicalParams.internalInfrastructureText ?? '')
      .split(/[,;]\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
    const manualCategories = new Set(
      manualItems
        .map((item) => TENANT_DERIVED_INFRASTRUCTURE.find(({ pattern }) => pattern.test(item))?.label)
        .filter((label): label is string => Boolean(label)),
    );
    const tenantCategories = new Set<string>();
    for (const amenity of tenantAmenities) {
      const match = TENANT_DERIVED_INFRASTRUCTURE.find(({ pattern }) => pattern.test(amenity.category));
      if (match) tenantCategories.add(match.label);
    }
    for (const tenant of tenantOrganizations) {
      const rubric = tenant.rubric;
      if (!rubric) continue;
      const match = TENANT_DERIVED_INFRASTRUCTURE.find(({ pattern }) => pattern.test(rubric));
      if (match) tenantCategories.add(match.label);
    }
    const derived = Array.from(tenantCategories).filter((label) => !manualCategories.has(label));
    return [redistributedTechnicalParams.internalInfrastructureText, derived.join(', ') || null]
      .filter(Boolean)
      .join(', ');
  }, [redistributedTechnicalParams.internalInfrastructureText, tenantOrganizations, tenantAmenities]);

  // Из общего списка фактов исключаем то, что теперь показано отдельными
  // авторскими блоками: рейтинг и отзывы уехали в «Что говорят» (Б11),
  // история — в таймлайн (Б10). Дублировать один и тот же текст в двух
  // местах страницы хуже, чем не показать его вовсе.
  //
  // 'tenants' — туда же: с 2026-09-19 у подавляющего большинства БЦ есть
  // полноценный "Каталог арендаторов" (TenantDirectory, реальные названия
  // организаций с картой) — проверено по живой базе 2026-09-21: у 82 из 83
  // БЦ, где такой факт вообще есть, каталог арендаторов уже заполнен. Держим
  // факт только для той единственной БЦ, где каталога нет (условие на
  // tenantOrganizations, не безусловное исключение icon'а).
  const visibleHighlights = useMemo(
    () =>
      center?.highlights.filter(
        (h) =>
          h.icon !== 'rating' &&
          h.icon !== 'reviews' &&
          h.icon !== 'history' &&
          h.icon !== 'award' &&
          h.icon !== 'warning' &&
          // 'media' — тоже переехал в свой блок ("Публикации в СМИ",
          // mediaMentions) 2026-09-20, но старые факты с этой иконкой в
          // highlights не почистили тогда же — владелец, 2026-09-21:
          // "media - убираем, у нас есть блок СМИ".
          h.icon !== 'media' &&
          // 'design'/'eco' — переехали в «Параметры здания» тем же днём
          // (см. buildingParamHighlights ниже): владелец про архитектуру/
          // инженерию/эко-сертификацию и физические остатки прежних
          // "Интересных фактов" — "все переноси в блок про здание,
          // Параметры здания". "Интересные факты" остаются для историй,
          // курьёзов, дизамбигуаций и позиционирования — не про параметры
          // самого здания, а про контекст вокруг него.
          h.icon !== 'design' &&
          h.icon !== 'eco' &&
          (h.icon !== 'tenants' || tenantOrganizations.length === 0),
      ) ?? [],
    [center, tenantOrganizations],
  );

  // См. комментарий у visibleHighlights выше — design/eco описывают САМО
  // здание (архитектура, конструкция, инженерия, экосертификация), поэтому
  // рендерятся в «Параметрах здания», а не в «Интересных фактах».
  const buildingParamHighlights = useMemo(
    () => center?.highlights.filter((h) => h.icon === 'design' || h.icon === 'eco') ?? [],
    [center],
  );
  // 'design' (архитектура) — короткие однострочные значения после чистки
  // 2026-09-22 (владелец: "сделай архитектуру такой же строчкой таблицы,
  // поставь на первое место, текст сократи, отсылки на источники убери"),
  // поэтому рендерятся ПЕРВОЙ строкой таблицы наравне с "Часы работы"/
  // "Парковка" и т.п. — обычный <td>, без markdown. 'eco' остаётся
  // абзацем ниже таблицы (LabeledTextRow) — там бывает длиннее одной строки.
  const architectureHighlights = useMemo(
    () => buildingParamHighlights.filter((h) => h.icon === 'design'),
    [buildingParamHighlights],
  );
  const ecoHighlights = useMemo(() => buildingParamHighlights.filter((h) => h.icon === 'eco'), [buildingParamHighlights]);

  // Публикации в СМИ — свой блок (владелец, 2026-09-20). Сортируем от свежих:
  // подборка отвечает на вопрос «что пишут о здании», и первым должен стоять
  // самый недавний материал, а не тот, что раньше попал в базу. Публикации
  // без даты уходят в конец — их некуда поставить честно.
  const mediaMentions = useMemo(() => {
    const items = center?.mediaMentions ?? [];
    return [...items].sort((a, b) => {
      if (a.date === b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
  }, [center]);

  // Награды — отдельный блок, а не строка в "Интересных фактах" (владелец,
  // 2026-09-20). Разворачиваем в плоский список строк по тому же принципу,
  // что reviewQuotes: одна строка текста = один пункт. Подпись самого
  // highlight'а не показывается — у всех вариантов она одна и та же по
  // смыслу ("Награда"/"Награды"/"Номинация ..."), а заголовок блока её уже
  // повторяет.
  const awardItems = useMemo(
    () =>
      (center?.highlights ?? [])
        .filter((h) => h.icon === 'award')
        .flatMap((h) =>
          h.text
            .split(/\n+/)
            .map((line) => line.replace(/^[-–—*•\s]+/, '').trim())
            .filter(Boolean),
        ),
    [center],
  );

  // Блоки-рекомендации других БЦ — готовые данные (заголовок/карточки/
  // ссылка на каталог), УЖЕ отсортированные по приоритету показа: чем
  // больше у блока подходящих зданий, тем раньше он должен встретиться
  // читателю, а блок с единственным кандидатом — в последнюю очередь
  // (владелец, 2026-09-20: "приоритет вывода всегда у тех блоков, по
  // которым будет много БЦ, с одной выводим в последнюю очередь"). Само
  // место на странице каждый блок получает позже, в recommendationSlots —
  // этот useMemo отвечает только за состав и порядок кандидатов.
  const recommendationBlocks = useMemo<RecommendationBlockData[]>(() => {
    if (!center || !centers) return [];
    const street = streetOfAddress(center.address);
    const distanceFromCenter = (candidate: BusinessCenter) => {
      if (center.lat == null || center.lng == null || candidate.lat == null || candidate.lng == null) {
        return Number.POSITIVE_INFINITY;
      }
      return haversineMeters(center.lat, center.lng, candidate.lat, candidate.lng);
    };
    const byDistance = (a: BusinessCenter, b: BusinessCenter) => distanceFromCenter(a) - distanceFromCenter(b);

    // "Сырые" пулы — БЕЗ дедупа между блоками. Их размер и есть мера
    // приоритета: дедуп ниже отсекает только то, что уже видимо в блоке
    // повыше по приоритету, а не наоборот, поэтому сортировать нужно ДО
    // дедупа, иначе более поздний (обеднённый) размер не отражает, какой
    // блок в принципе богаче кандидатами.
    const microdistrictRaw = center.microdistrict
      ? centers.filter((c) => c.slug !== center.slug && c.microdistrict === center.microdistrict).sort(byDistance)
      : [];
    const metroRaw = nearestMetro
      ? centers
          .filter((c) => c.slug !== center.slug && metroHubDistance(c, nearestMetro.name) != null)
          .sort((a, b) =>
            (metroHubDistance(a, nearestMetro.name) ?? Number.POSITIVE_INFINITY) -
            (metroHubDistance(b, nearestMetro.name) ?? Number.POSITIVE_INFINITY),
          )
      : [];
    // Владелец, 2026-09-20: "в рейтинге нет БЦ Капитал Палас" — блок обязан
    // показывать РОВНО тех же лидеров, что и /minsk/bcminsk/reyting, не
    // собственную сортировку по BusinessCenter.gisRating (это снимок 2ГИС,
    // другое число и без фильтра по классу/порогу — методика реального
    // рейтинга в buildRanking, BusinessCentersRankingPage.tsx). Тот же
    // разговор ("по умолчанию у нас везде рейтинг с Яндекс карт должен
    // быть") привёл источник рейтинга в блоке «Место среди конкурентов»
    // к тому же mapRatingFromHighlights — см. businessCenterMarketPosition.ts.
    const ratingRaw = buildBusinessCenterRanking(centers)
      .map((r) => r.center)
      .filter((c) => c.slug !== center.slug);
    const classDistrictRaw =
      center.businessClass && center.district
        ? centers
            .filter((c) => c.slug !== center.slug && c.businessClass === center.businessClass && c.district === center.district)
            .sort(byDistance)
        : [];
    const streetRaw = street
      ? centers.filter((c) => c.slug !== center.slug && streetOfAddress(c.address) === street).sort(byDistance)
      : [];

    const microdistrictCatalogUrl = center.microdistrict ? microdistrictHubUrl(center.microdistrict) : null;
    const metroCatalogUrl =
      nearestMetro && metroHubDistance(center, nearestMetro.name) !== null ? metroHubUrl(nearestMetro.name) : null;
    const classDistrictCatalogUrl =
      center.businessClass && center.district ? classDistrictHubUrl(center.businessClass, center.district) : null;
    const streetCatalogUrl = street ? streetHubUrl(street) : null;

    interface Candidate {
      id: RecommendationBlockId;
      raw: BusinessCenter[];
      build: (list: BusinessCenter[], fallback: BusinessCenter | undefined) => RecommendationBlockData | null;
    }
    const candidates: Candidate[] = [];
    if (microdistrictCatalogUrl && microdistrictRaw.length > 0) {
      candidates.push({
        id: 'microdistrictCenters',
        raw: microdistrictRaw,
        build: (list) =>
          list.length > 0
            ? {
                id: 'microdistrictCenters',
                title: `Бизнес-центры ${center.microdistrict}`,
                centers: list,
                catalogUrl: microdistrictCatalogUrl,
                catalogLabel: `Все БЦ ${center.microdistrict}`,
              }
            : null,
      });
    }
    if (metroCatalogUrl && nearestMetro && metroRaw.length > 0) {
      candidates.push({
        id: 'metroCenters',
        raw: metroRaw,
        build: (list, fallback) =>
          list.length > 0
            ? {
                id: 'metroCenters',
                title: `Бизнес-центры у станции ${nearestMetro.name}`,
                centers: list,
                catalogUrl: metroCatalogUrl,
                catalogLabel: `Все БЦ у станции ${nearestMetro.name}`,
                stationName: nearestMetro.name,
                fallbackCenter: fallback,
              }
            : null,
      });
    }
    if (ratingRaw.length > 0) {
      candidates.push({
        id: 'ratingCenters',
        raw: ratingRaw,
        build: (list) =>
          list.length > 0
            ? {
                id: 'ratingCenters',
                title: 'Рейтинг бизнес-центров Минска',
                centers: list,
                catalogUrl: '/minsk/bcminsk/reyting',
                catalogLabel: 'Весь рейтинг БЦ',
              }
            : null,
      });
    }
    if (classDistrictCatalogUrl && center.district && classDistrictRaw.length > 0) {
      const district = center.district;
      candidates.push({
        id: 'classDistrictCenters',
        raw: classDistrictRaw,
        build: (list) =>
          list.length > 0
            ? {
                id: 'classDistrictCenters',
                title: `Бизнес-центры класса ${center.businessClass} в ${districtPrepositional(district)} районе`,
                centers: list,
                catalogUrl: classDistrictCatalogUrl,
                catalogLabel: `Все БЦ класса ${center.businessClass} в этом районе`,
              }
            : null,
      });
    }
    if (streetCatalogUrl && streetRaw.length > 0) {
      candidates.push({
        id: 'streetCenters',
        raw: streetRaw,
        build: (list, fallback) =>
          list.length > 0
            ? {
                id: 'streetCenters',
                title: 'Бизнес-центры на этой улице',
                centers: list,
                catalogUrl: streetCatalogUrl,
                catalogLabel: 'Все БЦ на этой улице',
                fallbackCenter: fallback,
              }
            : null,
      });
    }

    // Богаче пул — выше приоритет (раньше в очереди на размещение).
    candidates.sort((a, b) => b.raw.length - a.raw.length);

    // Владелец, 2026-09-20: "по возможности не выводить дубли БЦ" — одно и
    // то же здание может подойти сразу нескольким блокам рекомендаций.
    // Дедуп идёт в порядке приоритета: более богатый блок забирает
    // кандидата первым, у более бедного (обычно ниже в очереди) он просто
    // не попадёт на видимые 2 карточки.
    const usedSlugs = new Set<string>();
    const takeVisible = (list: BusinessCenter[]) => {
      list.slice(0, 2).forEach((c) => usedSlugs.add(c.slug));
      return list;
    };

    // Владелец, 2026-09-20: "если у нас всего 1 БЦ в блоке рекомендаций,
    // давай использовать вторую половину блока под рекомендацию других БЦ
    // этого же класса" — вторая плитка не пустует, а предлагает ближайшее
    // здание того же делового класса. Фолбэк держим только у метро и улицы
    // (так и было запрошено), из общего пула, очищенного по мере разбора
    // очереди от всего, что уже показано в других блоках.
    let sameClassPool = center.businessClass
      ? centers.filter((c) => c.slug !== center.slug && c.businessClass === center.businessClass)
      : [];
    const takeFallback = (blockId: RecommendationBlockId, list: BusinessCenter[]) => {
      if (list.length !== 1 || (blockId !== 'metroCenters' && blockId !== 'streetCenters')) return undefined;
      sameClassPool = sameClassPool.filter((c) => !usedSlugs.has(c.slug)).sort(byDistance);
      const fallback = sameClassPool[0];
      if (fallback) sameClassPool = sameClassPool.filter((c) => c.slug !== fallback.slug);
      return fallback;
    };

    const buildAll = (list: Candidate[]) =>
      list
        .map((c) => {
          const visible = takeVisible(c.raw.filter((candidate) => !usedSlugs.has(candidate.slug)));
          return c.build(visible, takeFallback(c.id, visible));
        })
        .filter((b): b is RecommendationBlockData => b !== null);

    // Специфичные блоки собираются ПЕРВЫМИ — и только потом, глядя на то,
    // что из них реально осталось, добираются общегородские. Порядок
    // важен: у блока по улице или метро в пуле бывает одно здание, и
    // дедуп выше может его забрать — блок исчезает. Прошлая версия
    // спрашивала «есть ли блок по улице» у ОЧЕРЕДИ, а не у результата, и
    // на «Офисинвесте» глушила общегородской блок из-за уличного,
    // который потом сам не выжил: страница в 7,7 экрана оставалась с
    // двумя блоками и дырой в 5 экранов (прогон 2026-09-21).
    const specific = buildAll(candidates);

    // Общегородские блоки. «Бизнес-центры класса B в Минске» рядом с
    // «Бизнес-центры класса B в Первомайском районе» — два заголовка,
    // различающиеся хвостом, и второй по смыслу входит в первый; прогон
    // 141 страницы дал 33 таких пары, поэтому городской блок по классу
    // идёт только туда, где районного нет. «Бизнес-центры рядом» такой
    // оговорки не требуют: заголовок ни с чем не сливается, а здания в
    // нём после дедупа всегда другие — это универсальный добор, и без
    // него страницы без совпадений по метро/улице/микрорайону остаются
    // с одним-двумя блоками на девять экранов.
    const generic: Candidate[] = [];
    const businessClass = center.businessClass;
    if (businessClass && !specific.some((b) => b.id === 'classDistrictCenters')) {
      const classRaw = centers.filter((c) => c.slug !== center.slug && c.businessClass === businessClass).sort(byDistance);
      if (classRaw.length > 0) {
        generic.push({
          id: 'classCenters',
          raw: classRaw,
          build: (list) =>
            list.length > 0
              ? {
                  id: 'classCenters',
                  title: `Бизнес-центры класса ${businessClass} в Минске`,
                  centers: list,
                  catalogUrl: classHubUrl(businessClass),
                  catalogLabel: `Все БЦ класса ${businessClass}`,
                }
              : null,
        });
      }
    }
    if (center.lat != null && center.lng != null) {
      const nearbyRaw = centers.filter((c) => c.slug !== center.slug).sort(byDistance);
      const districtUrl = center.district ? districtHubUrl(center.district) : null;
      const district = center.district;
      if (nearbyRaw.length > 0) {
        generic.push({
          id: 'nearbyCenters',
          raw: nearbyRaw,
          build: (list) =>
            list.length > 0
              ? {
                  id: 'nearbyCenters',
                  title: 'Бизнес-центры рядом',
                  centers: list,
                  catalogUrl: districtUrl ?? '/minsk/bcminsk',
                  catalogLabel:
                    districtUrl && district
                      ? `Все БЦ в ${districtPrepositional(district)} районе`
                      : 'Все бизнес-центры Минска',
                }
              : null,
        });
      }
    }

    return [...specific, ...buildAll(generic)];
  }, [center, centers, nearestMetro]);

  // Медианы по зданиям (Д3) — те же, что в каталоге и блоке
  // «БЦ на фоне конкурентов», чтобы одна и та же ставка не расходилась.
  const offerIndex = useMemo(() => buildOfferIndex(officeSnapshots), [officeSnapshots]);

  // Сводка по сделке (диапазон площади/цены) — используется в FAQ; на
  // самой странице с 2026-09-20 не выводится отдельной строкой, чтобы не
  // дублировать таблицу ниже (см. offers-блок).
  const marketPosition = useMemo(
    () => (center ? buildMarketPosition(center, centers ?? [], officeSnapshots, offerIndex) : null),
    [center, centers, officeSnapshots, offerIndex],
  );
  const priceComparison = useMemo(
    () => (center ? buildPriceComparison(center, centers ?? [], offerIndex) : null),
    [center, centers, offerIndex],
  );
  // Цитаты отзывов из «Интересных фактов» — отдельным блоком «Что говорят»
  // вместе с рейтингами (Б11), а не россыпью по странице.
  const reviewQuotes = useMemo(
    () =>
      (center?.highlights ?? [])
        .filter((h) => h.icon === 'reviews')
        .flatMap((h) => h.text.split(/\n+/).map((l) => l.replace(/^[-–—•\s]+/, '').trim()).filter(Boolean))
        // Было 4 — у «Порта» это молча отрезало 5-ю, критичную цитату
        // (единственную про холодные этажи с оговоркой). Порог поднят, а не
        // убран: 6 — чтобы блок не превращался в бесконечную ленту у БЦ с
        // особо длинным списком.
        .slice(0, 6),
    [center],
  );

  // FAQ использует те же модели и выборки, что видимые блоки страницы.
  const faqItems = useMemo(() => {
    if (!center) return [];
    if (center.slug === 'port') return PORT_FAQ_DEMO;
    const items: { question: string; answer: string }[] = [];
    // Короткое имя, а не center.name: вопрос «Какой класс у «Бизнес-центр
    // «Порт»»?» читается как опечатка.
    const name = shortName(center);
    const add = (question: string, answer: string | null | undefined) => {
      if (answer?.trim()) items.push({ question, answer });
    };
    const fmt = (value: number) => value.toLocaleString('ru-RU');
    const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    // bar.deltaText сам по себе — "17% дешевле"/"на уровне медианы", без
    // "чем ..." (в вёрстке бара рядом и так стоит подпись класса). В прозе
    // FAQ этого не видно, поэтому достраиваем явно; nearTypical — тот же
    // порог незначимости, что красит бар серым, а не наш собственный.
    const compareToClass = (bar: { nearTypical: boolean; deltaText: string }) =>
      bar.nearTypical ? `Это ${bar.deltaText}.` : `Это ${bar.deltaText}, чем медианное здание класса ${center.businessClass}.`;
    // Владелец, 2026-09-20: «там вся эта инфа и так есть у нас на странице,
    // у этого блока есть реальная польза?» — да, но не у каждого вопроса
    // одинаковая. Вопрос, который только повторяет голыми словами то, что
    // подписано плиткой/таблицей на самой странице (адрес рядом с "Район",
    // "7" рядом с "Этажей", обе даты снимков — то же самое, что и в блоке
    // "Источники" под FAQ), убран или слит с соседним: правило ниже —
    // остаются вопросы, которые СРАВНИВАЮТ или ОБЪЕДИНЯЮТ факты (медиана
    // класса, сколько ещё таких в каталоге, застройщик+контакты в одном
    // месте), а не однократно называют число, которое и так видно глазами.
    add(
      `Где находится «${name}»?`,
      [center.address, redistributedTechnicalParams.administrativeDistrictText ? `${redistributedTechnicalParams.administrativeDistrictText} район` : null]
        .filter(Boolean)
        .join(', '),
    );
    if (center.altNames.length > 0) {
      add(
        `Как ещё называют «${name}»?`,
        `${center.altNames.map((alt) => `«${alt}»`).join(', ')} — то же самое здание по адресу ${center.address}: одно здание с двумя названиями, а не два разных бизнес-центра.`,
      );
    }
    if (center.businessClass) {
      const sameClassOthers = (centers ?? []).filter(
        (c) => c.businessClass === center.businessClass && c.slug !== center.slug,
      );
      const sameClassSameDistrict = center.district
        ? sameClassOthers.filter((c) => c.district === center.district)
        : [];
      const districtPart =
        center.district && sameClassSameDistrict.length > 0
          ? `, ${sameClassSameDistrict.length} из них — в ${districtPrepositional(center.district)} районе`
          : '';
      add(
        `Какой класс у «${name}»?`,
        `Класс ${center.businessClass}.${sameClassOthers.length > 0 ? ` В нашем каталоге ещё ${sameClassOthers.length} ${pluralRu(sameClassOthers.length, 'здание', 'здания', 'зданий')} этого класса${districtPart}.` : ''}`,
      );
    }
    if (center.yearBuilt != null) {
      if (center.status === 'under_construction') {
        add(`Когда «${name}» будет сдан?`, `Ожидаемая сдача — ${center.yearBuilt} год.`);
      } else {
        const age = new Date().getFullYear() - center.yearBuilt;
        const yearBar = marketPosition?.bars.find((bar) => bar.label === 'Год сдачи') ?? null;
        add(
          `В каком году построен «${name}»?`,
          `Сдан в ${center.yearBuilt} году${age > 0 ? `, зданию ${age} ${pluralRu(age, 'год', 'года', 'лет')}` : ''}.${yearBar ? ` ${compareToClass(yearBar)}` : ''}`,
        );
      }
    }
    if (center.developer) {
      const info = center.developerInfo;
      const lines = [`Застройщик — ${center.developer}.`];
      if (info?.description) lines.push(info.description);
      const contactBits = [
        info?.phone ? `тел. ${info.phone}` : null,
        info?.address ?? null,
        info?.hours ? `часы работы: ${info.hours}` : null,
        info?.website ?? null,
      ].filter((v): v is string => Boolean(v));
      if (contactBits.length) lines.push(`${contactBits.join(', ')}.`);
      add(`Кто застройщик «${name}»?`, lines.join('\n'));
    }
    // Технический паспорт — было пять отдельных вопросов (этажность, общая
    // площадь, офисная площадь, "какая информация о здании указана", "какие
    // дополнительные характеристики"), каждый один в один повторял строку
    // видимой таблицы "Информация о здании" без единой новой мысли. Теперь
    // один связный ответ: сначала то, что можно сказать фразой (этажность,
    // площади), затем остальные параметры из тех же двух таблиц — без
    // обеспеченности парковкой (она в отдельном, сравнительном ответе ниже,
    // чтобы не называть одно и то же число дважды).
    {
      const techSentenceParts: string[] = [];
      const floors = center.floors;
      const perFloor = floors != null && floors > 0 && center.totalArea != null ? Math.round(center.totalArea / floors) : null;
      if (floors != null) {
        techSentenceParts.push(
          `${floors} ${pluralRu(floors, 'этаж', 'этажа', 'этажей')}${center.totalArea != null ? `, общая площадь ${fmt(center.totalArea)} м²${perFloor != null ? ` (около ${fmt(perFloor)} м² на этаж)` : ''}` : ''}`,
        );
      } else if (center.totalArea != null) {
        techSentenceParts.push(`общая площадь ${fmt(center.totalArea)} м²`);
      }
      if (center.officeArea != null) {
        const share =
          center.totalArea != null && center.totalArea > 0
            ? ` (${Math.round((center.officeArea / center.totalArea) * 100)}% от общей площади)`
            : '';
        techSentenceParts.push(`офисная площадь ${fmt(center.officeArea)} м²${share}`);
      }
      const skipLabels = new Set(['Количество этажей', 'Общая площадь', 'Площадь офисов', 'Обеспеченность парковкой (маш./100 м²)']);
      const techRows = [
        ...redistributedTechnicalParams.buildingInformationRows.filter((row) => !skipLabels.has(row.label)),
        ...redistributedTechnicalParams.firstBlockTechnicalRows,
      ].filter((row) => row.value);
      const techAnswer = [
        techSentenceParts.length ? `${capitalize(techSentenceParts.join(', '))}.` : null,
        techRows.length ? `${techRows.map((row) => `${row.label}: ${row.value}`).join('; ')}.` : null,
      ]
        .filter(Boolean)
        .join(' ');
      add(`Какие технические параметры у «${name}»?`, techAnswer || null);
    }
    // Парковка — раньше было два вопроса: свободный текст (center.parking,
    // "подземная, платная") и отдельно число из сравнения с классом. Оба
    // про одно и то же удобство, читателю нужен один ответ, а не два рядом.
    {
      const parkingBar = marketPosition?.bars.find((bar) => bar.label === 'Парковка') ?? null;
      const parts = [
        center.parking || null,
        parkingBar
          ? `Обеспеченность машиноместами — ${parkingBar.subjectDisplayValue} (${parkingBar.captionText}). ${compareToClass(parkingBar)}`
          : null,
      ].filter((v): v is string => Boolean(v));
      add(`Какая парковка у «${name}»?`, parts.join(' '));
    }
    // Остальные сравнения с медианой класса — каждое само по себе синтез
    // (число + база сравнения + вывод), поэтому остаются отдельными
    // вопросами. "До метро" называет ещё и станцию — замена отдельному
    // голому вопросу "какое метро рядом", который просто повторял то же
    // расстояние без сравнения.
    for (const bar of marketPosition?.bars ?? []) {
      // "Год сдачи" уже влит в ответ на "В каком году построен" выше,
      // "Парковка" — в объединённый ответ про парковку выше.
      if (bar.label === 'Год сдачи' || bar.label === 'Парковка') continue;
      if (bar.label === 'До метро') {
        add(
          `Какое метро рядом с «${name}» и это близко или далеко для своего класса?`,
          `Ближайшая станция метро${nearestMetro ? ` — «${nearestMetro.name}»` : ''}, ${bar.subjectDisplayValue} (${bar.captionText}). ${compareToClass(bar)}`,
        );
        continue;
      }
      add(
        `${bar.label} в «${name}» — это много или мало для своего класса?`,
        `${bar.subjectDisplayValue} (${bar.captionText}). ${compareToClass(bar)}`,
      );
    }
    // FAQ пересказывает блок «Инфраструктура рядом» теми же цифрами, что
    // нарисованы на карте и в списке под ней — но текстом, а не картой:
    // для краулера, который карту не читает, это не дубль, а единственный
    // способ узнать эти цифры. "Как добраться на транспорте" убран отдельно:
    // он был подмножеством ровно этих же цифр (метро + остановки).
    const faqNearbyLines = nearbyFaqLines(nearbyPlaces);
    if (faqNearbyLines.length) {
      add(
        `Какая инфраструктура есть рядом с «${name}»?`,
        `${faqNearbyLines.join('; ')}. Метро учитывается в радиусе 2 км, остановки — 800 м, остальное — 500 м; расстояния по прямой.`,
      );
    }
    if (center.buildingFacts.length) {
      add(
        `Что известно о здании «${name}» из других источников, помимо prometr.by?`,
        center.buildingFacts.map((fact) => `${fact.label}: ${fact.value} (по данным ${fact.source})`).join('; '),
      );
    }
    if (buildingParamHighlights.length) {
      add(
        `Какие архитектурные и инженерные особенности у «${name}»?`,
        buildingParamHighlights.map((h) => [h.label, h.text].filter(Boolean).join(': ')).join('\n'),
      );
    }
    // "Что внутри" и "что кроме офисов" читали одни и те же категории по
    // разным спискам — на "Альянс" банкомат называли дважды. Теперь одна
    // строка: производный текст (ручной ввод + категории от арендаторов),
    // плюс из точек самообслуживания — только то, чего там ещё нет.
    {
      const insideText = derivedInternalInfrastructureText || '';
      const insideLower = insideText.toLowerCase();
      const extraAmenities = tenantAmenities.filter((item) => !insideLower.includes(item.category.toLowerCase()));
      const amenitiesText = extraAmenities.length
        ? `Точки самообслуживания: ${extraAmenities.map((item) => (item.count > 1 ? `${item.category} (${item.count})` : item.category)).join(', ')}.`
        : '';
      const combined = [insideText ? `${capitalize(insideText)}.` : null, amenitiesText || null].filter(Boolean).join(' ');
      add(`Что есть внутри «${name}» кроме офисов?`, combined || null);
    }
    add('Какие условия доступной среды указаны?', accessibilityAttributes);
    add('Какие часы работы указаны?', accessHoursText);
    // FAQ обязан описывать ВЕСЬ блок «Что сейчас сдают и продают» (правило
    // владельца) — и описывает его теми же цифрами, что нарисованы выше:
    // полки по бюджету, цену лота целиком и скидку за объём считает один
    // businessCenterOfferStats, отдельной арифметики здесь нет.
    for (const stats of [saleStats, rentStats]) {
      if (!stats) continue;
      const isRent = stats.deal === 'rent';
      const verb = isRent ? 'сдают' : 'продают';
      const types = stats.propertyTypes.map((t) => `${t.propertyType.toLowerCase()} — ${t.count}`).join(', ');
      add(
        `Сколько помещений в «${name}» сейчас ${verb} и по какой цене?`,
        `${stats.count} ${pluralRu(stats.count, 'лот', 'лота', 'лотов')} площадью ${formatArea(stats.sizeMin)}–${formatArea(stats.sizeMax)} (${types}). Медианная ставка — ${formatRate(stats.median, stats.deal)}/м²${isRent ? ' в месяц' : ''}, крайние значения ${formatRate(stats.minPrice, stats.deal)}–${formatRate(stats.maxPrice, stats.deal)}/м². Один и тот же лот, выложенный сразу на нескольких площадках, считается одним.`,
      );
      add(
        isRent ? `Сколько стоит снять помещение в «${name}» целиком?` : `Сколько стоит купить помещение в «${name}» целиком?`,
        `${isRent ? 'Платёж' : 'Бюджет покупки'} по ставке объявления — от ${formatMoney(stats.totalMin)} до ${formatMoney(stats.totalMax)}${isRent ? ' в месяц' : ''}: ${stats.lots
          .map((lot) => `${formatArea(lot.size)} по ${formatRate(lot.pricePerSqm, stats.deal)}/м² — ${formatMoney(lot.size * lot.pricePerSqm)}${isRent ? ' в месяц' : ''}`)
          .join('; ')}. Это площадь × ставка, а не итоговый платёж: состав коммунальных, эксплуатационных и других платежей в объявлениях не раскрыт.`,
      );
      const buckets = buildPriceBuckets(stats);
      if (buckets) {
        add(
          isRent ? `На какой бюджет аренды можно рассчитывать в «${name}»?` : `На какой бюджет покупки можно рассчитывать в «${name}»?`,
          `Предложения здания разложены по цене: ${buckets
            .map(
              (b) =>
                `${b.label.toLowerCase()} — ${b.lots.length} ${pluralRu(b.lots.length, 'помещение', 'помещения', 'помещений')} площадью ${formatArea(b.sizeMin)}–${formatArea(b.sizeMax)}`,
            )
            .join('; ')}.`,
        );
      }
      if (stats.sizeDiscount) {
        const d = stats.sizeDiscount;
        add(
          `Зависит ли цена метра в «${name}» от размера помещения?`,
          `Да, ${isRent ? 'при аренде' : 'при покупке'} метр в крупном лоте дешевле: ${formatArea(d.smallSize)} — ${formatRate(d.smallPrice, stats.deal)}/м², ${formatArea(d.largeSize)} — ${formatRate(d.largePrice, stats.deal)}/м², разница ${Math.round(d.dropPct)}%.`,
        );
      }
    }
    // Блок «Цены в здании и по рынку» — теми же строками, что нарисованы в
    // плитках: формулировки приходят из businessCenterPriceCompare, своей
    // арифметики здесь нет (правило «FAQ описывает всё, что на странице»).
    for (const block of priceComparison?.blocks ?? []) {
      const isRent = block.deal === 'rent';
      add(
        isRent
          ? `Дорого ли снимать в «${name}» по сравнению с другими бизнес-центрами?`
          : `Дорого ли покупать в «${name}» по сравнению с другими бизнес-центрами?`,
        `${isRent ? 'Аренда' : 'Продажа'} здесь — ${block.self.value} за м²${isRent ? ' в месяц' : ''}, это ${block.verdict}. Для сравнения: ${block.bases
          .map((b) => `${b.value} (${b.note})`)
          .join(', ')}. Диапазон — цены половины зданий группы, без самой дешёвой и самой дорогой четвертей.`,
      );
    }
    if (center.rentalInfo) {
      const info = center.rentalInfo;
      add('Какие условия и контакты аренды опубликованы?', [info.terms, info.rates, info.contacts].filter(Boolean).join(' ') + ' Актуальные условия уточняйте у арендодателя.');
    }
    if (awardItems.length) add(`Какие награды есть у «${name}»?`, awardItems.join('\n'));
    if (mediaMentions.length)
      add(
        `Что писали о «${name}» в СМИ?`,
        mediaMentions
          .map((m) => `${m.outlet}${m.date ? `, ${formatMentionDate(m.date)}` : ''}: «${m.title}»`)
          .join('\n'),
      );
    if (visibleHighlights.length) add('Какие факты о здании опубликованы?', visibleHighlights.map((h) => [h.label, h.text].filter(Boolean).join(': ')).join('\n'));
    const history = extractHistoryPoints(center);
    if (history.length) add('Что известно об истории здания?', history.map((h) => `${h.year}: ${h.text}`).join('; '));
    if (tenantOrganizations.length) {
      // Направления — ровно то, чем фильтруется каталог на странице: FAQ
      // обязан описывать её содержимое, а не отдельную классификацию.
      const directionCounts = new Map<string, number>();
      for (const org of tenantOrganizations) {
        const label = tenantDirectionLabel(org.industry);
        directionCounts.set(label, (directionCounts.get(label) ?? 0) + 1);
      }
      // По убыванию — как в выпадающем фильтре; вразнобой читается как свалка.
      const directions = [...directionCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
      const reported = tenantSource === '2gis' ? gis2?.tenantOrganizationsTotal ?? null : null;
      const partialNote =
        reported != null && reported > tenantOrganizations.length
          ? `Список неполный: в источнике указано ${reported} организаций. `
          : '';
      add(
        'Сколько организаций в здании и по каким направлениям?',
        `В списке ${tenantSource === '2gis' ? '2ГИС' : 'Яндекс.Карт'} ${tenantOrganizations.length} организаций: ${directions.map(([label, count]) => `${label} — ${count}`).join('; ')}. ${partialNote}Это сведения о соседях и сервисах, не показатель загрузки здания или спроса.`,
      );
      // Тот же расклад по этажам, что нарисован в каталоге, — из общей
      // функции: FAQ обязан повторять страницу, а не считать своё.
      const floors = buildFloorGroups(tenantOrganizations);
      if (floors.length > 0) {
        const withFloor = floors.reduce((sum, group) => sum + group.count, 0);
        add(
          'На каких этажах сидят организации?',
          `${floors.map((group) => `${formatFloorLabel(group.floor)} — ${group.count}`).join('; ')}. Этаж известен у ${withFloor} организаций из ${tenantOrganizations.length}.`,
        );
      }
    }
    // Рейтинг у нас приезжает из карточки Яндекс.Карт в свободном тексте
    // фактов — 2ГИС из этого ответа убран вместе с блоком «Отзывы» (владелец,
    // 2026-09-22): FAQ не должен называть источник, которого на странице
    // больше не видно.
    const yandexRatings = parseHighlightRatings(center.highlights);
    const ratingParts = [
      // mapRatingFromHighlights берёт только первую строку/первое число —
      // годится как общий индикатор для порога рейтинга (используется и в
      // ranking-странице), но для читаемого текста тут нужен именно
      // parseHighlightRatings: он не путает вступительное предложение с
      // названием источника у зданий с несколькими карточками Яндекс.Карт
      // (см. WhatTheySayBlock).
      ...yandexRatings.map(
        (r) =>
          `${r.source} — ${r.value}${r.totalCount != null ? ` (оценок: ${r.totalCount})` : ''}${r.corpusCount > 1 ? `, ${r.corpusCount} корпуса` : ''}`,
      ),
    ].filter(Boolean);
    if (ratingParts.length) add(`Какая оценка у «${name}» на картах?`, `${ratingParts.join('; ')}.`);
    if (reviewQuotes.length) {
      add(
        'Что пишут в отзывах?',
        reviewQuotes
          .map(parseReviewQuote)
          .map((q) => `${q.author ? `${q.author}: ` : ''}${q.isQuote ? `«${q.text}»` : q.text}`)
          .join('\n'),
      );
    }
    add('Как исправить сведения о здании?', 'Если хотите добавить, убрать или изменить информацию, напишите на a@redevelopment.pro, указав бизнес-центр и сведения, которые нужно поправить.');
    return items;
  }, [center, centers, nearestMetro, marketPosition, accessibilityAttributes, accessHoursText, saleStats, rentStats, awardItems, mediaMentions, visibleHighlights, gis2, tenantOrganizations, tenantAmenities, tenantSource, reviewQuotes, redistributedTechnicalParams, derivedInternalInfrastructureText, nearbyPlaces, priceComparison?.blocks]);

  // Б7: липкое меню «На странице». Пункт появляется только если
  // соответствующий блок реально отрисован — ссылка на несуществующий
  // якорь никуда не ведёт и выглядит поломкой. Блоки-рекомендации других БЦ
  // сюда не попадают — владелец, 2026-09-20, решил не множить пункты меню,
  // когда таких блоков на странице несколько (микрорайон/метро/рейтинг/
  // класс×район/улица) и их позиция не привязана к конкретному месту
  // (см. recommendationSlots ниже).
  const pageSections = useMemo(() => {
    if (!center) return [];
    const has = (id: string, cond: boolean) => (cond ? { id, label: SECTION_LABELS[id] } : null);
    // Порядок пунктов повторяет порядок блоков на странице (владелец принял
    // 2026-09-20; "Параметры здания" переехали под "Историю здания"
    // 2026-09-22): что предлагают и почём → где оно → кто внутри → на фоне
    // конкурентов → отзывы → блоки доверия (награды/СМИ/факты/история/
    // параметры здания) → застройщик → FAQ.
    return [
      has('offers', saleStats !== null || rentStats !== null),
      has(
        'rental',
        Boolean(
          center.rentalInfo && (center.rentalInfo.terms || center.rentalInfo.rates || center.rentalInfo.contacts),
        ),
      ),
      // Карта есть у любого БЦ с координатами — с 2026-09-20 блок рисуется
      // на всех страницах каталога, а не только там, где собран снимок
      // точек. Подпись пункта меню повторяет заголовок блока: вести
      // «Инфраструктуру рядом» на голую карту — обещать то, чего там нет.
      center.lat != null && center.lng != null
        ? {
            id: 'map',
            label: hasNearbyContent(center, nearbyPlaces) ? SECTION_LABELS.map : 'Расположение',
          }
        : null,
      has('tenants', tenantOrganizations.length > 0),
      has('market', Boolean(marketPosition && marketPosition.bars.length > 0)),
      has(
        'reviews',
        center.highlights.some((h) => h.icon === 'rating') ||
          reviewQuotes.length > 0 ||
          reviews.some((r) => r.source !== '2gis'),
      ),
      has('awards', awardItems.length > 0),
      has('media', mediaMentions.length > 0),
      has('facts', visibleHighlights.length > 0),
      has('history', extractHistoryPoints(center).length >= 2),
      has(
        'tech',
        redistributedTechnicalParams.buildingInformationRows.length > 0 ||
          center.buildingFacts.length > 0 ||
          buildingParamHighlights.length > 0 ||
          Boolean(center.parking || accessHoursText || accessibilityAttributes),
      ),
      has('developer', Boolean(center.developerInfo)),
      has('faq', faqItems.length > 0),
    ].filter((v): v is { id: string; label: string } => v !== null);
  }, [
    center,
    marketPosition,
    saleStats,
    rentStats,
    awardItems,
    visibleHighlights,
    buildingParamHighlights,
    mediaMentions,
    tenantOrganizations,
    faqItems,
    redistributedTechnicalParams,
    reviewQuotes,
    accessHoursText,
    accessibilityAttributes,
    nearbyPlaces,
    reviews,
  ]);

  // Сколько в блоке повторяющихся элементов — единственное, что нужно
  // модели высот из businessCenterPageLayout, чтобы прикинуть, насколько
  // блок длинный. Смысл числа у каждого блока свой: у offers это строки
  // таблицы, у faq — вопросы, у market — полосы сравнения, у rental и
  // developer — строки текста после переноса.
  const sectionSizes = useMemo<PageSectionSize[]>(() => {
    if (!center) return [];
    const rentalInfo = center.rentalInfo;
    const developerInfo = center.developerInfo;
    const sizeOf = (id: string): number => {
      switch (id) {
        // С 2026-09-21 блок — две колонки (продажа и аренда) рядом: высоту
        // задаёт та колонка, что длиннее, а не сумма обеих. С 2026-09-22
        // внутри колонки не сплошной список, а полки по бюджету, и строки
        // видны только в раскрытой — их не больше шести.
        case 'offers':
          return Math.max(saleStats?.count ?? 0, rentStats?.count ?? 0);
        case 'rental':
          return rentalInfo
            ? [rentalInfo.terms, rentalInfo.rates, rentalInfo.contacts].reduce(
                (sum, text) => sum + estimateTextLines(text, 95),
                0,
              )
            : 0;
        case 'tech':
          return (
            redistributedTechnicalParams.buildingInformationRows.length +
            center.buildingFacts.length +
            buildingParamHighlights.length +
            (center.parking ? 1 : 0) +
            (accessHoursText ? 1 : 0) +
            (accessibilityAttributes ? 1 : 0)
          );
        // Высоту карты задаёт не число точек, а число КАТЕГОРИЙ: точки
        // свёрнуты в чипы-фильтры по одному на категорию.
        case 'map':
          return new Set(nearbyPlaces.map((place) => place.category)).size;
        case 'market':
          return marketPosition?.bars.length ?? 0;
        // Настоящие отзывы вытесняют кураторские цитаты и выводятся
        // постранично по 6 (MAX_REAL_REVIEWS в BusinessCenterMarketBlocks).
        case 'reviews': {
          const realReviewCount = reviews.filter((r) => r.source !== '2gis').length;
          return realReviewCount > 0 ? Math.min(realReviewCount, 6) : reviewQuotes.length;
        }
        case 'awards':
          return awardItems.length;
        case 'media':
          return mediaMentions.length;
        case 'facts':
          return visibleHighlights.length;
        case 'history':
          return extractHistoryPoints(center).length;
        case 'developer':
          return developerInfo ? estimateTextLines(developerInfo.description, 110) : 0;
        case 'faq':
          return faqItems.length;
        // tenants — пагинация по 6 карточек, высота от числа организаций
        // не зависит вовсе.
        default:
          return 0;
      }
    };
    return pageSections.map((section) => ({ id: section.id, items: sizeOf(section.id) }));
  }, [
    center,
    pageSections,
    saleStats,
    rentStats,
    redistributedTechnicalParams,
    accessHoursText,
    accessibilityAttributes,
    nearbyPlaces,
    marketPosition,
    reviews,
    reviewQuotes,
    awardItems,
    mediaMentions,
    visibleHighlights,
    buildingParamHighlights,
    faqItems,
  ]);

  // Раскладка блоков-рекомендаций по странице — вся логика в
  // src/lib/businessCenterPageLayout.ts, там же разбор, почему предыдущие
  // две версии ставили блоки кучей в середине страницы. Здесь остаётся
  // только сопоставить выбранные места с очередью блоков: она уже
  // отсортирована по приоритету (богаче пулом кандидатов — раньше, см.
  // recommendationBlocks), так что самый содержательный блок достаётся
  // самому верхнему месту.
  const recommendationSlots = useMemo(() => {
    const slots = new Map<string, RecommendationBlockId[]>();
    planRecommendationSlots(sectionSizes, recommendationBlocks.length).forEach((sectionId, index) => {
      const block = recommendationBlocks[index];
      if (block) slots.set(sectionId, [...(slots.get(sectionId) ?? []), block.id]);
    });
    return slots;
  }, [sectionSizes, recommendationBlocks]);

  const recommendationBlocksById = useMemo(
    () => new Map(recommendationBlocks.map((b) => [b.id, b])),
    [recommendationBlocks],
  );

  const renderRecommendationSlot = (sectionId: string): ReactNode => {
    const ids = recommendationSlots.get(sectionId);
    if (!ids || ids.length === 0) return null;
    return ids.map((id) => {
      const data = recommendationBlocksById.get(id);
      return data ? <RelatedCentersSection key={id} {...data} /> : null;
    });
  };

  // «Что там есть» — состав здания в description сниппета. Источник тот же
  // список организаций и та же инфраструктура, что нарисованы на странице
  // (замер Wordstat 18.08–18.09.2026: отраслевые формулировки — ноль,
  // «бизнес центр аякс минск что там есть» — 5/мес; см. К16 в
  // docs/bc-catalog-redesign-plan.md). Пока срез Яндекса не приехал,
  // tenantOrganizations уже отдаёт материализованный список из самой строки
  // БЦ — то есть у пререндера состав есть с первого кадра.
  const pageComposition = useMemo(
    () => ({
      organizationCount: tenantOrganizations.length,
      infrastructure: center?.infraInternal ?? [],
    }),
    [tenantOrganizations, center],
  );

  useEffect(() => {
    if (!center) return;
    setBusinessCenterPageMeta(center.slug, center, withBcPhotoVersion(center.photos[0] ?? ''), pageComposition);
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bcminsk' },
      { name: shortName(center) },
    ]);
    // Б12: разметка самого здания. Удобства берём из уже собранных фактов
    // (инфраструктура внутри, доступная среда, круглосуточный доступ) — не
    // выдумываем список, которого нет в данных.
    setPlaceJsonLd({
      name: fullName(center),
      altNames: center.altNames,
      url: `https://redevelopment.pro/minsk/bcminsk/${center.slug}`,
      address: center.address,
      image: center.photos[0] ? withBcPhotoVersion(center.photos[0]) : undefined,
      lat: center.lat,
      lng: center.lng,
      amenities: [
        ...center.infraInternal,
        ...(center.is24x7 ? ['Круглосуточный доступ'] : []),
        ...(center.accessibility.length > 0 ? ['Доступная среда'] : []),
      ],
    });
    return () => setPlaceJsonLd(null);
  }, [center, pageComposition]);

  // Метаданные страницы выше сбрасывают JSON-LD: FAQ записываем после них.
  useEffect(() => {
    setFaqJsonLd(faqItems);
    return () => setFaqJsonLd([]);
  }, [faqItems]);

  // Слаг не найден (опечатка в ссылке, удалённый БЦ) — soft-404: страница
  // остаётся доступной (200, не редирект), но не индексируется, тот же
  // принцип, что и у ObjectLandingPage для неизвестного /:slug.
  useEffect(() => {
    if (centers === null || center) return;
    setNoIndex();
    return () => clearNoIndex();
  }, [centers, center]);

  if (centers === null) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-bg">
        {/* text-ink: прямо на фоне страницы muted даёт 4,48:1 — ниже порога.
            <main> и здесь — чтобы landmark был в любом состоянии страницы. */}
        <p className="text-sm text-ink">Загрузка…</p>
      </main>
    );
  }

  if (!center) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-base text-ink">Такой бизнес-центр не найден.</p>
        <Link to="/minsk/bcminsk" className="text-sm font-semibold text-primary-hover hover:underline">
          ← Все бизнес-центры Минска
        </Link>
      </main>
    );
  }

  // Владелец, 2026-09-20: "из адреса убираем город и район, только улица и
  // дом" — та же обрезка, что и на карточке каталога (shortAddress).
  const displayAddress = shortAddress(center.address);
  // Сайт застройщика — обычно ДРУГОЙ домен, чем сайт самого БЦ выше
  // (у «Футуриса» это futuris-bc.by у здания и tapas.by у ГК «Тапас»),
  // поэтому не переиспользуем businessCenterHomepageUrl: тот список
  // BUSINESS_CENTER_WEBSITE_OVERRIDES заведён под конкретные проверенные
  // сайты БЦ, не застройщиков. label — голый хост без протокола/www, как в
  // карточке "Застройщик района" на гиде по Минск Миру.
  const developerWebsiteRaw = center.developerInfo?.website?.trim();
  let developerWebsiteUrl: { href: string; label: string } | null = null;
  if (developerWebsiteRaw) {
    try {
      const url = new URL(/^https?:\/\//i.test(developerWebsiteRaw) ? developerWebsiteRaw : `https://${developerWebsiteRaw}`);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        developerWebsiteUrl = { href: url.href, label: url.host.replace(/^www\./, '') };
      }
    } catch {
      developerWebsiteUrl = null;
    }
  }
  return (
    <div className="min-h-svh bg-bg px-4 py-5 sm:py-8">
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md xl:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </Link>
        {/* Владелец, 2026-09-06: "крестик плохо подходит, он как будто про
            закрытие, но те, кто придёт на эту страницу из поиска, ещё не
            видел главную страницу" — крестик подразумевает "закрыть уже
            открытое", а для гостя из поисковика это первая страница сайта
            вообще, тут нужна навигация "назад к списку", не закрытие.
            Плюс "должно выглядеть заметнее" — обычная приглушённая текстовая
            ссылка заменена на pill-кнопку (тот же glassPillClass, что и у
            стрелок prev/next ниже на странице). */}
        <Link
          to="/minsk/bcminsk"
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:text-primary',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Все бизнес-центры</span>
          <span className="sm:hidden">Все БЦ</span>
        </Link>
        </div>
        {pageSections.length > 0 && (
          <div className="mx-auto mt-2 max-w-5xl">
            <nav aria-label="Навигация по странице" className="-mx-1 flex gap-3 overflow-x-auto px-1 text-xs text-ink-muted">
              {pageSections.map((sec) => (
                <a key={sec.id} href={`#${sec.id}`} className="shrink-0 whitespace-nowrap hover:text-primary-hover">
                  {sec.label}
                </a>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Стрелки влево/вправо по краям экрана — тот же паттерн, что и в
          ImageLightbox.tsx. Только от lg — на мобильном места мало, там
          навигация — строка кнопок под карточкой ниже. */}
      {prev && (
        <Link
          to={`/minsk/bcminsk/${prev.slug}`}
          aria-label={`Предыдущий бизнес-центр: ${shortName(prev)}`}
          className={cn(
            'fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full p-3 text-ink lg:flex',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      )}
      {next && (
        <Link
          to={`/minsk/bcminsk/${next.slug}`}
          aria-label={`Следующий бизнес-центр: ${shortName(next)}`}
          className={cn(
            'fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full p-3 text-ink lg:flex',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}

      <div
        className={cn(
          'mx-auto grid max-w-7xl items-start gap-6',
          pageSections.length > 0 && 'xl:grid-cols-[15rem_minmax(0,1fr)]',
        )}
      >
        {pageSections.length > 0 && (
          <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] flex-col gap-4 xl:flex">
            <Link to="/minsk" className="px-2 text-lg font-extrabold tracking-wide text-ink">
              <span className="font-black text-primary">RED</span>EVELOPMENT
            </Link>
            <Link
              to="/minsk/bcminsk"
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:text-primary',
                glassPillClass,
              )}
              style={glassPillShadow}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Все бизнес-центры
            </Link>
            <nav
              aria-label="Навигация по странице"
              className={cn('min-h-0 overflow-y-auto p-4', glassCardClass)}
              style={glassCardShadow}
            >
              <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">На странице</p>
              <div className="flex flex-col">
                {pageSections.map((sec) => {
                  const SectionIcon = SECTION_ICONS[sec.id] ?? FileText;
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      className="group flex items-start gap-3 rounded-xl px-2 py-2 text-sm leading-snug text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <SectionIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-primary" />
                      <span>{sec.label}</span>
                    </a>
                  );
                })}
              </div>
            </nav>
          </aside>
        )}

        {/* <main> — единственный main-landmark страницы (Accessibility). */}
        <main className="min-w-0 xl:pt-[7.75rem]">
        <div className={cn('overflow-hidden', glassCardClass)} style={glassCardShadow}>
          {/* Компактная версия первого экрана: на широком экране фото и
              основная сводка стоят рядом. Прежняя вертикальная версия целиком
              сохранена в родительском коммите этой правки и откатывается
              одним revert без затрагивания остальных блоков страницы. */}
          <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-muted/70 lg:aspect-auto lg:min-h-[28rem]">
              {/* cover, не contain — владелец, 2026-09-20: "на некоторых
                  разрешениях фото не вписано в высоту карточки, остаются
                  поля — полей быть не должно, где это возможно". contain
                  сохраняет весь кадр, но на контейнере с фиксированной
                  aspect-ratio/min-height даёт пустые поля у любого фото, чьё
                  соотношение сторон не совпадает с контейнером — было заметно
                  почти на каждом здании, а не только у двух прежних
                  исключений (port/victoria-plaza, для которых cover включали
                  точечно). */}
              <PhotoBlock center={center} variant="detail" fit="cover" />
              {/* Владелец, 2026-09-20: "если БЦ построен, вообще убирай тег
                  Работает — помечаем только строящиеся". Достроенное здание
                  и так по умолчанию работает, отдельная пометка для него
                  избыточна; "Строится" — исключение, которое стоит подсветить. */}
              {center.status === 'under_construction' && (
                <div className="absolute left-4 top-4">
                  <Badge tone="warning" className="shadow-sm backdrop-blur-sm">
                    Строится
                  </Badge>
                </div>
              )}
              {/* Избранное — в правом углу фотки (владелец, 2026-09-21:
                  "добавление в избранное перенесем в правый угол фотки").
                  Рейтинг Яндекс.Карт, который раньше был бейджем в этом же
                  углу, переехал в плитку фактов ниже (заменил "Этажей") —
                  второй раз тот же угол не занят. */}
              <div className="absolute right-4 top-4">
                <FavoriteButton slug={center.slug} />
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-0.5">
              {/* Второе имя здания — сразу под заголовком, а не только в
                  title: по Wordstat БЦ «V» ищут как «Столица» чаще, чем под
                  основным именем, и человек, пришедший по такому запросу,
                  должен увидеть знакомое слово на первом экране, иначе
                  решит, что попал не туда. */}
              <h1 className="text-2xl font-extrabold leading-tight text-ink">{fullName(center)}</h1>
              {center.altNames.length > 0 && (
                <p className="text-sm text-ink-muted">
                  Также известен как {center.altNames.map((alt) => `«${alt}»`).join(', ')}
                </p>
              )}
            </div>

            {/* Район, адрес и метро — три горизонтальные строки: подпись и
                значение находятся на одной базовой линии. Разделитель-тире
                между подписью и значением убран (владелец, 2026-09-20: "бесят
                три тире в районе, адресе и метро") — расстояние в сетке между
                колонками само отделяет подпись от значения. */}
            <section className="rounded-2xl border border-border bg-surface-muted/60 px-3.5 py-3" aria-labelledby="location-summary-title">
              <h2 id="location-summary-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Расположение
              </h2>
              <div className="mt-2.5 space-y-2">
                {redistributedTechnicalParams.administrativeDistrictText && (
                  <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      Район
                    </p>
                    <p className="mt-0.5 min-w-0 text-sm leading-snug text-ink sm:mt-0">
                      {redistributedTechnicalParams.administrativeDistrictText}
                    </p>
                  </div>
                )}
                <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Адрес</p>
                  {/* Улица внутри адреса раньше вела на уличный хаб каталога
                      (STREET_SLUGS) — владелец, 2026-09-20: "не нравится
                      кликабельная улица в адресе, у нас есть блок «Бизнес-
                      центры на этой улице»" — эта ссылка дублировала блок
                      ниже, убрана, адрес остаётся обычным текстом. */}
                  <p className="mt-0.5 min-w-0 text-sm leading-snug text-ink sm:mt-0">{displayAddress}</p>
                </div>
                {(nearestMetro || center.metro) && (
                  <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Метро</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm leading-snug text-ink sm:mt-0">
                      {nearestMetro ? (
                        <>
                          {/* Цвет линии — как на карточках каталога
                              (METRO_LINE_DOT_CLASS): владелец, 2026-09-20,
                              "добавляй цветной кружочек для обозначения линии
                              метро". Серая точка — когда линия не одна из
                              трёх известных (пока таких станций нет, но на
                              случай новых веток). */}
                          <span
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              metroLineId(nearestMetro.line) ? METRO_LINE_DOT_CLASS[metroLineId(nearestMetro.line)!] : 'bg-ink-faint',
                            )}
                          />
                          {nearestMetro.name} — {nearestMetro.distanceMeters} м по прямой
                        </>
                      ) : (
                        <>
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink-faint" />
                          {center.metro}
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </section>
            {/* Застройщик короткой строкой убран отсюда 2026-09-20 —
                владелец: "убираем из главного блока", своя развёрнутая
                карточка (логотип/описание/контакты) теперь идёт отдельной
                секцией сразу под этим главным блоком, см. developerInfo
                ниже. Короткая текстовая версия осталась только в FAQ
                ("Кто застройщик «...»?"). Отдельный блок "Сайт БЦ" убран
                отсюда же 2026-09-20 — сайт здания больше не выводится
                отдельной ссылкой нигде на странице (владелец, 2026-09-22:
                убрать отдельные плашки на конкретные сайты из блока
                источников), он попадает только в общий список попапа
                «Источники» наравне с остальными. */}

            {/* Ровно 4 плитки — класс/площадь/год/рейтинг (владелец,
                2026-09-06, четвёртый заход: "4 карточки - класс, площадь, год
                сдачи, этажность") — метро/застройщик переехали в обычные
                строки выше, парковка — в блок «Информация о здании». Четвёртую
                плитку владелец 2026-09-21 попросил заменить: "заменим плитку
                этажности на рейтинг на яндекс.картах" — этажность из плиток
                ушла (число этажей у здания и так не главный довод при выборе,
                а рейтинг с Яндекс.Карт был снаружи, бейджем на фото, и
                терялся рядом с заголовком). Класс — обычный текст, как у
                остальных плиток (владелец, 2026-09-06, пятый заход: "дизайн
                Класса отличается от других заголовков, сделай одинаково" —
                раньше был цветной Badge-пилюля вместо текста). */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {center.businessClass && (
                <FactTile value={`Класс ${center.businessClass}`} label="Деловой класс" tone="muted" />
              )}
              {center.totalArea != null && (
                <FactTile value={`${center.totalArea.toLocaleString('ru-RU')} м²`} label="Общая площадь" tone="muted" />
              )}
              {center.yearBuilt != null && (
                <FactTile
                  tone="muted"
                  value={`${center.yearBuilt} г.`}
                  label={center.status === 'under_construction' ? 'Ожидаемая сдача' : 'Год сдачи'}
                />
              )}
              {mapRating && (
                <FactTile
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
                      {mapRating.label}
                    </span>
                  }
                  label="Яндекс.Карты"
                  tone="muted"
                />
              )}
            </div>

            {/* Внутренняя инфраструктура относится к основной сводке и на
                широком экране заполняет свободную область справа от фото.
                Текст — вручную набранный владельцем плюс достроенные из
                списка организаций категории (derivedInternalInfrastructureText). */}
            {(derivedInternalInfrastructureText || tenantOrganizations.length > 0) && (
              <InternalInfrastructureRow
                text={derivedInternalInfrastructureText}
                organizationCount={tenantOrganizations.length}
                compact
              />
            )}

            </div>
          </div>
        </div>

        {/* "Интересные факты" — отдельная от условий аренды категория:
            история объекта, известные арендаторы, награды/СМИ, рейтинг и
            отзывы с карт (владелец, 2026-09-06: "подтянуть рейтинг из
            Яндекс.Карт, отзывы, другую инфу... чтобы страница была даже
            понятнее, чем официальный сайт"). history/tenants/media — веб-
            поиск (Gemini+google_search), КАЖДЫЙ факт перепроверен отдельным
            независимым поиском (см. комментарий у BusinessCenterHighlights
            в data/businessCenters.ts — первая попытка дала неподтверждённые
            детали). rating/reviews заполняются владельцем вручную — прямой
            поиск с картами дал похожие на правду, но выдуманные цитаты
            отзывов, публиковать нельзя. */}

        {/* Объявления с Kufar и Realt — было "Рынок в этом здании", владелец
            переименовал (2026-09-06), чтобы сразу было понятно источник
            данных. История правок самой таблицы (разбивка по типу
            помещения, явная строка "нет объявлений" вместо исчезновения
            секции, убранные прямые ссылки на Kufar/Realt) — см. запись
            2026-09-05 в docs/session-journal.md. С 2026-09-20 (владелец):
            если по БЦ нет объявлений на внешних площадках, блок целиком не
            выводится — раньше на этом месте была строка-заглушка.

            2026-09-21: таблица «тип помещения × диапазон цены» заменена
            сначала на плитки с медианами, потом — после «прям овер сложно
            воспринимать инфу, нужно упрощать, чтобы поняла домохозяйка» —
            на список самих помещений с ценой каждого. Разбор и правила —
            в BuildingOffersSection и lib/businessCenterOfferStats.ts.
            Сравнение со срезом рынка живёт в соседнем блоке «Цены в
            здании и по рынку», окупаемость не считается вовсе (обе
            причины — в комментариях тех файлов). */}
        <BuildingOffersSection sale={saleStats} rent={rentStats} />

        {/* Цены здания против рынка. Прежде здесь лежали два предложения с
            процентами («Аренда в этом здании — $15/м²/мес, это выше на 30%
            медианы по классу B…»); владелец 2026-09-21: блок нечитаемый,
            нужен понятный обычному человеку, а не аналитику. Что и почему
            считается именно так — в lib/businessCenterPriceCompare.ts,
            перебранные и отвергнутые макеты — в комментарии у
            PriceComparisonBlock. */}
        {/* Снимок рынка пересобирается раз в месяц, а объявления синк
            заменяет чаще — у здания, где объявления кончились, снимок ещё
            живёт. Подпись «4 предложения в здании» в таком случае врала бы
            настоящим временем, поэтому блок привязан к текущим объявлениям,
            а не только к снимку. */}
        {offers !== null && offers.length > 0 && priceComparison && <PriceComparisonBlock comparison={priceComparison} />}

        {renderRecommendationSlot('offers')}

        {/* Отдел аренды БЦ, с офиц. сайта БЦ (владелец, 2026-09-05, на
            примере "Проспект"/Elite Estate — по нему нет объявлений на
            Kufar/Realt, но на собственном сайте есть условия для
            арендаторов: "пройдись по сайтам БЦ и поищешь такую информацию").
            Собрано веб-поиском (Gemini через ProxyAPI — прямого доступа к
            большинству сайтов БЦ из песочницы нет). Первая версия рисовала
            всё одним абзацем — владелец: "верстка — пиздец, разбей на
            логические блоки, используй форматирование" — теперь отдельная
            подписанная строка на каждый раздел (LabeledTextRow). Каждое поле
            независимо может быть null — рисуем только то, что реально
            нашлось. Порядок блоков страницы пересобран 2026-09-20 (владелец
            принял предложенный порядок): условия аренды идут сразу за
            "Объявления на рынке" — оба блока отвечают на один и тот же
            вопрос "что тут есть и почём". Акцентный жёлтый блок с оговоркой
            источника (`caveat`) и дисклеймер "собрано автоматически...
            не куратировано вручную" под карточкой убраны тем же днём —
            владелец: "убери все предупреждения такого плана с сайта".
            Заголовок переименован и раздел "Площади и типы помещений" убран
            2026-09-22 — владелец: это дублировало totalArea/floors, уже
            показанные в "Параметрах здания", и вообще не про вопрос аренды. */}
        {center.rentalInfo && (center.rentalInfo.terms || center.rentalInfo.rates || center.rentalInfo.contacts) && (
          <div id="rental" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              Отдел аренды БЦ
            </h2>

            <div className="flex flex-col divide-y divide-border">
              <LabeledTextRow icon={ScrollText} label="Условия аренды" text={center.rentalInfo.terms} />
              <LabeledTextRow icon={Banknote} label="Ставки" text={center.rentalInfo.rates} />
              <LabeledTextRow icon={Phone} label="Контакты отдела аренды" text={center.rentalInfo.contacts} />
            </div>
          </div>
        )}

        {renderRecommendationSlot('rental')}

        {/* Карта и инфраструктура рядом — перед арендаторами и сравнением
            с конкурентами (владелец, 2026-09-20: принял предложенный
            порядок блоков страницы; см. подпись пункта меню "На странице"
            ниже про то, что карта есть у любого БЦ с координатами).
            "Параметры здания" отсюда переехали ниже, под "Историю здания"
            (владелец, 2026-09-22) — см. блок с id="tech" в конце страницы. */}
        {center && <NearbyInfrastructureBlock center={center} places={nearbyPlaces} />}

        {renderRecommendationSlot('map')}

        {/* Каталог арендаторов. Источник с 2026-09-19 — срез Яндекс.Карт
            (владелец отказался от платного 2GIS API, деньги вернули): 7608
            организаций по 139 зданиям против 4614 у 2GIS, и на организацию
            есть этаж, офис, рейтинг и ссылка на карточку. Старые данные 2GIS
            не выбрасываем — они остались фолбэком для зданий без яндексовского
            списка, отрасль у них приходит готовой и попадает в ту же шкалу.

            Сортировка по отзывам наконец честная: владелец просил её ещё
            2026-09-06 ("на первое место ставь места с максимумом отзывов на
            картах"), но тогда рейтинг был известен только по зданию целиком —
            теперь число оценок есть на саму организацию. */}
        {tenantOrganizations.length > 0 && (
          <TenantDirectory
            organizations={tenantOrganizations}
            amenities={tenantAmenities}
            source={tenantSource}
            capturedAt={
              tenantSource === '2gis' ? gis2?.tenantOrganizationsFetchedAt ?? null : tenantSnapshot?.capturedAt ?? null
            }
            // Потолок выдачи — беда только 2GIS (50 организаций на здание);
            // яндексовский срез снимается прокруткой до конца списка, и
            // оговорка про неполноту там была бы неправдой.
            reportedTotal={tenantSource === '2gis' ? gis2?.tenantOrganizationsTotal ?? null : null}
          />
        )}

        {renderRecommendationSlot('tenants')}

        {/* Сравнение с конкурентами — после того как показали цену, условия
            аренды, параметры здания и список арендаторов: сначала факты о
            самом БЦ, потом оценка "дорого/дёшево" на их фоне (владелец,
            2026-09-20: принял предложенный порядок блоков страницы; было
            на этом же месте, но раньше — до параметров здания и
            арендаторов — с общим комментарием на пару с картой ниже). */}
        {center && marketPosition && <MarketPositionBlock position={marketPosition} />}

        {renderRecommendationSlot('market')}

        {center && <WhatTheySayBlock key={center.slug} center={center} reviewQuotes={reviewQuotes} reviews={reviews} />}

        {renderRecommendationSlot('reviews')}

        {/* Награды — свой блок, а не строка в "Интересных фактах" (владелец,
            2026-09-20: "уберём это из фактов и сделаем прям блок Награды,
            если они есть. Формат — список, но чуть более большим шрифтом и
            с иконкой"). Отсюда и отличия от LabeledTextRow ниже: text-base
            вместо text-sm и цвет основного текста. Иконка кубка — ТОЛЬКО в
            заголовке: первая версия ставила её ещё и на каждый пункт, и
            владелец сразу поправил ("одной иконки для заголовка хватит, для
            самих премий просто точки, как в интересных фактах") — отсюда
            обычные маркеры списка. Блок не рисуется вовсе, если наград нет
            — как и весь остальной кастом на странице БЦ.

            Список строим из готовых строк awardItems, а не через
            renderRentalText: тот рисует буллеты мелким шрифтом абзаца,
            а нужен тот же маркер, но крупнее. */}
        {awardItems.length > 0 && (
          <div id="awards" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Trophy className="h-5 w-5 shrink-0 text-primary" />
              Награды
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-muted marker:text-ink-muted">
              {awardItems.map((item, i) => (
                <li key={i}>{renderBold(item)}</li>
              ))}
            </ul>
          </div>
        )}

        {renderRecommendationSlot('awards')}

        {/* «СМИ о здании» — владелец, 2026-09-20: «мне нравится подборка,
            давай сделаем блок с этими 5. В блок ставим логотип СМИ (в png и
            без фона), заголовок статьи, дату статьи». Раньше пресса была
            строкой внутри «Интересных фактов» («об этом писали Forbes и
            Habr») — без ссылок и дат, то есть читатель не мог дойти до
            первоисточника, ради которого блок и нужен.

            Дата и дисклеймер про источники убраны из самой карточки
            (владелец, 2026-09-20: единый размер шрифта с "Интересными
            фактами", даты и пояснение про ссылки — лишние) — дата остаётся
            только в FAQ-тексте (formatMentionDate ниже по файлу). Логотип
            берём из реестра по домену ссылки (data/mediaOutlets.ts); издания
            без логотипа рисуем названием — подборка не должна ждать, пока
            найдётся очередной PNG.

            Критерии отбора публикаций — docs/bc-media-research-brief.md. */}
        {mediaMentions.length > 0 && (
          <div id="media" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Newspaper className="h-5 w-5 shrink-0 text-primary" />
              СМИ о здании
            </h2>
            <ul className="flex flex-col divide-y divide-border">
              {mediaMentions.map((mention, i) => (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <a
                    href={mention.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <MediaOutletMark url={mention.url} outlet={mention.outlet} />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm leading-relaxed text-ink-muted underline-offset-4 group-hover:underline">
                        {mention.title}
                        <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 shrink-0 -translate-y-px align-middle text-ink-muted/50 group-hover:text-primary" />
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {renderRecommendationSlot('media')}

        {/* "Интересные факты" — произвольный набор блоков, разный у каждого
            БЦ (владелец, 2026-09-06, второй заход: "старайся делать
            кастомную страницу под каждый БЦ. Если у БЦ нет наград, не
            делай этот блок вообще. Если есть что-то новое — кастомный
            блок"). Раньше был фиксированный объект (history/tenants/media/
            rating/reviews), теперь — HighlightSection[] (см. комментарий у
            BusinessCenter.highlights в data/businessCenters.ts). icon
            'warning' (как и caveat в RentalInfo) с 2026-09-20 не рендерится
            вовсе — владелец: "убери все предупреждения такого плана с
            сайта", жёлтый акцентный блок с оговоркой источника убран из
            шаблона целиком, отфильтровывается в visibleHighlights.
            Позиция на странице менялась дважды: 2026-09-17 — сразу после
            главной карточки, 2026-09-20 — в группу блоков доверия (награды/
            СМИ/факты/история), после цены, параметров здания, арендаторов
            и сравнения с конкурентами (владелец принял предложенный
            порядок блоков). */}
        {visibleHighlights.length > 0 && (
          <div id="facts" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Sparkles className="h-5 w-5 shrink-0 text-primary" />
              Интересные факты
            </h2>

            <div className="flex flex-col divide-y divide-border">
              {(() => {
                // Единственный факт в карточке — свой подписанный заголовок
                // над ним избыточен: и так ясно из заголовка карточки "Интересные
                // факты" (владелец, 2026-09-06: "если интересный факт один, то
                // заголовок лишний").
                const showLabel = visibleHighlights.length > 1;
                return visibleHighlights.map((s, i) => (
                  <LabeledTextRow
                    key={i}
                    icon={HIGHLIGHT_ICONS[s.icon]}
                    label={showLabel ? s.label : undefined}
                    text={s.text}
                  />
                ));
              })()}
            </div>
          </div>
        )}

        {renderRecommendationSlot('facts')}

        {center && <HistoryTimeline center={center} />}

        {renderRecommendationSlot('history')}

        {/* "Параметры здания" — владелец, 2026-09-22: "перенеси блок Параметры
            здания под Историю здания, где нет истории здания — под предыдущий
            блок". Само это условие обеспечивает JSX: HistoryTimeline рисует
            себя только при ≥2 точках истории (extractHistoryPoints выше), а
            без них ничего не рендерит — блок ниже просто встаёт сразу после
            "Интересных фактов", то есть под тем блоком, что реально оказался
            перед ним на странице. Раньше стоял сразу после "Условий для
            арендаторов", теперь — здесь; сама разметка блока не менялась. */}
        <div id="tech" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            Параметры здания
          </h2>
          {/* Один сплошной список фактов о здании, без подзаголовков по
              ТИПУ ИСТОЧНИКА (владелец, 2026-09-20: "надпись ДОПОЛНИТЕЛЬНО,
              ПО ДРУГИМ ИСТОЧНИКАМ нелогичная, у нас один единый блок
              информации о здании" — раньше парковка/часы/доступная среда,
              технические параметры и исследованные факты рисовались тремя
              отдельными блоками со своими заголовками и обрамлением, хотя
              для читателя это один и тот же список "что известно о
              здании"). Порядок внутри остаётся прежним (сначала
              эксплуатационные строки, потом технические параметры, потом
              исследованные факты) — он и был логичным, лишним был только
              заголовок, объясняющий это через происхождение данных. */}
          {(architectureHighlights.length > 0 ||
            center.parking ||
            accessHoursText ||
            accessibilityAttributes ||
            redistributedTechnicalParams.buildingInformationRows.length > 0 ||
            center.buildingFacts.length > 0) && (
            <div className="overflow-hidden rounded-control border border-border">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {architectureHighlights.map((h, i) => (
                    <tr key={`arch-${i}`} className="border-b border-border last:border-b-0 odd:bg-surface-muted/40">
                      <th scope="row" className="w-1/2 py-2 pl-3 pr-2 text-left align-top font-medium text-ink-muted sm:w-2/5">
                        {h.label}
                      </th>
                      <td className="py-2 pl-2 pr-3 text-ink">{h.text}</td>
                    </tr>
                  ))}
                  {center.parking && (
                    <tr className="border-b border-border last:border-b-0 odd:bg-surface-muted/40">
                      <th scope="row" className="w-1/2 py-2 pl-3 pr-2 text-left align-top font-medium text-ink-muted sm:w-2/5">
                        Парковка
                      </th>
                      <td className="py-2 pl-2 pr-3 text-ink">{center.parking}</td>
                    </tr>
                  )}
                  {accessHoursText && (
                    <tr className="border-b border-border last:border-b-0 odd:bg-surface-muted/40">
                      <th scope="row" className="w-1/2 py-2 pl-3 pr-2 text-left align-top font-medium text-ink-muted sm:w-2/5">
                        Часы работы
                      </th>
                      <td className="py-2 pl-2 pr-3 text-ink">
                        {accessHoursText.toLocaleLowerCase('ru-RU') === 'круглосуточно' ? '24/7' : accessHoursText}
                      </td>
                    </tr>
                  )}
                  {accessibilityAttributes && (
                    <tr className="border-b border-border last:border-b-0 odd:bg-surface-muted/40">
                      <th scope="row" className="w-1/2 py-2 pl-3 pr-2 text-left align-top font-medium text-ink-muted sm:w-2/5">
                        Доступная среда
                      </th>
                      <td className="py-2 pl-2 pr-3 text-ink">
                        <AccessibilityChips text={accessibilityAttributes} />
                      </td>
                    </tr>
                  )}
                  {redistributedTechnicalParams.buildingInformationRows.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-b-0 odd:bg-surface-muted/40">
                      <th
                        scope="row"
                        className="w-1/2 py-2 pl-3 pr-2 text-left align-top font-medium text-ink-muted sm:w-2/5"
                      >
                        {row.label}
                      </th>
                      <td className="py-2 pl-2 pr-3 text-ink">{row.value}</td>
                    </tr>
                  ))}
                  {center.buildingFacts.map((fact, index) => (
                    <tr
                      key={`${fact.label}-${index}`}
                      className="border-b border-border last:border-b-0 odd:bg-surface-muted/40"
                    >
                      <th
                        scope="row"
                        className="w-1/2 py-2 pl-3 pr-2 text-left align-top font-medium text-ink-muted sm:w-2/5"
                      >
                        {fact.label}
                        {fact.corpusLabel && (
                          <span className="block text-xs font-normal text-ink-faint">{fact.corpusLabel}</span>
                        )}
                      </th>
                      <td className="py-2 pl-2 pr-3 text-ink">
                        <span>{fact.value}</span>
                        {fact.note && <span className="block text-xs text-ink-faint">{fact.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Эко-сертификация — переехала сюда из "Интересных фактов"
              2026-09-21 (владелец: "все переноси в блок про здание,
              Параметры здания"). Остаётся абзацем (LabeledTextRow, markdown
              жирный текст и буллеты) под таблицей — эти тексты обычно
              длиннее одной строки, в отличие от архитектуры (см.
              architectureHighlights выше), которую владелец 2026-09-22
              попросил сократить и увести в саму таблицу первой строкой. */}
          {ecoHighlights.length > 0 && (
            <div className="flex flex-col divide-y divide-border">
              {ecoHighlights.map((s, i) => (
                <LabeledTextRow key={i} icon={HIGHLIGHT_ICONS[s.icon]} label={s.label} text={s.text} />
              ))}
            </div>
          )}
        </div>

        {renderRecommendationSlot('tech')}

        {/* Развёрнутая карточка застройщика — владелец, 2026-09-20: "у
            половины БЦ застройщики нормальные, с сайтами и тд... сделал бы
            такой блок на страницах, где возможно, сразу под главным
            блоком", по образцу карточки "Застройщик района" на гиде по
            Минск Миру (DistrictGuidePage.tsx, id="developer"). В отличие от
            того гида это не захардкожено — данные конкретного БЦ из
            developerInfo (админка, BusinessCentersAdminTab.tsx), null у
            большинства БЦ, пока карточку не заполнили. Первый заполненный
            пример — "Футурис" (ГК «Тапас»). Позиция под главным блоком
            была временной: 2026-09-20, тем же днём, владелец принял
            предложенный порядок блоков страницы, и застройщик занял место
            в конце (после цены, параметров здания, арендаторов, отзывов и
            остального контента, перед выходами на другие БЦ) — блок про
            компанию-застройщика, а не про само здание, и заполнен меньше
            чем у половины БЦ (56 из 141 на 2026-09-20). */}
        {center.developerInfo && (
          <div id="developer" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <HardHat className="h-5 w-5 shrink-0 text-primary" />
                Застройщик
              </h2>
              {center.developerInfo.logoUrl && (
                <img
                  src={center.developerInfo.logoUrl}
                  alt={center.developer ?? shortName(center)}
                  loading="lazy"
                  className="h-9 w-auto max-w-[10rem] object-contain"
                />
              )}
            </div>
            {center.developer && <p className="text-sm font-semibold text-ink">{center.developer}</p>}
            {center.developerInfo.description && (
              <p className="text-sm leading-relaxed text-ink-muted">{center.developerInfo.description}</p>
            )}
            {(center.developerInfo.phone ||
              center.developerInfo.email ||
              center.developerInfo.address ||
              center.developerInfo.hours ||
              center.developerInfo.website) && (
              <div className="flex flex-col gap-1.5 text-sm text-ink-muted">
                {center.developerInfo.phone && (
                  <a
                    href={`tel:${center.developerInfo.phone.replace(/[^\d+]/g, '')}`}
                    className="flex w-fit items-center gap-2 text-ink hover:underline"
                  >
                    <Phone className="h-4 w-4 shrink-0" />
                    {center.developerInfo.phone}
                  </a>
                )}
                {center.developerInfo.email && (
                  <a
                    href={`mailto:${center.developerInfo.email}`}
                    className="flex w-fit items-center gap-2 text-ink hover:underline"
                  >
                    <Mail className="h-4 w-4 shrink-0" />
                    {center.developerInfo.email}
                  </a>
                )}
                {center.developerInfo.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{center.developerInfo.address}</span>
                  </div>
                )}
                {center.developerInfo.hours && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{center.developerInfo.hours}</span>
                  </div>
                )}
                {developerWebsiteUrl && (
                  <a
                    href={developerWebsiteUrl.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-fit items-center gap-1 text-ink hover:underline"
                  >
                    <Globe className="h-4 w-4 shrink-0" />
                    {developerWebsiteUrl.label}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {renderRecommendationSlot('developer')}

        {/* Б12. Собственникам и УК — способ поправить данные. Пишем прямо
            в почту: отдельной формы с лидом здесь не заводим, это не заявка
            на аренду, а правка справочника, и ответить на неё должен
            человек. */}
        {center && (
          <div className={cn('mt-6 flex flex-col gap-2 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Вы собственник или управляющая компания?</h2>
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm leading-relaxed text-ink-muted">
              <span>Если хотите добавить, убрать или изменить информацию — напишите нам, поправим:</span>
              <a
                href={`mailto:a@redevelopment.pro?subject=${encodeURIComponent(`Данные бизнес-центра «${shortName(center)}»`)}`}
                className="w-fit font-semibold text-primary-hover hover:underline"
              >
                a@redevelopment.pro
              </a>
            </p>
          </div>
        )}

        {/* Мобильная навигация "следующий/предыдущий" — фиксированные стрелки
            выше скрыты до lg, здесь тот же переход обычной строкой кнопок. */}
        {(prev || next) && (
          <div className="mt-5 flex items-center justify-between gap-3 xl:hidden">
            {prev ? (
              <Link
                to={`/minsk/bcminsk/${prev.slug}`}
                className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                {shortName(prev)}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to={`/minsk/bcminsk/${next.slug}`}
                className="flex items-center gap-1.5 text-right text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                {shortName(next)}
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
        {faqItems.length > 0 && (
          <div id="faq" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Частые вопросы</h2>
            {/* <details>/<summary> — ответ есть в DOM независимо от открыт/закрыт
                (важно для краулеров и JSON-LD рядом), но на экране скрыт, пока
                не раскрыли: блок из 20+ вопросов иначе занимает пол-страницы. */}
            <div className="flex flex-col divide-y divide-border">
              {faqItems.map((item) => (
                <details key={item.question} className="py-3 first:pt-0 last:pb-0">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    <h3 className="inline">{item.question}</h3>
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* Блок со ссылкой на Red One, стоявший на каждой карточке БЦ
            (аудит поиска 2026-09-07 — переходы из справочника на /minsk/one
            были главной метрикой SEO-линии), убран 2026-09-16 по решению
            владельца: пока здание Red One не куплено, продавать его нечего.
            Вернуть вместе с остальными ссылками (гид по району, посадочные
            Минск Мира, каталог БЦ), когда здание будет куплено. */}

        <div className={cn('mt-6 flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Источники</h2>
          {/* Владелец, 2026-09-22: один короткий дисклеймер без дат снимков и
              имён источников в основном тексте страницы — читатель видит
              длинный список оговорок как "нам нельзя доверять". Даты (2ГИС,
              Яндекс.Карты) и полный список конкретных сайтов остались только
              в попапе SourcesTrademarkNote — по клику на "Полный список
              источников", не в подверстке блока. */}
          <SourcesTrademarkNote />
        </div>

        </main>
      </div>
    </div>
  );
}

function RelatedCentersSection({
  id,
  title,
  centers,
  catalogUrl,
  catalogLabel,
  stationName,
  fallbackCenter,
}: {
  id: string;
  title: string;
  centers: BusinessCenter[];
  catalogUrl: string;
  catalogLabel: string;
  stationName?: string;
  fallbackCenter?: BusinessCenter;
}) {
  // Владелец, 2026-09-20: "если у нас всего 1 БЦ в блоке рекомендаций,
  // давай использовать вторую половину блока под рекомендацию других БЦ
  // этого же класса" — вторая плитка не пустует, показывает ближайшее
  // здание того же класса (fallbackCenter уже подобран и дедуплицирован
  // на уровне recommendationBlocks, здесь только рендер с пометкой "Похож
  // по классу", чтобы не выдавать его за настоящее совпадение по метро/улице).
  const entries: { related: BusinessCenter; isFallback: boolean }[] = centers
    .slice(0, 2)
    .map((related) => ({ related, isFallback: false }));
  if (entries.length === 1 && fallbackCenter) {
    entries.push({ related: fallbackCenter, isFallback: true });
  }
  return (
    <section id={id} className={cn('mt-6 scroll-mt-32 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="mb-4 text-lg font-bold text-ink">{title}</h2>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(12rem,1fr)]">
        {entries.map(({ related, isFallback }) => {
          const metro = !isFallback && stationName
            ? { name: stationName, distanceMeters: metroHubDistance(related, stationName) }
            : nearestMetroStation(related.nearestMetroStations);
          return (
          // Владелец, 2026-09-20: "сделай так, чтобы вся площадь плитки была
          // кликабельной" — раньше кликались только фото и текст "Подробнее",
          // остальная карточка (заголовок, класс, расстояние до метро) не
          // реагировала. Вложенные <a> внутри <a> невалидны, поэтому вся
          // плитка теперь один <Link>, а прежняя вторая ссылка ниже — просто
          // визуально стилизованный <span>.
          <Link
            key={related.slug}
            to={`/minsk/bcminsk/${related.slug}`}
            aria-label={`Открыть страницу ${related.name}`}
            className="block overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary/40 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)] lg:block xl:grid xl:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <div className="aspect-square overflow-hidden rounded-2xl bg-surface-muted">
              <PhotoBlock center={related} variant="card" fit="contain" />
            </div>
            <div className="flex min-w-0 flex-col items-start justify-center gap-2 p-4">
              {isFallback && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Похож по классу</p>
              )}
              <h3 className="text-base font-bold leading-snug text-ink">{shortName(related)}</h3>
              {related.businessClass && (
                <p className="text-sm text-ink-muted">Класс {related.businessClass}</p>
              )}
              {metro?.distanceMeters != null && (
                <p className="text-sm leading-snug text-ink-muted">
                  {metro.distanceMeters.toLocaleString('ru-RU')} м до метро
                </p>
              )}
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary-hover">
                Подробнее
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
          );
        })}
        {centers.length > 2 && (
          <Link
            to={catalogUrl}
            className="group flex min-h-40 items-center justify-center rounded-2xl border border-border bg-surface-muted p-6 text-center text-ink transition-transform hover:-translate-y-0.5 hover:bg-border/50"
          >
            <span className="flex items-center gap-2 text-lg font-bold leading-snug">
              {catalogLabel}
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}

// Иконка на раздел "Интересных фактов" по ключу из HighlightSection.icon —
// 'warning' в общий список не попадает (свой рендер, акцентный блок выше),
// но остаётся в мапе для полноты типа (Record должен покрывать все ключи).
// 'fact' — намеренно НЕ Sparkles (владелец, 2026-09-06: "не допускай повтора
// иконок" — заголовок карточки "Интересные факты" уже использует Sparkles,
// у самого частого по факту icon-ключа 'fact' была та же иконка — дублировалась
// на скриншоте с одним фактом "Позиционирование").
const HIGHLIGHT_ICONS: Record<HighlightIconKey, typeof FileText> = {
  history: Landmark,
  tenants: Building2,
  media: Newspaper,
  award: Trophy,
  rating: Star,
  reviews: MessageSquareQuote,
  design: Palette,
  eco: Leaf,
  warning: AlertTriangle,
  fact: Info,
};

// Достаёт число+источник из свободного текста блока "рейтинг" в
// "Интересных фактах" (напр. "- Яндекс.Карты: **4,8** из 5 (836 оценок,
// 160 отзывов)") — структурного поля под рейтинг нет, весь текст собран
// веб-поиском в свободной markdown-нотации (см. комментарий у
// BusinessCenter.highlights в data/businessCenters.ts). Берётся только
// ПЕРВАЯ строка (у части БЦ рейтинг на два источника, Яндекс.Карты и 2ГИС,
// каждый на своей строке — для компактного бейджа у заголовка достаточно
// одного) и только первое найденное "X,X из 5" — для "Порта" (3 отдельные
// карточки на Яндекс.Картах, по одной на очередь здания) это даёт рейтинг
// первой очереди, не среднее по всем трём, честный, но частичный
// компромисс ради компактности бейджа. Формат не узнан — просто не
// показываем бейдж, не гадаем.
// Расписание из 2GIS (владелец, 2026-09-06) — группирует подряд идущие дни
// с одинаковыми часами в одну строку ("Пн–Пт: 08:00–17:00"), а не по строке
// на каждый день недели — иначе для типового графика 5/2 получилось бы 5
// почти одинаковых строк подряд. День без записи в schedule.days — выходной
// (2GIS просто не включает нерабочие дни в объект, не шлёт их с пустым
// массивом часов).
const SCHEDULE_DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SCHEDULE_DAY_LABELS: Record<(typeof SCHEDULE_DAY_ORDER)[number], string> = {
  Mon: 'Пн',
  Tue: 'Вт',
  Wed: 'Ср',
  Thu: 'Чт',
  Fri: 'Пт',
  Sat: 'Сб',
  Sun: 'Вс',
};

function formatWorkingHours(day: Gis2ScheduleDay): string {
  return day.workingHours.map((h) => `${h.from}–${h.to}`).join(', ');
}

function formatSchedule(schedule: Gis2Schedule): string[] {
  if (schedule.is24x7) return ['Круглосуточно'];
  const lines: string[] = [];
  let i = 0;
  while (i < SCHEDULE_DAY_ORDER.length) {
    const day = SCHEDULE_DAY_ORDER[i];
    const entry = schedule.days[day];
    const hoursKey = entry ? formatWorkingHours(entry) : null;
    let j = i;
    while (j + 1 < SCHEDULE_DAY_ORDER.length) {
      const nextEntry = schedule.days[SCHEDULE_DAY_ORDER[j + 1]];
      const nextKey = nextEntry ? formatWorkingHours(nextEntry) : null;
      if (nextKey !== hoursKey) break;
      j++;
    }
    const label =
      i === j ? SCHEDULE_DAY_LABELS[day] : `${SCHEDULE_DAY_LABELS[day]}–${SCHEDULE_DAY_LABELS[SCHEDULE_DAY_ORDER[j]]}`;
    lines.push(hoursKey ? `${label}: ${hoursKey}` : `${label}: выходной`);
    i = j + 1;
  }
  return lines;
}






// сам текст, ничего не рендерит, если по этому разделу нашлось не найдено
// (text === null) — не показываем пустые подписи.
// Логотип издания в строке подборки. На широком экране — колонка постоянной
// ширины: логотипы у изданий разной пропорции (у Onliner вытянутый текстовый,
// у БелТА почти квадратный овал), и без общей колонки заголовки статей встали
// бы лесенкой. На телефоне та же колонка съедала треть строки и рвала
// заголовок на шесть строк, поэтому там логотип уходит НАД заголовком, а
// ширина колонки не задаётся вовсе.
//
// onError гасит картинку, а не оставляет «сломанное изображение»: если PNG
// когда-нибудь не доедет со сборкой, строка должна выглядеть как строка с
// названием издания, а не как ошибка.
// Ширина колонки под логотип фиксирована и не зависит от пропорций
// конкретной картинки (владелец, 2026-09-20: "видимые логотипы СМИ
// одного размера по ширине, за ориентир берём Белта"). У Белты овальный
// герб, у остальных — вытянутые вордмарки, поэтому раньше сайзинг по
// высоте (max-h) давал вордмаркам в 2 раза большую ширину, чем у Белты.
// Ширина ниже — это ширина, которую Белта занимает при прежней высоте
// (max-h-7/8 · её пропорции 207:96), взятая как эталон; у остальных
// логотипов при той же ширине высота меньше — так и задумано.
const MEDIA_LOGO_WIDTH = 'w-[60px] sm:w-[70px]';

function MediaOutletMark({ url, outlet }: { url: string; outlet: string }) {
  const brand = outletBrand(url);
  const [failed, setFailed] = useState(false);
  const label = brand?.name ?? outlet;

  if (!brand?.logo || failed) {
    return (
      <span className={cn('flex shrink-0 items-center text-sm font-semibold text-ink-muted sm:pt-0.5', MEDIA_LOGO_WIDTH)}>
        {label}
      </span>
    );
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center', MEDIA_LOGO_WIDTH)}>
      <img src={brand.logo} alt={label} loading="lazy" onError={() => setFailed(true)} className="h-auto w-full" />
    </span>
  );
}

// «13 февраля 2025», а не «13.02.2025»: в блоке дата стоит отдельной строкой
// под заголовком, где цифровой формат читается как артикул. Хвост « г.»,
// который ru-RU добавляет сам, снимаем — в подписи из трёх слов он лишний.
function formatMentionDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s*г\.$/, '');
}

function LabeledTextRow({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof FileText;
  label?: string;
  text: string | null;
}) {
  if (!text) return null;
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        {label && <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>}
        <div className={cn('text-sm leading-relaxed text-ink-muted', label && 'mt-1')}>{renderRentalText(text)}</div>
      </div>
    </div>
  );
}

const INTERNAL_INFRASTRUCTURE_ICONS: { pattern: RegExp; icon: typeof FileText }[] = [
  { pattern: /банкомат/i, icon: CreditCard },
  { pattern: /банк/i, icon: Landmark },
  { pattern: /кофе|кафе/i, icon: Coffee },
  { pattern: /магазин/i, icon: ShoppingBag },
  { pattern: /фитнес|спортзал/i, icon: Dumbbell },
  { pattern: /спа|сауна/i, icon: Waves },
  { pattern: /конференц/i, icon: Presentation },
  { pattern: /ресторан/i, icon: UtensilsCrossed },
];

// Те же категории, но для сопоставления с текстом из базы (рубрики
// организаций, подписи оборудования), а не с вручную набранным списком
// владельца, — там регулярки нарочно строже (граница слова через lookahead,
// см. использование выше в derivedInternalInfrastructureText): свободный
// текст владелец уже проверил глазами, а рубрики тысяч арендаторов — нет.
//
// Спа/сауна/конференц-залы/ресторан добавлены 2026-09-21 по прямому
// указанию владельца (эти категории — в шапку блока «В здании», остальные
// внутренние сервисы, которых нет и не будет в этом фиксированном списке,
// закрывает каталог арендаторов ниже по странице, отдельных категорий под
// них не заводим — см. "не расширял бы количество новых категорий",
// 2026-09-20, и разбор "Интересных фактов" 2026-09-21).
const TENANT_DERIVED_INFRASTRUCTURE: { pattern: RegExp; label: string }[] = [
  { pattern: /банкомат(?![\p{L}])/iu, label: 'банкомат' },
  { pattern: /банк(?![\p{L}])/iu, label: 'банк' },
  { pattern: /(?:кофе|кафе)(?![\p{L}])/iu, label: 'кафе' },
  { pattern: /магазин(?![\p{L}])/iu, label: 'магазин' },
  { pattern: /(?:фитнес|спортзал)(?![\p{L}])/iu, label: 'фитнес-центр' },
  { pattern: /(?:спа|сауна)(?![\p{L}])/iu, label: 'спа' },
  { pattern: /конференц(?![\p{L}])/iu, label: 'конференц-зал' },
  { pattern: /ресторан(?![\p{L}])/iu, label: 'ресторан' },
];

// organizationCount — первая плитка строки «В здании» на первом экране
// (замер Wordstat 18.08–18.09.2026: спрос сформулирован как «…что там
// есть», а не по отраслям). Ведёт якорем в сам справочник арендаторов
// ниже по странице, чтобы ответ «сколько их» и список не были в разных
// концах документа. Строка рисуется и когда инфраструктура не заполнена, —
// одного числа организаций для неё достаточно.
function InternalInfrastructureRow({
  text,
  compact = false,
  organizationCount = 0,
}: {
  text: string;
  compact?: boolean;
  organizationCount?: number;
}) {
  const items = text
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0 && organizationCount === 0) return null;

  return (
    <div
      className={cn(
        'flex gap-3',
        compact ? 'rounded-2xl border border-border bg-surface-muted/60 px-3.5 py-3' : 'py-3 first:pt-0 last:pb-0',
      )}
    >
      {!compact && <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">В здании</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {organizationCount > 0 && (
            <a
              href="#tenants"
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-semibold text-primary-hover hover:underline',
                !compact && 'rounded-full bg-surface-muted px-2.5 py-1.5 text-xs',
              )}
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              {organizationCount} {pluralRu(organizationCount, 'организация', 'организации', 'организаций')}
            </a>
          )}
          {items.map((item) => {
            const ItemIcon = INTERNAL_INFRASTRUCTURE_ICONS.find(({ pattern }) => pattern.test(item))?.icon ?? Building2;
            return (
              <span
                key={item}
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm text-ink-muted',
                  !compact && 'rounded-full bg-surface-muted px-2.5 py-1.5 text-xs font-medium',
                )}
              >
                <ItemIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                {item}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ACCESSIBILITY_ICONS: { pattern: RegExp; icon: typeof FileText }[] = [
  { pattern: /пандус|инвалид/i, icon: Accessibility },
  { pattern: /лифт/i, icon: ArrowUpDown },
  { pattern: /двер|вход|доступн/i, icon: DoorOpen },
];

function AccessibilityChips({ text }: { text: string }) {
  const items = text
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map((item) => {
        const ItemIcon = ACCESSIBILITY_ICONS.find(({ pattern }) => pattern.test(item))?.icon ?? CheckCircle2;
        return (
          <span key={item} className="inline-flex items-center gap-1.5 text-sm text-ink">
            <ItemIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            {item}
          </span>
        );
      })}
    </div>
  );
}

// Мини-разметка внутри полей "Отдел аренды БЦ" (владелец, 2026-09-06:
// "делай еще сильнее дробить... в таком формате: * Пункт 1... важные цифры
// выделяй жирным") — сознательно не полноценный markdown-парсер (незачем
// тянуть библиотеку ради двух приёмов), просто: строки, начинающиеся с "- "
// или "* ", группируются в маркированный список, остальные строки — обычные
// абзацы; **текст** внутри любой строки — жирным. Текст полей набирается в
// админке (BusinessCentersAdminTab.tsx) в этой же нотации.
function renderRentalText(text: string): ReactNode {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const blocks: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc space-y-1 pl-4 marker:text-ink-muted">
        {bulletBuffer.map((item, i) => (
          <li key={i}>{renderBold(item)}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };
  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('* ')) {
      bulletBuffer.push(line.slice(2));
    } else {
      flushBullets();
      blocks.push(
        <p key={blocks.length} className={blocks.length > 0 ? 'mt-2' : undefined}>
          {renderBold(line)}
        </p>,
      );
    }
  }
  flushBullets();
  return <>{blocks}</>;
}

