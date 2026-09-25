import { tenantDirectionLabel } from '../data/tenantIndustries';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import {
  Accessibility,
  AlertTriangle,
  ArrowUpDown,
  ArrowLeft,
  Award,
  BadgeCheck,
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
  List,
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
  LayoutGrid,
  Users,
  Waves,
  X,
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
  setGenericPageMeta,
  setNoIndex,
  clearNoIndex,
  setBusinessCenterPageMeta,
  setPlaceJsonLd,
} from '../lib/pageMeta';
import { useCatalogKind } from '../lib/catalogKind';
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
import { fetchBusinessCenter, fetchBusinessCenters, snapshotBusinessCenter, snapshotBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../data/businessCenterNearbyPlaces';
import { fetchBusinessCenterNearbyPlaces, peekBusinessCenterNearbyPlaces } from '../lib/businessCenterNearbyPlacesApi';
import { formatMeters, groupNearbyPlaces, hasNearbyContent, mergeMetroStations } from '../lib/nearbyPlaces';
import type { BusinessCenterReview } from '../data/businessCenterReviews';
import { fetchBusinessCenterReviews, peekBusinessCenterReviews } from '../lib/businessCenterReviewsApi';
import type { BusinessCenterOffer } from '../data/businessCenterOffers';
import { fetchBusinessCenterOffers, peekBusinessCenterOffers } from '../lib/businessCenterOffersApi';
import { dedupeOffers } from '../lib/businessCenterOfferDuplicates';
import { buildDealStats } from '../lib/businessCenterOfferStats';
import { BuildingOffersSection } from '../components/businessCenters/BuildingOffersSection';
import { pluralRu } from '../lib/pluralRu';
import { fetchLatestMarketSnapshots, peekLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import type { MarketSnapshot } from '../data/marketSnapshots';
import type {
  BusinessCenter2gisSnapshot,
  Gis2Schedule,
  Gis2ScheduleDay,
} from '../data/businessCenter2gis';
import { fetchBusinessCenter2gisSnapshot, peekBusinessCenter2gisSnapshot } from '../lib/businessCenter2gisApi';
import { fetchBusinessCenterTenantSnapshot, peekBusinessCenterTenantSnapshot } from '../lib/businessCenterTenantsApi';
import {
  buildFloorGroups,
  buildTenantsFromGis2,
  buildTenantsFromLegacyList,
  buildTenantsFromSnapshot,
  formatFloorLabel,
} from '../lib/businessCenterTenants';
import { TenantDirectory } from '../components/businessCenters/TenantDirectory';
import { BuildingAmenities } from '../components/businessCenters/BuildingAmenities';
import { TradeCenterRetailBlocks } from '../components/businessCenters/TradeCenterRetailBlocks';
import { TradeCenterInfrastructure } from '../components/businessCenters/TradeCenterInfrastructure';
import {
  buildTradeCenterInfrastructure,
  infrastructureFaqAnswer,
  infrastructureSectionSize,
} from '../lib/tradeCenterInfrastructure';
import { TradeCenterAwardsBlock } from '../components/businessCenters/TradeCenterAwardsBlock';
import { DeveloperDeepCard } from '../components/businessCenters/DeveloperDeepCard';
import {
  developerAboutFaqAnswer,
  developerCompaniesFaqAnswer,
  developerMainName,
  developerPortfolioFaqAnswer,
  developerProfileSentence,
  developerSectionSize,
  hasDeveloperDeepData,
} from '../lib/developerProfile';
import {
  RETAIL_SECTION_LABELS,
  anchorsFaqAnswer,
  anchorsForPage,
  foodFaqAnswer,
  vacanciesFaqAnswer,
  funFaqAnswer,
  leisureForPage,
  retailHistoryFaqAnswer,
  audienceFaqQuestion,
  awardsFaqAnswer,
  awardsRankingSize,
  awardsRankingTitle,
  eventsFaqAnswer,
  figuresFaqAnswer,
  floorsFaqAnswer,
  hoursFaqAnswer,
  leisureFaqAnswer,
  leisureFaqQuestion,
  loyaltyFaqAnswer,
  parkingFaqAnswer,
  parkingFaqQuestion,
  pitchFaqAnswer,
  quotesFaqAnswer,
  rankingFaqAnswer,
  retailSectionGroup,
  retailSectionIds,
  retailSectionSize,
  rulesFaqAnswer,
  transportFaqAnswer,
  transportFaqQuestion,
  type RetailSectionId,
} from '../lib/tradeCenterRetail';
import { RETAIL_SECTION_ICONS } from '../components/businessCenters/tradeCenterRetailStyle';
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
// "Закрытие" ведёт не назад в истории браузера, а явно на /minsk/bc —
// так работает предсказуемо и при заходе по прямой ссылке из поиска, когда
// в истории браузера страницы хаба вообще нет.

// Подписи пунктов липкого меню «На странице» (Б7). Ключ — id блока в
// разметке; список самих пунктов собирается в pageSections по тому, какие
// блоки реально отрисованы.
const SECTION_LABELS: Record<string, string> = {
  awards: 'Награды',
  // У ТЦ вместо «Наград» — «Награды и рейтинги» (TradeCenterAwardsBlock);
  // подпись пункта уточняется по содержимому (awardsRankingTitle).
  'awards-ranking': 'Награды и рейтинги',
  facts: 'Интересные факты',
  media: 'СМИ о здании',
  developer: 'Застройщик',
  market: 'Место среди конкурентов',
  map: 'Инфраструктура рядом',
  tech: 'Параметры здания',
  tenants: 'Каталог арендаторов',
  // Только у ТЦ: у БЦ блок оборудования в меню «На странице» не выводится.
  amenities: 'Инфраструктура',
  // Торговые блоки — только у ТЦ (TradeCenterRetailBlocks).
  floors: RETAIL_SECTION_LABELS.floors,
  'retail-history': RETAIL_SECTION_LABELS['retail-history'],
  food: RETAIL_SECTION_LABELS.food,
  fun: RETAIL_SECTION_LABELS.fun,
  leisure: RETAIL_SECTION_LABELS.leisure,
  visit: RETAIL_SECTION_LABELS.visit,
  business: RETAIL_SECTION_LABELS.business,
  numbers: RETAIL_SECTION_LABELS.numbers,
  quotes: RETAIL_SECTION_LABELS.quotes,
  anchors: RETAIL_SECTION_LABELS.anchors,
  // «БЦ» подменяется на «ТЦ» в каталоге торговых центров (см. sectionLabel).
  rental: 'Отдел аренды БЦ',
  offers: 'Что сдают и продают',
  history: 'История здания',
  reviews: 'Отзывы',
  faq: 'Частые вопросы',
};

const SECTION_ICONS: Record<string, typeof FileText> = {
  awards: Trophy,
  'awards-ranking': Trophy,
  facts: Sparkles,
  media: Newspaper,
  developer: HardHat,
  market: Award,
  map: MapPin,
  tech: Building2,
  tenants: Users,
  amenities: LayoutGrid,
  ...RETAIL_SECTION_ICONS,
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

// Владелец, 2026-09-23: каталог ТЦ закрыт от индексации на время сбора
// данных. Снять — отдельным решением вместе с полноценной SEO-разметкой ТЦ.
const TC_NOINDEX = true;

// ownerMode — та же карточка для сайта самого БЦ, адрес /bc/<slug>
// (владелец, 2026-09-24: «отдельный линк на страницу его БЦ без
// рекомендательных блоков и инфы про другие БЦ… чтобы этой страницы не было
// в выдаче, при этом вес ссылки передавался»). Canonical и вся разметка —
// от /minsk/bc/<slug> (setBusinessCenterPageMeta ниже не знает о режиме),
// Vercel отдаёт на этот адрес тот же пререндер, в sitemap его нет. Скрыто
// то, что владелец перечислил: шапка сайта с логотипом, «Все
// бизнес-центры», соседи по каталогу, тексты отзывов (рейтинг и число
// оценок остаются), «Что сейчас сдают и продают в здании», «Вы собственник
// или управляющая компания?», а в «Месте среди конкурентов» — всё, кроме
// показателей, где здание сильнее своего класса. Скрытое не пересказывает
// и FAQ: он строится из тех же выборок, их режим и обнуляет.
export function BusinessCenterDetailPage({ ownerMode = false }: { ownerMode?: boolean } = {}) {
  const { slug } = useParams<{ slug: string }>();
  // Каталог страницы: бизнес-центры (/minsk/bc) или торговые центры
  // (/minsk/tc) — один шаблон, словарь и корень из src/lib/catalogKind.tsx.
  const V = useCatalogKind();
  const isTc = V.kind === 'tc';
  // Стартуем с данных, положенных в сборку (Ш3-b плана
  // docs/bc-catalog-seo-plan.md): их разобрал main.tsx до монтирования,
  // поэтому первый же рендер получается полным — без «Загрузка…» поверх
  // готовой разметки пререндера и без прыжка вёрстки. Нет снимка (SPA-
  // переход, страница вне раздела) — как раньше, null и запрос ниже.
  const [centers, setCenters] = useState<BusinessCenter[] | null>(() => snapshotBusinessCenters(V.kind));
  // Все догружаемые блоки карточки стартуют с уже пришедшего файла
  // .extra (peekBuildData в src/lib/buildData.ts): пререндер-снапшот
  // нарисован с ними, и первый кадр React обязан совпасть с ним — иначе на
  // десктопе блоки пропадали и появлялись снова (CLS 0,33, 2026-09-23).
  const [offersResult, setOffersResult] = useState<{
    slug: string;
    offers: BusinessCenterOffer[] | null;
    error: boolean;
  } | null>(() => {
    const offers = slug ? peekBusinessCenterOffers(slug) : null;
    return slug && offers ? { slug, offers, error: false } : null;
  });
  const rawOffers = offersResult && offersResult.slug === slug ? offersResult.offers : null;
  // Один и тот же лот приходит сразу с нескольких площадок — считаем его
  // одним (см. lib/businessCenterOfferDuplicates.ts). Схлопываем СРАЗУ
  // после загрузки, чтобы дальше — и в сводке, и в таблице, и в медиане
  // здания, и в FAQ — везде было одно и то же число.
  const offers = useMemo(() => (rawOffers === null ? null : dedupeOffers(rawOffers)), [rawOffers]);
  const [gis2Result, setGis2Result] = useState<{ slug: string; data: BusinessCenter2gisSnapshot | null } | null>(() => {
    const data = slug ? peekBusinessCenter2gisSnapshot(slug) : undefined;
    return slug && data !== undefined ? { slug, data } : null;
  });
  const gis2 = gis2Result?.slug === slug ? gis2Result?.data ?? null : null;
  // Офисный рынок (ставки аренды офисов в БЦ) торговым центрам не нужен —
  // сравнение «дорого/дёшево против класса» у ТЦ не показываем вовсе.
  const [officeSnapshots, setOfficeSnapshots] = useState<MarketSnapshot[] | null>(() =>
    isTc ? [] : peekLatestMarketSnapshots('ofisy_bc'),
  );
  const [tenantSnapshotResult, setTenantSnapshotResult] = useState<{
    slug: string;
    data: BusinessCenterTenantSnapshot | null;
  } | null>(() => {
    const data = slug ? peekBusinessCenterTenantSnapshot(slug) : undefined;
    return slug && data !== undefined ? { slug, data } : null;
  });
  const tenantSnapshot = tenantSnapshotResult?.slug === slug ? tenantSnapshotResult?.data ?? null : null;
  const [nearbyPlacesResult, setNearbyPlacesResult] = useState<{
    slug: string;
    places: BusinessCenterNearbyPlace[];
  } | null>(() => {
    const places = slug ? peekBusinessCenterNearbyPlaces(slug) : null;
    return slug && places ? { slug, places } : null;
  });
  const [reviewsResult, setReviewsResult] = useState<{ slug: string; reviews: BusinessCenterReview[] } | null>(() => {
    const reviews = slug ? peekBusinessCenterReviews(slug) : null;
    return slug && reviews ? { slug, reviews } : null;
  });

  useEffect(() => {
    fetchBusinessCenters(V.kind)
      .then(setCenters)
      // Ошибка базы не стирает уже показанный список (снимок сборки): пустой
      // каталог на месте готового — хуже, чем данные часовой давности.
      .catch(() => setCenters((prev) => prev ?? []));
  }, [V.kind]);

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
    // Не гасим таблицу в null, если объявления здания уже на руках (файл
    // .extra из сборки): пустой промежуточный кадр — это тот же прыжок
    // вёрстки, от которого стартовое состояние выше и защищает.
    const fromBuild = peekBusinessCenterOffers(slug);
    setOffersResult(fromBuild ? { slug, offers: fromBuild, error: false } : null);
    fetchBusinessCenterOffers(slug, V.kind)
      .then((data) => {
        if (!cancelled) setOffersResult({ slug, offers: data, error: false });
      })
      .catch(() => {
        if (!cancelled) setOffersResult({ slug, offers: null, error: true });
      });
    return () => { cancelled = true; };
  }, [slug, V.kind]);

  // Сравнение со средней по классу/району (ANALYTICSPLAN.md §4.2) — тот же
  // сегмент 'ofisy_bc', что и на каталоге/хабах. Грузится один раз, не по
  // slug — 23 строки на весь город, дешевле держать в памяти, чем
  // перезапрашивать при каждом переходе на следующий/предыдущий БЦ.
  useEffect(() => {
    if (isTc) return;
    fetchLatestMarketSnapshots('ofisy_bc')
      .then(setOfficeSnapshots)
      .catch(() => setOfficeSnapshots([]));
  }, [isTc]);

  // Порядок для "предыдущий/следующий" — тот же алфавит по короткому имени,
  // что и в боковом меню хаба, чтобы стрелки совпадали с порядком, который
  // пользователь уже видел в списке до перехода сюда.
  const sorted = useMemo(() => sortByShortName(centers ?? []), [centers]);
  // Само здание — отдельным запросом по слагу, а не поиском в списке
  // (2026-09-22, Ш3 плана docs/bc-catalog-seo-plan.md). Список с того же дня
  // не забирает тяжёлые колонки — технические параметры, арендаторов,
  // упоминания в СМИ, инфо застройщика — а карточке они нужны все. Заодно
  // первый экран больше не ждёт всю таблицу: один ряд вместо 969 КБ.
  // Ответ храним вместе со слагом, под который он пришёл: компонент общий
  // для всех БЦ, и при переходе «предыдущий/следующий» иначе на миг
  // показались бы данные прошлого здания.
  // failed — база не ответила, а в снимке сборки здания нет. Это «не знаем»,
  // а не «здания нет»: такой ответ не имеет права превращаться в soft-404 с
  // noindex (см. эффект ниже у setNoIndex).
  const [detail, setDetail] = useState<{ slug: string; center: BusinessCenter | null; failed?: boolean } | null>(() =>
    slug ? (snapshotBusinessCenter(slug, V.kind) ? { slug, center: snapshotBusinessCenter(slug, V.kind) } : null) : null,
  );
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    // При переходе «предыдущий/следующий» показываем здание из снимка
    // сборки сразу, если оно там есть, и только иначе гасим страницу в
    // «Загрузка…»: сбрасывать в null всегда — значит мигать пустым экраном
    // там, где данные уже на руках.
    const fromBuild = snapshotBusinessCenter(slug, V.kind);
    setDetail(fromBuild ? { slug, center: fromBuild } : null);
    fetchBusinessCenter(slug, V.kind)
      .then((data) => {
        if (!cancelled) setDetail({ slug, center: data });
      })
      .catch(() => {
        if (cancelled) return;
        // Ошибка загрузки — не «такого здания нет». 2026-09-23, пока Supabase
        // был закрыт за трафик (402), это различие и выстрелило: сбой одного
        // файла /data/bc/<slug>.json (502 от CDN, медленная сеть дольше
        // таймаута) — и карточка живого здания рисовала «не найден» и ставила
        // себе noindex, nofollow: пришедший в этот момент робот поисковика
        // получил бы команду выкинуть страницу из индекса. Теперь сначала
        // пробуем здание из снимка СПИСКА (узкие колонки — без технических
        // параметров и арендаторов, но с именем, адресом, классом и фото, то
        // есть страница остаётся собой), и только если нет и его — честная
        // ошибка без noindex.
        const fromList = snapshotBusinessCenters(V.kind)?.find((c) => c.slug === slug) ?? null;
        setDetail({ slug, center: fromList, failed: fromList === null });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, V.kind]);
  const center = detail !== null && detail.slug === slug ? detail.center : null;

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
  // Каталог показан у соседнего корпуса того же комплекса (retailInfo.tenantsAt):
  // здесь ни списка, ни удобств из него, ни фолбэка на 2GIS — только ссылка.
  const tenantsAt = center?.retailInfo?.tenantsAt ?? null;
  const tenantOrganizations = useMemo(() => {
    if (tenantsAt) return [];
    if (yandexTenants && yandexTenants.tenants.length > 0) return yandexTenants.tenants;
    if (legacyTenants && legacyTenants.tenants.length > 0) return legacyTenants.tenants;
    return gis2 ? buildTenantsFromGis2(gis2.tenantOrganizations) : [];
  }, [tenantsAt, yandexTenants, legacyTenants, gis2]);
  const tenantAmenities = useMemo(() => {
    if (tenantsAt) return [];
    if (yandexTenants && yandexTenants.tenants.length > 0) return yandexTenants.amenities;
    if (legacyTenants && legacyTenants.tenants.length > 0) return legacyTenants.amenities;
    return [];
  }, [tenantsAt, yandexTenants, legacyTenants]);
  // «Инфраструктура» ТЦ (2026-09-24): то же оборудование плюс удобства с
  // сайта ТЦ (retail_info.services) одним списком по группам. Блок, FAQ и
  // модель высоты берут эти группы, у БЦ список пуст — там BuildingAmenities.
  const tcInfrastructure = useMemo(
    () => (isTc && center ? buildTradeCenterInfrastructure(center.retailInfo?.services ?? [], tenantAmenities) : []),
    [isTc, center, tenantAmenities],
  );
  const tcAmenitySource = useMemo(
    () => ({
      source: 'Яндекс Карты',
      sourceUrl: (yandexTenants?.tenants.length ?? 0) > 0 ? tenantSnapshot?.sourceUrl ?? null : null,
    }),
    [yandexTenants, tenantSnapshot],
  );

  const nearbyPlaces = nearbyPlacesResult?.slug === slug
    ? nearbyPlacesResult?.places ?? EMPTY_NEARBY_PLACES
    : EMPTY_NEARBY_PLACES;
  const reviews = !ownerMode && reviewsResult?.slug === slug ? reviewsResult?.reviews ?? EMPTY_REVIEWS : EMPTY_REVIEWS;
  const index = center ? sorted.findIndex((c) => c.slug === center.slug) : -1;
  const prev = !ownerMode && index > 0 ? sorted[index - 1] : null;
  const next = !ownerMode && index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;

  // Сводка по сделке (помещения, средняя цена, бюджет, скидка за объём) —
  // одни и те же цифры рисует блок «Что сейчас сдают и продают» и
  // пересказывает FAQ под ним.
  const saleStats = useMemo(() => (ownerMode ? null : buildDealStats(offers, 'sale')), [offers, ownerMode]);
  const rentStats = useMemo(() => (ownerMode ? null : buildDealStats(offers, 'rent')), [offers, ownerMode]);
  // Рейтинг Яндекс.Карт вынесен из общего списка фактов в короткий бейдж
  // рядом с заголовком. Подробный исходный текст не используется как tooltip.
  const mapRating = useMemo(() => mapRatingFromHighlights(center?.highlights ?? []), [center]);
  // Точное расстояние до метро из 2GIS (владелец подключает в параллельной
  // ветке, 2026-09-06) — по прямой, в метрах. Когда есть — показывается
  // ВМЕСТО center.metro (владелец, 2026-09-06: "дублируется метро... оставь
  // только данные 2GIS"), не вместе с ним — см. JSX ниже.
  const nearestMetro = useMemo(() => nearestMetroStation(center?.nearestMetroStations ?? []), [center]);
  const scheduleLines = useMemo(() => (gis2?.schedule ? formatSchedule(gis2.schedule) : []), [gis2]);
  // Одна станция — одно расстояние на всей странице. Поле БЦ
  // (nearestMetroStations, собрано раньше) и снимок точек инфраструктуры
  // расходятся в метрах до ОДНОЙ и той же станции: у «Фаренгейта» это 170 и
  // 129 м. Блок инфраструктуры давно сводит их общим mergeMetroStations
  // (берёт меньшее), а плитка у заголовка и FAQ брали сырое поле — и
  // страница показывала два разных числа про одно и то же. Полоса сравнения
  // с классом ниже намеренно остаётся на сыром поле: её медиана считается по
  // тому же полю у всех 141 здания, и подмена только своего значения сделала
  // бы сравнение нечестным.
  const displayMetro = useMemo(
    () => mergeMetroStations(center?.nearestMetroStations ?? [], nearbyPlaces)[0] ?? null,
    [center, nearbyPlaces],
  );

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
      corpusBreakdown: {} as Record<string, { corpusLabel: string; value: string }[]>,
      corpora: [] as { label: string; year: string | null; floors: string | null; area: string | null }[],
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

    // Значения, которые у корпусов разные: в таблице «Параметры здания» они
    // идут строками друг под другом с адресом корпуса слева (владелец,
    // 2026-09-24: «перечисление лифтов и этажей непонятно, делал бы строчки
    // друг под другом»). В FAQ и прочий текст уходит та же строка через «; ».
    const corpusBreakdown: Record<string, { corpusLabel: string; value: string }[]> = {};
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
      if (unique.length === 1) {
        // Значение, известное только у одного корпуса, в базе подписано
        // адресом в скобках («9310 м² (Шафарнянская, 11)»), иначе на
        // странице без подписи его не отличить от общего. В таблице такое
        // значение идёт той же строкой «адрес — значение», что и остальные.
        const only = unique[0];
        const suffix = only.corpusLabel ? ` (${only.corpusLabel})` : null;
        if (suffix && only.value.endsWith(suffix)) {
          corpusBreakdown[label] = [
            { corpusLabel: only.corpusLabel!, value: formatCorpusValue(only.value.slice(0, -suffix.length)) },
          ];
        }
        return only.value;
      }
      if (unique.every((entry) => entry.corpusLabel)) {
        corpusBreakdown[label] = unique.map((entry) => ({
          corpusLabel: entry.corpusLabel!,
          value: formatCorpusValue(entry.value),
        }));
      }
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

    // Корпуса комплекса (группы technicalParams со своей подписью). Два и
    // больше — первый блок показывает их списком вместо одного адреса, чтобы
    // с первого экрана было видно, что зданий несколько (владелец,
    // 2026-09-24, на примере «Порта»).
    const corpusGroups = center.technicalParams.filter((group) => group.corpusLabel);
    const corpora =
      corpusGroups.length >= 2
        ? corpusGroups.map((group) => {
            const pick = (label: string) => group.params.find((param) => param.label === label)?.value ?? null;
            return {
              label: group.corpusLabel!,
              year: pick('Год ввода'),
              floors: pick('Количество этажей'),
              area: pick('Общая площадь'),
            };
          })
        : [];

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
      corpusBreakdown,
      corpora,
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

  // «2010–2014» вместо года одного корпуса: плитка «Год сдачи» у комплекса
  // иначе показывала бы год того здания, чей адрес стоит в карточке.
  const corpusYearRange = useMemo(() => {
    const years = redistributedTechnicalParams.corpora
      .map((corpus) => Number(corpus.year?.match(/\d{4}/)?.[0]))
      .filter((year) => Number.isFinite(year) && year > 0);
    if (years.length < 2) return null;
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? `${min} г.` : `${min}–${max}`;
  }, [redistributedTechnicalParams.corpora]);

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
  // «Награды и рейтинги» ТЦ (TradeCenterAwardsBlock): наградами считаются и
  // структурные retail_info.awards, и строки из highlights — блок показывает
  // вторые, пока нет первых.
  const tcHasAwards = isTc && Boolean(center?.retailInfo?.awards.length || awardItems.length);
  const tcHasRanking = isTc && Boolean(center?.retailInfo?.ranking.length);

  // Блоки-рекомендации других БЦ — готовые данные (заголовок/карточки/
  // ссылка на каталог), УЖЕ отсортированные по приоритету показа: чем
  // больше у блока подходящих зданий, тем раньше он должен встретиться
  // читателю, а блок с единственным кандидатом — в последнюю очередь
  // (владелец, 2026-09-20: "приоритет вывода всегда у тех блоков, по
  // которым будет много БЦ, с одной выводим в последнюю очередь"). Само
  // место на странице каждый блок получает позже, в recommendationSlots —
  // этот useMemo отвечает только за состав и порядок кандидатов.
  const recommendationBlocks = useMemo<RecommendationBlockData[]>(() => {
    if (!center || !centers || ownerMode) return [];
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
    // показывать РОВНО тех же лидеров, что и /minsk/bc/rating, не
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

    // У каталога ТЦ хабы только районов и метро: построители улиц и
    // микрорайонов для его корня отдают null, класса у ТЦ нет.
    const microdistrictCatalogUrl = center.microdistrict ? microdistrictHubUrl(center.microdistrict, V.basePath) : null;
    const metroCatalogUrl =
      nearestMetro && metroHubDistance(center, nearestMetro.name) !== null ? metroHubUrl(nearestMetro.name, V.basePath) : null;
    const classDistrictCatalogUrl =
      !isTc && center.businessClass && center.district ? classDistrictHubUrl(center.businessClass, center.district) : null;
    const streetCatalogUrl = street ? streetHubUrl(street, V.basePath) : null;

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
                title: `${V.Many} ${center.microdistrict}`,
                centers: list,
                catalogUrl: microdistrictCatalogUrl,
                catalogLabel: `Все ${V.abbr} ${center.microdistrict}`,
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
                title: `${V.Many} у станции ${nearestMetro.name}`,
                centers: list,
                catalogUrl: metroCatalogUrl,
                catalogLabel: `Все ${V.abbr} у станции ${nearestMetro.name}`,
                stationName: nearestMetro.name,
                fallbackCenter: fallback,
              }
            : null,
      });
    }
    // Рейтинг есть только у каталога БЦ (/minsk/bc/rating).
    if (!isTc && ratingRaw.length > 0) {
      candidates.push({
        id: 'ratingCenters',
        raw: ratingRaw,
        build: (list) =>
          list.length > 0
            ? {
                id: 'ratingCenters',
                title: 'Рейтинг бизнес-центров Минска',
                centers: list,
                catalogUrl: '/minsk/bc/rating',
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
    const businessClass = isTc ? null : center.businessClass;
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
      const districtUrl = center.district ? districtHubUrl(center.district, V.basePath) : null;
      const district = center.district;
      if (nearbyRaw.length > 0) {
        generic.push({
          id: 'nearbyCenters',
          raw: nearbyRaw,
          build: (list) =>
            list.length > 0
              ? {
                  id: 'nearbyCenters',
                  title: `${V.Many} рядом`,
                  centers: list,
                  catalogUrl: districtUrl ?? V.basePath,
                  catalogLabel:
                    districtUrl && district
                      ? `Все ${V.abbr} в ${districtPrepositional(district)} районе`
                      : `Все ${V.many} Минска`,
                }
              : null,
        });
      }
    }

    return [...specific, ...buildAll(generic)];
  }, [center, centers, nearestMetro, V, isTc]);

  // Медианы по зданиям (Д3) — те же, что в каталоге и блоке
  // «БЦ на фоне конкурентов», чтобы одна и та же ставка не расходилась.
  const offerIndex = useMemo(() => buildOfferIndex(officeSnapshots), [officeSnapshots]);

  // Сводка по сделке (диапазон площади/цены) — используется в FAQ; на
  // самой странице с 2026-09-20 не выводится отдельной строкой, чтобы не
  // дублировать таблицу ниже (см. offers-блок).
  // У ТЦ сравнения с рынком нет: снимки рынка — офисный сегмент ofisy_bc, и
  // сравнивать с ним ставки торговых помещений нельзя. Сам список объявлений
  // здания (BuildingOffersSection) у ТЦ показывается так же, как у БЦ.
  const marketPosition = useMemo(() => {
    if (!center || isTc) return null;
    const position = buildMarketPosition(center, centers ?? [], officeSnapshots, offerIndex);
    if (!ownerMode || !position) return position;
    // Сводка «сильнее по N из M» выдала бы и число проигранных строк.
    return { bars: position.bars.filter((bar) => bar.tone === 'favorable' && !bar.nearTypical), summary: null };
  }, [center, centers, officeSnapshots, offerIndex, isTc, ownerMode]);
  const priceComparison = useMemo(
    () => (center && !isTc && !ownerMode ? buildPriceComparison(center, centers ?? [], offerIndex) : null),
    [center, centers, offerIndex, isTc, ownerMode],
  );
  // Цитаты отзывов из «Интересных фактов» — отдельным блоком «Что говорят»
  // вместе с рейтингами (Б11), а не россыпью по странице.
  const reviewQuotes = useMemo(
    () =>
      (ownerMode ? [] : center?.highlights ?? [])
        .filter((h) => h.icon === 'reviews')
        .flatMap((h) => h.text.split(/\n+/).map((l) => l.replace(/^[-–—•\s]+/, '').trim()).filter(Boolean))
        // Было 4 — у «Порта» это молча отрезало 5-ю, критичную цитату
        // (единственную про холодные этажи с оговоркой). Порог поднят, а не
        // убран: 6 — чтобы блок не превращался в бесконечную ленту у БЦ с
        // особо длинным списком.
        .slice(0, 6),
    [center, ownerMode],
  );

  // FAQ использует те же модели и выборки, что видимые блоки страницы.
  //
  // Владелец, 2026-09-22: «вопросы и ответы второсортные… вопросы в духе
  // "это много или мало для своего класса" — так вообще ни один человек не
  // говорит… "что известно о здании из других источников, помимо prometr.by"
  // — нельзя ссылаться на источники вот так, они только в дисклеймере».
  // Отсюда три правила этого генератора:
  //   1. Вопрос формулируется от читателя (арендатор, который выбирает офис
  //      и считает бюджет), а не от подписи поля в базе. Шесть механических
  //      вопросов «<подпись полосы> в «X» — это много или мало для своего
  //      класса?» слиты в один — «Чем отличается от других зданий класса Y?».
  //   2. Имени источника в тексте нет вообще — ни в вопросе, ни в ответе.
  //      То же решение, что принято 2026-09-22 для видимых блоков: конкретные
  //      сайты и даты снимков живут только в «Источниках» под FAQ.
  //   3. Ответ — связный текст, а не склейка «Подпись: значение» через «;».
  // Формулировки писал Codex/ChatGPT по ТЗ
  // docs/codex-tasks/bc-faq-rethink-farengeyt.md (черновик на «Фаренгейте» —
  // docs/codex-tasks/farengeyt-faq-draft.json), здесь они обобщены в шаблоны
  // на все 141 здание каталога.
  const faqItems = useMemo(() => {
    if (!center) return [];
    const items: { question: string; answer: string }[] = [];
    const name = shortName(center);
    // Имя подставляется в вопрос только вместе с родовым словом: «Сколько
    // стоит снять офис в «Фаренгейт»?» — не по-русски, а склонять кавычечное
    // имя кодом нельзя. У 27 зданий каталога собственного имени нет вовсе
    // (shortName отдаёт адрес) — там родовое слово тем более обязательно.
    // shortName отдаёт либо собственное имя («Фаренгейт», «Аден», «МФЦ
    // (Минск Мир)»), либо адрес — у 27 зданий каталога имени нет вовсе.
    // Адрес в кавычках читается как опечатка, поэтому он идёт с предлогом;
    // всё остальное — в кавычках. Признак адреса: уличный префикс или
    // «Улица Номер» («Энгельса 34А»), но не «А1» и не «Аден».
    const bcTail = centerNameTail(center, name);
    const bcNom = `${V.one} ${bcTail}`;
    const bcGen = `${V.oneGen} ${bcTail}`;
    const bcPrep = `${V.onePrep} ${bcTail}`;
    const bcIns = `${V.oneIns} ${bcTail}`;
    const cls = center.businessClass;
    const typicalOfClass = `типичного здания класса ${cls}`;

    const add = (question: string, answer: string | null | undefined) => {
      if (answer?.trim()) items.push({ question, answer: answer.trim() });
    };
    const fmt = (value: number) => value.toLocaleString('ru-RU');
    // Владелец набирает свободные поля (награды, история, факты, условия
    // аренды) с выделениями Markdown. Видимые блоки прогоняют их через
    // renderBold, а в FAQ это просто текст — звёздочки вылезали в ответ
    // как есть («признан **«Лучшим действующим бизнес-центром»**»).
    const plain = (value: string | null | undefined) => (value ? value.replace(/\*\*/g, '').trim() : '');
    const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
    const joinAnd = (parts: string[]) =>
      parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`;
    const sentences = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ');
    // deltaText приходит в трёх формах: «55% меньше», «в 3,1 раза больше» и
    // «на 2 года старше» (год сдачи). Предлог дописываем только первой —
    // «это на в 3,1 раза больше» было бы браком.
    const deltaPhrase = (bar: { deltaText: string }) =>
      /^(на|в) /.test(bar.deltaText) ? bar.deltaText : `на ${bar.deltaText}`;
    const bars = marketPosition?.bars ?? [];
    const barByLabel = (label: string) => bars.find((bar) => bar.label === label) ?? null;

    // --- Где это и как добраться -----------------------------------------
    // Станция метро — displayMetro, та же, что в плитке у заголовка и в
    // блоке инфраструктуры.
    {
      const metro = displayMetro;
      const stops = groupNearbyPlaces(nearbyPlaces).find((group) => group.category === 'transport_stop') ?? null;
      const nearestStop = stops?.places[0] ?? null;
      add(
        `Где находится ${bcNom} и как до него добраться?`,
        sentences([
          `Адрес — ${center.address}${redistributedTechnicalParams.administrativeDistrictText ? `, ${redistributedTechnicalParams.administrativeDistrictText} район` : ''}.`,
          metro ? `Ближайшая станция метро — «${metro.name}», ${formatMeters(metro.distanceMeters)}.` : center.metro ? `Ближайшая станция метро — «${center.metro}».` : null,
          nearestStop && stops
            ? `Ближайшая остановка транспорта — «${nearestStop.name}», ${formatMeters(nearestStop.distanceMeters)}; всего в пешей доступности ${stops.places.length} ${pluralRu(stops.places.length, 'остановка', 'остановки', 'остановок')}.`
            : null,
        ]),
      );
    }
    if (center.altNames.length > 0) {
      add(
        `Как ещё называют ${bcNom}?`,
        `${center.altNames.map((alt) => `«${alt}»`).join(', ')} — то же самое здание по адресу ${center.address}: одно здание с двумя названиями, а не два разных бизнес-центра.`,
      );
    }

    // --- Что предлагают и почём ------------------------------------------
    // Здесь больше нет ни одного вопроса, и это осознанно (владелец,
    // 2026-09-22). Сначала из FAQ убрали цифры предложений — они меняются
    // каждый месяц. Оставшиеся два вопроса («как мы собираем объявления» и
    // «дорого ли снимать») без цифр выродились в шаблон: по замеру на всех
    // 141 странице первый давал ОДИН И ТОТ ЖЕ текст на 87 зданиях (99%
    // совпадения), второй — 24 разных текста на 79 зданий (40% дословного
    // совпадения). Владелец: «однотипные тексты давай убирать вообще, это
    // скажется негативно». Сам блок «Что сейчас сдают и продают» и
    // «Цены в здании и по рынку» на странице остались — FAQ их не дублирует.
    if (center.rentalInfo) {
      const info = center.rentalInfo;
      // Строка БЦ бывает с пустыми полями аренды — тогда от ответа остаётся
      // одна оговорка «уточняйте у арендодателя», и вопрос лучше не задавать.
      const hasRentalInfo = Boolean(plain(info.terms) || plain(info.rates) || plain(info.contacts));
      if (hasRentalInfo)
        add(
          `На каких условиях сдают помещения в ${bcPrep} и куда обращаться?`,
          // Поля набираются списком через «- », и склейка их в один абзац
          // давала строку «- А - Б - В»; каждое поле остаётся своей строкой.
          [plain(info.terms), plain(info.rates), plain(info.contacts)]
            .filter(Boolean)
            .flatMap((field) => field.split(/\n+/))
            .map((line) => line.replace(/^[-–—•]\s*/, '').trim())
            .filter(Boolean)
            .concat('Актуальные условия уточняйте у арендодателя.')
            .join('\n'),
        );
    }

    // --- Что это за здание ------------------------------------------------
    {
      const sameClassOthers = cls
        ? (centers ?? []).filter((c) => c.businessClass === cls && c.slug !== center.slug)
        : [];
      const sameClassSameDistrict = center.district
        ? sameClassOthers.filter((c) => c.district === center.district)
        : [];
      const yearBar = barByLabel('Год сдачи');
      const age = center.yearBuilt != null ? new Date().getFullYear() - center.yearBuilt : null;
      const yearSentence =
        center.yearBuilt == null
          ? null
          : center.status === 'under_construction'
            ? `Здание ещё строится, ожидаемая сдача — ${center.yearBuilt} год.`
            : `Сдано в ${center.yearBuilt} году${age != null && age > 0 ? `, зданию ${age} ${pluralRu(age, 'год', 'года', 'лет')}` : ''}.${yearBar ? ` Это ${deltaPhrase(yearBar)}, чем типичное здание класса ${cls}.` : ''}`;
      const classSentence = cls
        ? `Здание относится к классу ${cls}.${
            sameClassOthers.length > 0
              ? ` В каталоге есть ещё ${sameClassOthers.length} ${pluralRu(sameClassOthers.length, 'здание', 'здания', 'зданий')} этого класса${
                  center.district && sameClassSameDistrict.length > 0
                    ? `, ${sameClassSameDistrict.length} из них — в ${districtPrepositional(center.district)} районе`
                    : ''
                }.`
              : ''
          }`
        : null;
      // У ТЦ вместо делового класса — формат (ТРЦ, районный ТЦ, рынок…).
      const formatSentence = isTc && center.retailFormat ? `Формат — ${center.retailFormat}.` : null;
      const question = formatSentence
        ? `Какой формат у ${bcGen} и когда он открылся?`
        : cls
        ? center.status === 'under_construction'
          ? `Какого класса ${bcNom} и когда его сдадут?`
          : `Какого класса ${bcNom} и давно ли он построен?`
        : center.status === 'under_construction'
          ? `Когда сдадут ${bcNom}?`
          : `Когда построен ${bcNom}?`;
      add(question, sentences([formatSentence ?? classSentence, yearSentence]));
    }
    // Главная компания: короткое поле developer, а если его нет —
    // профиль из развёрнутого блока (ресёрч ТЦ, 2026-09-24).
    const developerName = center.developer ?? center.developerInfo?.profile?.name ?? null;
    if (developerName) {
      const info = center.developerInfo;
      const lines = [`Застройщик — ${developerName}.`];
      const profileSentence = developerProfileSentence(info?.profile);
      if (profileSentence) lines.push(profileSentence);
      if (info?.description) lines.push(plain(info.description));
      const contactBits = [
        info?.phone ? `тел. ${info.phone}` : null,
        info?.address ?? null,
        info?.hours ? `часы работы: ${info.hours}` : null,
        info?.website ?? null,
      ].filter((v): v is string => Boolean(v));
      if (contactBits.length) lines.push(`${contactBits.join(', ')}.`);
      add(`Кто застройщик ${bcGen}?`, lines.join('\n'));
    }
    // Развёрнутый блок «Кто стоит за…» — по вопросу на каждую его часть,
    // только когда она есть (правило FAQ: всё, что на странице, и ничего
    // сверх). Один участник — это и есть застройщик из ответа выше, отдельный
    // вопрос был бы повтором.
    if ((center.developerInfo?.companies?.length ?? 0) > 1) {
      add(`Кто участвовал в строительстве ${bcGen}?`, developerCompaniesFaqAnswer(center.developerInfo?.companies));
    }
    {
      const mainName = developerMainName(center.developerInfo, center.developer);
      const company = mainName ? `компания ${mainName}` : 'компания-застройщик';
      if (center.developerInfo?.portfolio?.length) {
        add(`Что ещё построила и чем владеет ${company}?`, developerPortfolioFaqAnswer(center.developerInfo.portfolio));
      }
      add(`Что известно о компании${mainName ? ` ${mainName}` : '-застройщике'}?`, developerAboutFaqAnswer(center.developerInfo));
    }
    // Технический паспорт — раньше это был один ответ-выгрузка: связная
    // фраза про этажи и площади, а следом хвост «Подпись: значение;
    // Подпись: значение». Набор подписей в базе закрытый (проверено по
    // живой базе 2026-09-22 — 19 штук на все 141 здание), поэтому каждая
    // переписана фразой; неизвестная подпись всё равно не теряется, а
    // уходит в хвост как была.
    const airConditioningRow = redistributedTechnicalParams.buildingInformationRows.find(
      (row) => row.label === 'Система кондиционирования',
    );
    {
      const techRow = (label: string) =>
        redistributedTechnicalParams.buildingInformationRows.find((row) => row.label === label)?.value ?? null;
      const numeric = (value: string | null) => {
        if (!value) return null;
        const parsed = Number(value.replace(',', '.').replace(/\s/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
      };
      const floors = center.floors;
      const perFloor = floors != null && floors > 0 && center.totalArea != null ? Math.round(center.totalArea / floors) : null;
      const officeShare =
        center.officeArea != null && center.totalArea != null && center.totalArea > 0
          ? Math.round((center.officeArea / center.totalArea) * 100)
          : null;
      const floorPlate = techRow('Площадь типового этажа');
      const ceilingRaw = techRow('Высота потолков типового этажа, м');
      const ceiling = numeric(ceilingRaw);
      const layout = techRow('Тип планировки');
      const layoutText = layout
        ? joinAnd(
            layout
              .split(',')
              .map((part) => lower(part.trim()))
              .filter(Boolean),
          )
        : null;
      const elevators = numeric(techRow('Количество лифтов'));
      const management = techRow('Управление БЦ');
      const providers = techRow('Интернет-провайдеры');
      // Всё, что не разобрано фразой выше: площади и этажность уже сказаны
      // словами, парковка и кондиционирование — в своих вопросах ниже.
      const handled = new Set([
        'Площадь типового этажа',
        'Высота потолков типового этажа, м',
        'Тип планировки',
        'Количество лифтов',
        'Управление БЦ',
        'Интернет-провайдеры',
        'Количество этажей',
        'Общая площадь',
        'Площадь офисов',
        'Обеспеченность парковкой (маш./100 м²)',
        'Система кондиционирования',
      ]);
      const restRows = [
        ...redistributedTechnicalParams.buildingInformationRows.filter((row) => !handled.has(row.label)),
        ...redistributedTechnicalParams.firstBlockTechnicalRows,
      ].filter((row) => row.value);
      const answer = sentences([
        floors != null ? `В здании ${floors} ${pluralRu(floors, 'этаж', 'этажа', 'этажей')}.` : null,
        center.totalArea != null
          ? `Общая площадь — ${fmt(center.totalArea)} м²${
              center.officeArea != null
                ? `, из них под офисы отведено ${fmt(center.officeArea)} м²${officeShare != null ? `, или ${officeShare}%` : ''}`
                : ''
            }.`
          : center.officeArea != null
            ? `Офисная площадь — ${fmt(center.officeArea)} м².`
            : null,
        perFloor != null
          ? `На этаж в среднем приходится около ${fmt(perFloor)} м²${floorPlate ? `, площадь типового этажа — ${floorPlate}` : ''}.`
          : floorPlate
            ? `Площадь типового этажа — ${floorPlate}.`
            : null,
        layoutText || ceiling != null || ceilingRaw
          ? `${layoutText ? `Планировка ${layoutText}` : 'Планировка не указана'}${
              ceiling != null ? `, потолки типового этажа — ${fmt(ceiling)} м` : ceilingRaw ? `, потолки типового этажа — ${ceilingRaw} м` : ''
            }.`
          : null,
        elevators != null ? `Лифтов в здании — ${fmt(elevators)}.` : null,
        management ? `Зданием управляет ${lower(management)}.` : null,
        providers ? `Интернет проводят: ${providers}.` : null,
        restRows.length ? restRows.map((row) => `${row.label} — ${row.value}.`).join(' ') : null,
      ]);
      add(
        floors != null
          ? isTc
            ? `Сколько этажей в ${bcPrep}?`
            : `Сколько этажей в ${bcPrep} и как устроены офисы?`
          : `Как устроен ${bcNom}?`,
        answer || null,
      );
    }
    // Инженерия и конструкция. Сюда же уехал бывший вопрос «Что известно о
    // здании из других источников, помимо prometr.by?» — набор фактов тот
    // же, имя источника убрано (владелец, 2026-09-22), а сам вопрос теперь
    // называет то, о чём эти факты: подписи у них открытые, поэтому тема
    // вопроса выводится из них же.
    {
      // «Тип вентиляции: Приточно-вытяжная» — значение с большой буквы в
      // середине строки выглядит куском таблицы. Опускаем регистр только у
      // коротких значений-характеристик: у длинных это уже предложение, а у
      // архитектора/застройщика — фамилия, которую портить нельзя.
      const factLine = (label: string, value: string) => {
        const text = plain(value);
        const first = text.charAt(0);
        const second = text.charAt(1);
        // После двоеточия значение идёт со строчной — иначе строки в одном
        // ответе выглядят вразнобой («Тип вентиляции: приточно-вытяжная» и
        // рядом «Конструкция: Каркасно-монолитное здание»). Три исключения,
        // где заглавная осмысленна: имя человека или бюро (подпись сама о
        // нём говорит), латиница («NBBJ») и аббревиатура («ГОРПРОЕКТ»).
        const keepCase =
          /архитектор|застройщик|проектировщик|название/i.test(label) ||
          !/[А-ЯЁ]/.test(first) ||
          (Boolean(second) && /\p{L}/u.test(second) && second === second.toUpperCase());
        return `${label}: ${keepCase ? text : lower(text)}`;
      };
      const lines = [
        ...center.buildingFacts.map((fact) => factLine(fact.label, fact.value)),
        airConditioningRow?.value ? factLine('Система кондиционирования', airConditioningRow.value) : null,
        ...buildingParamHighlights.map((h) => (h.label ? factLine(h.label, h.text) : h.text)),
      ].filter((line): line is string => Boolean(line && line.trim()));
      // Один-единственный факт — это не ответ, а строка таблицы, и у
      // полусотни зданий она дословно одна и та же («Система
      // кондиционирования: центральное»). Такой вопрос не задаём.
      if (lines.length > 1) {
        const haystack = lines.join(' ').toLowerCase();
        const hasEngineering = /вентиляц|кондицион|отоплен|электро|инженер|слаботоч|лифт|связ/.test(haystack);
        const hasStructure = /конструкц|материал|фасад|остеклен|кровл|архитект|композиц|каркас|бетон/.test(haystack);
        const question =
          hasEngineering && hasStructure
            ? `Из чего построен ${bcNom} и как устроены его инженерные системы?`
            : hasEngineering
              ? `Как устроены инженерные системы в ${bcPrep}?`
              : hasStructure
                ? `Из чего построен ${bcNom} и как выглядит его фасад?`
                : `Что ещё известно о ${bcPrep}?`;
        add(question, lines.map((line) => (line.endsWith('.') ? line : `${line}.`)).join('\n'));
      }
    }
    {
      const parkingBar = barByLabel('Парковка');
      add(
        `Есть ли парковка у ${bcGen} и хватает ли мест?`,
        sentences([
          center.parking ? `${capitalize(center.parking)}${/[.!?]$/.test(center.parking) ? '' : '.'}` : null,
          parkingBar
            ? `Машиномест относительно площади здания — ${parkingBar.subjectDisplayValue}${
                parkingBar.nearTypical
                  ? `, столько же, сколько у ${typicalOfClass} (${parkingBar.baseDisplayValue})`
                  : `: это ${deltaPhrase(parkingBar)}, чем у ${typicalOfClass} (${parkingBar.baseDisplayValue})`
              }.`
            : null,
        ]),
      );
    }
    // Один вопрос вместо шести. Раньше каждая полоса сравнения давала свой
    // вопрос «<подпись> в «X» — это много или мало для своего класса?» —
    // шесть почти одинаковых строк подряд, на которые владелец и указал.
    {
      // «30 шт.» про компании и «4,7 ★» про оценку — подписи из вёрстки
      // полос, где единица стоит рядом с числом. В предложении её несёт
      // сама формулировка, а «шт.» после компаний звучит как склад.
      const plainValue = (value: string) => value.replace(/\s*(шт\.|★)$/u, '').trim();
      const metricLabels: Record<string, string> = {
        'Высота потолков': 'Потолки',
        'Лифты на 10 000 м²': 'Лифтов на 10 000 м² площади',
        'Компаний-арендаторов': 'Компаний-арендаторов у здания',
        'Рейтинг Яндекс.Карт': 'Оценка посетителей на картах',
      };
      const skip = new Set(['Ставка аренды', 'Цена продажи', 'Парковка', 'Год сдачи']);
      const comparisonSentences = bars
        .filter((bar) => !skip.has(bar.label))
        .map((bar) => {
          // Расстояние до метро у полосы и у снимка точек разное (см.
          // вопрос про адрес выше), поэтому здесь называем не само значение,
          // а только разницу с классом — иначе два ответа рядом показывали
          // бы одной станции два разных числа.
          if (bar.label === 'До метро') {
            return bar.nearTypical
              ? `До метро отсюда столько же, сколько у ${typicalOfClass} (медиана — ${plainValue(bar.baseDisplayValue)}).`
              : `До метро отсюда ${deltaPhrase(bar)}, чем у ${typicalOfClass} (медиана — ${plainValue(bar.baseDisplayValue)}).`;
          }
          const label = metricLabels[bar.label] ?? bar.label;
          return bar.nearTypical
            ? `${label} — ${plainValue(bar.subjectDisplayValue)}, столько же, сколько у ${typicalOfClass} (${plainValue(bar.baseDisplayValue)}).`
            : `${label} — ${plainValue(bar.subjectDisplayValue)}: это ${deltaPhrase(bar)}, чем у ${typicalOfClass} (${plainValue(bar.baseDisplayValue)}).`;
        });
      if (comparisonSentences.length) {
        add(
          `Чем ${bcNom} отличается от других зданий класса ${cls}?`,
          `${comparisonSentences.join(' ')} Сравнение — с медианой по зданиям того же класса в нашем каталоге.`,
        );
      }
    }

    // --- Что вокруг и кто внутри ------------------------------------------
    // FAQ пересказывает блок «Инфраструктура рядом» теми же цифрами, что
    // нарисованы на карте и в списке под ней — но текстом, а не картой: для
    // краулера, который карту не читает, это не дубль, а единственный способ
    // узнать эти цифры. Метро и остановки не повторяются: они уже названы в
    // ответе про адрес.
    {
      const genitiveLabels: Partial<Record<NearbyPlaceCategory, string>> = {
        grocery: 'Продуктовых магазинов',
        shop: 'Магазинов',
        pharmacy: 'Аптек',
        bank: 'Банков',
        atm: 'Банкоматов',
        coffee: 'Кофеен',
        cafe: 'Кафе и ресторанов',
        fitness: 'Фитнес-клубов',
        other: 'Других объектов',
      };
      const nearestWords: Partial<Record<NearbyPlaceCategory, string>> = {
        grocery: 'ближайший',
        shop: 'ближайший',
        pharmacy: 'ближайшая',
        bank: 'ближайший',
        atm: 'ближайший',
        coffee: 'ближайшая',
        cafe: 'ближайшее заведение',
        fitness: 'ближайший',
        other: 'ближайший',
      };
      const lines = groupNearbyPlaces(nearbyPlaces)
        .filter((group) => group.category !== 'metro' && group.category !== 'transport_stop')
        .map((group) => {
          const nearest = group.places[0];
          const label = genitiveLabels[group.category] ?? group.label;
          const word = nearestWords[group.category] ?? 'ближайший';
          return `${label} — ${group.places.length}, ${word} «${nearest.name}» в ${formatMeters(nearest.distanceMeters)}.`;
        });
      if (lines.length) {
        add(`Что есть рядом с ${bcIns}?`, `${lines.join(' ')} Учтены объекты в пешей доступности — примерно до 800 м.`);
      }
    }
    // Торговые блоки ТЦ (TradeCenterRetailBlocks) — в том же порядке, что на
    // странице: между картой и каталогом арендаторов. Ответы собирают те же
    // функции, что рисуют блоки (lib/tradeCenterRetail.ts), — нет записей,
    // нет и вопроса.
    if (isTc && center.retailInfo) {
      const retail = center.retailInfo;
      add(`Что находится на каждом этаже ${bcGen}?`, floorsFaqAnswer(retail.floorsGuide));
      add(`Чем ${bcNom} вошёл в историю ритейла Беларуси?`, retailHistoryFaqAnswer(retail.timeline));
      // «Где поесть» и «Развлечения» (2026-09-24) вместо старого досуга;
      // вопрос про досуг — только у ТЦ без новых блоков (leisureForPage).
      add(`Где поесть в ${bcPrep}?`, foodFaqAnswer(retail.food));
      add(`Какие развлечения есть в ${bcPrep}?`, funFaqAnswer(retail.fun));
      const leisure = leisureForPage(retail);
      const leisureQuestion = leisureFaqQuestion(leisure, `в ${bcPrep}`);
      if (leisureQuestion) add(leisureQuestion, leisureFaqAnswer(leisure));
      // «Посетителю» и «для бизнеса» (TradeCenterExtraBlocks) — в том же
      // порядке, что панели на странице.
      add(`Какой режим работы у ${bcGen}?`, hoursFaqAnswer(retail.hours, retail.hoursNote));
      const parkingQuestion = parkingFaqQuestion(retail.parking, bcGen);
      if (parkingQuestion) add(parkingQuestion, parkingFaqAnswer(retail.parking));
      const transportQuestion = transportFaqQuestion(retail.transport, bcGen);
      if (transportQuestion) add(transportQuestion, transportFaqAnswer(retail.transport));
      add(`Какие правила посещения действуют в ${bcPrep}?`, rulesFaqAnswer(retail.rules));
      add(`Есть ли у ${bcGen} программа лояльности или подарочные сертификаты?`, loyaltyFaqAnswer(retail.loyalty));
      add(`Какие события проходят в ${bcPrep}?`, eventsFaqAnswer(retail.events));
      const audienceQuestion = audienceFaqQuestion(retail.audience, bcPrep);
      if (audienceQuestion) add(audienceQuestion, figuresFaqAnswer(retail.audience));
      add(`Какие помещения свободны в ${bcPrep}?`, vacanciesFaqAnswer(retail.vacancies));
      add(`Как арендовать помещение в ${bcPrep}?`, pitchFaqAnswer(retail.leasing));
      add(`Как разместить рекламу в ${bcPrep}?`, pitchFaqAnswer(retail.advertising));
      add(`${capitalize(bcNom)} в цифрах: что известно?`, figuresFaqAnswer(retail.numbers));
      add(`Что говорят о ${bcPrep}?`, quotesFaqAnswer(retail.quotes));
      // «Якорные арендаторы» стоят последними, прямо перед каталогом арендаторов.
      add(`Какие якорные арендаторы в ${bcPrep}?`, anchorsFaqAnswer(anchorsForPage(retail)));
    }
    // Арендаторы и «что есть кроме офисов» — один вопрос (владелец,
    // 2026-09-22: «я бы анализировал весь список арендаторов, если он есть,
    // и писал ответ на основе него; можешь объединить»). Раньше сервисы
    // здания собирались из пяти ключевых слов (TENANT_DERIVED_INFRASTRUCTURE)
    // и выходили обезличенным списком «банк, кафе, магазин»; теперь берётся
    // весь список организаций с рубриками, и сервисы называются по именам.
    if (tenantOrganizations.length) {
      const directionCounts = new Map<string, number>();
      for (const org of tenantOrganizations) {
        const label = tenantDirectionLabel(org.industry);
        directionCounts.set(label, (directionCounts.get(label) ?? 0) + 1);
      }
      const directions = [...directionCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
      const reported = tenantSource === '2gis' ? gis2?.tenantOrganizationsTotal ?? null : null;
      const floors = buildFloorGroups(tenantOrganizations);
      const withFloor = floors.reduce((sum, group) => sum + group.count, 0);
      // Сервисы, ради которых в здание заходят не по делу к арендатору.
      // Порядок фиксированный и осмысленный: сначала то, чем пользуются
      // ежедневно. Рубрика у Яндекса бывает с хвостом («Банк РКЦ
      // Фаренгейт»), поэтому сопоставляем по вхождению, а подпись берём
      // свою — иначе список сервисов читается как список опечаток.
      const servicePatterns: { label: string; re: RegExp; byName?: RegExp }[] = [
        // Короткие двусмысленные слова ищем ТОЛЬКО в начале рубрики: у
        // Яндекса рубрика начинается с категории, а хвост — это место в
        // здании и название хаба («Интернет-маркетинг Бизнес-Хаб
        // Альфа-банк» — это агентство, а не банк; «Кофемашины, кофейные
        // автоматы» — оборудование, а не кофейня). Описательные рубрики
        // магазинов («Керамическая плитка») категории в начале не имеют,
        // поэтому ищутся по всей строке.
        // byName — для карточек, у которых рубрики нет вовсе (у отделений
        // банков Яндекс часто отдаёт только этаж): имя тут однозначное, в
        // отличие от кафе и магазинов, которые по названию не опознать.
        { label: 'банк', re: /^банк(?!омат)(?![\p{L}])/iu, byName: /банк(?!омат)(?![\p{L}])/iu },
        { label: 'аптека', re: /^аптек/iu, byName: /аптек/iu },
        { label: 'кофейня', re: /^кофейня(?![\p{L}])/iu },
        { label: 'кафе и столовые', re: /^(кафе|столов|бистро|пекарн|кондитерск|фуд-?корт)/iu },
        { label: 'ресторан', re: /^ресторан/iu },
        { label: 'ветклиника', re: /^ветеринар/iu },
        { label: 'медцентр', re: /^(медцентр|клиник|стоматолог|медицинск|диагностическ|поликлиник|лаборатор)/iu },
        { label: 'салон красоты', re: /^(салон красоты|студия красоты|парикмахер|косметолог|барбершоп|ногтев|бров|маникюр|эпиляц|спа-)/iu },
        { label: 'фитнес', re: /^(фитнес|тренаж|спортзал|йог(а|и)|пилатес|единоборств|бассейн)/iu },
        { label: 'пункт выдачи заказов', re: /^(пункт выдачи|пвз(?![\p{L}])|постамат)/iu },
        { label: 'отделение почты', re: /^почт/iu },
        { label: 'магазины', re: /магазин|супермаркет|гипермаркет|плитка|инструмент|мебел|одежд|обув|ювелир|оптика|цвет(ы|очный)|бытовая техника|товары/iu },
      ];
      const serviceNames = new Map<string, string[]>();
      for (const org of tenantOrganizations) {
        const rubric = org.rubric;
        const match = rubric
          ? servicePatterns.find((item) => item.re.test(rubric))
          : servicePatterns.find((item) => item.byName?.test(org.name));
        if (!match) continue;
        const names = serviceNames.get(match.label) ?? [];
        if (!names.some((n) => n.toLowerCase() === org.name.toLowerCase())) names.push(org.name);
        serviceNames.set(match.label, names);
      }
      const serviceParts = servicePatterns
        .filter((item) => serviceNames.has(item.label))
        .map((item) => {
          const names = serviceNames.get(item.label) ?? [];
          const shown = names.slice(0, 3).map((n) => `«${n}»`);
          const rest = names.length - shown.length;
          return `${item.label} — ${shown.join(', ')}${rest > 0 ? ` и ещё ${rest}` : ''}`;
        });
      // Точки самообслуживания (туалет, банкомат, кофейный автомат) —
      // не организации, у них своя каноническая подпись. У ТЦ они — в
      // отдельном вопросе про инфраструктуру ниже, вместе с удобствами.
      const amenityParts = isTc ? [] : tenantAmenities.map((item) => lower(item.category));
      const manualParts = (redistributedTechnicalParams.internalInfrastructureText ?? '')
        .split(/[,;]\s*/)
        .map((item) => lower(item.trim()))
        .filter(Boolean)
        // Ручной ввод владельца обычно называет то же самое одним словом
        // («банк, кафе»), что уже названо сервисом с именем организации.
        .filter((item) => !serviceParts.some((part) => part.startsWith(item)));
      add(
        isTc
          ? `Какие магазины и компании работают в ${bcPrep}?`
          : `Какие компании работают в ${bcPrep} и что есть в здании кроме офисов?`,
        sentences([
          `В списке организаций здания — ${tenantOrganizations.length}.`,
          reported != null && reported > tenantOrganizations.length
            ? `Список неполный: всего в здании числится ${reported} ${pluralRu(reported, 'организация', 'организации', 'организаций')}.`
            : null,
          `По направлениям: ${directions.map(([label, count]) => `«${label}» — ${count}`).join(', ')}.`,
          floors.length
            ? `Этаж известен у ${withFloor} ${pluralRu(withFloor, 'организации', 'организаций', 'организаций')} из ${tenantOrganizations.length}: ${floors
                .map((group) => `${formatFloorLabel(group.floor).toLowerCase()} — ${group.count}`)
                .join(', ')}.`
            : null,
          serviceParts.length ? `${isTc ? 'Ещё в здании есть' : 'Кроме офисов, в здании есть'} ${serviceParts.join('; ')}.` : null,
          amenityParts.length || manualParts.length
            ? `Из остального в здании ${joinAnd([...manualParts, ...amenityParts])}.`
            : null,
          'Это сведения о соседях и сервисах, а не показатель загрузки здания или спроса на него.',
        ]),
      );
    }
    // «Инфраструктура» ТЦ стоит сразу под каталогом арендаторов — и вопрос
    // тут же: оборудование с числом из Яндекса и удобства с сайта ТЦ, по тем
    // же группам, что в блоке.
    if (isTc) add(`Какая инфраструктура есть для посетителей в ${bcPrep}?`, infrastructureFaqAnswer(tcInfrastructure));
    // Часы работы и доступная среда — один вопрос, а не два. По отдельности
    // оба ответа короткие и совпадают дословно у десятков зданий («Здание
    // работает круглосуточно» — у 56, «пандус, широкий лифт и доступный
    // вход» — у полутора десятков). Вместе они дают заметно больше разных
    // текстов и отвечают на один настоящий вопрос — как сюда попасть.
    {
      const accessList = (accessibilityAttributes ?? '')
        .split(/,\s*/)
        .map((item) => lower(item.trim()))
        .filter(Boolean);
      // У ТЦ с поминутным режимом по зонам (retail_info.hours) часы уже
      // отвечены своим вопросом «Какой режим работы…» — второй вопрос о том
      // же самом общей строкой был бы дублем.
      const hoursText = !accessHoursText || (isTc && center.retailInfo?.hours.length)
        ? null
        : accessHoursText === 'Круглосуточно'
          ? 'Здание открыто круглосуточно.'
          : accessHoursText === 'Не круглосуточно'
            ? 'Круглосуточного доступа в здание нет, точный режим работы не публикуется.'
            : `Режим работы — ${accessHoursText.split(/\n+/).join('; ')}.`;
      const accessText = accessList.length ? `Для посетителей есть ${joinAnd(accessList)}.` : null;
      if (hoursText || accessText) {
        add(
          hoursText && accessText
            ? `В какие часы работает ${bcNom} и как в него попасть?`
            : hoursText
              ? `В какие часы работает ${bcNom}?`
              : `Доступен ли ${bcNom} для людей с инвалидностью?`,
          sentences([hoursText, accessText]),
        );
      }
    }

    // --- Репутация и история ----------------------------------------------
    // Рейтинг приезжает из карточки на картах в свободном тексте фактов.
    // Название сервиса в ответе не упоминается (владелец, 2026-09-22) — на
    // странице его тоже больше не видно, только в «Источниках».
    {
      const yandexRatings = parseHighlightRatings(center.highlights);
      const ratingSentences = yandexRatings.map(
        (r) =>
          `Оценка посетителей на картах — ${r.value}${
            r.totalCount != null ? ` (${fmt(r.totalCount)} ${pluralRu(r.totalCount, 'оценка', 'оценки', 'оценок')})` : ''
          }${r.corpusCount > 1 ? `, по ${r.corpusCount} корпусам` : ''}.`,
      );
      const quotes = reviewQuotes
        .map(parseReviewQuote)
        .map((q) => `${q.author ? `${q.author}: ` : ''}${q.isQuote ? `«${q.text}»` : q.text}`);
      if (ratingSentences.length || quotes.length) {
        add(
          `Как ${bcNom} оценивают посетители?`,
          [ratingSentences.join(' '), quotes.join('\n')].filter(Boolean).join('\n'),
        );
      }
    }
    // «Награды и рейтинги» ТЦ — после отзывов, как блок на странице. Ответы
    // собирают те же функции, что рисуют блок (lib/tradeCenterRetail.ts);
    // строки наград из highlights — запасной вариант, пока нет структурных.
    if (isTc) {
      const retail = center.retailInfo;
      add(`Какие награды у ${bcGen}?`, awardsFaqAnswer(retail?.awards ?? [], awardItems));
      add(`Какие места ${bcNom} занимает в рейтингах ${V.manyGen}?`, rankingFaqAnswer(retail?.ranking ?? []));
    }
    // СМИ и история здания убраны из FAQ (владелец, 2026-09-22: «Что писали
    // в СМИ — убирай», «Что известно об истории — ответ хуйня, убирай»).
    // Оба блока остаются видимыми на странице, FAQ их не пересказывает.
    if (visibleHighlights.length)
      add(`Чем примечателен ${bcNom}?`, visibleHighlights.map((h) => (h.label ? `${h.label}: ${plain(h.text)}` : plain(h.text))).join('\n'));
    return items;
  }, [center, centers, marketPosition, accessibilityAttributes, accessHoursText, saleStats, rentStats, awardItems, mediaMentions, visibleHighlights, buildingParamHighlights, gis2, tenantOrganizations, tenantAmenities, tenantSource, reviewQuotes, redistributedTechnicalParams, derivedInternalInfrastructureText, nearbyPlaces, priceComparison?.blocks, V, isTc, tcInfrastructure]);

  // Б7: липкое меню «На странице». Пункт появляется только если
  // соответствующий блок реально отрисован — ссылка на несуществующий
  // якорь никуда не ведёт и выглядит поломкой. Блоки-рекомендации других БЦ
  // сюда не попадают — владелец, 2026-09-20, решил не множить пункты меню,
  // когда таких блоков на странице несколько (микрорайон/метро/рейтинг/
  // класс×район/улица) и их позиция не привязана к конкретному месту
  // (см. recommendationSlots ниже).
  const pageSections = useMemo(() => {
    if (!center) return [];
    const has = (id: string, cond: boolean) =>
      cond ? { id, label: SECTION_LABELS[id].replace(/БЦ$/, V.abbr) } : null;
    // Порядок пунктов повторяет порядок блоков на странице (владелец принял
    // 2026-09-20; "Параметры здания" переехали под "Историю здания"
    // 2026-09-22): что предлагают и почём → где оно → кто внутри → на фоне
    // конкурентов → отзывы → блоки доверия (награды/СМИ/факты/история/
    // параметры здания) → застройщик → FAQ.
    return [
      has('offers', saleStats !== null || rentStats !== null || Boolean(isTc && center.retailInfo?.vacancies.length)),
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
      // Торговые блоки ТЦ стоят между картой и каталогом арендаторов.
      ...(isTc ? retailSectionIds(center.retailInfo) : []).map((id) => has(id, true)),
      has('tenants', tenantOrganizations.length > 0),
      // «Инфраструктура» — пунктом меню только у ТЦ (у БЦ блок оборудования
      // короткий и в меню не выводился).
      has('amenities', tcInfrastructure.length > 0),
      has('market', Boolean(marketPosition && marketPosition.bars.length > 0)),
      has(
        'reviews',
        center.highlights.some((h) => h.icon === 'rating') ||
          reviewQuotes.length > 0 ||
          reviews.some((r) => r.source !== '2gis'),
      ),
      // У ТЦ награды (в том числе строки из highlights) и места в рейтингах
      // — один блок «Награды и рейтинги», общий блок «Награды» не рисуется.
      has('awards', !isTc && awardItems.length > 0),
      isTc && (tcHasAwards || tcHasRanking)
        ? { id: 'awards-ranking', label: awardsRankingTitle(tcHasAwards, tcHasRanking) }
        : null,
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
    isTc,
    tcHasAwards,
    tcHasRanking,
    tcInfrastructure,
    V,
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
          return Math.max(saleStats?.count ?? 0, rentStats?.count ?? 0, isTc ? (center?.retailInfo?.vacancies.length ?? 0) : 0);
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
        case 'awards-ranking':
          return awardsRankingSize(center.retailInfo, awardItems.length);
        case 'media':
          return mediaMentions.length;
        case 'facts':
          return visibleHighlights.length;
        case 'history':
          return extractHistoryPoints(center).length;
        case 'developer':
          // Без новых полей — строки описания, как раньше; с ними модель
          // складывает части развёрнутого блока (lib/developerProfile).
          return developerSectionSize(developerInfo);
        case 'faq':
          return faqItems.length;
        // «Инфраструктура» ТЦ: строки подзаголовков групп и ряды плиток.
        case 'amenities':
          return infrastructureSectionSize(tcInfrastructure);
        // Торговые карточки ТЦ — модель строк в lib/tradeCenterRetail.
        case 'floors':
        case 'retail-history':
        case 'food':
        case 'fun':
        case 'leisure':
        case 'visit':
        case 'business':
        case 'numbers':
        case 'quotes':
        case 'anchors':
          return retailSectionSize(center.retailInfo, id);
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
    tcInfrastructure,
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
    // Торговые карточки ТЦ читаются двумя группами — «для посетителя»
    // (этажи, история ритейла, еда, развлечения, посетителю) и «для бизнеса» (аренда и реклама,
    // цифры, цитаты). Рекомендацию, выпавшую внутри группы, переносим за
    // последнюю карточку той же группы; на стыке групп она остаётся. Если
    // там уже стоит своя, оставляем как было: две рекомендации подряд хуже.
    const retailIds = new Set<string>(isTc && center ? retailSectionIds(center.retailInfo) : []);
    // «Якорные арендаторы» и каталог арендаторов под ними читаются как одно
    // целое: рекомендация после якорей уезжает за каталог, если он есть.
    const hasTenants = sectionSizes.some((section) => section.id === 'tenants');
    const lastRetailOf = (group: 'visitor' | 'business' | 'tenants') =>
      group === 'tenants' && hasTenants
        ? 'tenants'
        : ([...sectionSizes]
            .reverse()
            .find((section) => retailIds.has(section.id) && retailSectionGroup(section.id as RetailSectionId) === group)
            ?.id ?? null);
    const planned = planRecommendationSlots(sectionSizes, recommendationBlocks.length);
    planned.forEach((sectionId, index) => {
      const block = recommendationBlocks[index];
      if (!block) return;
      const lastRetail = retailIds.has(sectionId)
        ? lastRetailOf(retailSectionGroup(sectionId as RetailSectionId))
        : null;
      const target = lastRetail && !planned.includes(lastRetail) ? lastRetail : sectionId;
      slots.set(target, [...(slots.get(target) ?? []), block.id]);
    });
    return slots;
  }, [sectionSizes, recommendationBlocks, isTc, center]);

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
  //
  // С 2026-09-22 сюда же уходит присутствие остальных разделов: описание
  // перечисляет то, что человек реально увидит, перейдя по ссылке, — иначе
  // сниппет обещает отзывы там, где их нет, и Google подменяет его своим
  // текстом (ровно это и происходило со старым описанием). Признаки берутся
  // из тех же выражений, что и пункты меню страницы (pageSections выше), а
  // не считаются заново.
  const pageComposition = useMemo(
    () => ({
      organizationCount: tenantOrganizations.length,
      infrastructure: center?.infraInternal ?? [],
      rentOfferCount: rentStats?.count ?? 0,
      saleOfferCount: saleStats?.count ?? 0,
      hasReviews: Boolean(
        center &&
          (center.highlights.some((h) => h.icon === 'rating') ||
            reviewQuotes.length > 0 ||
            reviews.some((r) => r.source !== '2gis')),
      ),
      hasNearbyInfrastructure: Boolean(center && hasNearbyContent(center, nearbyPlaces)),
    }),
    [tenantOrganizations, center, rentStats, saleStats, reviewQuotes, reviews, nearbyPlaces],
  );

  // Тёзки в каталоге: «Порт» на Независимости, 177 и «Порт» на
  // Шафарнянской, 11 — разные здания с одинаковым коротким именем. Заголовок
  // страницы без адреса у них совпал бы, а две страницы с одним title
  // конкурируют в выдаче между собой. Проверить это может только страница —
  // она держит весь каталог, тогда как сборщик мета-тегов видит одну запись.
  const ambiguousName = useMemo(() => {
    if (!center || !centers) return false;
    const own = shortName(center);
    return centers.filter((c) => shortName(c) === own).length > 1;
  }, [center, centers]);

  useEffect(() => {
    if (!center) return;
    if (isTc) {
      // Каталог ТЦ пока закрыт от индексации (TC_NOINDEX): простые мета-теги
      // для превью ссылки и noindex, без разметки здания и крошек.
      setGenericPageMeta({
        title: `${fullName(center)} — ${V.one} в Минске`,
        description: [center.retailFormat, center.address].filter(Boolean).join(', '),
        url: `${V.siteUrl}/${center.slug}`,
        image: center.photos[0] ? new URL(withBcPhotoVersion(center.photos[0]), 'https://redevelopment.pro').toString() : undefined,
      });
      if (TC_NOINDEX) {
        setNoIndex();
        return () => clearNoIndex();
      }
      return;
    }
    setBusinessCenterPageMeta(
      center.slug,
      { ...center, ambiguousName },
      withBcPhotoVersion(center.photos[0] ?? ''),
      pageComposition,
    );
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bc' },
      { name: shortName(center) },
    ]);
    // Б12: разметка самого здания. Удобства берём из уже собранных фактов
    // (инфраструктура внутри, доступная среда, круглосуточный доступ) — не
    // выдумываем список, которого нет в данных.
    setPlaceJsonLd({
      name: fullName(center),
      altNames: center.altNames,
      url: `https://redevelopment.pro/minsk/bc/${center.slug}`,
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
  }, [center, pageComposition, ambiguousName, isTc, V]);

  // Разметку пререндера на /bc/<slug> прячет инлайн-скрипт index.html:
  // в ней полная карточка с соседями. Показываем, когда отрисовался режим
  // владельца.
  useEffect(() => {
    if (ownerMode) document.documentElement.classList.remove('bc-owner-pending');
  }, [ownerMode]);

  // Метаданные страницы выше сбрасывают JSON-LD: FAQ записываем после них.
  // Страницам ТЦ, закрытым от индекса, разметка FAQ ни к чему.
  useEffect(() => {
    if (isTc && TC_NOINDEX) return;
    setFaqJsonLd(faqItems);
    return () => setFaqJsonLd([]);
  }, [faqItems, isTc]);

  // Б7-мобайл (владелец, 2026-09-23: «сделаем меню страницы не сверху, а
  // постоянно видимым блоком, как Фильтры»). До этой правки «На странице»
  // было горизонтальной прокручиваемой строкой в sticky-шапке — на телефоне
  // её частично закрывала системная панель браузера. Ниже xl список
  // переехал в кнопку «Содержание» со шторкой снизу — тот же native
  // <dialog> + createPortal, что и в CatalogFilterPanel, только выезжает
  // снизу, а не слева: для списка-оглавления это привычнее, чем боковой
  // drawer с фильтрами. Кнопка сперва стояла плавающей в правом нижнем
  // углу; владелец, 2026-09-23: «пусть содержание будет в том же месте по
  // высоте, где возврат на каталог всех БЦ, наверху» — теперь она рядом с
  // «Все БЦ» в той же sticky-строке, той же высоты и стиля (см. secondRow
  // у CatalogTopNav ниже). Список пунктов не дублируется — тот же
  // pageSections, что и в десктопной колонке.
  const [tocOpen, setTocOpen] = useState(false);
  const tocDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!tocOpen) return;
    const dialog = tocDialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    // 1280px = xl: с этой ширины список уже виден в боковой колонке,
    // открытую шторку в этот момент закрываем сами — то же самое делает
    // фильтр каталога на lg (см. CatalogFilterPanel).
    const desktop = window.matchMedia('(min-width: 1280px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setTocOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [tocOpen]);

  // Слаг не найден (опечатка в ссылке, удалённый БЦ) — soft-404: страница
  // остаётся доступной (200, не редирект), но не индексируется, тот же
  // принцип, что и у ObjectLandingPage для неизвестного /:slug.
  useEffect(() => {
    // failed — мы не знаем, есть ли здание (база не ответила), поэтому и
    // noindex не ставим: только ответ базы «такого слага нет» даёт soft-404.
    if (detail === null || detail.slug !== slug || center || detail.failed) return;
    setNoIndex();
    return () => clearNoIndex();
  }, [detail, slug, center]);

  // Ждём ТОЛЬКО своё здание: список зданий (соседи, «предыдущий/следующий»,
  // сравнения) догружается фоном, и каждый блок, который его использует, и
  // так проверяет centers на null.
  if (detail === null || detail.slug !== slug) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-bg">
        {/* text-ink: прямо на фоне страницы muted даёт 4,48:1 — ниже порога.
            <main> и здесь — чтобы landmark был в любом состоянии страницы. */}
        <p className="text-sm text-ink">Загрузка…</p>
      </main>
    );
  }

  if (!center && detail.failed) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-base text-ink">Не удалось загрузить данные о {V.onePrep}. Обновите страницу чуть позже.</p>
        <Link to={V.basePath} className="text-sm font-semibold text-primary-hover hover:underline">
          ← Все {V.many} Минска
        </Link>
      </main>
    );
  }

  if (!center) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-base text-ink">Такой {V.one} не найден.</p>
        <Link to={V.basePath} className="text-sm font-semibold text-primary-hover hover:underline">
          ← Все {V.many} Минска
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
  // Контакты застройщика — общий кусок простой карточки «Застройщик» и
  // развёрнутого блока «Кто стоит за…» (DeveloperDeepCard).
  const developerContacts =
    center.developerInfo &&
    (center.developerInfo.phone ||
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
    );
  return (
    <div className="min-h-svh bg-bg">
      {/* Сквозная шапка каталога (владелец, 2026-09-22). Раньше на карточке
          было две собственные копии логотипа: своя sticky-шапка до xl и
          дубль в боковой колонке от xl — обе убраны, логотип теперь один,
          в CatalogTopNav. Вторым рядом той же sticky-шапки идёт то, что
          было во второй строке прежней: кнопка «назад в каталог» и
          оглавление страницы. Держать их отдельным sticky-блоком под
          шапкой нельзя — два sticky друг под другом дерутся за top:0. */}
      {/* navOffsetClassName — та же логика, что и на каталоге (см. коммент
          там): начало пунктов меню должно совпадать с началом самой
          карточки здания, а не идти сразу за логотипом. Колонка оглавления
          здесь — `xl:grid-cols-[15rem_minmax(0,1fr)]` с `gap-6` (ниже):
          240px + 24px = 264px = 16.5rem от края страницы; минус ширина
          логотипа (176px) — margin-left от его конца получается 88px =
          5.5rem. Активен с xl — раньше колонка не показывается (плюс она
          вообще не рисуется без pageSections, см. условие ниже). */}
      {ownerMode ? (
        pageSections.length > 0 && (
          <div className="mx-auto flex max-w-7xl px-4 pt-5 sm:px-8 xl:hidden">
            <button
              type="button"
              onClick={() => setTocOpen(true)}
              aria-expanded={tocOpen}
              className={cn(
                'flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:text-primary',
                glassPillClass,
              )}
              style={glassPillShadow}
            >
              <List className="h-3.5 w-3.5 shrink-0" />
              Содержание
            </button>
          </div>
        )
      ) : (
      <CatalogTopNav
        centers={centers}
        width="max-w-7xl"
        navOffsetClassName="xl:ml-[5.5rem]"
        secondRow={
          <div className="flex items-center gap-3 xl:hidden">
            {/* Владелец, 2026-09-06: "крестик плохо подходит, он как будто
                про закрытие, но те, кто придёт на эту страницу из поиска,
                ещё не видел главную страницу" — крестик подразумевает
                "закрыть уже открытое", а для гостя из поисковика это первая
                страница сайта вообще, тут нужна навигация "назад к списку",
                не закрытие. Плюс "должно выглядеть заметнее" — обычная
                приглушённая текстовая ссылка заменена на pill-кнопку (тот
                же glassPillClass, что и у стрелок prev/next ниже). */}
            <Link
              to={V.basePath}
              className={cn(
                'flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:text-primary',
                glassPillClass,
              )}
              style={glassPillShadow}
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Все {V.many}</span>
              <span className="sm:hidden">Все {V.abbr}</span>
            </Link>
            {/* Кнопка «Содержание» — владелец, 2026-09-23: "пусть будет в
                том же месте по высоте, где возврат на каталог всех БЦ,
                наверху". Раньше стояла плавающей в правом нижнем углу —
                здесь она в той же sticky-строке, что и «Все БЦ», той же
                высоты и того же стиля; шторка снизу по тапу не изменилась,
                см. комментарий про Б7-мобайл у tocOpen. */}
            {pageSections.length > 0 && (
              <button
                type="button"
                onClick={() => setTocOpen(true)}
                aria-expanded={tocOpen}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:text-primary',
                  glassPillClass,
                )}
                style={glassPillShadow}
              >
                <List className="h-3.5 w-3.5 shrink-0" />
                Содержание
              </button>
            )}
            {/* Избранное — владелец, 2026-09-23: "перенеси на ту же строку
                добавление в избранное с мобилки". Раньше стояло только
                поверх фотки (правый верхний угол); на мобильном фотка
                теперь квадратная и заметно ниже верхней строки, сердечко
                уезжало от остальных кнопок. Собственный стиль кнопки не
                трогаем — `cn()` в этом проекте не tailwind-merge, а простая
                конкатенация (src/lib/cn.ts), переопределение конфликтующих
                классов (bg/shadow/размер) через className непредсказуемо
                зависит от порядка в сгенерированном CSS; единственное
                другое место, где FavoriteButton получает className
                (BusinessCentersMinskPage.tsx), тоже добавляет только
                позиционирование, не переопределяет вид. `ml-auto`
                прижимает её к правому краю строки. На фотке (xl и шире)
                кнопка осталась как была — см. `hidden xl:flex` у обёртки
                вокруг неё ниже. */}
            <FavoriteButton slug={center.slug} className="ml-auto" />
          </div>
        }
      />
      )}

      {/* Горизонтальный padding переехал отсюда на сам грид ниже (см.
          комментарий там) — раньше он стоял на этой внешней обёртке, а
          грид внутри неё ещё раз центрировался своим mx-auto max-w-7xl:
          два вложенных центрирования дают не ту же линию, что у шапки
          (mx-auto max-w-7xl px-4 sm:px-8 на одном элементе), а более
          левую — на 32px при ширине окна больше 1344px (разница по
          формуле = половина одного лишнего px-8). Вертикальный остался
          здесь, он на этот сдвиг не влияет. */}
      <div className="py-5 sm:py-8">
      {/* Стрелки влево/вправо по краям экрана — тот же паттерн, что и в
          ImageLightbox.tsx. Только от lg — на мобильном места мало, там
          навигация — строка кнопок под карточкой ниже. */}
      {prev && (
        <Link
          to={`${V.basePath}/${prev.slug}`}
          aria-label={`Предыдущий ${V.one}: ${shortName(prev)}`}
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
          to={`${V.basePath}/${next.slug}`}
          aria-label={`Следующий ${V.one}: ${shortName(next)}`}
          className={cn(
            'fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 items-center justify-center rounded-full p-3 text-ink lg:flex',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}


      {tocOpen && pageSections.length > 0 && createPortal(
        <dialog
          ref={tocDialogRef}
          aria-label="Содержание страницы"
          onCancel={(event) => {
            event.preventDefault();
            setTocOpen(false);
          }}
          className="fixed inset-0 m-0 h-svh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-ink backdrop:bg-transparent xl:hidden"
        >
          <div className="absolute inset-0 bg-ink/40" onClick={() => setTocOpen(false)} aria-hidden="true" />
          {/* Шторка снизу, не слева — для списка-оглавления это привычнее,
              чем боковой drawer с фильтрами (тот открывается слева в
              CatalogFilterPanel). */}
          <div className="absolute inset-x-0 bottom-0 flex max-h-[75svh] flex-col rounded-t-3xl border-t border-white/50 bg-white/95 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <span className="text-sm font-bold text-ink">Содержание</span>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                aria-label="Закрыть содержание"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {pageSections.map((sec) => {
                const SectionIcon = SECTION_ICONS[sec.id] ?? FileText;
                return (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    onClick={() => setTocOpen(false)}
                    className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm leading-snug text-ink transition-colors hover:bg-surface-muted"
                  >
                    <SectionIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                    <span>{sec.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </dialog>,
        document.body,
      )}

      {/* px-4 sm:px-8 — теперь на одном элементе с mx-auto max-w-7xl, той
          же парой классов и в том же порядке вложенности, что и у шапки
          (CatalogTopNav): centered-box и его padding должны быть на одном
          уровне, иначе получаются два вложенных центрирования вместо
          одного, и края расходятся (разбор — в комментарии у обёртки
          выше). Именно эта линия — 15rem (колонка оглавления) + 1.5rem
          (gap-6) от левого края — то, подо что посчитан
          `navOffsetClassName="xl:ml-[5.5rem]"` в CatalogTopNav ниже. */}
      <div
        className={cn(
          'mx-auto grid max-w-7xl items-start gap-6 px-4 sm:px-8',
          pageSections.length > 0 && 'xl:grid-cols-[15rem_minmax(0,1fr)]',
        )}
      >
        {/* top-24, не top-6: над колонкой теперь стоит sticky-шапка каталога,
            и при прокрутке колонка уезжала бы под неё. Логотип из колонки
            убран — он в шапке, второй был бы дублем. */}
        {pageSections.length > 0 && (
          <aside className={cn('sticky hidden max-h-[calc(100svh-7rem)] flex-col gap-4 xl:flex', ownerMode ? 'top-6' : 'top-24')}>
            {!ownerMode && (
            <Link
              to={V.basePath}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:text-primary',
                glassPillClass,
              )}
              style={glassPillShadow}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              Все {V.many}
            </Link>
            )}
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
        {/* Отступа сверху нет (владелец, 2026-09-22): карточка начинается на
            одном уровне с кнопкой «Все бизнес-центры» в боковой колонке, а не
            под ней. Раньше здесь стоял `xl:pt-[3.375rem]` (высота кнопки плюс
            gap-4 колонки), выравнивавший верх карточки по НИЗУ кнопки — из-за
            него первый экран начинался ниже оглавления и терял ~54px высоты
            над сгибом. Вернуть отступ = снова опустить карточку. */}
        <main className="min-w-0">
        <div className={cn('overflow-hidden', glassCardClass)} style={glassCardShadow}>
          {/* Компактная версия первого экрана: на широком экране фото и
              основная сводка стоят рядом. Прежняя вертикальная версия целиком
              сохранена в родительском коммите этой правки и откатывается
              одним revert без затрагивания остальных блоков страницы. */}
          <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            {/* Квадрат на мобильном, не 16:9 (владелец, 2026-09-22: «не
                нравится, что на мобильной версии обрезается половина
                картинки»). Все 143 фото в каталоге — 1200×1200, и контейнер
                16:9 вырезал из них центральную полосу, срезая 44% кадра:
                у низких зданий уезжал верх, у высоких — вход и первый этаж.
                Квадратный контейнер совпадает с пропорцией файла, поэтому
                кадр виден целиком и при этом без полей — то самое «полей
                быть не должно», ради которого в 2026-09-20 включали cover.
                Появится неквадратное фото — cover обрежет его по короткой
                стороне, как и раньше; заводить под это отдельную логику
                незачем, пока съёмка идёт в квадрат. На lg и шире всё
                по-прежнему: фото в колонке рядом со сводкой, высота по
                min-h. На планшете (md, 768–1023) квадрат во всю ширину
                занимал бы 768 px высоты — весь первый экран под одним фото,
                поэтому там 4:3: кадр режется, но вчетверо меньше, чем
                резало 16:9. */}
            <div className="relative aspect-square w-full overflow-hidden bg-surface-muted/70 md:aspect-[4/3] lg:aspect-auto lg:min-h-[28rem]">
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
                  второй раз тот же угол не занят. Только xl и шире —
                  владелец, 2026-09-23: "перенеси на ту же строку добавление
                  в избранное с мобилки". Ниже xl та же кнопка стоит в
                  sticky-строке рядом с «Все БЦ»/«Содержание» (secondRow
                  выше); дублировать её на фотке незачем. */}
              <div className="absolute right-4 top-4 hidden xl:block">
                {!ownerMode && <FavoriteButton slug={center.slug} />}
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
              {redistributedTechnicalParams.corpora.length >= 2 && (
                <p className="text-sm font-semibold text-ink-muted">
                  Комплекс из {redistributedTechnicalParams.corpora.length}{' '}
                  {pluralRu(redistributedTechnicalParams.corpora.length, 'здания', 'зданий', 'зданий')} с разными адресами
                </p>
              )}
              {center.verifiedByManagementAt && (
                <p className="mt-1.5 flex w-fit items-center gap-1 rounded-full border border-success/30 bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                  Информация проверена администрацией БЦ
                </p>
              )}
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
                {redistributedTechnicalParams.corpora.length >= 2 ? (
                  // Комплекс из нескольких зданий: вместо одного адреса —
                  // список корпусов, у каждого год, этажность и площадь
                  // (что известно). Один адрес на первом экране читался как
                  // «одно здание», и про остальные корпуса гость узнавал
                  // только из таблицы в конце страницы.
                  <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      {redistributedTechnicalParams.corpora.length} {pluralRu(redistributedTechnicalParams.corpora.length, 'корпус', 'корпуса', 'корпусов')}
                    </p>
                    <ul className="mt-0.5 min-w-0 space-y-1 text-sm leading-snug text-ink sm:mt-0">
                      {redistributedTechnicalParams.corpora.map((corpus) => {
                        const details = [
                          corpus.year ? `${corpus.year}\u00a0г.` : null,
                          corpus.floors ? `${corpus.floors}\u00a0эт.` : null,
                          corpus.area ? formatCorpusValue(corpus.area) : null,
                        ].filter(Boolean);
                        return (
                          <li key={corpus.label}>
                            <span className="font-semibold">{corpus.label}</span>
                            {details.length > 0 && <span className="text-ink-muted"> · {details.join(' · ')}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_minmax(0,1fr)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Адрес</p>
                  {/* Улица внутри адреса раньше вела на уличный хаб каталога
                      (STREET_SLUGS) — владелец, 2026-09-20: "не нравится
                      кликабельная улица в адресе, у нас есть блок «Бизнес-
                      центры на этой улице»" — эта ссылка дублировала блок
                      ниже, убрана, адрес остаётся обычным текстом. */}
                  <p className="mt-0.5 min-w-0 text-sm leading-snug text-ink sm:mt-0">{displayAddress}</p>
                </div>
                )}
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
                          {nearestMetro.name} — {(displayMetro ?? nearestMetro).distanceMeters} м
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
              {corpusYearRange ? (
                <FactTile tone="muted" value={corpusYearRange} label="Годы сдачи корпусов" />
              ) : center.yearBuilt != null && (
                <FactTile
                  tone="muted"
                  value={`${center.yearBuilt} г.`}
                  label={center.status === 'under_construction' ? 'Ожидаемая сдача' : isTc ? 'Год открытия' : 'Год сдачи'}
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
        {!ownerMode && (
          <BuildingOffersSection
            sale={saleStats}
            rent={rentStats}
            listed={isTc ? (center.retailInfo?.vacancies ?? []) : []}
          />
        )}

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
        {/* Торговые блоки ТЦ — что на каком этаже, чем ТЦ вошёл в историю
            ритейла, где поесть и развлечения (или старый блок досуга), … и последними якорные арендаторы
            (вплотную к каталогу), место в рейтинге ТЦ Минска
            (business_centers.retail_info, 2026-09-23). Стоят перед каталогом
            арендаторов: это выжимка того же состава здания, а каталог —
            полный список для поиска по имени. У БЦ не рисуются. */}
        {isTc && (
          <TradeCenterRetailBlocks
            info={center.retailInfo}
            name={`${V.abbr} ${centerNameTail(center)}`}
            after={renderRecommendationSlot}
          />
        )}

        {tenantOrganizations.length > 0 && (
          <TenantDirectory organizations={tenantOrganizations} />
        )}
        {tenantsAt && (
          <div id="tenants" className={cn('mt-6 scroll-mt-32 p-5 sm:p-6', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-xl font-bold text-ink">Магазины комплекса</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
              {center.name} и {tenantsAt.name} стоят рядом и работают как один торговый комплекс. Большинство
              магазинов — в соседнем корпусе, их полный список с этажами — на его странице.
            </p>
            <Link
              to={`/minsk/tc/${tenantsAt.slug}#tenants`}
              className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
            >
              Все магазины: {tenantsAt.name} →
            </Link>
          </div>
        )}
        {/* У ТЦ оборудование из Яндекса и удобства с сайта ТЦ — одним
            блоком «Инфраструктура» по группам (2026-09-24); это свой пункт
            меню и своё место в модели высот, поэтому рекомендация после
            каталога стоит между ними. У БЦ — прежний блок оборудования. */}
        {isTc ? (
          <>
            {renderRecommendationSlot('tenants')}
            <TradeCenterInfrastructure groups={tcInfrastructure} amenitySource={tcAmenitySource} />
            {renderRecommendationSlot('amenities')}
          </>
        ) : (
          <>
            <BuildingAmenities amenities={tenantAmenities} />
            {renderRecommendationSlot('tenants')}
          </>
        )}

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
        {/* У ТЦ вместо этого блока — «Награды и рейтинги» (2026-09-24):
            награды из retail_info.awards (или, пока их нет, те же строки
            из highlights) и места в рейтингах ТЦ Минска одной карточкой. */}
        {isTc && (
          <TradeCenterAwardsBlock info={center.retailInfo} legacyAwardLines={awardItems} renderLine={renderBold} />
        )}
        {isTc && renderRecommendationSlot('awards-ranking')}
        {!isTc && awardItems.length > 0 && (
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
            нигде: FAQ перестал пересказывать публикации 2026-09-22. Логотип
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
              <table role="table" className="block w-full border-collapse text-sm sm:table">
                <tbody role="rowgroup" className="block sm:table-row-group">
                  {architectureHighlights.map((h, i) => (
                    <tr role="row" key={`arch-${i}`} className="block border-b border-border last:border-b-0 odd:bg-surface-muted/40 sm:table-row">
                      <th scope="row" role="rowheader" className="block w-full break-words [overflow-wrap:anywhere] pb-1 pt-2 pl-3 pr-3 text-left align-top font-medium text-ink-muted sm:table-cell sm:w-2/5 sm:py-2 sm:pr-2">
                        {h.label}
                      </th>
                      <td role="cell" className="block w-full break-words [overflow-wrap:anywhere] pb-2 pt-0 pl-3 pr-3 text-ink sm:table-cell sm:w-auto sm:py-2 sm:pl-2">{h.text}</td>
                    </tr>
                  ))}
                  {center.parking && (
                    <tr role="row" className="block border-b border-border last:border-b-0 odd:bg-surface-muted/40 sm:table-row">
                      <th scope="row" role="rowheader" className="block w-full break-words [overflow-wrap:anywhere] pb-1 pt-2 pl-3 pr-3 text-left align-top font-medium text-ink-muted sm:table-cell sm:w-2/5 sm:py-2 sm:pr-2">
                        Парковка
                      </th>
                      <td role="cell" className="block w-full break-words [overflow-wrap:anywhere] pb-2 pt-0 pl-3 pr-3 text-ink sm:table-cell sm:w-auto sm:py-2 sm:pl-2">{center.parking}</td>
                    </tr>
                  )}
                  {accessHoursText && (
                    <tr role="row" className="block border-b border-border last:border-b-0 odd:bg-surface-muted/40 sm:table-row">
                      <th scope="row" role="rowheader" className="block w-full break-words [overflow-wrap:anywhere] pb-1 pt-2 pl-3 pr-3 text-left align-top font-medium text-ink-muted sm:table-cell sm:w-2/5 sm:py-2 sm:pr-2">
                        Часы работы
                      </th>
                      <td role="cell" className="block w-full break-words [overflow-wrap:anywhere] pb-2 pt-0 pl-3 pr-3 text-ink sm:table-cell sm:w-auto sm:py-2 sm:pl-2">
                        {accessHoursText.toLocaleLowerCase('ru-RU') === 'круглосуточно' ? '24/7' : accessHoursText}
                      </td>
                    </tr>
                  )}
                  {accessibilityAttributes && (
                    <tr role="row" className="block border-b border-border last:border-b-0 odd:bg-surface-muted/40 sm:table-row">
                      <th scope="row" role="rowheader" className="block w-full break-words [overflow-wrap:anywhere] pb-1 pt-2 pl-3 pr-3 text-left align-top font-medium text-ink-muted sm:table-cell sm:w-2/5 sm:py-2 sm:pr-2">
                        Доступная среда
                      </th>
                      <td role="cell" className="block w-full break-words [overflow-wrap:anywhere] pb-2 pt-0 pl-3 pr-3 text-ink sm:table-cell sm:w-auto sm:py-2 sm:pl-2">
                        <AccessibilityChips text={accessibilityAttributes} />
                      </td>
                    </tr>
                  )}
                  {redistributedTechnicalParams.buildingInformationRows.map((row) => (
                    <tr
                      role="row"
                      key={row.label}
                      className="block border-b border-border last:border-b-0 odd:bg-surface-muted/40 sm:table-row">
                      <th
                        scope="row"
                        role="rowheader"
                        className="block w-full break-words [overflow-wrap:anywhere] pb-1 pt-2 pl-3 pr-3 text-left align-top font-medium text-ink-muted sm:table-cell sm:w-2/5 sm:py-2 sm:pr-2"
                      >
                        {row.label}
                      </th>
                      <td role="cell" className="block w-full break-words [overflow-wrap:anywhere] pb-2 pt-0 pl-3 pr-3 text-ink sm:table-cell sm:w-auto sm:py-2 sm:pl-2">
                        {redistributedTechnicalParams.corpusBreakdown[row.label] ? (
                          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                            {redistributedTechnicalParams.corpusBreakdown[row.label].map((entry) => (
                              <Fragment key={entry.corpusLabel}>
                                <dt className="text-ink-muted">{entry.corpusLabel}</dt>
                                <dd>{entry.value}</dd>
                              </Fragment>
                            ))}
                          </dl>
                        ) : (
                          row.value
                        )}
                      </td>
                    </tr>
                  ))}
                  {center.buildingFacts.map((fact, index) => (
                    <tr
                      role="row"
                      key={`${fact.label}-${index}`}
                      className="block border-b border-border last:border-b-0 odd:bg-surface-muted/40 sm:table-row"
                    >
                      <th
                        scope="row"
                        role="rowheader"
                        className="block w-full break-words [overflow-wrap:anywhere] pb-1 pt-2 pl-3 pr-3 text-left align-top font-medium text-ink-muted sm:table-cell sm:w-2/5 sm:py-2 sm:pr-2"
                      >
                        {fact.label}
                        {fact.corpusLabel && (
                          <span className="block text-xs font-normal text-ink-faint">{fact.corpusLabel}</span>
                        )}
                      </th>
                      <td role="cell" className="block w-full break-words [overflow-wrap:anywhere] pb-2 pt-0 pl-3 pr-3 text-ink sm:table-cell sm:w-auto sm:py-2 sm:pl-2">
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
            чем у половины БЦ (56 из 141 на 2026-09-20).
            2026-09-24: когда ресёрч положил в developer_info участников
            проекта, профиль, портфель или факты (пока — только ТЦ), вместо
            этой карточки рисуется развёрнутый блок «Кто стоит за…»
            (DeveloperDeepCard); без них карточка прежняя. */}
        {center.developerInfo && hasDeveloperDeepData(center.developerInfo) ? (
          <DeveloperDeepCard
            info={center.developerInfo}
            title={`Кто стоит за ${V.oneIns} «${shortName(center)}»`}
            mainName={developerMainName(center.developerInfo, center.developer)}
            logoAlt={center.developer ?? shortName(center)}
            contacts={developerContacts}
          />
        ) : center.developerInfo ? (
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
            {developerContacts}
          </div>
        ) : null}

        {renderRecommendationSlot('developer')}

        {/* Б12. Собственникам и УК — способ поправить данные. Пишем прямо
            в почту: отдельной формы с лидом здесь не заводим, это не заявка
            на аренду, а правка справочника, и ответить на неё должен
            человек. Здание, чья администрация нам уже ответила или сверила
            карточку, блок не получает (владелец, 24.09.2026): связь есть. */}
        {center && !ownerMode && !center.managementRepliedAt && !center.verifiedByManagementAt && (
          <div className={cn('mt-6 flex flex-col gap-2 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Вы собственник или управляющая компания?</h2>
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm leading-relaxed text-ink-muted">
              <span>Если хотите добавить, убрать или изменить информацию — напишите нам, поправим:</span>
              <a
                href={`mailto:a@redevelopment.pro?subject=${encodeURIComponent(`Данные ${V.oneGen} «${shortName(center)}»`)}`}
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
                to={`${V.basePath}/${prev.slug}`}
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
                to={`${V.basePath}/${next.slug}`}
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
    </div>
  );
}

/**
 * Имя здания после родового слова: «Фаренгейт» → «Фаренгейт» в кавычках,
 * адрес — с предлогом («на ул. …»). Разбор — в faqItems, где этим пользуются
 * вопросы FAQ; тем же видом подписан заголовок ленты ТЦ.
 */
function centerNameTail(center: BusinessCenter, name = shortName(center)): string {
  const addressLike = /^(ул\.|пр-т|просп|проспект|пер\.|пл\.|тракт|бул|наб|индустриальн)/i.test(name) || /^[\p{Lu}][\p{L}\s-]+\s\d+[\p{L}]?$/u.test(name);
  return addressLike ? `на ${shortAddress(center.address)}` : `«${name}»`;
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
  const V = useCatalogKind();
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
            to={`${V.basePath}/${related.slug}`}
            aria-label={`Открыть страницу ${related.name}`}
            // Владелец, 2026-09-22: "предложи новый макет блока рекомендаций,
            // он огромный". Ниже sm карточка была столбиком с фото во всю
            // ширину (aspect-square = 291px на 375px экране), и блок занимал
            // 1167px — почти три экрана телефона, а таких блоков на странице
            // четыре (суммарно 4025px, 23% высоты страницы). От sm та же
            // карточка уже была строкой с фото 10rem — то есть на телефоне
            // тот же самый контент занимал в 4,3 раза больше. Мобильная
            // раскладка теперь такая же строка, только фото 5rem: блок
            // ужимается до ~400px. Десктоп (sm/lg/xl) не тронут.
            // Про lg (1024–1279px): раньше здесь стоял lg:block — на этом
            // диапазоне секция раскладывается в три колонки, каждая узкая,
            // и карточку «роняли» в столбик. Но столбик в колонке 410px даёт
            // фото 410×410 — блок разбухал до 659px, БОЛЬШЕ, чем был на
            // телефоне до правки (владелец так и написал «у меня пока старый
            // вид» — он смотрел как раз в этом диапазоне). Вместо столбика
            // строка с фото поменьше (7rem), как на всех остальных ширинах.
            className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-2 transition-colors hover:border-primary/40 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-0 sm:p-0 lg:grid-cols-[7rem_minmax(0,1fr)] xl:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <div className="aspect-square overflow-hidden rounded-xl bg-surface-muted sm:rounded-2xl">
              {/* sizes повторяет ширины колонки фото из grid-cols выше
                  (5rem / 10rem / 7rem / 10rem) — см. PhotoBlock. */}
              <PhotoBlock
                center={related}
                variant="card"
                fit="contain"
                sizes="(min-width: 1280px) 10rem, (min-width: 1024px) 7rem, (min-width: 640px) 10rem, 5rem"
              />
            </div>
            <div className="flex min-w-0 flex-col items-start justify-center gap-1 py-1 pr-2 sm:gap-2 sm:p-4">
              {isFallback && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Похож по классу</p>
              )}
              <h3 className="text-base font-bold leading-snug text-ink">{shortName(related)}</h3>
              {/* Класс и расстояние: на телефоне одной строкой через точку,
                  от sm — двумя отдельными строками, как было. Обёртка нужна
                  только ради этого склеивания, поэтому от sm она повторяет
                  gap-2 родителя — иначе расстояние между строками схлопнулось
                  бы и десктоп поехал бы на 8px. */}
              <div className="flex flex-wrap items-baseline gap-x-1.5 sm:flex sm:flex-col sm:items-start sm:gap-2">
                {related.businessClass && (
                  // Разделитель — на классе, а не на расстоянии: у части БЦ
                  // класс не заполнен, и точка в начале строки висела бы
                  // сиротой («· 110 м до метро»). Заодно при переносе она
                  // остаётся в конце первой строки, а не открывает вторую.
                  <p className="text-xs text-ink-muted after:ml-1.5 after:content-['·'] last:after:hidden sm:text-sm sm:after:hidden">
                    Класс {related.businessClass}
                  </p>
                )}
                {metro?.distanceMeters != null && (
                  <p className="text-xs leading-snug text-ink-muted sm:text-sm">
                    {metro.distanceMeters.toLocaleString('ru-RU')} м до метро
                  </p>
                )}
              </div>
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
            // Плитка «весь каталог» на телефоне была такой же высокой, как
            // карточка БЦ (min-h-40 = 160px + p-6), хотя внутри одна строка
            // текста. Ниже sm — обычная кнопка в одну строку.
            className="group flex items-center justify-center rounded-2xl border border-border bg-surface-muted p-4 text-center text-ink transition-transform hover:-translate-y-0.5 hover:bg-border/50 sm:min-h-40 sm:p-6"
          >
            <span className="flex items-center gap-2 text-base font-bold leading-snug sm:text-lg">
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
                'inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:underline',
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
          <span key={item} className="inline-flex min-w-0 items-start gap-1.5 text-sm text-ink sm:items-center">
            <ItemIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint sm:mt-0" />
            <span className="min-w-0 break-words">{item}</span>
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

// Значения корпусов лежат в technicalParams строкой, как их прислал
// застройщик: «15415 м²», «14400,7 м²», «2.7». Приводим к виду остальной
// страницы: «15 415 м²», «14 400,7 м²», «2,7»; всё прочее — как есть.
function formatCorpusValue(value: string): string {
  const m = value.trim().match(/^(\d+)(?:[.,](\d+))?(\s*м²)?$/);
  if (!m) return value;
  // Разряды — только у площадей: «2013» в любой другой строке — это год.
  const whole = m[3] ? Number(m[1]).toLocaleString('ru-RU') : m[1];
  return `${whole}${m[2] ? `,${m[2]}` : ''}${m[3] ? '\u00a0м²' : ''}`;
}
