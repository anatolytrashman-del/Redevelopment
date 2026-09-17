import { GENERAL_DATA_SOURCES } from '../data/businessCenterSources';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Building2,
  Calendar,
  Camera,
  DollarSign,
  HardHat,
  Layers,
  MapPin,
  Ruler,
  TrainFront,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { PhotoBlock, FactRow, FactTile } from '../components/businessCenters/BusinessCenterVisuals';
import { CatalogFilterPanel } from '../components/businessCenters/CatalogFilterPanel';
import { CatalogCompare } from '../components/businessCenters/CatalogCompare';
import {
  setArticleJsonLd,
  setBreadcrumbJsonLd,
  setFaqJsonLd,
  setGenericPageMeta,
  setNoIndex,
  clearNoIndex,
} from '../lib/pageMeta';
import { businessClassTone, shortAddress, shortMetro, shortName, streetOfAddress } from '../lib/businessCenterDisplay';
import {
  CLASS_SLUG_TO_VALUE,
  DISTRICT_SLUG_TO_NAME,
  MICRODISTRICT_SLUG_TO_NAME,
  classDistrictHubUrl,
  classHubUrl,
  districtHubUrl,
  districtPrepositional,
  microdistrictHubUrl,
  METRO_SLUG_TO_STATION,
  metroHubUrl,
  metroHubDistance,
  STREET_SLUG_TO_NAME,
  streetHubUrl,
} from '../lib/businessCenterHubs';
import { BUSINESS_CENTER_CLASSES, type BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { fetchExternalMetrics, fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { fetchBusinessCenterLotSizes } from '../lib/businessCenterOffersApi';
import {
  AvailableNowBlock,
  DistrictDensityBlock,
  ManagementBlock,
  MarketContextBlock,
} from '../components/businessCenters/CatalogMarketBlocks';
import { SOURCE_LABELS, MIN_RELIABLE_N, type ExternalMetric, type MarketSnapshot } from '../data/marketSnapshots';
import {
  EMPTY_CATALOG_FILTER,
  MAX_COMPARE,
  METRO_WITHIN_OPTIONS,
  buildOfferIndex,
  catalogFilterToQuery,
  catalogSummary,
  hasActiveCatalogFilter,
  matchesCatalogFilter,
  nearestMetroMeters,
  catalogMetroStations,
  parseCatalogFilter,
  unverifiableByMetroStation,
  sortCatalogCenters,
  type CatalogFilterState,
} from '../lib/businessCenterCatalogFilter';

// Справочная SEO-страница по бизнес-центрам Минска (владелец, 2026-09-04) —
// см. комментарий в data/businessCenters.ts про источник списка и принцип
// "не выдумываем факты, чего нет — то не показываем". По структуре и
// визуальному языку — младшая сестра DistrictGuidePage.tsx (тот же
// glassCard/шапка с логотипом, тот же hero с HeroImageSlider), владелец
// прямо попросил "структуру первого блока и бокового меню" оттуда же.
//
// TITLE/DESCRIPTION — meta-теги (title/og/canonical), не то же самое, что
// видимые PAGE_H1/INTRO_TEXT ниже (тот же принцип разведения, что и в
// DistrictGuidePage.tsx — см. комментарий там от 2026-08-24 про путаницу
// "описание страницы" = INTRO_TEXT, а не meta-DESCRIPTION).
const TITLE = 'Бизнес-центры Минска — список, адреса, класс, площадь';
const DESCRIPTION =
  'Справочник бизнес-центров Минска: адреса, деловой класс, площадь, год постройки, застройщик и управляющая компания.';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk';
const UNDER_CONSTRUCTION_HUB_URL = 'https://redevelopment.pro/minsk/bcminsk/stroyashchiesya';
const OG_IMAGE = 'https://redevelopment.pro/og-image.png';

// Заголовок и подзаголовок hero — первая версия составлена Gemini (через
// ProxyAPI), владелец переписал вручную (2026-09-04), затем ещё раз попросил
// переформулировать: "не нравится слово «всех» и «помогаем»" — выбрал из
// трёх предложенных вариантов ("А").
const PAGE_H1 = 'Бизнес-центры Минска: аналитика для аренды и покупки офиса';
const INTRO_TEXT =
  'Сравнивайте бизнес-центры Минска по классу, площади и расположению — для инвестиций, аренды или покупки офиса.';

// Тот же снимок «Футуриса» в исходном размере 1600×1067 (Domovita).
// Источник: https://domovita.by/bc-bcfuturis — фото 4.
const HERO_IMAGES: string[] = ['/images/business-centers-hero/futuris-1600.jpg'];
const HERO_IMAGE_WIDTH = 1600;
const HERO_IMAGE_HEIGHT = 1067;

// Карта каталога и переключатель вида сняты с первого экрана 2026-09-17:
// владелец оставил единый карточный режим и компактные фильтры в сайдбаре.

// Только дата последнего пересмотра фактов/добавления БЦ — держать в одном
// месте, тот же принцип, что и DATE_MODIFIED в DistrictGuidePage.tsx.
const DATE_MODIFIED = '2026-09-06';

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

// Тот же принцип, что и в DistrictGuidePage.tsx — не фейковая дата, а честный
// месяц пересмотра, считается от текущей даты на каждый рендер.
const UPDATED_BADGE_LABEL = (() => {
  const now = new Date();
  return `Обновлено: ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
})();

// Значение district вне обычных городских районов (сейчас — только "Аден" в
// индустриальном парке "Великий камень", см. data/businessCenters.ts) —
// владелец: "переименуй За городом в Великий камень, и поставь вниз" — в
// фильтре и списке всегда последним, не по алфавиту вместе с районами.
const OUT_OF_TOWN_DISTRICT = 'Великий камень';

// Сколько карточек рисуем за раз. 48 — шестнадцать рядов по три на
// десктопе: на любом экране это заведомо больше одного «пролистывания», а
// красить 143 стеклянные карточки разом больше не приходится (ради этого
// раньше стоял content-visibility, см. комментарий в BusinessCenterCard).
const CARDS_PAGE_SIZE = 48;

// Параметры строки запроса, любое присутствие которых делает состояние
// каталога неиндексируемым (см. filterIsIndexable ниже).
const FILTER_QUERY_KEYS = ['class', 'district', 'microdistrict', 'metro', 'station', 'lot', 'facts', 'q', 'view', 'sort', 'compare'];

// Карточка каталога (К7 плана docs/bc-catalog-redesign-plan.md).
//
// Было: фото 16:10 и пять строк справочника — адрес, площадь, срок сдачи,
// этажность, метро — плюс пилюля «Подробнее». По таким карточкам нельзя
// было выбирать: 143 штуки подряд выглядели одинаково, а главного (сколько
// стоит и есть ли вообще что снять) на них не было вовсе.
//
// Стало: фото ниже (16:9 вместо 16:10, по 4 в ряд на широком экране),
// сверху — авто-бейдж «чем выделяется» (К8), в теле — то, по чему реально
// сравнивают: метро в метрах, площадь и типовой этаж, ставка с числом
// лотов, рейтинг 2ГИС, УК/ТС и парковка. Пилюля «Подробнее» убрана — вся
// карточка и так ссылка, а место она занимала на каждой из 143 штук.
//
// Про «объявлений нет»: это ЧЕСТНАЯ строка, а не пробел. Здание без лотов
// на Kufar и Realt — полезный факт (сдаёт через УК напрямую либо занято),
// и молчать о нём хуже, чем сказать.
function BusinessCenterCard({
  center,
  metroStation,
  compared,
  onToggleCompare,
}: {
  center: BusinessCenter;
  metroStation?: string | null;
  compared: boolean;
  onToggleCompare: (slug: string) => void;
}) {
  // На хабе станции — точное расстояние 2GIS до НЕЁ; иначе до ближайшей.
  const metroDistance = metroStation ? metroHubDistance(center, metroStation) : nearestMetroMeters(center);
  const metroLabel = metroStation
    ? `«${metroStation}»`
    : center.nearestMetroStations.length > 0
      ? `«${[...center.nearestMetroStations].sort((a, b) => a.distanceMeters - b.distanceMeters)[0].name}»`
      : null;
  return (
    <Link
      to={`/minsk/bcminsk/${center.slug}`}
      className={cn(
        'group block min-w-0 self-start overflow-hidden transition-transform hover:-translate-y-0.5',
        glassCardClass,
      )}
      style={glassCardShadow}
    >
      <div className="relative w-full overflow-hidden" style={{ paddingTop: '62.5%' }}>
        <div className="absolute inset-0">
          <PhotoBlock center={center} variant="card" />
        </div>
        <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1.5">
          {center.status === 'under_construction' && <Badge tone="warning">Строится</Badge>}
          {center.businessClass && (
            <Badge tone={businessClassTone[center.businessClass]}>Класс {center.businessClass}</Badge>
          )}
        </div>
        {/* Отметка «сравнить» лежит поверх ссылки-карточки, поэтому клик
            обязан не всплывать: иначе отметка уводила бы на страницу БЦ. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleCompare(center.slug);
          }}
          aria-pressed={compared}
          aria-label={compared ? 'Убрать из сравнения' : 'Добавить к сравнению'}
          className={cn(
            'absolute bottom-2 right-2 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm transition-colors',
            compared ? 'bg-primary text-white' : 'bg-white/90 text-ink-muted hover:text-ink',
          )}
        >
          {compared ? 'В сравнении' : 'Сравнить'}
        </button>
      </div>
      {/* Карточка — обычный блок: её высоту задают рамка фото и текст.
          Процентная высота картинки не участвует в расчёте строки grid. */}
      <div className="flex flex-col gap-2.5 p-4">
        <h2 className="text-base font-bold leading-snug text-ink">{center.name}</h2>

        <div className="flex flex-col gap-1.5">
          <FactRow icon={MapPin}>{shortAddress(center.address)}</FactRow>
          {center.totalArea != null && (
            <FactRow icon={Ruler}>Площадь: {center.totalArea.toLocaleString('ru-RU')} м²</FactRow>
          )}
          {center.yearBuilt != null && <FactRow icon={Calendar}>Срок сдачи: {center.yearBuilt} г.</FactRow>}
          {center.floors != null && <FactRow icon={Layers}>Этажность: {center.floors}</FactRow>}
          {metroDistance != null && metroLabel ? (
            <FactRow icon={TrainFront}>
              До {metroLabel}: {metroDistance} м по прямой
            </FactRow>
          ) : (
            center.metro && <FactRow icon={TrainFront}>Метро: {shortMetro(center.metro)}</FactRow>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            Подробнее
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// Хаб-страницы по классу/району (Fable-анализ, 2026-09-06 — "нужны страницы
// вида /minsk/bcminsk/class-a/, /minsk/bcminsk/centralny/... каждая со
// своим H1... блок ссылок на них — на каталоге и в карточках"). Один и тот
// же компонент обслуживает три роута — общий каталог `/minsk/bcminsk`,
// `/minsk/bcminsk/class/:classSlug` и `/minsk/bcminsk/raion/:districtSlug`
// (см. App.tsx) — фильтр больше не локальный useState, а производный от
// URL через useParams(): пункты бокового меню стали обычными <Link>, сама
// навигация и есть применение фильтра (клиентский роутинг, без перезагрузки
// страницы — так же мгновенно, как раньше onClick+setState, но URL теперь
// настоящий, индексируемый, с уникальным title/H1/canonical). Сознательное
// упрощение: класс и район не комбинируются в одном URL (как и в примерах
// самого документа) — выбор одной оси сбрасывает другую.
// underConstruction — ось «Строящиеся бизнес-центры» (/minsk/bcminsk/
// stroyashchiesya, аудит поиска 2026-09-07: срез «строящиеся БЦ 2026–2027»).
// Не комбинируется с классом/районом (та же логика, что у микрорайона):
// объектов в стройке единицы, пересечения дали бы пустые страницы.
// «по 1 зданию» / «по 4 зданиям» — дательный падеж для подписи под
// медианой ставки: «по 1 зданиям» читается как опечатка и подрывает
// доверие к самой цифре.
function pluralBuildingsDative(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'зданию' : 'зданиям';
}

function pluralBusinessCenters(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'бизнес-центр';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'бизнес-центра';
  return 'бизнес-центров';
}

export function BusinessCentersMinskPage({ underConstruction = false }: { underConstruction?: boolean } = {}) {
  const { classSlug, districtSlug, microdistrictSlug, metroSlug, streetSlug } = useParams<{
    classSlug?: string;
    districtSlug?: string;
    microdistrictSlug?: string;
    metroSlug?: string;
    streetSlug?: string;
  }>();
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [officeSnapshots, setOfficeSnapshots] = useState<MarketSnapshot[] | null>(null);
  const [externalMetrics, setExternalMetrics] = useState<ExternalMetric[] | null>(null);
  // Только слаг и площадь каждого лота (~618 строк, два поля) — для фильтра
  // «нужен офис от N м²» и блока «Сейчас сдаётся» (К13).
  const [lotSizes, setLotSizes] = useState<{ businessCenterSlug: string; size: number }[] | null>(null);
  // Состояние фильтра живёт в URL, не в useState (К4): хаб-URL задаёт одну
  // ось и остаётся индексируемым входом, всё остальное — query-параметры,
  // которыми можно поделиться ссылкой. Раньше клиентским был только
  // мультивыбор станций метро, и он молча терялся при любой навигации.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [visibleCount, setVisibleCount] = useState(CARDS_PAGE_SIZE);

  const classFilter = classSlug ? (CLASS_SLUG_TO_VALUE[classSlug] ?? null) : null;
  const districtFilter = districtSlug ? (DISTRICT_SLUG_TO_NAME[districtSlug] ?? null) : null;
  // Микрорайон — отдельная, НЕ комбинируемая с классом/районом ось (владелец,
  // 2026-09-07: "Бизнес-центры Уручье" и т.п.) — своя ветка роутинга
  // (App.tsx), поэтому classSlug/districtSlug на этом маршруте всегда пусты.
  const microdistrictFilter = microdistrictSlug ? (MICRODISTRICT_SLUG_TO_NAME[microdistrictSlug] ?? null) : null;
  // Невалидный slug в /class/:classSlug или /raion/:districtSlug — не
  // существующий класс/район, не просто "пусто" (тот же принцип soft-404,
  // что и у неизвестного :slug на BusinessCenterDetailPage.tsx).
  const badClassSlug = Boolean(classSlug) && classFilter === null;
  const badDistrictSlug = Boolean(districtSlug) && districtFilter === null;
  const badMicrodistrictSlug = Boolean(microdistrictSlug) && microdistrictFilter === null;
  // Метро — ещё одна независимая ось (аудит 2026-09-07), см. METRO_STATION_SLUGS.
  const metroFilter = metroSlug ? (METRO_SLUG_TO_STATION[metroSlug] ?? null) : null;
  const badMetroSlug = Boolean(metroSlug) && metroFilter === null;
  // Станция есть в списке, но ни одного БЦ в радиусе — тот же soft-404, что
  // и у пустого пересечения класс×район.
  const metroEmpty =
    metroFilter !== null && centers !== null && !centers.some((c) => metroHubDistance(c, metroFilter) !== null);
  // Улица — ещё одна независимая ось (аудит 2026-09-07), см. STREET_SLUGS.
  const streetFilter = streetSlug ? (STREET_SLUG_TO_NAME[streetSlug] ?? null) : null;
  const badStreetSlug = Boolean(streetSlug) && streetFilter === null;
  // Пересечение класс×район без единого БЦ (владелец, 2026-09-06: "делай
  // структуру урлов [дерево пересечений]") — тот же soft-404, что и у
  // невалидного slug: сам план (`BCMINSK_SEO_PLAN.md`) явно предупреждал не
  // генерировать хаб для комбинации без единого БЦ (риск тонкого
  // контента). `centers !== null` — не 404-им во время самой загрузки.
  const comboEmpty =
    classFilter !== null &&
    districtFilter !== null &&
    centers !== null &&
    !centers.some((c) => c.businessClass === classFilter && c.district === districtFilter);
  const notFound = badClassSlug || badDistrictSlug || badMicrodistrictSlug || badMetroSlug || metroEmpty || badStreetSlug || comboEmpty;

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
    // ANALYTICSPLAN.md §4.2 — сводка ставок на фильтровых страницах, из
    // уже собранного сегмента 'ofisy_bc' (market_snapshots). Дёшево (~20
    // строк за один запрос) — грузим всегда, не только на хаб-страницах
    // класса/района, показываем только там, где для этого есть срез.
    fetchLatestMarketSnapshots('ofisy_bc')
      .then(setOfficeSnapshots)
      .catch(() => setOfficeSnapshots([]));
    fetchBusinessCenterLotSizes()
      .then(setLotSizes)
      .catch(() => setLotSizes([]));
    fetchExternalMetrics('ofisy_bc')
      .then(setExternalMetrics)
      .catch(() => setExternalMetrics([]));
  }, []);

  // Единственная ось — класс ИЛИ район (не комбо, не микрорайон/метро/
  // улица/стройка): market_snapshots не хранит срез по пересечению класс×
  // район, показывать его для комбо значило бы либо молчать, либо
  // выдумывать — оставляем блок только там, где реальный срез есть.
  const rateSliceKey = classFilter && !districtFilter ? classFilter : !classFilter && districtFilter ? districtFilter : classFilter || districtFilter ? null : 'all';
  const rateSliceType: MarketSnapshot['sliceType'] | null = classFilter && !districtFilter ? 'class' : !classFilter && districtFilter ? 'district' : classFilter || districtFilter ? null : 'city';
  const showRatesBlock =
    !underConstruction && !metroFilter && !streetFilter && !microdistrictFilter && rateSliceKey !== null && rateSliceType !== null;
  const rateRent = useMemo(
    () =>
      showRatesBlock
        ? (officeSnapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === rateSliceType && s.sliceKey === rateSliceKey)
        : undefined,
    [officeSnapshots, showRatesBlock, rateSliceType, rateSliceKey],
  );
  const rateSale = useMemo(
    () =>
      showRatesBlock
        ? (officeSnapshots ?? []).find((s) => s.deal === 'sale' && s.sliceType === rateSliceType && s.sliceKey === rateSliceKey)
        : undefined,
    [officeSnapshots, showRatesBlock, rateSliceType, rateSliceKey],
  );
  function formatRate(n: number, deal: 'rent' | 'sale'): string {
    const rounded = deal === 'rent' ? Math.round(n * 10) / 10 : Math.round(n);
    return `$${rounded.toLocaleString('ru-RU')}${deal === 'rent' ? '/м²/мес' : '/м²'}`;
  }

  // Белый список индексируемых состояний (мастер-план, задача 8).
  // Индексируем только сам каталог и его SEO-хабы: маршрут задаёт одну ось
  // (класс, район, микрорайон, метро, улица, строящиеся), и у каждой свой
  // H1, title и canonical. Любое состояние, набранное фильтром, сортировкой
  // или поиском, по ссылке воспроизводится, но в индекс не идёт — в sitemap
  // уже 286 путей, а комбинаций фильтра тысячи, и они съели бы краулинговый
  // бюджет, ничего не добавив. Считаем прямо по строке запроса, а не по
  // разобранному фильтру: эффект метатегов стоит выше его объявления.
  const filterIsIndexable = !FILTER_QUERY_KEYS.some((k) => searchParams.has(k));

  useEffect(() => {
    if (notFound || !filterIsIndexable) {
      setNoIndex();
      return () => clearNoIndex();
    }
    const hubTitle = underConstruction
      ? 'Строящиеся бизнес-центры Минска — что сдадут в 2026–2027 годах'
      : metroFilter
        ? `Бизнес-центры у метро «${metroFilter}» — офисы в пешей доступности`
        : streetFilter
          ? `Бизнес-центры Минска: ${streetFilter}`
          : classFilter && districtFilter
        ? `Бизнес-центры класса ${classFilter} в ${districtPrepositional(districtFilter)} районе Минска`
        : classFilter
          ? `Бизнес-центры класса ${classFilter} в Минске`
          : districtFilter
            ? `Бизнес-центры Минска: ${districtFilter} район`
            : microdistrictFilter
              ? `Бизнес-центры ${microdistrictFilter}`
              : TITLE;
    const hubDescription = underConstruction
      ? 'Бизнес-центры Минска, которые сейчас строятся: класс, площадь, район, застройщик и сроки сдачи — МФЦ в Минск Мире, «Газпром», «Сигма», «Шантер Хилл».'
      : metroFilter
        ? `Бизнес-центры рядом со станцией метро «${metroFilter}» (Минск): расстояние до станции по прямой, класс, площадь, этажность, объявления об аренде и продаже офисов.`
        : streetFilter
          ? `Все бизнес-центры на «${streetFilter}» в Минске: класс, площадь, этажность, метро, объявления об аренде и продаже.`
          : classFilter && districtFilter
        ? `Бизнес-центры класса ${classFilter} в ${districtPrepositional(districtFilter)} районе Минска: адреса, площадь, этажность, метро.`
        : classFilter
          ? `Список бизнес-центров класса ${classFilter} в Минске: адреса, площадь, этажность, метро.`
          : districtFilter
            ? `Бизнес-центры в ${districtPrepositional(districtFilter)} районе Минска: адреса, деловой класс, площадь, метро.`
            : microdistrictFilter
              ? `Бизнес-центры в микрорайоне ${microdistrictFilter} (Минск): адреса, деловой класс, площадь, метро.`
              : DESCRIPTION;
    const hubUrl = underConstruction
      ? UNDER_CONSTRUCTION_HUB_URL
      : metroFilter
        ? `https://redevelopment.pro${metroHubUrl(metroFilter) ?? ''}`
        : streetFilter
          ? `https://redevelopment.pro${streetHubUrl(streetFilter) ?? ''}`
          : classFilter && districtFilter
        ? `https://redevelopment.pro${classDistrictHubUrl(classFilter, districtFilter) ?? ''}`
        : classFilter
          ? `https://redevelopment.pro${classHubUrl(classFilter)}`
          : districtFilter
            ? `https://redevelopment.pro${districtHubUrl(districtFilter) ?? ''}`
            : microdistrictFilter
              ? `https://redevelopment.pro${microdistrictHubUrl(microdistrictFilter) ?? ''}`
              : PAGE_URL;

    setGenericPageMeta({ title: hubTitle, description: hubDescription, url: hubUrl, image: OG_IMAGE, ogType: 'article' });
    setArticleJsonLd({
      headline: hubTitle,
      description: hubDescription,
      url: hubUrl,
      datePublished: '2026-09-04',
      dateModified: DATE_MODIFIED,
      image: OG_IMAGE,
    });
    setBreadcrumbJsonLd(
      classFilter && districtFilter
        ? [
            { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
            { name: 'Бизнес-центры Минска', url: PAGE_URL },
            { name: `Класс ${classFilter}`, url: `https://redevelopment.pro${classHubUrl(classFilter)}` },
            { name: `${districtFilter} район` },
          ]
        : classFilter || districtFilter || microdistrictFilter || underConstruction || metroFilter || streetFilter
          ? [
              { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
              { name: 'Бизнес-центры Минска', url: PAGE_URL },
              {
                name: underConstruction
                  ? 'Строящиеся'
                  : metroFilter
                    ? `Метро «${metroFilter}»`
                    : streetFilter
                      ? streetFilter
                      : classFilter
                    ? `Класс ${classFilter}`
                    : ((districtFilter ?? microdistrictFilter) as string),
              },
            ]
          : [
              { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
              { name: 'Бизнес-центры Минска' },
            ],
    );
  }, [classFilter, districtFilter, microdistrictFilter, underConstruction, metroFilter, streetFilter, notFound, filterIsIndexable]);

  // --- Фильтр поверх маршрута (К2–К5 плана) ----------------------------
  //
  // Раньше каждая ось фильтра была отдельным SEO-URL, и клик по одной ОСИ
  // СБРАСЫВАЛ другую: выбрать «класс A и Партизанский район и рядом с
  // метро» было нельзя в принципе. Теперь роль поделена: путь задаёт одно
  // значение одной оси и остаётся индексируемым входом (хабы никуда не
  // делись), а всё сверх того живёт в query-параметрах, которые поисковик
  // не индексирует (canonical всегда указывает на хаб), но ссылкой с
  // отфильтрованным списком можно поделиться.
  //
  // Ось из пути главнее query по этой же оси: иначе /class/a?class=b
  // означало бы две разные вещи одновременно.
  const queryFilter = useMemo(() => parseCatalogFilter(searchParams), [searchParams]);
  const filter: CatalogFilterState = useMemo(
    () => ({
      ...queryFilter,
      classes: classFilter ? [classFilter] : queryFilter.classes,
      districts: districtFilter ? [districtFilter] : queryFilter.districts,
      microdistricts: microdistrictFilter ? [microdistrictFilter] : queryFilter.microdistricts,
    }),
    [queryFilter, classFilter, districtFilter, microdistrictFilter],
  );



  // Медианы и число объявлений по КОНКРЕТНОМУ зданию (Д3) — нужны и
  // тумблерам «есть аренда/продажа», и сортировке по ставке, и сводке.
  const offerIndex = useMemo(() => buildOfferIndex(officeSnapshots, lotSizes), [officeSnapshots, lotSizes]);
  // Любая смена фильтра, сортировки или маршрута начинает список заново:
  // иначе «показать ещё» с прошлой выборки тихо переносился бы на новую.
  useEffect(() => {
    setVisibleCount(CARDS_PAGE_SIZE);
  }, [searchParams, classSlug, districtSlug, microdistrictSlug, metroSlug, streetSlug, underConstruction]);

  // Вселенная страницы: то, что отсекается САМИМ МАРШРУТОМ (микрорайон,
  // улица, станция метро, «строящиеся»). Панель чипов работает уже внутри
  // неё, и счётчики на чипах считаются от неё же — иначе на хабе станции
  // чип показывал бы число по всему городу.
  const routeScoped = useMemo(
    () =>
      (centers ?? []).filter(
        (c) =>
          (microdistrictFilter === null || c.microdistrict === microdistrictFilter) &&
          (!underConstruction || c.status === 'under_construction') &&
          (metroFilter === null || metroHubDistance(c, metroFilter) !== null) &&
          (streetFilter === null || streetOfAddress(c.address) === streetFilter),
      ),
    [centers, microdistrictFilter, underConstruction, metroFilter, streetFilter],
  );

  const visibleCenters = useMemo(
    () => routeScoped.filter((c) => matchesCatalogFilter(c, filter, offerIndex)),
    [routeScoped, filter, offerIndex],
  );

  // На хабе станции порядок по умолчанию — расстояние до неё (ближайшие
  // первыми): это и есть ответ на вопрос такой страницы. Явно выбранная в
  // панели сортировка его перебивает.
  const orderedCenters = useMemo(() => {
    if (metroFilter && filter.sort === 'default') {
      return [...visibleCenters].sort(
        (a, b) => (metroHubDistance(a, metroFilter) ?? Infinity) - (metroHubDistance(b, metroFilter) ?? Infinity),
      );
    }
    return sortCatalogCenters(visibleCenters, filter.sort, offerIndex);
  }, [visibleCenters, metroFilter, filter.sort, offerIndex]);

  // Классы и районы для чипов — весь набор, встречающийся в данных (не
  // урезанный по другой оси, как было у старого сайдбара): вместо того
  // чтобы прятать варианты, чип показывает живой счётчик и гаснет на нуле.
  // Порядок — как на рынке (A, B+, B, C), а не алфавитный: .sort() ставил
  // «B» перед «B+», потому что для строк «B» < «B+».
  const availableClasses = useMemo(() => {
    const present = new Set((centers ?? []).map((c) => c.businessClass).filter((v): v is NonNullable<typeof v> => !!v));
    return BUSINESS_CENTER_CLASSES.filter((cls) => present.has(cls));
  }, [centers]);
  const districts = useMemo(() => {
    const all = Array.from(new Set((centers ?? []).map((c) => c.district).filter((v): v is string => !!v)));
    const inCity = all.filter((d) => d !== OUT_OF_TOWN_DISTRICT).sort((a, b) => a.localeCompare(b, 'ru'));
    const outOfCity = all.filter((d) => d === OUT_OF_TOWN_DISTRICT);
    return [...inCity, ...outOfCity];
  }, [centers]);
  const filterMicrodistricts = useMemo(
    () =>
      Array.from(new Set((centers ?? []).map((c) => c.microdistrict).filter((value): value is string => !!value)))
        .sort((a, b) => a.localeCompare(b, 'ru')),
    [centers],
  );

  // Счётчик на чипе = сколько БЦ останется, если выбрать ИМЕННО ЭТО
  // значение оси, сохранив остальные фильтры (nomads-стиль). Не «сколько
  // всего в районе» — такая цифра врала бы при любом другом активном
  // фильтре. 143 записи в памяти, пересчёт на каждый клик ничего не стоит.
  function countWith(next: Partial<CatalogFilterState>): number {
    return routeScoped.filter((c) => matchesCatalogFilter(c, { ...filter, ...next }, offerIndex)).length;
  }
  const classCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const cls of availableClasses) m[cls] = countWith({ classes: [cls] });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableClasses, routeScoped, filter, offerIndex]);
  const districtCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of districts) m[d] = countWith({ districts: [d] });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, routeScoped, filter, offerIndex]);
  const microdistrictCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const microdistrict of filterMicrodistricts) {
      m[microdistrict] = countWith({ microdistricts: [microdistrict] });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMicrodistricts, routeScoped, filter, offerIndex]);
  const metroCounts = useMemo(() => {
    const m: Record<number, number> = {};
    for (const o of METRO_WITHIN_OPTIONS) m[o.value] = countWith({ metroWithin: o.value });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeScoped, filter, offerIndex]);
  // Список станций и счётчики по ним — фильтр «станция метро» с
  // множественным выбором (владелец, 2026-09-17).
  const metroStationList = useMemo(() => catalogMetroStations(routeScoped), [routeScoped]);
  const stationCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const st of metroStationList) {
      m[st] = countWith({
        metroStations: filter.metroStations.includes(st) ? filter.metroStations : [...filter.metroStations, st],
      });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroStationList, routeScoped, filter, offerIndex]);
  // Сколько зданий нельзя проверить по применённому фильтру метро: у них
  // не разобрана ни одна станция. «Не знаем» ≠ «не подходит».
  const unverifiableCount = useMemo(
    () => (filter.metroStations.length > 0 || filter.metroWithin != null ? unverifiableByMetroStation(routeScoped) : 0),
    [filter.metroStations, filter.metroWithin, routeScoped],
  );

  // Куда вести после клика по чипу. Одно значение одной оси — это ровно
  // тот срез, под который уже есть SEO-хаб: ведём на красивый URL, чтобы
  // страница осталась индексируемой и делилась ссылкой как раньше. Всё
  // остальное (мультивыбор, комбинации) — query-параметры.
  //
  // На хабах микрорайона/улицы/станции/стройки класс и район всегда уходят
  // в query прямо на этом пути: там ось маршрута — другая, и терять её
  // ради класса нельзя.
  const routeHubPath = underConstruction
    ? '/minsk/bcminsk/stroyashchiesya'
    : microdistrictFilter
      ? microdistrictHubUrl(microdistrictFilter)
      : streetFilter
        ? streetHubUrl(streetFilter)
        : metroFilter
          ? metroHubUrl(metroFilter)
          : null;

  function urlForFilter(next: CatalogFilterState): string {
    if (microdistrictFilter) {
      const staysOnHub =
        next.microdistricts?.length === 1 && next.microdistricts[0] === microdistrictFilter;
      if (staysOnHub && routeHubPath) {
        return routeHubPath + catalogFilterToQuery({ ...next, microdistricts: null });
      }
    } else if (routeHubPath) {
      return routeHubPath + catalogFilterToQuery(next);
    }

    const withoutAxes = catalogFilterToQuery({
      ...next,
      classes: [],
      districts: null,
      microdistricts: null,
    });
    if (
      next.microdistricts?.length === 1 &&
      next.classes.length === 0 &&
      next.districts === null
    ) {
      const url = microdistrictHubUrl(next.microdistricts[0]);
      if (url) return url + withoutAxes;
    }
    if (next.classes.length === 1 && next.districts?.length === 1 && next.microdistricts === null) {
      const url = classDistrictHubUrl(next.classes[0] as NonNullable<BusinessCenter['businessClass']>, next.districts[0]);
      if (url) return url + withoutAxes;
    }
    if (next.classes.length === 1 && next.districts === null && next.microdistricts === null) {
      return classHubUrl(next.classes[0] as NonNullable<BusinessCenter['businessClass']>) + withoutAxes;
    }
    if (next.classes.length === 0 && next.districts?.length === 1 && next.microdistricts === null) {
      const url = districtHubUrl(next.districts[0]);
      if (url) return url + withoutAxes;
    }
    return '/minsk/bcminsk' + catalogFilterToQuery(next);
  }

  // replace: true — фильтрование не должно забивать историю браузера так,
  // чтобы «назад» уводило на страницу через двадцать кликов по чипам.
  function applyFilter(next: CatalogFilterState) {
    navigate(urlForFilter(next), { replace: true });
  }
  // К14. Отметка «сравнить»: до MAX_COMPARE зданий, повторный клик
  // снимает. Больше четырёх колонок таблица сравнения не выдерживает ни на
  // одном экране, поэтому лишнее просто не добавляется.
  function toggleCompare(slug: string) {
    const next = filter.compare.includes(slug)
      ? filter.compare.filter((s) => s !== slug)
      : filter.compare.length >= MAX_COMPARE
        ? filter.compare
        : [...filter.compare, slug];
    applyFilter({ ...filter, compare: next });
  }

  function resetFilter() {
    applyFilter({ ...EMPTY_CATALOG_FILTER, compare: filter.compare });
  }

  // Микрорайоны, станции и улицы больше не списки в боковом фильтре — они
  // остались блоком «Срезы каталога» под результатами (см. рендер ниже).
  // Без него страница потеряла бы полсотни внутренних ссылок на
  // собственные SEO-хабы — это была бы не перестановка блоков, а регресс.
  const microdistricts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) if (c.microdistrict) counts[c.microdistrict] = (counts[c.microdistrict] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([name]) => microdistrictHubUrl(name) !== null)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [centers]);
  const metroStations = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) {
      for (const st of c.nearestMetroStations) {
        if (metroHubDistance(c, st.name) !== null && metroHubUrl(st.name)) counts[st.name] = (counts[st.name] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [centers]);
  const streets = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) {
      const st = streetOfAddress(c.address);
      if (streetHubUrl(st)) counts[st] = (counts[st] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }, [centers]);

  // «4 бизнес-центра», «24 бизнес-центра», «5 бизнес-центров» — склонение по
  // числу; пока список не загружен — просто «бизнес-центры» без числа.
  const allCentersAlphabetical = useMemo(
    () => [...(centers ?? [])].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru')),
    [centers],
  );

  const bcCountLabel = centers ? `${visibleCenters.length} ${pluralBusinessCenters(visibleCenters.length)}` : 'бизнес-центры';

  // Полоска сводки над сеткой (К1): пересчитывается под фильтр, в отличие
  // от блока «Рынок в цифрах», который уехал под результаты.
  const summary = useMemo(() => catalogSummary(visibleCenters, offerIndex), [visibleCenters, offerIndex]);

  // Для SEO-текста нужны АБСОЛЮТНЫЕ числа по районам, а не счётчики чипов
  // (те зависят от текущего фильтра): фраза «больше всего БЦ приходится на
  // такой-то район» описывает рынок, а не выборку пользователя.
  const districtTotals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) if (c.district) counts[c.district] = (counts[c.district] ?? 0) + 1;
    return counts;
  }, [centers]);

  // Сводка и FAQ считаются по одной текущей выборке; метро — по координатам.
  const marketStats = useMemo(() => {
    const withArea = visibleCenters.filter((c) => c.totalArea != null);
    const totalArea = withArea.reduce((sum, c) => sum + (c.totalArea ?? 0), 0);
    const withMetro = visibleCenters.filter((c) => nearestMetroMeters(c) != null);
    const nearMetro = withMetro.filter((c) => nearestMetroMeters(c)! <= 800);
    const underConstruction = visibleCenters.filter((c) => c.status === 'under_construction').length;
    const byClass: Record<string, number> = {};
    for (const c of visibleCenters) if (c.businessClass) byClass[c.businessClass] = (byClass[c.businessClass] ?? 0) + 1;
    return { total: visibleCenters.length, totalArea, withAreaCount: withArea.length, nearMetro: nearMetro.length, withMetroCount: withMetro.length, underConstruction, byClass };
  }, [visibleCenters]);

  // Подпись текущего раздела каталога для FAQ.
  const scopeLabel = underConstruction
    ? 'из строящихся в Минске'
    : metroFilter
      ? `у метро «${metroFilter}»`
      : streetFilter
        ? `на «${streetFilter}»`
        : classFilter && districtFilter
      ? `класса ${classFilter} в ${districtPrepositional(districtFilter)} районе`
      : classFilter
        ? `класса ${classFilter}`
        : districtFilter
          ? `в ${districtPrepositional(districtFilter)} районе`
          : microdistrictFilter
            ? `в ${microdistrictFilter}`
            : 'в Минске';
  const underConstructionNames = useMemo(
    () => visibleCenters.filter((c) => c.status === 'under_construction').map((c) => shortName(c)),
    [visibleCenters],
  );
  // Срезы по реальным данным каталога — только на общей странице.
  const classDistrictBreakdown = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const c of centers ?? []) {
      if (!c.businessClass || !c.district) continue;
      map[c.businessClass] ??= {};
      map[c.businessClass][c.district] = (map[c.businessClass][c.district] ?? 0) + 1;
    }
    const result: Record<string, string> = {};
    for (const cls of Object.keys(map)) {
      const top = Object.entries(map[cls]).sort((a, b) => b[1] - a[1])[0];
      if (top) result[cls] = top[0];
    }
    return result;
  }, [centers]);

  const topDistrictsByCount = useMemo(
    () => Object.entries(districtTotals).sort((a, b) => b[1] - a[1]).slice(0, 3),
    [districtTotals],
  );

  const showCatalogSeoText = !classFilter && !districtFilter && !microdistrictFilter && !underConstruction && !metroFilter && !streetFilter && centers !== null && centers.length > 0;

  const latestSnapshotPeriod = useMemo(() => {
    const dates = (officeSnapshots ?? []).map((s) => s.period).filter(Boolean).sort();
    return dates.at(-1)?.slice(0, 7) ?? null;
  }, [officeSnapshots]);
  const rentMethodology = summary.rentMedian != null
    ? `Медиана аренды — $${summary.rentMedian}/м² в месяц, по ${summary.rentBuildings} зданиям текущей выборки с объявлениями. Сначала берётся медиана ставки объявлений каждого здания, затем медиана этих значений; при чётном числе — среднее двух центральных. Площадь здания не служит весом.`
    : 'Медиана аренды для текущей выборки не рассчитана: нет доступных медиан по зданиям с объявлениями.';

  const faqItems = useMemo(() => {
    if (centers === null) return [];
    const items: { question: string; answer: string }[] = [];
    const add = (question: string, answer: string) => items.push({ question, answer });
    add(`Сколько бизнес-центров ${scopeLabel} есть в текущей выборке?`, `Найдено ${marketStats.total} зданий с учётом выбранных фильтров.`);
    if (marketStats.withAreaCount > 0) add('Какая суммарная площадь зданий?', `${Math.round(marketStats.totalArea).toLocaleString('ru-RU')} м²; площадь известна у ${marketStats.withAreaCount} из ${marketStats.total} зданий выборки.`);
    if (Object.keys(marketStats.byClass).length) add('Как здания выборки распределены по классам?', Object.entries(marketStats.byClass).map(([cls, n]) => `Класс ${cls} — ${n}`).join('; '));
    if (Object.keys(districtTotals).length) add('Как весь каталог распределён по районам?', Object.entries(districtTotals).map(([district, n]) => {
      const area = (centers ?? []).filter((c) => c.district === district).reduce((sum, c) => sum + (c.totalArea ?? 0), 0);
      const rate = (officeSnapshots ?? []).find((s) => s.sliceType === 'district' && s.deal === 'rent' && s.sliceKey === district)?.median;
      return `${district}: ${n} БЦ${area > 0 ? `, ${Math.round(area).toLocaleString('ru-RU')} м² по заполненным площадям` : ''}${rate != null ? `, медиана аренды $${rate}/м²` : ''}`;
    }).join('; '));
    if (showCatalogSeoText && Object.keys(classDistrictBreakdown).length) add('Где чаще встречаются здания разных классов?', Object.entries(classDistrictBreakdown).map(([cls, district]) => `Класс ${cls} — ${district} район`).join('; '));
    if (marketStats.withMetroCount > 0) add('Сколько зданий рядом с метро?', `${marketStats.nearMetro} из ${marketStats.withMetroCount} зданий выборки с известным расстоянием находятся не дальше 800 м по прямой от ближайшего метро. Это не длина пешего маршрута.`);
    if (metroFilter && orderedCenters.length) {
      const nearest = [...orderedCenters].sort((a, b) => (metroHubDistance(a, metroFilter) ?? Infinity) - (metroHubDistance(b, metroFilter) ?? Infinity))[0];
      const distance = metroHubDistance(nearest, metroFilter);
      if (distance != null) add(`Какой бизнес-центр ближе всего к метро «${metroFilter}»?`, `${shortName(nearest)} — ${distance} м по прямой. В подборку станции входят здания не дальше 1,5 км по прямой.`);
    }
    add('Сколько зданий в выборке строится?', `${marketStats.underConstruction}.${underConstructionNames.length ? ` Строятся: ${underConstructionNames.join(', ')}.` : ''}`);
    if (summary.rentMedian != null) add('Какая медианная ставка аренды и как она рассчитана?', rentMethodology);
    if (showRatesBlock) {
      for (const [label, deal, rate] of [['аренды', 'rent', rateRent], ['продажи', 'sale', rateSale]] as const) {
        if (rate?.median != null) add(`Какая ставка ${label} в блоке рыночных ставок?`, `${formatRate(rate.median, deal)} по ${rate.n} объявлениям Kufar и Realt${rate.period ? `, период ${rate.period.slice(0, 7)}` : ''}.${rate.n < MIN_RELIABLE_N ? ' Маленькая выборка: ориентировочное значение.' : ''} Это медиана объявлений соответствующего рыночного среза.`);
      }
    }
    const hoa = centers.filter((c) => c.managementType === 'hoa').length;
    const uk = centers.filter((c) => c.managementType === 'single_uk').length;
    if (hoa + uk > 0) add('Какие типы управления представлены в каталоге?', `Товарищество собственников — ${hoa}, единая управляющая компания — ${uk}; тип известен для ${hoa + uk} зданий. Плитки включают фильтр по типу управления.`);
    const withLots = centers.filter((c) => (offerIndex.lotSizesBySlug.get(c.slug)?.length ?? 0) > 0);
    if (withLots.length) add('Что показывает блок «Сейчас сдаётся и продаётся»?', `${withLots.length} зданий с активными объявлениями Kufar и Realt и данными о площади лотов. Показаны до десяти зданий с наибольшим числом лотов и диапазоны их площадей. Кнопки площади включают фильтр зданий с подходящими лотами; отсутствие объявления не означает отсутствие свободных помещений.`);
    const contextMetrics = [
      ['colliers', 'vacancy_rate', 'Вакантность по городу', '%'],
      ['colliers', 'total_stock', 'Арендопригодные офисы', 'тыс. м²'],
      ['colliers', 'new_supply', 'Ввод за 2025 год', 'тыс. м²'],
      ['rezultativnaya-nedvizhimost', 'new_supply_forecast_2026', 'Прогноз ввода на 2026', 'тыс. м²'],
      ['rezultativnaya-nedvizhimost', 'vacancy_rate', 'Вакантность качественных БЦ', '%'],
      ['goskomimushchestvo', 'registered_deals', 'Сделки за первое полугодие 2026', ''],
    ].flatMap(([source, metric, label, unit]) => {
      const row = externalMetrics?.find((m) => m.source === source && m.metric === metric && m.sliceKey === null);
      return row ? [`${label}: ${row.value} ${unit} (${SOURCE_LABELS[row.source] ?? row.source}, ${row.period})`] : [];
    });
    if (contextMetrics.length) add('Что показывает внешний контекст рынка офисов?', contextMetrics.join('; ') + '. Классификации внешних источников отличаются от классов каталога; эти значения не относятся к выбранному классу.');
    add('Как работают фильтры и подборки?', 'Фильтры отбирают здания по заданным характеристикам и пересчитывают выдачу и её сводку. Сортировка меняет порядок. Карточки, таблица и карта помогают просматривать результаты, сравнение — сопоставлять выбранные здания. Подборки ведут к каталогам по классу, району, микрорайону, улице, метро и статусу строительства; список всех названий ведёт на страницы зданий.');
    add('Что означает «параметр не известен»?', 'В источниках нет заполненного значения. Это не означает, что характеристики или услуги нет. Фильтр по признаку показывает только здания с данными, подтверждающими этот признак.');
    if (showCatalogSeoText) {
      add('Чем отличаются классы A, B+, B и C?', 'Классы описывают уровень инженерии, отделки и сервиса: от наиболее высокого A через B+ и B до более простого C. Конкретные характеристики следует проверять в карточке здания.');
      add('На что смотреть при выборе офиса?', 'На класс и площадь, транспортную доступность, парковку, планировку, инфраструктуру внутри и рядом, управление, соседей и условия договора: срок, индексацию и состав эксплуатационных платежей.');
      add('Из чего складывается стоимость аренды?', 'Из базовой аренды, эксплуатационных и коммунальных платежей, а при необходимости — бюджета на отделку. Состав платежей уточняйте по конкретному объявлению.');
    }
    return items;
  }, [centers, scopeLabel, marketStats, districtTotals, officeSnapshots, showCatalogSeoText, classDistrictBreakdown, metroFilter, orderedCenters, underConstructionNames, summary.rentMedian, rentMethodology, showRatesBlock, rateRent, rateSale, offerIndex, externalMetrics]);

  useEffect(() => {
    setFaqJsonLd(notFound ? [] : faqItems);
    return () => setFaqJsonLd([]);
  }, [faqItems, notFound]);

  if (notFound) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
        <p className="text-base text-ink-muted">Такой раздел каталога не найден.</p>
        <Link to="/minsk/bcminsk" className="text-sm font-semibold text-primary-hover hover:underline">
          ← Все бизнес-центры Минска
        </Link>
      </div>
    );
  }

  // Заголовок/подзаголовок hero — на общем каталоге статичные PAGE_H1/
  // INTRO_TEXT, на хаб-подстранице класса/района — уникальные под конкретный
  // фильтр (то же значение, что уже посчитано для meta-тегов выше).
  const heroH1 = underConstruction
    ? 'Строящиеся бизнес-центры Минска'
    : metroFilter
      ? `Бизнес-центры у метро «${metroFilter}»`
      : streetFilter
        ? `Бизнес-центры Минска: ${streetFilter}`
        : classFilter && districtFilter
      ? `Бизнес-центры класса ${classFilter} в ${districtPrepositional(districtFilter)} районе Минска`
      : classFilter
        ? `Бизнес-центры класса ${classFilter} в Минске`
        : districtFilter
          ? `Бизнес-центры Минска: ${districtFilter} район`
          : microdistrictFilter
            ? `Бизнес-центры ${microdistrictFilter}`
            : PAGE_H1;
  const heroIntro = underConstruction
    ? `${bcCountLabel} Минска, которые сейчас строятся, — класс, площадь, район и срок сдачи по данным застройщиков. Офисы в них пока нельзя ни арендовать, ни купить; готовые варианты — в общем каталоге.`
    : metroFilter
      ? `${bcCountLabel} не дальше 1,5 км по прямой от станции «${metroFilter}» — расстояние по данным 2GIS, ближайшие первыми. Класс, площадь, этажность и объявления об аренде и продаже — в карточках.`
    : streetFilter
      ? `${bcCountLabel} на «${streetFilter}» — класс, площадь, этажность, метро и объявления об аренде и продаже.`
    : classFilter && districtFilter
      ? `${bcCountLabel} делового класса ${classFilter} в ${districtPrepositional(districtFilter)} районе Минска — адреса, площадь, этажность, метро.`
      : classFilter
        ? `${bcCountLabel} делового класса ${classFilter} в Минске — адреса, площадь, этажность, метро.`
        : districtFilter
          ? `${bcCountLabel} в ${districtPrepositional(districtFilter)} районе Минска — сравнивайте по классу, площади и расположению.`
          : microdistrictFilter
            ? `${bcCountLabel} в микрорайоне ${microdistrictFilter} (Минск) — адреса, деловой класс, площадь, метро.`
          : INTRO_TEXT;

  return (
    <div className="min-h-svh bg-bg">
      {/* Шапка sticky — владелец: "нравится, как на /minsk/minsk-mir логотип
          остаётся при скролле, сделай 1 в 1". У DistrictGuidePage.tsx для
          этого исторически сложный fixed+JS-измеренный трюк (см. комментарий
          там же — нужен был из-за старого overflow-x:hidden на body/#root,
          ломавшего position:sticky); с тех пор это заменили на overflow-x:
          clip (см. index.css), sticky работает нормально сайтвайд (тот же
          подход уже и в Sidebar.tsx, и в боковом фильтре этой страницы ниже)
          — простого `sticky top-0` на саму шапку достаточно для того же
          визуального эффекта, без дублирования логотипа отдельным узлом. */}
      <div className="sticky top-0 z-30 border-b border-border bg-bg/90 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
            {/* text-primary-hover — как на гиде района: базовый красный на
                полупрозрачной шапке даёт контраст ниже 4,5:1 (Accessibility). */}
            <span className="font-black text-primary-hover">RED</span>EVELOPMENT
          </Link>
          <Link to="/minsk/bcminsk/reyting" className="text-sm font-semibold text-ink-muted transition-colors hover:text-ink">
            Рейтинг
          </Link>
        </div>
      </div>

      {/* <main> — единственный main-landmark (Accessibility «Document does
          not have a main landmark»), шапка — вне него. */}
      {/* Сетка и ширина основного контента — как на странице Минск Мира. */}
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-12 sm:px-8 sm:pt-12">
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside aria-label="Фильтры каталога" className="min-w-0 lg:sticky lg:top-24">
          <CatalogFilterPanel
            state={filter}
            onChange={applyFilter}
            availableClasses={availableClasses}
            districts={districts}
            microdistricts={filterMicrodistricts}
            classCounts={classCounts}
            districtCounts={districtCounts}
            microdistrictCounts={microdistrictCounts}
            metroCounts={metroCounts}
            metroStations={metroStationList}
            stationCounts={stationCounts}
            unverifiableCount={unverifiableCount}
            resultCount={visibleCenters.length}
            resultLabel={pluralBusinessCenters(visibleCenters.length)}
            hasActiveFilter={hasActiveCatalogFilter(filter)}
            onReset={resetFilter}
          />
          </aside>
          <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
          <div
            className={cn('flex flex-col gap-6 overflow-hidden p-6 sm:flex-row sm:items-center sm:p-8', glassCardClass)}
            style={glassCardShadow}
          >
            <div className="contents sm:flex sm:min-w-0 sm:flex-[3] sm:flex-col sm:gap-3">
              <h1 className="order-1 text-2xl font-extrabold leading-tight text-ink sm:order-none sm:text-3xl">{heroH1}</h1>
              <p className="order-3 text-base text-ink-muted sm:order-none">{heroIntro}</p>
              <span className="order-4 flex w-fit items-center gap-1.5 rounded-full border border-success/30 bg-success-bg px-3 py-1 text-xs font-semibold text-[#0f6b3d] sm:order-none">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                {UPDATED_BADGE_LABEL}
              </span>
            </div>
            <div className="order-2 w-full min-w-0 sm:order-none sm:flex-[2]">
              {/* Padding задаёт высоту по ширине независимо от Grid/Flex и
                  процентной высоты вложенной картинки в Safari. */}
              <div className="relative w-full pt-[56.25%] sm:pt-[125%]">
                <div className="absolute inset-0">
                  {HERO_IMAGES.length > 0 ? (
                    <HeroImageSlider
                      images={HERO_IMAGES}
                      alt="Бизнес-центры Минска"
                      aspectClassName="h-full"
                      imageWidth={HERO_IMAGE_WIDTH}
                      imageHeight={HERO_IMAGE_HEIGHT}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-gradient-to-br from-surface-muted to-border">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted shadow-sm">
                        <Camera className="h-3.5 w-3.5 shrink-0" />
                        Фото скоро
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>



          {/* Живая сводка под фильтром (К1). Заменяет собой «Рынок в цифрах»
              в роли первого, что видно: та плитка считалась только от оси
              маршрута и на клик по фильтру не реагировала вовсе. */}
          {centers !== null && (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="font-bold text-ink">
                {hasActiveCatalogFilter(filter)
                  ? `Подходит ${visibleCenters.length} из ${routeScoped.length}`
                  : `${visibleCenters.length} ${pluralBusinessCenters(visibleCenters.length)}`}
              </span>
              {summary.withAreaCount > 0 && (
                <span className="text-ink-muted">
                  {Math.round(summary.totalArea).toLocaleString('ru-RU')} м² суммарно (площадь известна у{' '}
                  {summary.withAreaCount})
                </span>
              )}
              {/* Медиана медиан по зданиям, а не по объявлениям — число
                  зданий рядом обязательно, иначе цифру прочитают как
                  городскую медиану, которой она не является. */}
              {summary.rentMedian != null && (
                <span className="text-ink-muted">
                  медиана аренды ${summary.rentMedian}/м² — по {summary.rentBuildings}{' '}
                  {pluralBuildingsDative(summary.rentBuildings)} с объявлениями
                </span>
              )}
            </div>
          )}

          {/* К14. Сравнение — блоком НАД результатами, а не модалкой:
              вложенных модалок в проекте не бывает, а сравнение смотрят,
              продолжая листать каталог. */}
          {centers !== null && filter.compare.length >= 2 && (
            <CatalogCompare
              centers={filter.compare
                .map((slug) => centers.find((c) => c.slug === slug))
                .filter((c): c is BusinessCenter => Boolean(c))}
              offers={offerIndex}
              onRemove={(slug) => toggleCompare(slug)}
              onClear={() => applyFilter({ ...filter, compare: [] })}
            />
          )}

          {/* text-ink, не text-ink-muted: эти два состояния лежат прямо на
              фоне страницы (не на стеклянной карточке), а muted на #f0efed
              даёт 4,48:1 — на волосок ниже порога 4,5 (Accessibility). */}
          {centers === null ? (
            <p className="text-sm text-ink">Загрузка…</p>
          ) : visibleCenters.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-ink">Нет бизнес-центров по выбранным фильтрам.</p>
              {hasActiveCatalogFilter(filter) && (
                <button
                  type="button"
                  onClick={resetFilter}
                  className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-hover"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
                {orderedCenters.slice(0, visibleCount).map((c) => (
                  <BusinessCenterCard
                    key={c.slug}
                    center={c}
                    metroStation={metroFilter}
                    compared={filter.compare.includes(c.slug)}
                    onToggleCompare={toggleCompare}
                  />
                ))}
              </div>
              {orderedCenters.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + CARDS_PAGE_SIZE)}
                  className="mx-auto block rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary-hover"
                >
                  Показать ещё {Math.min(CARDS_PAGE_SIZE, orderedCenters.length - visibleCount)} из{' '}
                  {orderedCenters.length - visibleCount}
                </button>
              )}
            </div>
          )}

            {/* Пока данные не пришли — та же карточка с невидимыми плитками
                той же формы (PAGESPEED_PLAN.md, Э9): страница приходит
                пререндер-снапшотом с готовой сводкой, React после
                монтирования на ~полсекунды остаётся без данных, и без
                заглушки блок исчезал целиком — карта и всё ниже прыгали
                вверх, потом обратно. На десктопе карта в первом экране →
                CLS 0,104 (третий пункт Agentic Browsing в PageSpeed), на
                мобильном она ниже сгиба → 0. Число плиток — как у реальной
                сводки: 4 общих (+4 по классам вне хаба класса). */}
            {centers === null ? (
              <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow} aria-hidden="true">
                <h2 className="text-lg font-bold text-ink">Рынок в цифрах</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    'Всего бизнес-центров',
                    'Суммарная площадь (по 000 из 000)',
                    'Строится',
                    'До 800 м по прямой от метро',
                    ...(classFilter ? [] : ['Класса A', 'Класса B+', 'Класса B', 'Класса C']),
                  ].map((label) => (
                    <div key={label} className="invisible">
                      <FactTile icon={Building2} value="0" label={label} />
                    </div>
                  ))}
                </div>
              </div>
            ) : marketStats.total > 0 && (
              <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
                <h2 className="text-lg font-bold text-ink">Рынок в цифрах</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <FactTile icon={Building2} value={marketStats.total} label="Всего бизнес-центров" />
                  {marketStats.withAreaCount > 0 && (
                    <FactTile
                      icon={Ruler}
                      value={`${Math.round(marketStats.totalArea).toLocaleString('ru-RU')} м²`}
                      label={`Суммарная площадь (по ${marketStats.withAreaCount} из ${marketStats.total})`}
                    />
                  )}
                  {marketStats.underConstruction > 0 && (
                    <FactTile icon={HardHat} value={marketStats.underConstruction} label="Строится" />
                  )}
                  {marketStats.withMetroCount > 0 && (
                    <FactTile
                      icon={TrainFront}
                      value={`${marketStats.nearMetro} из ${marketStats.withMetroCount}`}
                      label="До 800 м по прямой от метро"
                    />
                  )}
                  {/* Разбивка по классам — только когда сама сводка не по
                      одному классу (на хаб-странице класса это было бы
                      избыточно: все плитки, кроме одной, показали бы 0). */}
                  {!classFilter &&
                    (['A', 'B+', 'B', 'C'] as const).map(
                      (cls) =>
                        marketStats.byClass[cls] > 0 && (
                          <FactTile key={cls} icon={Award} value={marketStats.byClass[cls]} label={`Класса ${cls}`} />
                        ),
                    )}
                </div>
              </div>
            )}

            {/* Сводка ставок (ANALYTICSPLAN.md §4.2) — только там, где для
                скоупа страницы реально есть срез в market_snapshots (класс
                ИЛИ район, не их пересечение — см. rateSliceKey/rateSliceType
                выше). Пока обе цифры не пришли или срез слишком мал — блок
                просто не рендерится, не выдумываем "недостаточно данных"
                отдельной плашкой ради ещё одной строки на странице. */}
            {showRatesBlock && (rateRent?.median != null || rateSale?.median != null) && (
              <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
                <h2 className="text-lg font-bold text-ink">Ставки аренды и продажи</h2>
                <p className="text-xs text-ink-faint">
                  Медиана по объявлениям Kufar и Realt{rateSliceType === 'class' ? ` для класса ${rateSliceKey}` : rateSliceType === 'district' ? ` в ${districtPrepositional(rateSliceKey ?? '')} районе` : ' по Минску'}
                  {rateRent?.period ? `, ${rateRent.period.slice(0, 7)}` : ''}.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rateRent?.median != null && (
                    <FactTile
                      icon={DollarSign}
                      value={formatRate(rateRent.median, 'rent')}
                      label={rateRent.n >= MIN_RELIABLE_N ? `Аренда (по ${rateRent.n} объявлениям)` : `Аренда — ориентировочно (${rateRent.n})`}
                    />
                  )}
                  {rateSale?.median != null && (
                    <FactTile
                      icon={DollarSign}
                      value={formatRate(rateSale.median, 'sale')}
                      label={rateSale.n >= MIN_RELIABLE_N ? `Продажа (по ${rateSale.n} объявлениям)` : `Продажа — ориентировочно (${rateSale.n})`}
                    />
                  )}
                </div>
                <Link
                  to="/minsk/analytics/ofisy/arenda"
                  className="inline-flex w-fit items-center gap-1 text-sm text-primary-hover hover:underline"
                >
                  Подробная аналитика по офисам в БЦ
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {/* Разбор рынка (К10–К13) — ПОД результатами: первый экран
                отдан фильтру и карточкам, а это читают те, кто доскроллил.
                Каждый блок ещё и кликабельный: строка района включает
                фильтр по району, плитка УК/ТС — соответствующий тумблер. */}
            {centers !== null && centers.length > 0 && (
              <div className="flex flex-col gap-6">
                <AvailableNowBlock
                  centers={centers}
                  offers={offerIndex}
                  lotSize={filter.lotSize}
                  onPickLotSize={(size) => applyFilter({ ...filter, lotSize: size })}
                />
                <DistrictDensityBlock
                  centers={centers}
                  snapshots={officeSnapshots}
                  activeDistricts={filter.districts ?? []}
                  onPickDistrict={(d) =>
                    applyFilter({
                      ...filter,
                      districts: (filter.districts ?? []).includes(d)
                        ? (filter.districts ?? []).filter((x) => x !== d)
                        : [d],
                    })
                  }
                />
                <ManagementBlock
                  centers={centers}
                  activeFacts={filter.facts}
                  onPickFact={(id) =>
                    applyFilter({
                      ...filter,
                      facts: filter.facts.includes(id) ? filter.facts.filter((x) => x !== id) : [...filter.facts, id],
                    })
                  }
                />
                <MarketContextBlock metrics={externalMetrics} />
              </div>
            )}

            {/* Срезы каталога — SEO-хабы, которые до 2026-09-16 были
                списками в боковом фильтре (районы, микрорайоны, станции
                метро, улицы, классы, стройка). Панель чипов сверху их НЕ
                заменяет: она клиентская и живёт в query, которую поисковик
                не индексирует. Убрать отсюда ссылки значило бы лишить
                полсотни собственных хаб-страниц внутренней перелинковки —
                это был бы не перенос блока, а регресс. */}
            {centers !== null && centers.length > 0 && (
              <div className={cn('flex flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
                <h2 className="text-lg font-bold text-ink">Срезы каталога</h2>
                {(
                  [
                    {
                      label: 'По классу',
                      items: availableClasses.map((cls) => ({
                        key: cls,
                        name: `Класс ${cls}`,
                        url: classHubUrl(cls),
                      })),
                    },
                    {
                      label: 'По району',
                      items: districts.map((d) => ({ key: d, name: d, url: districtHubUrl(d) })),
                    },
                    {
                      label: 'По микрорайону',
                      items: microdistricts.map(([name, count]) => ({
                        key: name,
                        name: `${name} (${count})`,
                        url: microdistrictHubUrl(name),
                      })),
                    },
                    {
                      label: 'У метро',
                      items: metroStations.map(([name, count]) => ({
                        key: name,
                        name: `${name} (${count})`,
                        url: metroHubUrl(name),
                      })),
                    },
                    {
                      label: 'По улице',
                      items: streets.map(([name, count]) => ({
                        key: name,
                        name: `${name} (${count})`,
                        url: streetHubUrl(name),
                      })),
                    },
                    {
                      label: 'Статус',
                      items: [{ key: 'uc', name: 'Строящиеся', url: '/minsk/bcminsk/stroyashchiesya' }],
                    },
                  ] as { label: string; items: { key: string; name: string; url: string | null }[] }[]
                ).map((group) => {
                  const items = group.items.filter((i) => i.url);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.label} className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {group.label}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {items.map((i) => (
                          <Link
                            key={i.key}
                            to={i.url as string}
                            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary-hover"
                          >
                            {i.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Все названия ссылками. Раньше этот список жил в боковом
                    фильтре, теперь карточек в сетке рисуется по 48 — без
                    него страница ссылалась бы только на треть каталога.
                    Обычный текст, без «стекла» и фото: 143 ссылки здесь
                    ничего не стоят браузеру. */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Все бизнес-центры каталога
                  </span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {allCentersAlphabetical.map((c) => (
                      <Link
                        key={c.slug}
                        to={`/minsk/bcminsk/${c.slug}`}
                        className="text-sm text-ink-muted transition-colors hover:text-primary-hover"
                      >
                        {shortName(c)}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showCatalogSeoText && (
              <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
                <h2 className="text-lg font-bold text-ink">Как устроен рынок бизнес-центров в Минске</h2>
                <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-muted">
                  <p>
                    В каталоге собрано {marketStats.total} бизнес-центров Минска — от небольших
                    офисных зданий на несколько кабинетов до многокорпусных комплексов на
                    десятки тысяч квадратных метров. Ниже — как устроена классификация, где
                    физически сосредоточены объекты разного уровня и на что стоит смотреть,
                    выбирая офис в аренду или для покупки.
                  </p>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-bold text-ink">Классы A, B+, B и C</h3>
                    <p>
                      Деловой класс бизнес-центра — это не маркетинговая метка, а сложившаяся на
                      рынке коммерческой недвижимости система координат по качеству здания и
                      уровню сервиса. <strong>Класс A</strong> — самый высокий уровень: современная
                      инженерия (климат-контроль, резервное электропитание, скоростные лифты),
                      профессиональная управляющая компания, достаточная парковка и, как правило,
                      расположение в деловых зонах города. <strong>Класс B+</strong> обычно уступает
                      классу A по расположению или инженерным системам, но сопоставим по качеству
                      отделки и управлению зданием. <strong>Класс B</strong> — крепкий средний
                      сегмент: хорошая для повседневной работы отделка и инженерия, но без
                      премиальных опций класса A. <strong>Класс C</strong> — более простые здания,
                      часто реконструированные под офисы из другого назначения, с базовой отделкой
                      и минимальным набором сервисов; ставки аренды здесь обычно ниже, чем в
                      других классах. Единой обязательной сертификации классов в Беларуси нет —
                      застройщики и управляющие компании присваивают класс сами, ориентируясь на
                      международную практику (стандарты вроде BOMA/Euromoney), поэтому у объектов
                      одного и того же формального класса от разных застройщиков сервис может
                      заметно отличаться.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-bold text-ink">География: где сосредоточены бизнес-центры</h3>
                    <p>
                      {topDistrictsByCount.length > 0 && (
                        <>
                          Больше всего бизнес-центров в каталоге приходится на{' '}
                          {topDistrictsByCount
                            .map(([d, n]) => `${d} район (${n})`)
                            .join(', ')}
                          .{' '}
                        </>
                      )}
                      {Object.keys(classDistrictBreakdown).length > 0 && (
                        <>
                          По деловым классам распределение неравномерно:{' '}
                          {Object.entries(classDistrictBreakdown)
                            .map(([cls, district]) => `класс ${cls} чаще всего встречается в ${district} районе`)
                            .join(', ')}
                          .
                        </>
                      )}
                    </p>
                  </div>

                  {underConstructionNames.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-sm font-bold text-ink">Что сейчас строится</h3>
                      <p>
                        Сейчас в каталоге {underConstructionNames.length}{' '}
                        {underConstructionNames.length === 1 ? 'строящийся объект' : 'строящихся объекта'}:{' '}
                        {underConstructionNames.join(', ')}. Раздел обновляется по мере появления
                        новых данных о ходе строительства и сроках сдачи.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-bold text-ink">На что смотреть при выборе офиса</h3>
                    <p>
                      Кроме класса и площади, на комфорт работы в здании и итоговую стоимость
                      аренды влияет ряд менее очевидных параметров: транспортная доступность
                      (расстояние до метро и наличие парковки — как для сотрудников, так и для
                      посетителей), тип планировки (открытая планировка гибче под рост команды,
                      кабинетная — привычнее для части бизнесов), состав инфраструктуры в самом
                      здании и рядом с ним (кафе, банки, аптеки), качество управления зданием
                      (скорость реакции на заявки, чистота, охрана) и состав соседей — в одном
                      бизнес-центре с вами могут работать десятки других компаний, что важно и для
                      деловых контактов, и для общей атмосферы. Отдельно стоит уточнять условия
                      договора аренды: минимальный срок, порядок индексации ставки и то, что
                      входит в эксплуатационные платежи помимо самой аренды.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-bold text-ink">Из чего складывается ставка аренды</h3>
                    <p>
                      Итоговая ставка за квадратный метр обычно состоит из нескольких компонентов:
                      базовой арендной платы (зависит в первую очередь от класса здания и
                      расположения), эксплуатационных платежей (обслуживание инженерных систем,
                      уборка, охрана общих зон — часто выставляются отдельной строкой), коммунальных
                      платежей по факту потребления и, при необходимости отделки помещения под
                      арендатора, отдельного бюджета на ремонт. Ставки в разных бизнес-центрах
                      одного класса могут заметно различаться в зависимости от расположения,
                      возраста здания и текущей заполняемости — актуальные предложения по
                      конкретным зданиям смотрите в карточках объектов, в разделе «Объявления с
                      Kufar и Realt».
                    </p>
                  </div>

                </div>
              </div>
            )}

            {faqItems.length > 0 && (
              <div id="faq" className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
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
            <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
              <h2 className="text-lg font-bold text-ink">Источники</h2>
              <div className="flex flex-wrap gap-2">
                {GENERAL_DATA_SOURCES.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary">
                    {source.label}
                  </a>
                ))}
              </div>
              <p className="text-xs text-ink-muted">Фото «Футуриса»: <a href="https://domovita.by/bc-bcfuturis" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">Domovita</a>.</p>
              <p className="text-xs text-ink-muted">Данные каталога собраны из открытых источников; не каждый источник содержит сведения о каждом здании. Единой даты обновления всех характеристик нет: сведения дополняются по мере получения.</p>
              <p className="text-xs text-ink-muted">{latestSnapshotPeriod ? `Последний период загруженных рыночных снимков: ${latestSnapshotPeriod}. Точная дата обновления в данных не указана.` : 'Период рыночных снимков недоступен.'}</p>
              <p className="text-xs text-ink-muted">{rentMethodology} Ставки — из объявлений, не из заключённых сделок; состав дополнительных платежей уточняйте у автора объявления.</p>
              <p className="text-xs text-ink-muted">У части зданий параметры не заполнены. Суммарная площадь учитывает только известные значения, расстояния до метро указаны по прямой. Внешний контекст рынка подписан источником и периодом в соответствующем блоке.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
