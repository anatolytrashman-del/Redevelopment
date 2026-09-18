import { GENERAL_DATA_SOURCES } from '../data/businessCenterSources';
import { tenantIndustryLabel } from '../data/tenantIndustries';
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
  Car,
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
  TrainFront,
  Users,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { PhotoBlock, FactTile } from '../components/businessCenters/BusinessCenterVisuals';
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
  shortName,
  sortByShortName,
  mapRatingFromHighlights,
  streetOfAddress,
} from '../lib/businessCenterDisplay';
import { nearestMetroStation } from '../lib/metroStations';
import {
  classHubUrl,
  districtHubUrl,
  metroHubDistance,
  metroHubUrl,
  microdistrictHubUrl,
  streetHubUrl,
  districtDative,
} from '../lib/businessCenterHubs';
import type { BusinessCenter, HighlightIconKey, TenantOrganization } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { NO_ACTIVE_OFFERS_MESSAGE, type BusinessCenterOffer } from '../data/businessCenterOffers';
import { fetchBusinessCenterOffers } from '../lib/businessCenterOffersApi';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
import type {
  BusinessCenter2gisSnapshot,
  Gis2Schedule,
  Gis2ScheduleDay,
  TenantIndustryCityProfile,
} from '../data/businessCenter2gis';
import { fetchBusinessCenter2gisSnapshot, fetchTenantIndustryCityProfile } from '../lib/businessCenter2gisApi';
import { buildOfferIndex } from '../lib/businessCenterCatalogFilter';
import { buildMarketPosition, haversineMeters, nearestNeighbours } from '../lib/businessCenterMarketPosition';
import {
  extractHistoryPoints,
  HistoryTimeline,
  MarketPositionBlock,
  TenantIndustriesBlock,
  WhatTheySayBlock,
} from '../components/businessCenters/BusinessCenterMarketBlocks';
import { NeighboursBlock, SimilarCentersBlock, similarCenters } from '../components/businessCenters/BusinessCenterNeighbours';

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
  facts: 'Факты',
  metroCenters: 'БЦ у метро',
  market: 'БЦ на фоне конкурентов',
  map: 'Другие бизнес-центры рядом',
  tech: 'Информация о здании',
  streetCenters: 'БЦ на улице',
  tenants: 'Кто внутри',
  rental: 'Условия аренды',
  offers: 'Предложения',
  history: 'История здания',
  reviews: 'Отзывы',
  similar: 'Похожие',
  faq: 'Вопросы',
};

const SECTION_ICONS: Record<string, typeof FileText> = {
  facts: Sparkles,
  metroCenters: TrainFront,
  market: Award,
  map: MapPin,
  tech: Building2,
  streetCenters: MapPin,
  tenants: Users,
  rental: FileText,
  offers: Banknote,
  history: Clock,
  reviews: MessageSquareQuote,
  similar: Building2,
  faq: Info,
};

export function BusinessCenterDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [offersResult, setOffersResult] = useState<{
    slug: string;
    offers: BusinessCenterOffer[] | null;
    error: boolean;
  } | null>(null);
  const offers = offersResult && offersResult.slug === slug ? offersResult.offers : null;
  const [gis2Result, setGis2Result] = useState<{ slug: string; data: BusinessCenter2gisSnapshot | null } | null>(null);
  const gis2 = gis2Result?.slug === slug ? gis2Result?.data ?? null : null;
  const [officeSnapshots, setOfficeSnapshots] = useState<MarketSnapshot[] | null>(null);
  const [tenantCityProfile, setTenantCityProfile] = useState<TenantIndustryCityProfile | null>(null);

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

  // Городской профиль отраслей (Б9) — одна строка на весь каталог, но нужна
  // только тем карточкам, где организации 2GIS реально собраны: запрашиваем
  // после снапшота, а не вместе с ним, чтобы у зданий без арендаторов не
  // было лишнего запроса.
  const hasTenantOrganizations = (gis2?.tenantOrganizations.length ?? 0) > 0;
  useEffect(() => {
    if (!hasTenantOrganizations) return;
    fetchTenantIndustryCityProfile()
      .then(setTenantCityProfile)
      .catch(() => setTenantCityProfile(null));
  }, [hasTenantOrganizations]);

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
  // Из общего списка фактов исключаем то, что теперь показано отдельными
  // авторскими блоками: рейтинг и отзывы уехали в «Что говорят» (Б11),
  // история — в таймлайн (Б10). Дублировать один и тот же текст в двух
  // местах страницы хуже, чем не показать его вовсе.
  const visibleHighlights = useMemo(
    () => center?.highlights.filter((h) => h.icon !== 'rating' && h.icon !== 'reviews' && h.icon !== 'history') ?? [],
    [center],
  );

  const relatedCenters = useMemo(() => {
    if (!center || !centers) return { metro: [], street: [] };
    const street = streetOfAddress(center.address);
    const distanceFromCenter = (candidate: BusinessCenter) => {
      if (center.lat == null || center.lng == null || candidate.lat == null || candidate.lng == null) {
        return Number.POSITIVE_INFINITY;
      }
      return haversineMeters(center.lat, center.lng, candidate.lat, candidate.lng);
    };
    const byDistance = (a: BusinessCenter, b: BusinessCenter) => distanceFromCenter(a) - distanceFromCenter(b);

    const metro = nearestMetro
      ? centers
          .filter((candidate) => candidate.slug !== center.slug && metroHubDistance(candidate, nearestMetro.name) != null)
          .sort((a, b) =>
            (metroHubDistance(a, nearestMetro.name) ?? Number.POSITIVE_INFINITY) -
            (metroHubDistance(b, nearestMetro.name) ?? Number.POSITIVE_INFINITY),
          )
      : [];
    const streetCenters = street
      ? centers
          .filter((candidate) => candidate.slug !== center.slug && streetOfAddress(candidate.address) === street)
          .sort(byDistance)
      : [];
    return { metro, street: streetCenters };
  }, [center, centers, nearestMetro]);

  // Медианы по зданиям (Д3) — те же, что в каталоге и блоке
  // «БЦ на фоне конкурентов», чтобы одна и та же ставка не расходилась.
  const offerIndex = useMemo(() => buildOfferIndex(officeSnapshots), [officeSnapshots]);

  // Б5: «Сейчас предлагается» — живая строка вместо голой таблицы. Важны
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
  // Чипы-хабы вместо простого текста со ссылками (Б6): район, класс,
  // станция, улица, микрорайон — только те, для которых хаб реально есть.
  const hubChips = useMemo(() => {
    if (!center) return [];
    const street = streetOfAddress(center.address);
    const station = center.nearestMetroStations.length > 0
      ? [...center.nearestMetroStations].sort((a, b) => a.distanceMeters - b.distanceMeters)[0].name
      : null;
    return [
      center.district ? { label: `${center.district} район`, url: districtHubUrl(center.district) } : null,
      center.businessClass ? { label: `Класс ${center.businessClass}`, url: classHubUrl(center.businessClass) } : null,
      station ? { label: `м. ${station}`, url: metroHubUrl(station) } : null,
      { label: street, url: streetHubUrl(street) },
      center.microdistrict ? { label: center.microdistrict, url: microdistrictHubUrl(center.microdistrict) } : null,
    ].filter((c): c is { label: string; url: string } => c !== null && typeof c.url === 'string' && c.url.length > 0);
  }, [center]);
  // Цитаты отзывов из «Интересных фактов» — отдельным блоком «Что говорят»
  // вместе с рейтингами (Б11), а не россыпью по странице.
  const reviewQuotes = useMemo(
    () =>
      (center?.highlights ?? [])
        .filter((h) => h.icon === 'reviews')
        .flatMap((h) => h.text.split(/\n+/).map((l) => l.replace(/^[-–—•\s]+/, '').trim()).filter(Boolean))
        .slice(0, 4),
    [center],
  );

  // FAQ использует те же модели и выборки, что видимые блоки страницы.
  const faqItems = useMemo(() => {
    if (!center) return [];
    const items: { question: string; answer: string }[] = [];
    // Короткое имя, а не center.name: вопрос «Какой класс у «Бизнес-центр
    // «Порт»»?» читается как опечатка.
    const name = shortName(center);
    const add = (question: string, answer: string | null | undefined) => {
      if (answer?.trim()) items.push({ question, answer });
    };
    const fmt = (value: number) => value.toLocaleString('ru-RU');
    add(`Где находится «${name}»?`, center.address);
    add(
      `В каком административном районе находится «${name}»?`,
      redistributedTechnicalParams.administrativeDistrictText,
    );
    if (center.businessClass) add(`Какой класс у «${name}»?`, `Класс ${center.businessClass}.`);
    if (center.totalArea != null) add(`Какая общая площадь у «${name}»?`, `${fmt(center.totalArea)} м².`);
    if (center.floors != null) add(`Сколько этажей в «${name}»?`, String(center.floors));
    if (center.yearBuilt != null) add(`В каком году построен «${name}»?`, String(center.yearBuilt));
    if (center.status === 'under_construction') add('Здание уже построено?', 'Здание строится.');
    add(`Какая степень готовности у «${name}»?`, redistributedTechnicalParams.readinessText);
    add(`Кто застройщик «${name}»?`, center.developer);
    add(`Какая парковка у «${name}»?`, center.parking);
    if (center.officeArea != null) {
      const share =
        center.totalArea != null && center.totalArea > 0
          ? ` — ${Math.round((center.officeArea / center.totalArea) * 100)}% от общей площади`
          : '';
      add(`Какая офисная площадь у «${name}»?`, `${fmt(center.officeArea)} м²${share}.`);
    }
    if (gis2?.fetchedAt) {
      add(
        'На какую дату сведения 2ГИС?',
        `Организации, рейтинг, часы работы и атрибуты здания — срез от ${new Date(gis2.fetchedAt).toLocaleDateString('ru-RU')}.`,
      );
    }
    if (nearestMetro) add(`Какое метро рядом с «${name}»?`, `«${nearestMetro.name}» — ${nearestMetro.distanceMeters} м по прямой.`);
    for (const bar of marketPosition?.bars ?? []) {
      add(`${bar.label} в «${name}» — это много или мало для своего класса?`, `${fmt(bar.value)} ${bar.unit}; ${bar.baselines.map((b) => `${b.label}: ${fmt(b.value)} ${bar.unit}`).join('; ')}.${bar.note ? ` ${bar.note}.` : ''}`);
    }
    const neighbours = nearestNeighbours(center, centers ?? [], 5);
    if (neighbours.length) add('Какие бизнес-центры рядом на карте?', neighbours.map((n) => `${shortName(n.center)} — ${fmt(n.meters)} м по прямой`).join('; '));
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
    add(`Что есть внутри «${name}»?`, redistributedTechnicalParams.internalInfrastructureText);
    // Инфраструктура рядом появится отдельным картографическим блоком и в
    // карточке/FAQ пока не повторяется.
    add('Какие условия доступной среды указаны?', accessibilityAttributes);
    add('Какие часы работы указаны?', accessHoursText);
    if (offers !== null) {
      add('Сколько активных предложений аренды и продажи?', offers.length === 0
        ? NO_ACTIVE_OFFERS_MESSAGE
        : `Активных предложений: аренда — ${offers.filter((o) => o.dealType === 'rent').length}, продажа — ${offers.filter((o) => o.dealType === 'sale').length}.`);
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
    if (visibleHighlights.length) add('Какие факты о здании опубликованы?', visibleHighlights.map((h) => [h.label, h.text].filter(Boolean).join(': ')).join('\n'));
    const history = extractHistoryPoints(center);
    if (history.length) add('Что известно об истории здания?', history.map((h) => `${h.year}: ${h.text}`).join('; '));
    if (gis2?.tenantOrganizations.length) {
      const industries = new Map<string, number>();
      for (const org of gis2.tenantOrganizations) {
        const label = tenantIndustryLabel(org.industry);
        industries.set(label, (industries.get(label) ?? 0) + 1);
      }
      add('Сколько организаций в здании и каких отраслей?', `В списке 2ГИС ${gis2.tenantOrganizations.length} организаций: ${[...industries].map(([label, count]) => `${label} — ${count}`).join('; ')}. ${gis2.tenantOrganizationsTotal != null && gis2.tenantOrganizationsTotal > gis2.tenantOrganizations.length ? `Список неполный: в источнике указано ${gis2.tenantOrganizationsTotal} организаций. ` : ''}Это сведения о соседях и сервисах, не показатель загрузки здания или спроса.`);
    } else if (center.tenantOrganizations.length) {
      add('Какие организации и сервисы есть в здании?', `В списке ${center.tenantOrganizations.length} организаций: ${center.tenantOrganizations.map((o) => `${o.name}${o.category ? ` (${o.category})` : ''}`).join(', ')}.`);
    }
    // Рейтинг у нас приезжает из трёх мест (снимок 2ГИС, поле карточки,
    // свободный текст фактов) — но для читателя это ОДИН вопрос. Три
    // отдельных вопроса про одну и ту же оценку читаются как заполнение
    // объёма, поэтому собираем их в один ответ.
    const ratingParts = [
      gis2?.reviews?.orgRating != null
        ? `2ГИС — ${gis2.reviews.orgRating}${gis2.reviews.orgReviewCount != null ? ` (оценок: ${gis2.reviews.orgReviewCount})` : ''}`
        : center.gisRating != null
          ? `2ГИС — ${center.gisRating}${center.gisReviewCount != null ? ` (оценок: ${center.gisReviewCount})` : ''}`
          : null,
      mapRating ? `${mapRating.source} — ${mapRating.label}` : null,
    ].filter(Boolean);
    if (ratingParts.length) add(`Какая оценка у «${name}» на картах?`, `${ratingParts.join('; ')}.`);
    if (reviewQuotes.length) add('Что пишут в отзывах?', reviewQuotes.join('\n'));
    add('Как исправить сведения о здании?', 'Напишите на anatoly.trashman@gmail.com, указав бизнес-центр и сведения, которые устарели или требуют исправления.');
    // Тот же вызов, что и в самом блоке «Похожие»: соседи из него
    // исключены, иначе FAQ перечислял бы не то, что видно на странице.
    const neighbourSlugs = new Set(neighbours.map((n) => n.center.slug));
    const similar = similarCenters(center, centers ?? [], 6, neighbourSlugs);
    if (similar.length) add('Какие бизнес-центры показаны как похожие?', similar.map(shortName).join(', '));
    if (hubChips.length) add('Какие связанные подборки доступны?', hubChips.map((c) => c.label).join(', '));
    return items;
  }, [center, centers, nearestMetro, marketPosition, accessibilityAttributes, accessHoursText, offers, offersSummary, rentRows, saleRows, visibleHighlights, gis2, mapRating, reviewQuotes, hubChips, redistributedTechnicalParams]);

  // Б7: липкое меню «На странице». Пункт появляется только если
  // соответствующий блок реально отрисован — ссылка на несуществующий
  // якорь никуда не ведёт и выглядит поломкой.
  const pageSections = useMemo(() => {
    if (!center) return [];
    const has = (id: string, cond: boolean) => (cond ? { id, label: SECTION_LABELS[id] } : null);
    return [
      has('facts', visibleHighlights.length > 0),
      has('metroCenters', relatedCenters.metro.length > 0),
      has('market', Boolean(marketPosition && marketPosition.bars.length > 0)),
      has('map', center.lat != null && center.lng != null),
      has(
        'tech',
        redistributedTechnicalParams.buildingInformationRows.length > 0 ||
          Boolean(center.parking || accessHoursText || accessibilityAttributes),
      ),
      has('streetCenters', relatedCenters.street.length > 0),
      has('tenants', hasTenantOrganizations || center.tenantOrganizations.length > 0),
      has('rental', Boolean(center.rentalInfo)),
      has('offers', offers !== null),
      has('history', extractHistoryPoints(center).length >= 2),
      has('reviews', center.gisRating != null || center.highlights.some((h) => h.icon === 'rating') || reviewQuotes.length > 0),
      has('similar', true),
      has('faq', faqItems.length > 0),
    ].filter((v): v is { id: string; label: string } => v !== null);
  }, [
    center,
    marketPosition,
    offers,
    visibleHighlights,
    hasTenantOrganizations,
    faqItems,
    redistributedTechnicalParams,
    reviewQuotes,
    relatedCenters,
    accessHoursText,
    accessibilityAttributes,
  ]);

  useEffect(() => {
    if (!center) return;
    setBusinessCenterPageMeta(center.slug, center, center.photos[0]);
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
      url: `https://redevelopment.pro/minsk/bcminsk/${center.slug}`,
      address: center.address,
      image: center.photos[0],
      lat: center.lat,
      lng: center.lng,
      amenities: [
        ...center.infraInternal,
        ...(center.is24x7 ? ['Круглосуточный доступ'] : []),
        ...(center.accessibility.length > 0 ? ['Доступная среда'] : []),
      ],
    });
    return () => setPlaceJsonLd(null);
  }, [center]);

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

  const displayAddress = /^г\.\s*Минск(?:,|\s)/i.test(center.address)
    ? center.address
    : `г. Минск, ${center.address}`;
  const centerWebsiteUrl = businessCenterHomepageUrl(center.website);
  const streetName = streetOfAddress(center.address);
  const streetCatalogUrl = streetHubUrl(streetName);
  const metroCatalogUrl =
    nearestMetro && metroHubDistance(center, nearestMetro.name) !== null
      ? metroHubUrl(nearestMetro.name)
      : null;

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
        <main className="min-w-0 xl:pt-11">
        <div className={cn('overflow-hidden', glassCardClass)} style={glassCardShadow}>
          {/* Компактная версия первого экрана: на широком экране фото и
              основная сводка стоят рядом. Прежняя вертикальная версия целиком
              сохранена в родительском коммите этой правки и откатывается
              одним revert без затрагивания остальных блоков страницы. */}
          <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-muted/70 lg:aspect-auto lg:min-h-[28rem]">
              <PhotoBlock
                center={center}
                variant="detail"
                fit={center.slug === 'port' || center.slug === 'victoria-plaza' ? 'cover' : 'contain'}
              />
              <Badge
                tone={center.status === 'under_construction' ? 'warning' : 'success'}
                className="absolute right-4 top-4 shadow-sm backdrop-blur-sm"
              >
                {center.status === 'under_construction' ? 'Строится' : 'Построен'}
              </Badge>
            </div>

            <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <h1 className="text-2xl font-extrabold leading-tight text-ink">{center.name}</h1>
              <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm font-semibold text-ink-muted">
                {/* Рейтинг с Яндекс.Карт/2ГИС — владелец, 2026-09-06 (четвёртый
                    заход): "справа от заголовка рейтинг с яндекс.карт, а из
                    интересных фактов инфу про оценку убирай". Раньше рейтинг
                    был просто одним из блоков "Интересные факты" (свободный
                    markdown-текст вида "Яндекс.Карты: **5,0** из 5 (204
                    оценки...)") — структурного поля под число нет, поэтому
                    парсим ту же строку регуляркой (extractMapRating ниже) —
                    если формат не узнан, бейдж просто не показывается, ничего
                    не выдумываем. */}
                {mapRating && (
                  <span className="inline-flex items-center gap-1.5 leading-none">
                    <Star className="h-3 w-3 shrink-0 translate-y-px fill-amber-400 text-amber-500" />
                    {mapRating.label} · На Яндекс.Картах
                  </span>
                )}
                {/* Рейтинг 2ГИС — отдельный источник от Яндекс.Карт выше,
                    оба честно подписаны, не смешиваются в один бейдж
                    (владелец, 2026-09-06: "выведи всю инфу, которую мы
                    спарсили"). org_review_count может быть null у части
                    записей (реже — только рейтинг без числа оценок). */}
                {gis2?.reviews?.orgRating != null && (
                  <span className="inline-flex items-center gap-1.5 leading-none">
                    <Star className="h-3 w-3 shrink-0 fill-current" />
                    {gis2.reviews.orgRating.toLocaleString('ru-RU')} · 2ГИС
                    {gis2.reviews.orgReviewCount != null && ` (${gis2.reviews.orgReviewCount})`}
                  </span>
                )}
              </div>
            </div>

            {/* Район, адрес и метро — три горизонтальные строки:
                подпись, тире и значение находятся на одной базовой линии. */}
            <section className="rounded-2xl border border-border bg-surface-muted/60 px-3.5 py-3" aria-labelledby="location-summary-title">
              <h2 id="location-summary-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Расположение
              </h2>
              <div className="mt-2.5 space-y-2">
                {redistributedTechnicalParams.administrativeDistrictText && (
                  <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_auto_minmax(0,1fr)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      Административный район
                    </p>
                    <span className="hidden text-xs text-ink-muted sm:inline" aria-hidden="true">—</span>
                    <p className="mt-0.5 min-w-0 text-sm leading-snug text-ink sm:mt-0">
                      {redistributedTechnicalParams.administrativeDistrictText}
                    </p>
                  </div>
                )}
                <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_auto_minmax(0,1fr)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Адрес</p>
                  <span className="hidden text-xs text-ink-muted sm:inline" aria-hidden="true">—</span>
                  <p className="mt-0.5 min-w-0 text-sm leading-snug text-ink sm:mt-0">
                    {displayAddress}
                  </p>
                </div>
                {(nearestMetro || center.metro) && (
                  <div className="grid min-w-0 items-baseline gap-x-2 sm:grid-cols-[max-content_auto_minmax(0,1fr)]">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Метро</p>
                    <span className="hidden text-xs text-ink-muted sm:inline" aria-hidden="true">—</span>
                    <p className="mt-0.5 min-w-0 text-sm leading-snug text-ink sm:mt-0">
                      {nearestMetro ? (
                        <>
                          «{nearestMetro.name}» — {nearestMetro.distanceMeters} м по прямой
                        </>
                      ) : (
                        center.metro
                      )}
                    </p>
                  </div>
                )}
              </div>
            </section>
            {(center.developer || centerWebsiteUrl) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                {center.developer && (
                  <span>
                    <span className="font-semibold text-ink">Застройщик:</span> {center.developer}
                  </span>
                )}
                {centerWebsiteUrl && (
                  <a
                    href={centerWebsiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary-hover hover:underline"
                  >
                    Сайт БЦ
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}

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
                широком экране заполняет свободную область справа от фото. */}
            {redistributedTechnicalParams.internalInfrastructureText && (
              <InternalInfrastructureRow
                text={redistributedTechnicalParams.internalInfrastructureText}
                compact
              />
            )}

            </div>
          </div>
        </div>

        {/* "Интересные факты" — произвольный набор блоков, разный у каждого
            БЦ (владелец, 2026-09-06, второй заход: "старайся делать
            кастомную страницу под каждый БЦ. Если у БЦ нет наград, не
            делай этот блок вообще. Если есть что-то новое — кастомный
            блок"). Раньше был фиксированный объект (history/tenants/media/
            rating/reviews), теперь — HighlightSection[] (см. комментарий у
            BusinessCenter.highlights в data/businessCenters.ts). icon
            'warning' — единственная особая: выносится наверх акцентным
            жёлтым блоком (как caveat в RentalInfo), а не в общий список.
            По решению владельца от 2026-09-17 блок расположен сразу после
            главной карточки и связанных подборок, перед сравнением с
            конкурентами. */}
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

        {metroCatalogUrl && nearestMetro && relatedCenters.metro.length > 0 && (
          <RelatedCentersSection
            id="metroCenters"
            icon={TrainFront}
            eyebrow="Метро"
            title={`Бизнес-центры у станции «${nearestMetro.name}»`}
            centers={relatedCenters.metro}
            catalogUrl={metroCatalogUrl}
            catalogLabel={`Все БЦ у станции «${nearestMetro.name}»`}
          />
        )}

        {/* Сначала аналитика и расположение, затем отдельная карточка
            с параметрами самого здания. */}
        {center && marketPosition && <MarketPositionBlock position={marketPosition} />}
        {center && <NeighboursBlock center={center} all={centers ?? []} />}

        <div id="tech" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            Информация о здании
          </h2>
          {(center.parking || accessHoursText || accessibilityAttributes) && (
            <section className="flex flex-col gap-2" aria-labelledby="operations-title">
              <h3 id="operations-title" className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Эксплуатация и доступность
              </h3>
              <div className="overflow-hidden rounded-control border border-border">
                {center.parking && <OperationalInfoRow icon={Car} label="Парковка" text={center.parking} />}
                {accessHoursText && (
                  <OperationalInfoRow
                    icon={Clock}
                    label="Часы работы"
                    text={accessHoursText.toLocaleLowerCase('ru-RU') === 'круглосуточно' ? '24/7' : accessHoursText}
                  />
                )}
                {accessibilityAttributes && <AccessibilityRow text={accessibilityAttributes} />}
              </div>
            </section>
          )}
          {redistributedTechnicalParams.buildingInformationRows.length > 0 && (
          <div className="overflow-hidden rounded-control border border-border">
            <table className="w-full border-collapse text-sm">
              <tbody>
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
              </tbody>
            </table>
          </div>
          )}
        </div>

        {streetCatalogUrl && relatedCenters.street.length > 0 && (
          <RelatedCentersSection
            id="streetCenters"
            icon={MapPin}
            eyebrow="Улица"
            title="Бизнес-центры на этой улице"
            centers={relatedCenters.street}
            catalogUrl={streetCatalogUrl}
            catalogLabel="Все БЦ на этой улице"
          />
        )}

        {/* Кто сидит в здании. Основной источник — организации 2GIS по
            building_id с рубриками, из них считается диаграмма отраслей (Б9,
            docs/bc-catalog-redesign-plan.md). Ниже — прежний блок из
            веб-архива Яндекс.Карт, он остаётся фолбэком для зданий, куда
            2GIS ещё не доехал: там есть названия и категории, но нет рубрик
            2GIS, а значит и отраслей с городским сравнением не построить.

            Организации внутри здания — владелец, 2026-09-06 (третий заход):
            "давай сделаем ещё блок арендаторов внутри БЦ... сгруппировать,
            на первое место ставь места с максимумом отзывов на картах".
            Источник — карусель "Организации внутри" на Яндекс.Картах
            (веб-архив) — она отдаёт только название+категорию на каждую
            организацию, БЕЗ числа отзывов на неё саму (в отличие от
            рейтинга/отзывов всего здания в блоке выше). Настоящей сортировки
            "по числу отзывов" на уровне отдельной организации из этих данных
            не построить — группы отсортированы по размеру (категории с
            большим числом организаций первыми) как ближайший доступный
            прокси, без выдумывания цифр (см. комментарий у
            BusinessCenter.tenantOrganizations в data/businessCenters.ts). */}
        {gis2 && gis2.tenantOrganizations.length > 0 ? (
          <TenantIndustriesBlock
            organizations={gis2.tenantOrganizations}
            total={gis2.tenantOrganizationsTotal}
            fetchedAt={gis2.tenantOrganizationsFetchedAt}
            cityProfile={tenantCityProfile}
          />
        ) : (
          center.tenantOrganizations.length > 0 && <TenantOrganizationsBlock organizations={center.tenantOrganizations} />
        )}

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
            реально нашлось. */}
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
            2026-09-05 в docs/session-journal.md. */}
        {offers !== null && (
          <div id="offers" className={cn('mt-6 flex scroll-mt-32 flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Сейчас предлагается</h2>
            {offers.length === 0 ? (
              <div className="flex flex-col gap-2 text-sm text-ink-muted">
                <p>
                  {NO_ACTIVE_OFFERS_MESSAGE} Это не значит, что
                  свободных площадей нет: часть бизнес-центров сдаёт офисы напрямую через управляющую
                  компанию, минуя площадки.
                </p>
                {centerWebsiteUrl ? (
                  <a
                    href={centerWebsiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit font-semibold text-primary-hover hover:underline"
                  >
                    Официальный сайт бизнес-центра →
                  </a>
                ) : (
                  <Link to="/minsk/bcminsk?facts=rent" className="w-fit font-semibold text-primary-hover hover:underline">
                    Посмотреть бизнес-центры, где объявления есть →
                  </Link>
                )}
              </div>
            ) : (
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
            )}
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

        {center && <HistoryTimeline center={center} />}
        {center && <WhatTheySayBlock center={center} reviewQuotes={reviewQuotes} />}
        {/* Б12. Собственникам и УК — способ поправить данные. Пишем прямо
            в почту: отдельной формы с лидом здесь не заводим, это не заявка
            на аренду, а правка справочника, и ответить на неё должен
            человек. */}
        {center && (
          <div className={cn('mt-6 flex flex-col gap-2 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Вы собственник или управляющая компания?</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Данные по зданию собраны из открытых источников — prometr.by, 2ГИС, объявления Kufar и
              Realt. Если что-то устарело или указано неверно, напишите: поправим и пересчитаем
              сравнения и индекс.
            </p>
            <a
              href={`mailto:anatoly.trashman@gmail.com?subject=${encodeURIComponent(`Данные бизнес-центра «${shortName(center)}»`)}`}
              className="w-fit text-sm font-semibold text-primary-hover hover:underline"
            >
              anatoly.trashman@gmail.com
            </a>
          </div>
        )}

        {center && <SimilarCentersBlock center={center} all={centers ?? []} offers={offerIndex} hubChips={hubChips} />}

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
            <div className="flex flex-col divide-y divide-border">
              {faqItems.map((item) => (
                <div key={item.question} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold text-ink">{item.question}</p>
                  <p className="text-sm leading-relaxed text-ink-muted">{item.answer}</p>
                </div>
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
          {/* Организации, рейтинг, часы работы и атрибуты — это
              срез 2ГИС на конкретную дату, а не «сейчас». Дата обязана
              стоять рядом с данными, а не подразумеваться. */}
          {gis2?.fetchedAt && (
            <p className="text-sm text-ink-muted">
              Данные 2ГИС (организации, рейтинг, часы работы, атрибуты здания) —
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
  icon: Icon,
  eyebrow,
  title,
  centers,
  catalogUrl,
  catalogLabel,
}: {
  id: string;
  icon: typeof MapPin;
  eyebrow: string;
  title: string;
  centers: BusinessCenter[];
  catalogUrl: string;
  catalogLabel: string;
}) {
  const visible = centers.slice(0, 3);
  return (
    <section id={id} className={cn('mt-6 scroll-mt-32 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{eyebrow}</p>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((related) => (
          <Link
            key={related.slug}
            to={`/minsk/bcminsk/${related.slug}`}
            className="group overflow-hidden rounded-2xl border border-border bg-surface transition-transform hover:-translate-y-0.5"
          >
            <div className="aspect-[4/3] overflow-hidden bg-surface-muted">
              <PhotoBlock center={related} variant="card" />
            </div>
            <p className="px-4 py-3 text-sm font-bold leading-snug text-ink transition-colors group-hover:text-primary-hover">
              {shortName(related)}
            </p>
          </Link>
        ))}
        {centers.length > 3 && (
          <Link
            to={catalogUrl}
            className="group flex min-h-40 flex-col justify-between rounded-2xl border border-primary/20 bg-primary-soft p-5 text-ink transition-transform hover:-translate-y-0.5"
          >
            <Icon className="h-7 w-7 text-primary" />
            <span className="flex items-end justify-between gap-3">
              <span className="text-sm font-bold leading-snug">{catalogLabel}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
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

// Сколько категорий показывать сразу — у части БЦ (владелец, 2026-09-06:
// "ограничь список видимых категорий с кнопкой «показать ещё»") реальная
// страница "Организации внутри" на Яндекс.Картах даёт не карусель из
// 6-10 позиций, а полный список зарегистрированных на адрес юрлиц — у
// "Паруса", например, 160+ категорий одним полотном. Первый экран остаётся
// компактным, весь список доступен по клику, без ограничения на бэкенде.
const VISIBLE_TENANT_CATEGORIES = 8;

// "5 категорий"/"2 категории"/"1 категорию" — числительное требует разного
// падежа/числа (тот же принцип, что и pluralOrganizations в DistrictQuarterMap.tsx).
function pluralCategories(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'категорию';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'категории';
  return 'категорий';
}

function TenantOrganizationsBlock({ organizations }: { organizations: TenantOrganization[] }) {
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => groupTenantOrganizations(organizations), [organizations]);
  const visibleGroups = expanded ? groups : groups.slice(0, VISIBLE_TENANT_CATEGORIES);
  const hiddenCount = groups.length - visibleGroups.length;

  return (
    <div id="tenants" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Building2 className="h-5 w-5 shrink-0 text-primary" />
        Организации в здании
      </h2>
      {/* Владелец, 2026-09-06 (третий заход): "предложи более компактный
          способ — плитки занимают слишком много места, а полезной инфы
          немного". Раньше на каждую категорию уходило 2 строки (заголовок
          категории отдельно + отдельный ряд плашек-названий) — теперь
          категория и список названий в одной строке ("Категория (N):
          названия через запятую"), обычным текстом без плашек-фонов —
          при 150+ категориях у "Паруса" разница в высоте блока в разы. */}
      <div className="flex flex-col divide-y divide-border">
        {visibleGroups.map((group) => (
          <p key={group.category} className="py-1.5 text-sm leading-relaxed first:pt-0 last:pb-0">
            <span className="font-semibold text-ink">
              {group.category} <span className="text-ink-muted">({group.items.length})</span>:
            </span>{' '}
            <span className="text-ink-muted">{group.items.join(', ')}</span>
          </p>
        ))}
      </div>
      {groups.length > VISIBLE_TENANT_CATEGORIES && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-sm font-semibold text-primary-hover hover:underline"
        >
          {expanded ? 'Свернуть' : `Показать ещё ${hiddenCount} ${pluralCategories(hiddenCount)}`}
        </button>
      )}
      <p className="text-xs text-ink-muted">
        Информация из Яндекс.Карт — полный список организаций мог измениться.
      </p>
    </div>
  );
}

// Группировка "Организации в здании" по категории — без реального числа
// отзывов на каждую организацию (см. комментарий в JSX выше) сортируем
// группы по размеру (больше организаций одной категории — выше), внутри
// группы — по алфавиту. "Без категории" (пустая строка из формы) — всегда
// последней группой, не мешает содержательным категориям наверху.
function groupTenantOrganizations(orgs: TenantOrganization[]): { category: string; items: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const org of orgs) {
    const category = org.category.trim() || 'Без категории';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(org.name);
  }
  return Array.from(groups.entries())
    .map(([category, items]) => ({ category, items: [...items].sort((a, b) => a.localeCompare(b, 'ru')) }))
    .sort((a, b) => {
      if (a.category === 'Без категории') return 1;
      if (b.category === 'Без категории') return -1;
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      return a.category.localeCompare(b.category, 'ru');
    });
}

// сам текст, ничего не рендерит, если по этому разделу нашлось не найдено
// (text === null) — не показываем пустые подписи.
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

function OperationalInfoRow({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof FileText;
  label: string;
  text: string;
}) {
  return (
    <div className="grid gap-2 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(11rem,2fr)_3fr] sm:items-start">
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon className="h-4 w-4 shrink-0 text-ink-muted" />
        <p className="text-sm font-medium">{label}</p>
      </div>
      <div className="whitespace-pre-line text-sm leading-relaxed text-ink">{text}</div>
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

function InternalInfrastructureRow({ text, compact = false }: { text: string; compact?: boolean }) {
  const items = text
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

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

function AccessibilityRow({ text }: { text: string }) {
  const items = text
    .split(/[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(11rem,2fr)_3fr] sm:items-start">
      <div className="flex items-center gap-2 text-ink-muted">
        <Accessibility className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">Доступная среда</p>
      </div>
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
