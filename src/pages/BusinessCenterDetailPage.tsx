import { GENERAL_DATA_SOURCES } from '../data/businessCenterSources';
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
  MapPin,
  MessageSquareQuote,
  Newspaper,
  Palette,
  Phone,
  Ruler,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import { outletBrand } from '../data/mediaOutlets';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { PhotoBlock, FactTile } from '../components/businessCenters/BusinessCenterVisuals';
import { FavoriteButton } from '../components/businessCenters/FavoriteButton';
import {
  setBreadcrumbJsonLd,
  setFaqJsonLd,
  setNoIndex,
  clearNoIndex,
  setBusinessCenterPageMeta,
  setPlaceJsonLd,
} from '../lib/pageMeta';
import {
  businessCenterHomepageUrl,
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
  metroHubDistance,
  metroHubUrl,
  streetHubUrl,
  districtDative,
  districtPrepositional,
  classDistrictHubUrl,
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
import { pluralRu } from '../lib/pluralRu';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
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
import {
  extractHistoryPoints,
  HistoryTimeline,
  MarketPositionBlock,
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
  tenants: 'Кто внутри',
  rental: 'Условия для арендаторов',
  offers: 'Объявления на рынке',
  history: 'История здания',
  reviews: 'Отзывы',
  faq: 'Частые вопросы',
};

// Демонстрация: FAQ «Альянс», переписанный gemini-3.8-flash (ProxyAPI) в
// формате аналитики Минск Мира — связный текст вместо перечислений через
// «;». Факты те же, что даёт вычисляемый faqItems ниже (сверено построчно),
// один объединённый вопрос (этажность/площадь/тех.паспорт) вместо четырёх
// отдельных — владелец ещё не решил, тиражировать ли это на весь каталог.
// Только для показа вживую на проде; убрать после решения (владелец,
// 2026-09-20).
const ALYANS_FAQ_DEMO: { question: string; answer: string }[] = [
  {
    question: 'Где находится бизнес-центр «Альянс» и в каком районе он расположен?',
    answer: 'Бизнес-центр расположен в Московском районе Минска по адресу: ул. 3-я Щорса, 9.',
  },
  {
    question: 'К какому классу относится «Альянс» и сколько таких объектов в каталоге?',
    answer:
      'Объект классифицирован как класс C. Всего в каталоге насчитывается ещё 36 зданий этого же класса, из которых 4 также расположены в Московском районе.',
  },
  {
    question: 'В каком году построен бизнес-центр «Альянс» и каков его статус?',
    answer:
      '«Альянс» — готовый объект коммерческой недвижимости, сданный в эксплуатацию и открытый в 2011 году на ул. 3-я Щорса. Зданию 15 лет, что на 1 год новее медианного здания класса C в каталоге.',
  },
  {
    question: 'Кто застройщик бизнес-центра «Альянс»?',
    answer:
      'Застройщиком объекта является девелопер IDC Group, работающий на рынке коммерческой недвижимости Минска с середины 2000-х годов. В портфеле девелопера — бизнес-центры «Академия», «Альянс», «Терминал», строящийся комплекс Quantum и многофункциональный комплекс Valeo-Center. Офис компании находится непосредственно в БЦ «Альянс» по адресу: г. Минск, ул. 3-я Щорса, 9, телефон +375 17 301-32-25, сайт https://idc.by.',
  },
  {
    question: 'Каковы технические, объемно-планировочные параметры здания и условия управления?',
    answer:
      'Здание бизнес-центра насчитывает 7 этажей при общей площади 6 325 м² (в среднем около 904 м² на этаж, площадь типового этажа — 550 м²). Офисная площадь составляет 3 955 м², или 63% от общей площади объекта. Планировка помещений кабинетная, высота потолков типового этажа — 3.0 м. Здание оборудовано 1 лифтом, кондиционирование реализовано частично. Обеспеченность парковкой составляет 1,8 маш./100 м². Управление объектом осуществляет Товарищество собственников.',
  },
  {
    question: 'Как добраться до «Альянс» на общественном транспорте и насколько близко метро?',
    answer:
      'В пешей доступности от бизнес-центра находятся 4 остановки наземного транспорта, ближайшая из которых — «Белита-Витэкс» — расположена в 281 м по прямой. Ближайшая станция метро — «Грушевка» — находится в 470 м по прямой. Для своего класса объект расположен на 39% ближе к метро, чем медианное здание класса C, где медианное расстояние составляет 775 м.',
  },
  {
    question: 'Какая инфраструктура есть рядом с «Альянс»?',
    answer:
      'В расчетных радиусах от здания зафиксированы ключевые объекты сервиса: 1 станция метро («Грушевка» — 364 м по прямой при радиусе учета до 2 км), 4 остановки транспорта (ближайшая — «Белита-Витэкс», 281 м по прямой при радиусе учета до 800 м). В радиусе 500 м по прямой расположены 2 продуктовых магазина (ближайший — «Соседи», 98 м), 4 аптеки (ближайшая — «Искамед», 297 м), 1 банк («Белинвестбанк», 398 м), 2 банкомата (ближайший — «Белгазпромбанк, банкомат», 8 м), 2 кафе (ближайшее — «Беллини», 16 м) и 4 фитнес-объекта (ближайший — «О. К.», 182 м).',
  },
  {
    question: 'Парковка в «Альянс» — это много или мало для своего класса?',
    answer:
      'Показатель обеспеченности машиноместами составляет 1,8 маш./100 м². Для объектов класса C медиана равна 1,7 маш./100 м², то есть парковка в «Альянсе» на 6% больше, чем у медианного здания класса C.',
  },
  {
    question: 'Лифты на 10 000 м² в «Альянс» — это много или мало для своего класса?',
    answer:
      'В пересчете на площадь плотность лифтов составляет 1,58 шт. на 10 000 м² при 1 фактически установленном лифте. Это на 39% меньше, чем у медианного здания класса C, где медиана составляет 2,59 шт.',
  },
  {
    question: 'Компаний-арендаторов в «Альянс» — это много или мало для своего класса?',
    answer:
      'В здании зарегистрировано 52 компании-арендатора. Этот показатель находится точно на уровне медианного здания класса C, для которого медиана также составляет 52 шт.',
  },
  {
    question: 'Что расположено внутри здания бизнес-центра помимо офисов?',
    answer:
      'Внутренняя инфраструктура бизнес-центра включает кафе, кофепоинт и магазин. Кроме того, в здании функционируют точки самообслуживания, которые не учитываются в общем перечне организаций: банкомат и криптомат.',
  },
  {
    question: 'Предусмотрены ли в здании условия доступной среды?',
    answer: 'Для маломобильных групп посетителей в бизнес-центре обустроен пандус и функционирует широкий лифт.',
  },
  {
    question: 'Какие часы работы установлены в здании?',
    answer: 'Бизнес-центр открыт для входа с понедельника по воскресенье (Пн–Вс) с 06:00 до 22:00.',
  },
  {
    question: 'Кто выступает основным арендатором бизнес-центра?',
    answer:
      'Основным арендатором является ЗАСО «Белнефтестрах» — страховая компания, дочерняя структура концерна «Белнефтехим». По адресу ул. 3-я Щорса, 9 также официально зарегистрирован её юридический адрес.',
  },
  {
    question: 'Сколько организаций находится в здании и как они распределены по сферам и этажам?',
    answer:
      'По данным среза Яндекс.Карт, в здании работает 49 организаций. По направлениям деятельности они распределяются так: медицина и красота — 9; другое — 7; производство и оборудование — 6; IT и связь — 6; образование и работа — 5; еда и досуг — 4; магазины и товары — 3; финансы, юристы, бизнес — 3; логистика и транспорт — 2; реклама и медиа — 1; спорт и туризм — 1; стройка и недвижимость — 1; услуги и сервис — 1. Эти сведения показывают состав арендаторов и сервисов, но не являются прямым индикатором уровня вакантности или спроса на площади. Этаж размещения зафиксирован у 12 организаций из 49: на цокольном этаже расположена 1 компания, на 1 этаже — 3, на 2 этаже — 2, на 3 этаже — 1, на 5 этаже — 1, на 6 этаже — 1, на 7 этаже — 3.',
  },
  {
    question: 'На какую дату актуальны данные каталога?',
    answer:
      'Список и классификация организаций внутри здания сформированы по срезу Яндекс.Карт от 19.09.2026. Данные о рейтинге, часах работы и общих атрибутах здания зафиксированы по срезу 2ГИС от 06.09.2026.',
  },
  {
    question: 'Какая оценка у «Альянс» на картах?',
    answer: 'Рейтинг объекта на Яндекс.Картах составляет 4,4 балла, он рассчитан на основе 244 пользовательских оценок.',
  },
  {
    question: 'Как исправить или дополнить сведения о бизнес-центре?',
    answer:
      'Если вы хотите скорректировать, добавить или убрать сведения о здании, отправьте запрос на электронную почту a@redevelopment.pro, указав название бизнес-центра и данные, требующие исправления.',
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

// Блоки-выходы на другие БЦ (2026-09-20, доработано после фидбэка
// владельца тем же днём: "везде разное количество блоков, какие-то
// страницы длинные, какие-то короткие" + "два блока рекомендаций падают
// рядом"). Первая версия вешала каждый блок на конкретного соседа
// ("микрорайон — сразу после карты", "метро — сразу после рынка"), и это
// ломалось ровно там, где у конкретного БЦ этого соседа не было или он
// был пустым — на бедных данными страницах блоки либо пропадали, либо
// слипались. Вторая версия (recommendationSlots ниже) не привязана к
// именам соседних блоков: она раскладывает блоки-рекомендации по
// накопленному объёму обычного контента (первый — после 5-го блока
// страницы, дальше — примерно каждые 1,5–2 экрана) и по приоритету
// (богаче пулом кандидатов — раньше; с одним кандидатом — в последнюю
// очередь, см. recommendationBlocks).
type RecommendationBlockId = 'microdistrictCenters' | 'metroCenters' | 'ratingCenters' | 'classDistrictCenters' | 'streetCenters';

interface RecommendationBlockData {
  id: RecommendationBlockId;
  title: string;
  centers: BusinessCenter[];
  catalogUrl: string;
  catalogLabel: string;
  stationName?: string;
  fallbackCenter?: BusinessCenter;
}

// Примерный вес обычного блока контента в "экранах" — нет способа измерить
// реальную высоту рендера без клиентского layout-прохода (а на странице,
// которая ещё и пререндерится headless-браузером на сборке, это лишний
// источник нестабильности), поэтому веса — грубая оценка по типичному
// наполнению блока, не точный пиксельный расчёт. 1.0 ≈ один экран обычной
// высоты. reviews оценивается отдельно (см. recommendationSlots) — блок
// то с полноценными карточками отзывов, то с одними бейджами рейтинга,
// разница в высоте кратная.
const SECTION_WEIGHTS: Record<string, number> = {
  offers: 0.6,
  rental: 0.3,
  tech: 1.0,
  map: 1.3,
  tenants: 1.1,
  market: 1.4,
  awards: 0.3,
  media: 0.3,
  facts: 0.6,
  history: 0.5,
  developer: 0.5,
};
const DEFAULT_SECTION_WEIGHT = 0.5;
const RECOMMENDATION_BLOCK_WEIGHT = 0.6;
const FIRST_RECOMMENDATION_AFTER_SECTIONS = 5;
const NEXT_RECOMMENDATION_MIN_WEIGHT = 1.75;

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
  const collapsedDuplicates = (rawOffers?.length ?? 0) - (offers?.length ?? 0);
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

  const saleRows = useMemo(() => computeOfferRows(offers ?? [], 'sale'), [offers]);
  const rentRows = useMemo(() => computeOfferRows(offers ?? [], 'rent'), [offers]);

  // Медиана по ЭТОМУ зданию целиком (не разбитая по типу помещения, как
  // saleRows/rentRows выше) — для сравнения со средней по классу/району.
  const buildingRentMedian = useMemo(() => overallMedianPricePerSqm(offers ?? [], 'rent'), [offers]);
  const buildingSaleMedian = useMemo(() => overallMedianPricePerSqm(offers ?? [], 'sale'), [offers]);
  const classSnapshot = useMemo(
    () =>
      center?.businessClass
        ? {
            rent: (officeSnapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === 'class' && s.sliceKey === center.businessClass),
            sale: (officeSnapshots ?? []).find((s) => s.deal === 'sale' && s.sliceType === 'class' && s.sliceKey === center.businessClass),
          }
        : null,
    [officeSnapshots, center],
  );
  const districtSnapshot = useMemo(
    () =>
      center?.district
        ? {
            rent: (officeSnapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === 'district' && s.sliceKey === center.district),
            sale: (officeSnapshots ?? []).find((s) => s.deal === 'sale' && s.sliceType === 'district' && s.sliceKey === center.district),
          }
        : null,
    [officeSnapshots, center],
  );

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
  const visibleHighlights = useMemo(
    () =>
      center?.highlights.filter(
        (h) => h.icon !== 'rating' && h.icon !== 'reviews' && h.icon !== 'history' && h.icon !== 'award',
      ) ?? [],
    [center],
  );

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
    // рейтинга в buildRanking, BusinessCentersRankingPage.tsx).
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

    return candidates
      .map((c) => {
        const list = takeVisible(c.raw.filter((candidate) => !usedSlugs.has(candidate.slug)));
        return c.build(list, takeFallback(c.id, list));
      })
      .filter((b): b is RecommendationBlockData => b !== null);
  }, [center, centers, nearestMetro]);

  // Медианы по зданиям (Д3) — те же, что в каталоге и блоке
  // «БЦ на фоне конкурентов», чтобы одна и та же ставка не расходилась.
  const offerIndex = useMemo(() => buildOfferIndex(officeSnapshots), [officeSnapshots]);

  // Б5: «Объявления на рынке» — живая строка вместо голой таблицы. Важны
  // ДИАПАЗОНЫ: «офисы от 50 до 400 м² по $10–18/м²» отвечает на вопрос
  // «подойдёт ли мне», а таблица со средними по типу помещения — нет.
  const offersSummary = useMemo(() => {
    const byDeal = (deal: 'rent' | 'sale') => {
      const rows = (offers ?? []).filter((o) => o.dealType === deal && o.size > 0 && o.pricePerSqm > 0);
      if (rows.length === 0) return null;
      const sizes = rows.map((o) => o.size);
      const prices = rows.map((o) => o.pricePerSqm);
      return {
        count: rows.length,
        sizeMin: Math.min(...sizes),
        sizeMax: Math.max(...sizes),
        priceMin: Math.min(...prices),
        priceMax: Math.max(...prices),
        // Ссылки на сами объявления: самое маленькое и самое большое
        // помещение — крайние точки диапазона, который мы только что
        // назвали, чтобы его можно было проверить одним кликом.
        links: [
          rows.reduce((a, b) => (a.size <= b.size ? a : b)),
          rows.reduce((a, b) => (a.size >= b.size ? a : b)),
        ],
      };
    };
    return { rent: byDeal('rent'), sale: byDeal('sale') };
  }, [offers]);
  const marketPosition = useMemo(
    () => (center ? buildMarketPosition(center, centers ?? [], officeSnapshots, offerIndex) : null),
    [center, centers, officeSnapshots, offerIndex],
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
    if (center.slug === 'alyans') return ALYANS_FAQ_DEMO;
    const items: { question: string; answer: string }[] = [];
    // Короткое имя, а не center.name: вопрос «Какой класс у «Бизнес-центр
    // «Порт»»?» читается как опечатка.
    const name = shortName(center);
    const add = (question: string, answer: string | null | undefined) => {
      if (answer?.trim()) items.push({ question, answer });
    };
    const fmt = (value: number) => value.toLocaleString('ru-RU');
    add(`Где находится «${name}»?`, center.address);
    if (center.altNames.length > 0) {
      add(
        `Как ещё называют «${name}»?`,
        `${center.altNames.map((alt) => `«${alt}»`).join(', ')} — то же самое здание по адресу ${center.address}: одно здание с двумя названиями, а не два разных бизнес-центра.`,
      );
    }
    add(
      `В каком административном районе находится «${name}»?`,
      redistributedTechnicalParams.administrativeDistrictText,
    );
    // Голые значения без контекста ("2011", "7") читаются как заполнение
    // объёма — владелец, 2026-09-20: «слишком скупо». Каждый такой ответ
    // получает реальную (не шаблонную) добавку из уже вычисленных на
    // странице данных: сколько ещё таких зданий в каталоге, площадь на
    // этаж, сравнение с медианой класса — а не бантик из общих слов.
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
    if (center.totalArea != null) {
      const floors = center.floors;
      const perFloor = floors != null && floors > 0 ? Math.round(center.totalArea / floors) : null;
      add(
        `Какая общая площадь у «${name}»?`,
        `${fmt(center.totalArea)} м²${perFloor != null && floors != null ? `, в среднем около ${fmt(perFloor)} м² на этаж при ${floors} ${pluralRu(floors, 'этаже', 'этажах', 'этажах')}` : ''}.`,
      );
    }
    if (center.floors != null) {
      add(`Сколько этажей в «${name}»?`, `${center.floors} ${pluralRu(center.floors, 'этаж', 'этажа', 'этажей')}.`);
    }
    // "Год сдачи" из marketPosition.bars ниже даёт то же значение со
    // сравнением с медианой класса — тот же вопрос под естественную
    // формулировку, а не второй такой же под другой обёрткой (bar с этим
    // label пропускается в цикле ниже).
    if (center.yearBuilt != null) {
      if (center.status === 'under_construction') {
        add(`Когда «${name}» будет сдан?`, `Ожидаемая сдача — ${center.yearBuilt} год.`);
      } else {
        const age = new Date().getFullYear() - center.yearBuilt;
        const yearBar = marketPosition?.bars.find((bar) => bar.label === 'Год сдачи') ?? null;
        add(
          `В каком году построен «${name}»?`,
          `Сдан в ${center.yearBuilt} году${age > 0 ? `, зданию ${age} ${pluralRu(age, 'год', 'года', 'лет')}` : ''}.${yearBar && !yearBar.nearTypical ? ` Это ${yearBar.deltaText}.` : ''}`,
        );
      }
    }
    add(`Какая степень готовности у «${name}»?`, redistributedTechnicalParams.readinessText);
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
    add(`Какая парковка у «${name}»?`, center.parking);
    if (center.officeArea != null) {
      const share =
        center.totalArea != null && center.totalArea > 0
          ? ` — ${Math.round((center.officeArea / center.totalArea) * 100)}% от общей площади`
          : '';
      add(`Какая офисная площадь у «${name}»?`, `${fmt(center.officeArea)} м²${share}.`);
    }
    // Организации с 2026-09-19 приезжают из Яндекс.Карт, а рейтинг здания,
    // часы работы и атрибуты — по-прежнему из 2ГИС. Это два разных среза на
    // две разные даты, и в ответе они не должны слипаться в один.
    if (tenantSource === 'yandex_maps' && tenantSnapshot?.capturedAt) {
      add(
        'На какую дату список организаций?',
        `Организации в здании — срез Яндекс.Карт от ${new Date(tenantSnapshot.capturedAt).toLocaleDateString('ru-RU')}.`,
      );
    }
    if (gis2?.fetchedAt) {
      add(
        'На какую дату сведения 2ГИС?',
        `${tenantSource === 'yandex_maps' ? 'Рейтинг, часы работы и атрибуты здания' : 'Организации, рейтинг, часы работы и атрибуты здания'} — срез от ${new Date(gis2.fetchedAt).toLocaleDateString('ru-RU')}.`,
      );
    }
    if (nearestMetro) add(`Какое метро рядом с «${name}»?`, `«${nearestMetro.name}» — ${nearestMetro.distanceMeters} м по прямой.`);
    for (const bar of marketPosition?.bars ?? []) {
      // "Год сдачи" уже влит в ответ на "В каком году построен" выше —
      // второй вопрос с тем же числом читался бы как дубль.
      if (bar.label === 'Год сдачи') continue;
      add(`${bar.label} в «${name}» — это много или мало для своего класса?`, `${bar.subjectDisplayValue}; ${bar.captionText} (${bar.deltaText}).`);
    }
    // FAQ пересказывает блок «Инфраструктура рядом» теми же цифрами, что
    // нарисованы на карте и в списке под ней (правило владельца: FAQ
    // описывает всё, что есть на странице), — отсюда общий хелпер, а не
    // вторая формулировка тех же данных.
    const faqNearbyLines = nearbyFaqLines(nearbyPlaces);
    if (faqNearbyLines.length) {
      add(
        `Какая инфраструктура есть рядом с «${name}»?`,
        `${faqNearbyLines.join('; ')}. Метро учитывается в радиусе 2 км, остановки — 800 м, остальное — 500 м; расстояния по прямой.`,
      );
    }
    const faqStops = nearbyPlaces.filter((place) => place.category === 'transport_stop');
    if (faqStops.length) {
      const nearestStop = [...faqStops].sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
      add(
        `Как добраться до «${name}» на общественном транспорте?`,
        `В пешей доступности ${faqStops.length} ${faqStops.length === 1 ? 'остановка' : 'остановок'}; ближайшая — «${nearestStop.name}», ${nearestStop.distanceMeters} м по прямой.${nearestMetro ? ` Ближайшее метро — «${nearestMetro.name}», ${nearestMetro.distanceMeters} м.` : ''}`,
      );
    }
    const filledBuildingRows = redistributedTechnicalParams.buildingInformationRows.filter((row) => row.value);
    if (filledBuildingRows.length) {
      add(
        `Какая информация о здании «${name}» указана?`,
        filledBuildingRows.map((row) => `${row.label}: ${row.value}`).join('; '),
      );
    }
    if (redistributedTechnicalParams.firstBlockTechnicalRows.length) {
      add(
        `Какие дополнительные характеристики есть у «${name}»?`,
        redistributedTechnicalParams.firstBlockTechnicalRows
          .map((row) => `${row.label}: ${row.value}`)
          .join('; '),
      );
    }
    if (center.buildingFacts.length) {
      add(
        `Что известно о здании «${name}» из других источников, помимо prometr.by?`,
        center.buildingFacts.map((fact) => `${fact.label}: ${fact.value} (по данным ${fact.source})`).join('; '),
      );
    }
    add(`Что есть внутри «${name}»?`, derivedInternalInfrastructureText || null);
    // Инфраструктура рядом появится отдельным картографическим блоком и в
    // карточке/FAQ пока не повторяется.
    add('Какие условия доступной среды указаны?', accessibilityAttributes);
    add('Какие часы работы указаны?', accessHoursText);
    if (offers !== null && offers.length > 0) {
      add('Сколько активных предложений аренды и продажи?', `Активных предложений: аренда — ${offers.filter((o) => o.dealType === 'rent').length}, продажа — ${offers.filter((o) => o.dealType === 'sale').length}.`);
      for (const deal of ['rent', 'sale'] as const) {
        const sum = offersSummary[deal];
        if (sum) add(`Какие площади и ставки ${deal === 'rent' ? 'аренды' : 'продажи'} сейчас предлагаются?`, `${sum.count} лотов с указанными площадью и ставкой: ${fmt(Math.round(sum.sizeMin))}–${fmt(Math.round(sum.sizeMax))} м², $${fmt(Math.round(sum.priceMin))}–$${fmt(Math.round(sum.priceMax))}/м²${deal === 'rent' ? ' в месяц' : ''}.`);
      }
      for (const [label, rows] of [['Аренда', rentRows], ['Продажа', saleRows]] as const) {
        if (rows.length) add(`Какие помещения в «${name}» сейчас ${label === 'Аренда' ? 'сдают' : 'продают'} и по какой цене?`, rows.map((row) => `${row.propertyType}: ${row.count} объявлений, ${Math.round(row.minSize).toLocaleString('ru-RU')}–${Math.round(row.maxSize).toLocaleString('ru-RU')} м², ${formatUsd(row.minPrice)}–${formatUsd(row.maxPrice)}/м² (медиана ${formatUsd(row.medianPrice)})`).join('; '));
      }
      const priced = offers.filter((o) => Number.isFinite(o.size) && o.size > 0 && Number.isFinite(o.pricePerSqm) && o.pricePerSqm >= 0);
      if (priced.length) add('Сколько стоит помещение целиком по ставке объявления?', priced.map((o) => `${o.dealType === 'rent' ? 'Аренда' : 'Продажа'}, ${fmt(o.size)} м² по $${fmt(o.pricePerSqm)}/м²: около $${fmt(Math.round(o.size * o.pricePerSqm))}${o.dealType === 'rent' ? ' в месяц' : ''}`).join('; ') + '. Это площадь × ставка, а не итоговый платёж: состав коммунальных, эксплуатационных и других платежей не раскрыт. Уточняйте у автора объявления.');
    }
    if (center.rentalInfo) {
      const info = center.rentalInfo;
      add('Какие условия и контакты аренды опубликованы?', [info.caveat, info.terms, info.rates, info.sizes, info.contacts].filter(Boolean).join(' ') + ' Актуальные условия уточняйте у арендодателя.');
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
    // FAQ описывает ВСЁ, что есть на странице (правило владельца, CLAUDE.md:
    // "берем за практику описывать в faq вообще все, что описываем на
    // странице"), поэтому про организации здесь три вопроса, а не один: сам
    // список с отраслями, этажи и оборудование. Ответы собираются из тех же
    // данных, что нарисованы в каталоге арендаторов, — нет данных, нет вопроса.
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
      if (tenantAmenities.length > 0) {
        add(
          'Что есть в здании кроме офисов?',
          `${tenantAmenities.map((item) => (item.count > 1 ? `${item.category} (${item.count})` : item.category)).join(', ')}. Это оборудование и точки самообслуживания, в списке организаций они не учтены.`,
        );
      }
    }
    // Рейтинг у нас приезжает из трёх мест (снимок 2ГИС, поле карточки,
    // свободный текст фактов) — но для читателя это ОДИН вопрос. Три
    // отдельных вопроса про одну и ту же оценку читаются как заполнение
    // объёма, поэтому собираем их в один ответ.
    const yandexRatings = parseHighlightRatings(center.highlights);
    const ratingParts = [
      gis2?.reviews?.orgRating != null
        ? `2ГИС — ${gis2.reviews.orgRating}${gis2.reviews.orgReviewCount != null ? ` (оценок: ${gis2.reviews.orgReviewCount})` : ''}`
        : center.gisRating != null
          ? `2ГИС — ${center.gisRating}${center.gisReviewCount != null ? ` (оценок: ${center.gisReviewCount})` : ''}`
          : null,
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
  }, [center, centers, nearestMetro, marketPosition, accessibilityAttributes, accessHoursText, offers, offersSummary, rentRows, saleRows, awardItems, mediaMentions, visibleHighlights, gis2, tenantOrganizations, tenantAmenities, tenantSource, tenantSnapshot, mapRating, reviewQuotes, redistributedTechnicalParams, derivedInternalInfrastructureText, nearbyPlaces]);

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
    // 2026-09-20): что предлагают и почём → какое здание → где оно → кто
    // внутри → на фоне конкурентов → отзывы → блоки доверия (награды/СМИ/
    // факты/история) → застройщик → FAQ.
    return [
      has('offers', offers !== null && offers.length > 0),
      has('rental', Boolean(center.rentalInfo)),
      has(
        'tech',
        redistributedTechnicalParams.buildingInformationRows.length > 0 ||
          center.buildingFacts.length > 0 ||
          Boolean(center.parking || accessHoursText || accessibilityAttributes),
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
      has('reviews', center.gisRating != null || center.highlights.some((h) => h.icon === 'rating') || reviewQuotes.length > 0 || reviews.length > 0),
      has('awards', awardItems.length > 0),
      has('media', mediaMentions.length > 0),
      has('facts', visibleHighlights.length > 0),
      has('history', extractHistoryPoints(center).length >= 2),
      has('developer', Boolean(center.developerInfo)),
      has('faq', faqItems.length > 0),
    ].filter((v): v is { id: string; label: string } => v !== null);
  }, [
    center,
    marketPosition,
    offers,
    awardItems,
    visibleHighlights,
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

  // Расставляет recommendationBlocks (уже отсортированные по приоритету) по
  // накопленному объёму ОБЫЧНОГО контента страницы, а не по имени
  // конкретного соседа — владелец, 2026-09-20, после того как версия
  // "микрорайон всегда после карты, метро всегда после рынка" на бедных
  // данными страницах то теряла блоки (после карты — пусто, у конкретного
  // БЦ просто не было микрорайона), то роняла два блока рекомендаций
  // впритык друг к другу (между ними не оставалось контента-разделителя).
  // Правило теперь простое: первый блок — как только пройдено 5 обычных
  // блоков страницы, каждый следующий — когда с прошлой рекомендации
  // набралось ~1,5–2 "экрана" веса (см. SECTION_WEIGHTS). FAQ — не якорь:
  // рекомендация не встаёт прямо перед вопросами.
  const recommendationSlots = useMemo(() => {
    const slots = new Map<string, RecommendationBlockId[]>();
    const anchors = pageSections.filter((s) => s.id !== 'faq');
    if (anchors.length === 0 || recommendationBlocks.length === 0) return slots;
    const queue = [...recommendationBlocks];
    let sectionsSinceLastRec = 0;
    let weightSinceLastRec = 0;
    let placed = 0;
    for (const section of anchors) {
      sectionsSinceLastRec += 1;
      weightSinceLastRec += SECTION_WEIGHTS[section.id] ?? DEFAULT_SECTION_WEIGHT;
      const readyForFirst = placed === 0 && sectionsSinceLastRec >= FIRST_RECOMMENDATION_AFTER_SECTIONS;
      const readyForNext = placed > 0 && weightSinceLastRec >= NEXT_RECOMMENDATION_MIN_WEIGHT;
      if ((readyForFirst || readyForNext) && queue.length > 0) {
        const block = queue.shift()!;
        slots.set(section.id, [...(slots.get(section.id) ?? []), block.id]);
        placed += 1;
        sectionsSinceLastRec = 0;
        weightSinceLastRec = RECOMMENDATION_BLOCK_WEIGHT;
      }
    }
    // Кандидаты, для которых не нашлось места (очень короткая страница) —
    // просто не показываем, а не доклеиваем в хвост: это и держит
    // равномерный интервал, и не роняет блоки друг на друга.
    return slots;
  }, [pageSections, recommendationBlocks]);

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
      name: center.name,
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
  const centerWebsiteUrl = businessCenterHomepageUrl(center.website);
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
              <div className="absolute left-4 top-4 flex items-center gap-2">
                {center.status === 'under_construction' && (
                  <Badge tone="warning" className="shadow-sm backdrop-blur-sm">
                    Строится
                  </Badge>
                )}
                <FavoriteButton slug={center.slug} />
              </div>
              {/* Рейтинг с Яндекс.Карт — бейджем поверх фото, а не рядом с
                  заголовком (владелец, 2026-09-20: "у нас не влезает название
                  БЦ, предлагаю рейтинг яндекс.карт сделать бейджем поверх
                  фото", затем тем же вечером: "рейтинг переносим в правый край
                  фотки"). 2ГИС-рейтинг с главного экрана убран — владелец
                  попросил оставить в шапке только Яндекс; 2ГИС-оценка
                  остаётся в блоке отзывов ниже. Раньше рейтинг был просто
                  одним из блоков "Интересные факты" (свободный markdown-текст
                  вида "Яндекс.Карты: **5,0** из 5 (204 оценки...)") —
                  структурного поля под число нет, поэтому парсим ту же
                  строку регуляркой (mapRatingFromHighlights) — если формат не
                  узнан, бейдж просто не показывается, ничего не выдумываем. */}
              {mapRating && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-ink shadow-sm backdrop-blur-sm">
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                  {mapRating.label} · Яндекс.Карты
                </span>
              )}
            </div>

            <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-0.5">
              {/* Второе имя здания — сразу под заголовком, а не только в
                  title: по Wordstat БЦ «V» ищут как «Столица» чаще, чем под
                  основным именем, и человек, пришедший по такому запросу,
                  должен увидеть знакомое слово на первом экране, иначе
                  решит, что попал не туда. */}
              <h1 className="text-2xl font-extrabold leading-tight text-ink">{center.name}</h1>
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
                отсюда же 2026-09-20 — ссылка на сайт осталась только внизу
                страницы, в блоке источников (centerWebsiteUrl, см. конец
                файла). */}

            {/* Ровно 4 плитки — класс/площадь/год/этажность (владелец,
                2026-09-06, четвёртый заход: "4 карточки - класс, площадь, год
                сдачи, этажность") — метро/застройщик переехали в обычные
                строки выше, парковка — в блок «Информация о здании».
                Класс — обычный текст, как у
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
              {center.floors != null && <FactTile value={center.floors} label="Этажей" tone="muted" />}
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
            выводится — раньше на этом месте была строка-заглушка. */}
        {offers !== null && offers.length > 0 && (
          <div id="offers" className={cn('mt-6 flex scroll-mt-32 flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Объявления на рынке</h2>
            <div className="flex flex-col gap-2">
              {(['rent', 'sale'] as const).map((deal) => {
                const sum = offersSummary[deal];
                if (!sum) return null;
                // Знак доллара уже стоит у чисел ниже — в единице его
                // быть не должно, иначе получается «$13–$29 $/м²».
                const unit = deal === 'rent' ? '/м²/мес' : '/м²';
                return (
                  <p key={deal} className="text-sm text-ink-muted">
                    <span className="font-bold text-ink">{deal === 'rent' ? 'Аренда' : 'Продажа'}</span>:{' '}
                    {sum.count} {sum.count === 1 ? 'лот' : 'лотов'}, площади{' '}
                    <span className="font-semibold text-ink">
                      {Math.round(sum.sizeMin).toLocaleString('ru-RU')}–{Math.round(sum.sizeMax).toLocaleString('ru-RU')} м²
                    </span>
                    , цены{' '}
                    <span className="font-semibold text-ink">
                      ${Math.round(sum.priceMin).toLocaleString('ru-RU')}–${Math.round(sum.priceMax).toLocaleString('ru-RU')}{unit}
                    </span>
                    {'. '}
                    {sum.links.map((o, i) => (
                      <a
                        key={o.id}
                        href={o.adLink}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-primary-hover hover:underline"
                      >
                        {i === 0 ? 'самый маленький' : 'самый большой'}
                        {i === 0 && sum.links.length > 1 ? ' · ' : ''}
                      </a>
                    ))}
                  </p>
                );
              })}
            </div>
            {offers.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="py-2 pr-3 text-left">
                        Тип помещения
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Объявлений
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Площадь
                      </th>
                      <th scope="col" className="py-2 pl-2 text-right">
                        Цена за м²
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <OfferDealSection title="Продажа" rows={saleRows} />
                    <OfferDealSection title="Аренда" rows={rentRows} />
                  </tbody>
                </table>
              </div>
            )}
            {/* Честная оговорка: у нас лотов меньше, чем объявлений на самих
                площадках, и это не потеря данных. Агентство выкладывает один
                кабинет и на Kufar, и на Realt — мы считаем его одним лотом
                (lib/businessCenterOfferDuplicates.ts). */}
            {collapsedDuplicates > 0 && (
              <p className="text-xs text-ink-muted">
                {collapsedDuplicates} {pluralRu(collapsedDuplicates, 'объявление', 'объявления', 'объявлений')} —
                это те же помещения, выложенные ещё и на другой площадке; в подсчёте они учтены один раз.
              </p>
            )}

            {/* Сравнение со средней по классу/району (ANALYTICSPLAN.md
                §4.2) — медиана этого конкретного здания против медиан
                market_snapshots (сегмент ofisy_bc). Только когда у здания
                вообще есть медиана по сделке И хотя бы один из бенчмарков
                (класс/район) набрал порог MIN_RELIABLE_N — иначе сравнение
                с сырыми 2-3 объявлениями было бы не сравнением, а шумом. */}
            <RateComparisonNote
              dealType="rent"
              buildingMedian={buildingRentMedian}
              classLabel={center?.businessClass ? `классу ${center.businessClass}` : null}
              classSnapshot={classSnapshot?.rent}
              districtLabel={center?.district ? `${districtDative(center.district)} району` : null}
              districtSnapshot={districtSnapshot?.rent}
            />
            <RateComparisonNote
              dealType="sale"
              buildingMedian={buildingSaleMedian}
              classLabel={center?.businessClass ? `классу ${center.businessClass}` : null}
              classSnapshot={classSnapshot?.sale}
              districtLabel={center?.district ? `${districtDative(center.district)} району` : null}
              districtSnapshot={districtSnapshot?.sale}
            />
          </div>
        )}

        {renderRecommendationSlot('offers')}

        {/* Условия для арендаторов с офиц. сайта БЦ (владелец, 2026-09-05,
            на примере "Проспект"/Elite Estate — по нему нет объявлений на
            Kufar/Realt, но на собственном сайте есть условия для
            арендаторов: "пройдись по сайтам БЦ и поищешь такую информацию").
            Собрано веб-поиском (Gemini через ProxyAPI — прямого доступа к
            большинству сайтов БЦ из песочницы нет). Первая версия рисовала
            всё одним абзацем — владелец: "верстка — пиздец, разбей на
            логические блоки, используй форматирование" — теперь отдельная
            подписанная строка на каждый раздел (LabeledTextRow), важная
            оговорка источника (сайт недоступен, "Аден" по факту гостиница
            и т.п.) — акцентным блоком сверху, не затёртая в общем тексте.
            Каждое поле независимо может быть null — рисуем только то, что
            реально нашлось. Порядок блоков страницы пересобран 2026-09-20
            (владелец принял предложенный порядок): условия аренды идут
            сразу за "Объявления на рынке" — оба блока отвечают на один и
            тот же вопрос "что тут есть и почём". */}
        {center.rentalInfo && (
          <div id="rental" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              Условия для арендаторов
            </h2>

            {center.rentalInfo.caveat && (
              <div className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="leading-relaxed">{center.rentalInfo.caveat}</p>
              </div>
            )}

            <div className="flex flex-col divide-y divide-border">
              <LabeledTextRow icon={ScrollText} label="Условия аренды" text={center.rentalInfo.terms} />
              <LabeledTextRow icon={Banknote} label="Ставки" text={center.rentalInfo.rates} />
              <LabeledTextRow icon={Ruler} label="Площади и типы помещений" text={center.rentalInfo.sizes} />
              <LabeledTextRow icon={Phone} label="Контакты отдела аренды" text={center.rentalInfo.contacts} />
            </div>

            <p className="text-xs text-ink-muted">
              Собрано автоматически по официальному сайту БЦ и открытым источникам — не куратировано вручную, перед
              подписанием договора уточняйте актуальные условия напрямую у арендодателя.
            </p>
          </div>
        )}

        {renderRecommendationSlot('rental')}

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
          {(center.parking ||
            accessHoursText ||
            accessibilityAttributes ||
            redistributedTechnicalParams.buildingInformationRows.length > 0 ||
            center.buildingFacts.length > 0) && (
            <div className="overflow-hidden rounded-control border border-border">
              <table className="w-full border-collapse text-sm">
                <tbody>
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
        </div>

        {renderRecommendationSlot('tech')}

        {/* Карта и инфраструктура рядом — сразу после параметров здания,
            перед арендаторами и сравнением с конкурентами (владелец,
            2026-09-20: принял предложенный порядок блоков страницы; см.
            подпись пункта меню "На странице" ниже про то, что карта есть
            у любого БЦ с координатами). */}
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
            'warning' — единственная особая: выносится наверх акцентным
            жёлтым блоком (как caveat в RentalInfo), а не в общий список.
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

            {visibleHighlights
              .filter((s) => s.icon === 'warning')
              .map((s, i) => (
                <div
                  key={`warning-${i}`}
                  className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {s.label && <p className="text-xs font-semibold uppercase tracking-wide">{s.label}</p>}
                    <p className="mt-0.5 leading-relaxed">{renderRentalText(s.text)}</p>
                  </div>
                </div>
              ))}

            <div className="flex flex-col divide-y divide-border">
              {(() => {
                const plainFacts = visibleHighlights.filter((s) => s.icon !== 'warning');
                // Единственный факт в карточке — свой подписанный заголовок
                // над ним избыточен: и так ясно из заголовка карточки "Интересные
                // факты" (владелец, 2026-09-06: "если интересный факт один, то
                // заголовок лишний").
                const showLabel = plainFacts.length > 1;
                return plainFacts.map((s, i) => (
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
          {/* Организации, рейтинг, часы работы и атрибуты — это срезы на
              конкретную дату, а не «сейчас». Дата обязана стоять рядом с
              данными, а не подразумеваться. Источников теперь два: организации
              с 2026-09-19 из Яндекс.Карт, остальное — по-прежнему 2ГИС. */}
          {tenantSource === 'yandex_maps' && tenantSnapshot?.capturedAt && (
            <p className="text-sm text-ink-muted">
              Организации в здании — срез Яндекс.Карт от{' '}
              {new Date(tenantSnapshot.capturedAt).toLocaleDateString('ru-RU')}.
            </p>
          )}
          {gis2?.fetchedAt && (
            <p className="text-sm text-ink-muted">
              Данные 2ГИС ({tenantSource === 'yandex_maps' ? 'рейтинг, часы работы, атрибуты здания' : 'организации, рейтинг, часы работы, атрибуты здания'}) —
              срез от {new Date(gis2.fetchedAt).toLocaleDateString('ru-RU')}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {GENERAL_DATA_SOURCES.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary',
                )}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {source.label}
              </a>
            ))}
            {centerWebsiteUrl && (
              <a
                href={centerWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary"
              >
                <Globe className="h-3.5 w-3.5 shrink-0" />
                Официальный сайт «{shortName(center)}»
              </a>
            )}
            {developerWebsiteUrl && (
              <a
                href={developerWebsiteUrl.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary"
              >
                <HardHat className="h-3.5 w-3.5 shrink-0" />
                Сайт застройщика{center.developer ? ` (${center.developer})` : ''}
              </a>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Данные о здании собраны из открытых источников — не всё относится к каждому конкретному БЦ.
            Расстояния указаны по прямой. Стоимость помещения рассчитана как площадь × ставка объявления;
            дополнительные платежи в источниках не раскрыты. Отсутствие объявлений не означает отсутствие
            свободных помещений. Характеристики и условия требуют уточнения у владельца или автора объявления.
          </p>
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

// Одна строка блока "Условия для арендаторов" — иконка + подпись раздела +
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
];

// То же пять категорий, но для сопоставления с текстом из базы (рубрики
// организаций, подписи оборудования), а не с вручную набранным списком
// владельца, — там регулярки нарочно строже (граница слова через lookahead,
// см. использование выше в derivedInternalInfrastructureText): свободный
// текст владелец уже проверил глазами, а рубрики тысяч арендаторов — нет.
const TENANT_DERIVED_INFRASTRUCTURE: { pattern: RegExp; label: string }[] = [
  { pattern: /банкомат(?![\p{L}])/iu, label: 'банкомат' },
  { pattern: /банк(?![\p{L}])/iu, label: 'банк' },
  { pattern: /(?:кофе|кафе)(?![\p{L}])/iu, label: 'кафе' },
  { pattern: /магазин(?![\p{L}])/iu, label: 'магазин' },
  { pattern: /(?:фитнес|спортзал)(?![\p{L}])/iu, label: 'фитнес-центр' },
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

// Мини-разметка внутри полей "Условия для арендаторов" (владелец, 2026-09-06:
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

function renderBold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

// Таблица содержит только реальные предложения, без пустых строк-заглушек.
interface OfferRow {
  propertyType: string;
  count: number;
  minSize: number;
  maxSize: number;
  minPrice: number;
  medianPrice: number;
  maxPrice: number;
}

function computeOfferRows(offers: BusinessCenterOffer[], dealType: BusinessCenterOffer['dealType']): OfferRow[] {
  const filtered = offers.filter((o) => o.dealType === dealType);
  if (filtered.length === 0) return [];

  const groups = new Map<string, BusinessCenterOffer[]>();
  for (const o of filtered) {
    const key = o.propertyType ?? 'Без категории';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  return Array.from(groups.entries())
    .map(([propertyType, group]) => {
      const sizes = group.map((o) => o.size);
      const prices = [...group.map((o) => o.pricePerSqm)].sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);
      const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
      return {
        propertyType,
        count: group.length,
        minSize: Math.min(...sizes),
        maxSize: Math.max(...sizes),
        minPrice: Math.min(...prices),
        medianPrice,
        maxPrice: Math.max(...prices),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('ru-RU')}`;
}

// Медиана цены за м² по ВСЕМ объявлениям здания одного типа сделки, без
// разбивки по типу помещения (та живёт в computeOfferRows выше) — нужна
// только для сравнения со средней по классу/району из market_snapshots.
function overallMedianPricePerSqm(offers: BusinessCenterOffer[], dealType: BusinessCenterOffer['dealType']): number | null {
  const prices = offers.filter((o) => o.dealType === dealType).map((o) => o.pricePerSqm);
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatRatePerSqm(n: number, dealType: 'rent' | 'sale'): string {
  const rounded = dealType === 'rent' ? Math.round(n * 10) / 10 : Math.round(n);
  return `$${rounded.toLocaleString('ru-RU')}${dealType === 'rent' ? '/м²/мес' : '/м²'}`;
}

function compareLabel(diffPct: number): string {
  if (Math.abs(diffPct) < 5) return 'на уровне';
  return diffPct > 0 ? `выше на ${Math.round(diffPct)}%` : `ниже на ${Math.round(Math.abs(diffPct))}%`;
}

function RateComparisonNote({
  dealType,
  buildingMedian,
  classLabel,
  classSnapshot,
  districtLabel,
  districtSnapshot,
}: {
  dealType: 'rent' | 'sale';
  buildingMedian: number | null;
  classLabel: string | null;
  classSnapshot: MarketSnapshot | undefined;
  districtLabel: string | null;
  districtSnapshot: MarketSnapshot | undefined;
}) {
  if (buildingMedian == null) return null;

  const parts: ReactNode[] = [];
  if (classLabel && classSnapshot?.median != null && classSnapshot.n >= MIN_RELIABLE_N) {
    const diff = ((buildingMedian - classSnapshot.median) / classSnapshot.median) * 100;
    parts.push(
      <span key="class">
        {compareLabel(diff)} медианы по {classLabel} ({formatRatePerSqm(classSnapshot.median, dealType)})
      </span>,
    );
  }
  if (districtLabel && districtSnapshot?.median != null && districtSnapshot.n >= MIN_RELIABLE_N) {
    const diff = ((buildingMedian - districtSnapshot.median) / districtSnapshot.median) * 100;
    parts.push(
      <span key="district">
        {compareLabel(diff)} медианы по {districtLabel} ({formatRatePerSqm(districtSnapshot.median, dealType)})
      </span>,
    );
  }
  if (parts.length === 0) return null;

  return (
    <p className="text-xs text-ink-muted">
      {dealType === 'rent' ? 'Аренда' : 'Продажа'} в этом здании — {formatRatePerSqm(buildingMedian, dealType)}, это{' '}
      {parts.reduce<ReactNode[]>((acc, part, i) => (i === 0 ? [part] : [...acc, ' и ', part]), [])}.
    </p>
  );
}

// Заголовок сделки (Продажа/Аренда) — не отдельная колонка (чтобы не
// повторять текст на каждой строке разбивки), а строка-разделитель на всю
// ширину таблицы, за ней сразу строки по типу помещения.
function OfferDealSection({ title, rows }: { title: string; rows: OfferRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <tr>
        <td colSpan={4} className="pt-4 pb-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
          {title}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.propertyType}>
          <td className="py-3 pr-3 font-medium text-ink">{row.propertyType}</td>
          <td className="py-3 px-2 text-right tabular-nums text-ink-muted">{row.count}</td>
          <td className="whitespace-nowrap py-3 px-2 text-right tabular-nums text-ink-muted">
            {row.minSize === row.maxSize
              ? `${row.minSize.toLocaleString('ru-RU')} м²`
              : `${row.minSize.toLocaleString('ru-RU')}–${row.maxSize.toLocaleString('ru-RU')} м²`}
          </td>
          <td className="whitespace-nowrap py-3 pl-2 text-right tabular-nums font-semibold text-ink">
            {row.minPrice === row.maxPrice
              ? `${formatUsd(row.minPrice)}/м²`
              : `${formatUsd(row.minPrice)}–${formatUsd(row.maxPrice)}/м² (медиана ${formatUsd(row.medianPrice)})`}
          </td>
        </tr>
      ))}
    </>
  );
}
