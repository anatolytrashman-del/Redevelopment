import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  DollarSign,
  HardHat,
  Heart,
  MapPin,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { pluralRu } from '../lib/pluralRu';
import { fitsSerpTitle } from '../lib/serpTitleWidth';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { PhotoBlock, FactTile } from '../components/businessCenters/BusinessCenterVisuals';
import { CatalogFilterPanel } from '../components/businessCenters/CatalogFilterPanel';
import { CatalogCompare } from '../components/businessCenters/CatalogCompare';
import { FavoriteButton } from '../components/businessCenters/FavoriteButton';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { useFavorites } from '../lib/favoritesContext';
import {
  businessCenterHubDescription,
  setArticleJsonLd,
  setBreadcrumbJsonLd,
  setFaqJsonLd,
  setGenericPageMeta,
  setItemListJsonLd,
  setNoIndex,
  clearNoIndex,
} from '../lib/pageMeta';
import {
  businessCenterPhotoSrc,
  formatMetroDistance,
  shortAddress,
  shortName,
  streetOfAddress,
} from '../lib/businessCenterDisplay';
import { nearestMetroStation } from '../lib/metroStations';
import {
  CLASS_SLUG_TO_VALUE,
  DISTRICT_SLUG_TO_NAME,
  MICRODISTRICT_SLUG_TO_NAME,
  MIN_INDEXABLE_HUB_CENTERS,
  classDistrictHubUrl,
  classHubUrl,
  districtHubUrl,
  districtPrepositional,
  microdistrictHubUrl,
  METRO_SLUG_TO_STATION,
  metroHubUrl,
  metroHubDistance,
  metroHubIncludesMicrodistrict,
  STREET_SLUG_TO_NAME,
  streetHubUrl,
} from '../lib/businessCenterHubs';
import { BUSINESS_CENTER_CLASSES, type BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters, snapshotBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { fetchBusinessCenterLotSizes } from '../lib/businessCenterOffersApi';
import { MIN_RELIABLE_N, type MarketSnapshot } from '../data/marketSnapshots';
import {
  EMPTY_CATALOG_FILTER,
  MAX_COMPARE,
  METRO_LINE_DOT_CLASS,
  METRO_WITHIN_OPTIONS,
  buildOfferIndex,
  catalogFilterToQuery,
  catalogSummary,
  hasActiveCatalogFilter,
  matchesCatalogFilter,
  metroLineId,
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
// Константа только для корня каталога, и это БАЗА заголовка, а не готовый
// заголовок: число зданий и год дописываются к ней там же, где и к
// подборкам (см. hubBaseTitle в эффекте ниже). Отдельной константы
// DESCRIPTION с 2026-09-22 нет — описание у всех состояний каталога,
// включая корень, строит businessCenterHubDescription.
const TITLE = 'Бизнес-центры Минска';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk';
const UNDER_CONSTRUCTION_HUB_URL = 'https://redevelopment.pro/minsk/bcminsk/stroyashchiesya';
const OG_IMAGE = 'https://redevelopment.pro/og-image.png';

// Заголовок и подзаголовок hero — первая версия составлена Gemini (через
// ProxyAPI), владелец переписал вручную (2026-09-04), затем ещё раз попросил
// переформулировать: "не нравится слово «всех» и «помогаем»" — выбрал из
// трёх предложенных вариантов ("А"). 2026-09-22: каталог перерос узкую
// аудиторию "аналитик/инвестор" — владелец попросил формулировку для
// обычного посетителя, которому нужна информация о БЦ, а не только подбор
// офиса; аналитика при этом должна остаться заметной, не потеряться.
const PAGE_H1 = 'Бизнес-центры Минска: каталог и аналитика рынка';
const INTRO_TEXT =
  'Всё о бизнес-центрах Минска в одном месте — инфраструктура, помещения в аренду и на продажу, арендаторы, отзывы и фото.';

// Тот же снимок «Футуриса» в исходном размере 1600×1067 (Domovita).
// Источник: https://domovita.by/bc-bcfuturis — фото 4. Дефолт для голого
// каталога (ни одной оси хаба) и для любого хаба, где ни у одного БЦ
// подборки нет своего фото.
const HERO_IMAGES: string[] = ['/images/business-centers-hero/futuris-1600.jpg'];
const HERO_IMAGE_WIDTH = 1600;
const HERO_IMAGE_HEIGHT = 1067;

// Этап 1 (владелец, 2026-09-22): на хаб-странице подборки (метро/район/
// класс/микрорайон/улица/стройка) hero-фото — снимок ЛУЧШЕГО БЦ этой
// подборки, а не всегда один и тот же «Футурис» — раньше на «БЦ у метро
// «Немига»» висело фото здания, которое к Немиге не имеет отношения.
// «Лучший» — класс важнее рейтинга (B+ всегда выше B независимо от
// отзывов), при равном классе выше рейтинг 2GIS, число отзывов —
// последний тай-брейк. Кандидат без единого фото в `photos` не участвует —
// заменить статичный снимок нечем.
const HERO_CENTER_CLASS_RANK: Record<string, number> = { A: 4, 'B+': 3, B: 2, C: 1 };

function pickHeroCenter(list: BusinessCenter[]): BusinessCenter | null {
  const withPhoto = list.filter((c) => c.photos.length > 0);
  if (withPhoto.length === 0) return null;
  return [...withPhoto].sort((a, b) => {
    const rankDiff =
      (HERO_CENTER_CLASS_RANK[b.businessClass ?? ''] ?? 0) - (HERO_CENTER_CLASS_RANK[a.businessClass ?? ''] ?? 0);
    if (rankDiff !== 0) return rankDiff;
    const ratingDiff = (b.gisRating ?? 0) - (a.gisRating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return (b.gisReviewCount ?? 0) - (a.gisReviewCount ?? 0);
  })[0];
}

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
const FILTER_QUERY_KEYS = ['class', 'status', 'district', 'microdistrict', 'metro', 'station', 'lot', 'facts', 'q', 'view', 'sort', 'compare'];

// Карточка каталога — упрощённый вид (владелец, 2026-09-19: квадратные
// фото под новую фотосъёмку БЦ, карточка сведена к минимуму — фото,
// название, адрес, кнопка «Подробнее»). Класс/статус, площадь/этажность/
// метро и отметка «Сравнить» с карточки убраны сознательно — это осознанный
// откат от плотной карточки К7/К8 (docs/bc-catalog-redesign-plan.md) к
// простому виду для нового набора фото. «Сравнить» остаётся доступным по
// прямой ссылке (?compare=slug,slug — CatalogCompare.tsx), просто больше не
// включается кликом на карточке.
// Мобильный — ДВЕ карточки в ряд (владелец, 2026-09-22: «может попробуем
// формат 2 карточек на экране?»). В одну колонку карточка занимала ~490 px
// (фото 358 + текст 132) — полтора экрана на 143 БЦ. В две колонки фото
// 173 px, карточка ~245 px, на экране шесть карточек вместо полутора, а
// здание в кадре всё ещё различимо (проверено на макетах с живыми фото).
// Квадрат оставлен как есть: файлы `*-card.webp` нарезаны 640×640, любой
// другой формат пришлось бы докропить, срезав аэросъёмку сверху и снизу.
// Отсюда мобильные варианты классов ниже: мельче шрифт и отступы, адрес и
// станция в одну строку с обрезкой, «Подробнее» скрыта (вся карточка и так
// ссылка, а 36 px в каждой карточке — заметная доля экрана). На sm и шире
// всё возвращается к прежнему виду — это правка одного только мобильного.
export function BusinessCenterCard({ center }: { center: BusinessCenter }) {
  const nearestMetro = nearestMetroStation(center.nearestMetroStations);
  return (
    <Link
      to={`/minsk/bcminsk/${center.slug}`}
      className={cn(
        'group flex h-full min-w-0 flex-col overflow-hidden transition-transform hover:-translate-y-0.5',
        glassCardClass,
      )}
      style={glassCardShadow}
    >
      {/* pt-[100%] вместо aspect-square — тот же Safari-баг, что уже правили
          в hero БЦ (docs/session-journal.md, 2026-09-17): Grid + CSS
          aspect-ratio на карточке в её же потоке "плывёт" в Safari, а
          padding-подложка с абсолютным фото внутри — нет. */}
      <div className="relative w-full overflow-hidden pt-[100%]">
        <div className="absolute inset-0">
          <PhotoBlock center={center} variant="card" />
        </div>
        {/* max-w на мобильном — чтобы пара «Класс + Строится» не заезжала
            под сердечко в узкой колонке: не влезло в строку — переносится
            под первым бейджем (flex-wrap), а не под кнопку избранного. */}
        <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-2.75rem)] flex-wrap items-start gap-1 sm:left-2 sm:top-2 sm:max-w-none sm:gap-1.5">
          {center.businessClass && (
            <span className="rounded-full bg-ink-muted/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm sm:px-2.5 sm:py-1 sm:text-xs">
              {`Класс ${center.businessClass}`}
            </span>
          )}
          {center.status === 'under_construction' && (
            <span className="flex items-center gap-1 rounded-full bg-ink-muted/90 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm sm:px-2.5 sm:py-1 sm:text-xs">
              <HardHat className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              Строится
            </span>
          )}
        </div>
        <FavoriteButton slug={center.slug} className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5 sm:gap-2.5 sm:p-4">
        <h2 className="line-clamp-2 text-[13px] font-bold leading-tight text-ink sm:line-clamp-none sm:text-base sm:leading-snug">
          {shortName(center)}
        </h2>
        {/* На мобильном адрес и станция обрезаются в одну строку: перенос
            в узкой колонке разваливает карточку на разную высоту, а
            расстояние до метро (самое ценное в строке) остаётся видно
            всегда — оно вынесено отдельным shrink-0 элементом. */}
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted sm:gap-2 sm:text-xs">
          <MapPin className="h-3 w-3 shrink-0 text-ink-faint sm:h-4 sm:w-4" />
          <span className="truncate sm:whitespace-normal sm:text-balance">{shortAddress(center.address)}</span>
        </div>
        {nearestMetro ? (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted sm:gap-2 sm:text-xs">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5',
                metroLineId(nearestMetro.line) ? METRO_LINE_DOT_CLASS[metroLineId(nearestMetro.line)!] : 'bg-ink-faint',
              )}
            />
            <span className="truncate sm:whitespace-normal sm:text-balance">
              {nearestMetro.name}
              <span className="hidden sm:inline"> — {formatMetroDistance(nearestMetro.distanceMeters)}</span>
            </span>
            <span className="shrink-0 font-semibold sm:hidden">{formatMetroDistance(nearestMetro.distanceMeters)}</span>
          </div>
        ) : (
          center.metro && (
            // Точного расстояния (2GIS/расчёт по прямой) нет — станция дальше
            // 2 км или источник дал только описание словами. Показываем как
            // есть, серой точкой вместо цвета линии (владелец, 2026-09-20:
            // на карточках не должно быть "дыр" там, где хоть что-то о метро
            // известно).
            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted sm:gap-2 sm:text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full bg-ink-faint sm:h-2.5 sm:w-2.5" />
              <span className="truncate sm:whitespace-normal sm:text-balance">{center.metro}</span>
            </div>
          )
        )}
        <div className="mt-auto hidden justify-start pt-1 sm:flex">
          <span className="flex items-center gap-1 rounded-full bg-ink-muted/10 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors group-hover:bg-ink-muted group-hover:text-white">
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
  const { id: favoritesId, slugs: favoriteSlugs } = useFavorites();
  // Стартуем с данных, положенных в сборку (Ш3-b плана
  // docs/bc-catalog-seo-plan.md): их разобрал main.tsx до монтирования,
  // поэтому первый же рендер получается полным — без «Загрузка…» поверх
  // готовой разметки пререндера и без прыжка вёрстки. Нет снимка (SPA-
  // переход, страница вне раздела) — как раньше, null и запрос ниже.
  const [centers, setCenters] = useState<BusinessCenter[] | null>(snapshotBusinessCenters);
  const [officeSnapshots, setOfficeSnapshots] = useState<MarketSnapshot[] | null>(null);
  // Только слаг и площадь каждого лота (~618 строк, два поля) — для фильтра
  // «нужен офис от N м²» (offerIndex ниже; блок «Сейчас сдаётся» переехал на
  // /minsk/bcminsk/analytics, но тот же offerIndex нужен и здесь для чипа).
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
  }, []);

  // Единственная ось — класс ИЛИ район (не комбо, не микрорайон/метро/
  // улица/стройка): market_snapshots не хранит срез по пересечению класс×
  // район, показывать его для комбо значило бы либо молчать, либо
  // выдумывать — оставляем блок только там, где реальный срез есть.
  // Городской срез (ни класс, ни район не выбраны) сюда больше не попадает
  // (владелец, 2026-09-22) — те же цифры уже на /minsk/bcminsk/analytics,
  // на голом каталоге это было тем же дублем, что и остальные блоки разбора
  // рынка (см. тизер «Аналитика каталога БЦ» ниже).
  const rateSliceKey = classFilter && !districtFilter ? classFilter : !classFilter && districtFilter ? districtFilter : null;
  const rateSliceType: MarketSnapshot['sliceType'] | null = classFilter && !districtFilter ? 'class' : !classFilter && districtFilter ? 'district' : null;
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
  // разобранному фильтру: так признак не зависит от порядка объявлений.
  const filterIsIndexable = !FILTER_QUERY_KEYS.some((k) => searchParams.has(k));

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
          (metroFilter === null ||
            metroHubDistance(c, metroFilter) !== null ||
            metroHubIncludesMicrodistrict(c, metroFilter)) &&
          (streetFilter === null || streetOfAddress(c.address) === streetFilter),
      ),
    [centers, microdistrictFilter, underConstruction, metroFilter, streetFilter],
  );

  const visibleCenters = useMemo(
    () => routeScoped.filter((c) => matchesCatalogFilter(c, filter, offerIndex)),
    [routeScoped, filter, offerIndex],
  );

  // Смежные подборки (Ш2 плана docs/bc-catalog-seo-plan.md). Аудит
  // 2026-09-22: 48 URL раздела не имели НИ ОДНОЙ входящей ссылки со всего
  // сайта — 19 хабов улиц, 15 «класс + район», 10 микрорайонов. Причина:
  // блок рекомендаций на карточке БЦ показывается, только когда в срезе
  // есть ДРУГИЕ здания, а ковёр чипов-срезов убран с видимой части сайта
  // тем же днём.
  //
  // Это НЕ возврат ковра: строка живёт только на хабе района и на хабе
  // класса (на корне каталога её нет), перечисляет соседние срезы той же
  // географии и не показывает то, что мы сами закрыли от индекса — порог
  // MIN_INDEXABLE_HUB_CENTERS здесь тот же, что у noindex, иначе ссылка
  // вела бы на страницу, которую сами же и не пускаем в индекс.
  //
  // Улицы и микрорайоны считаются ПО ВСЕМУ ГОРОДУ, а не внутри района:
  // порогом распоряжается сама целевая страница, а она показывает улицу
  // целиком, даже если та проходит по двум районам.
  const crossHubGroups = useMemo(() => {
    const all = centers ?? [];
    if (all.length === 0) return [];
    const isDistrictHub = Boolean(districtFilter) && !classFilter && !microdistrictFilter && !metroFilter && !streetFilter && !underConstruction;
    const isClassHub = Boolean(classFilter) && !districtFilter && !microdistrictFilter && !metroFilter && !streetFilter && !underConstruction;
    const groups: { title: string; links: { label: string; url: string }[] }[] = [];
    const big = (n: number) => n >= MIN_INDEXABLE_HUB_CENTERS;

    if (isDistrictHub && districtFilter) {
      const inDistrict = all.filter((c) => c.district === districtFilter);
      const classLinks = BUSINESS_CENTER_CLASSES.flatMap((cls) => {
        const n = inDistrict.filter((c) => c.businessClass === cls).length;
        const url = big(n) ? classDistrictHubUrl(cls, districtFilter) : null;
        return url ? [{ label: `Класс ${cls} (${n})`, url }] : [];
      });
      if (classLinks.length) groups.push({ title: `Классы в ${districtPrepositional(districtFilter)} районе`, links: classLinks });

      const microLinks = Array.from(new Set(inDistrict.map((c) => c.microdistrict).filter((v): v is string => !!v)))
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .flatMap((name) => {
          const n = all.filter((c) => c.microdistrict === name).length;
          const url = big(n) ? microdistrictHubUrl(name) : null;
          return url ? [{ label: `${name} (${n})`, url }] : [];
        });
      if (microLinks.length) groups.push({ title: 'Микрорайоны', links: microLinks });

      const streetLinks = Array.from(new Set(inDistrict.map((c) => streetOfAddress(c.address)).filter((v): v is string => !!v)))
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .flatMap((name) => {
          const n = all.filter((c) => streetOfAddress(c.address) === name).length;
          const url = big(n) ? streetHubUrl(name) : null;
          return url ? [{ label: `${name} (${n})`, url }] : [];
        });
      if (streetLinks.length) groups.push({ title: 'Улицы', links: streetLinks });
    }

    if (isClassHub && classFilter) {
      const districtLinks = Array.from(new Set(all.filter((c) => c.businessClass === classFilter).map((c) => c.district).filter((v): v is string => !!v)))
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .flatMap((name) => {
          const n = all.filter((c) => c.businessClass === classFilter && c.district === name).length;
          const url = big(n) ? classDistrictHubUrl(classFilter, name) : null;
          return url ? [{ label: `${name} район (${n})`, url }] : [];
        });
      if (districtLinks.length) groups.push({ title: `Класс ${classFilter} по районам`, links: districtLinks });
    }

    return groups;
  }, [centers, districtFilter, classFilter, microdistrictFilter, metroFilter, streetFilter, underConstruction]);

  // Число зданий в разделе и порог индексации производных срезов (Ш2 плана
  // docs/bc-catalog-seo-plan.md). Считается при рендере, а не внутри
  // эффекта: на него смотрят все три эффекта разметки (мета, FAQ, ItemList),
  // и разъехаться они не должны.
  //
  // Пока каталог не приехал, числа нет: «0 зданий» в заголовке хуже, чем
  // заголовок без числа. Пререндер снимает готовую страницу, поэтому в HTML
  // для поисковика число уже стоит.
  const hubCount = centers === null ? null : visibleCenters.length;
  // Срез улицы, микрорайона или «класс + район» с одним-двумя зданиями почти
  // повторяет карточку БЦ — в индекс такую страницу не пускаем (почему
  // именно эти три оси и почему не метро/район/класс — см. комментарий у
  // MIN_INDEXABLE_HUB_CENTERS).
  const thinDerivedHub =
    hubCount !== null &&
    hubCount < MIN_INDEXABLE_HUB_CENTERS &&
    Boolean(streetFilter || microdistrictFilter || (classFilter && districtFilter));
  // Единственный ответ на вопрос «эту страницу индексируем?»: и мета, и FAQ,
  // и ItemList смотрят сюда.
  const pageIsIndexable = !notFound && filterIsIndexable && !thinDerivedHub;

  // Мета-теги каталога. Эффект стоит ПОСЛЕ visibleCenters сознательно: с
  // 2026-09-22 в заголовок и описание подставляется число зданий в
  // разделе, а массив зависимостей вычисляется прямо при рендере — выше
  // объявления visibleCenters он упал бы на temporal dead zone.
  useEffect(() => {
    if (notFound) {
      setNoIndex();
      return () => clearNoIndex();
    }
    // Сниппет каталога собран по тому же правилу, что и сниппет карточки БЦ
    // (см. fallbackBusinessCenterMeta в src/lib/pageMeta.ts): владелец,
    // 2026-09-22, задал формат «Актуальная аналитика … Обновляется
    // ежемесячно. <что внутри>». Раньше у всех подборок описание было одним
    // и тем же скелетом («адреса, деловой класс, площадь, метро») — на
    // четырёх десятках страниц это duplicate meta descriptions, из-за
    // которых Google и подменяет описание своим текстом. Число зданий
    // делает каждую подборку своей и заодно отвечает на вопрос,
    // ради которого на такую страницу и заходят.
    const hubBaseTitle = underConstruction
      ? 'Строящиеся бизнес-центры Минска'
      : metroFilter
        ? `Бизнес-центры у метро ${metroFilter}`
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
    // Родительный падеж — под «Актуальная аналитика N ...», и падеж зависит
    // от самого N: «аналитика 5 бизнес-центров», но «аналитика 141
    // бизнес-центра». Без этого на корне каталога стояло бы «аналитика 141
    // бизнес-центров» — ошибка в первой же строке сниппета.
    const one = hubCount !== null && hubCount % 10 === 1 && hubCount % 100 !== 11;
    const bc = one ? 'бизнес-центра' : 'бизнес-центров';
    const hubSubject = underConstruction
      ? `${one ? 'строящегося' : 'строящихся'} ${bc} Минска`
      : metroFilter
        ? `${bc} у метро ${metroFilter}`
        : streetFilter
          ? `${bc} на «${streetFilter}» в Минске`
          : classFilter && districtFilter
        ? `${bc} класса ${classFilter} в ${districtPrepositional(districtFilter)} районе Минска`
        : classFilter
          ? `${bc} класса ${classFilter} в Минске`
          : districtFilter
            ? `${bc} в ${districtPrepositional(districtFilter)} районе Минска`
            : microdistrictFilter
              ? `${bc} в микрорайоне ${microdistrictFilter} (Минск)`
              : `${bc} Минска`;
    // Число зданий — то, ради чего на подборку и заходят, поэтому оно стоит
    // в заголовке, а не только в описании. Варианты перебираются от полного
    // к короткому: обрезка выдачи съедает хвост, и «…— 4 здания, обз…»
    // выглядело бы браком. У длинных осей (класс × район) уступается год,
    // у самых длинных — само число.
    const hubYear = new Date().getFullYear();
    const hubTitle =
      hubCount === null
        ? hubBaseTitle
        : ([
            `${hubBaseTitle} — ${hubCount} ${pluralRu(hubCount, 'здание', 'здания', 'зданий')}, обзор ${hubYear}`,
            `${hubBaseTitle} — ${hubCount} ${pluralRu(hubCount, 'здание', 'здания', 'зданий')}`,
            hubBaseTitle,
          ].find(fitsSerpTitle) ?? hubBaseTitle);
    const hubDescription = businessCenterHubDescription(hubSubject, hubCount);
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

    // Состояние, набранное фильтром (?class=A&metro=…), в индекс не идёт —
    // но ссылкой им делятся, и до 2026-09-22 такая страница оставалась с
    // ДЕФОЛТНЫМИ тегами index.html: заголовок, описание и og:image «Red One»,
    // canonical — на /minsk/one. То есть ссылка на отфильтрованный каталог
    // разворачивалась в мессенджере превью совсем другого объекта, а
    // canonical указывал на чужую страницу, хотя по замыслу (см.
    // filterIsIndexable выше) он всегда должен вести на хаб. Теперь мета
    // своя и canonical на хабе, а от индекса состояние закрывает noindex.
    // Разметку (Article, крошки, ItemList, FAQ) такому состоянию не даём:
    // она для индексируемых страниц, и setGenericPageMeta её уже сбросил.
    // ...а вот разметку (Article, крошки, ItemList, FAQ) страницы вне индекса
    // не получают: она для индексируемых состояний, и setGenericPageMeta её
    // уже сбросил. Сюда попадают и состояния под фильтром, и тонкие срезы.
    if (!pageIsIndexable) {
      setNoIndex();
      return () => clearNoIndex();
    }

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
                    ? `Метро ${metroFilter}`
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
  }, [classFilter, districtFilter, microdistrictFilter, underConstruction, metroFilter, streetFilter, notFound, pageIsIndexable, centers, hubCount]);

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

  // Подборка для hero-фото — та же "вселенная" маршрута (routeScoped), что
  // и у счётчиков на чипах фильтра, плюс класс/район из самого ПУТИ (не из
  // query-фильтра — ручные фильтры посетителя не должны менять фото шапки).
  const hubCenters = useMemo(
    () =>
      routeScoped.filter(
        (c) =>
          (classFilter === null || c.businessClass === classFilter) &&
          (districtFilter === null || c.district === districtFilter),
      ),
    [routeScoped, classFilter, districtFilter],
  );
  // На голом каталоге (ни одной оси хаба) подборки нет — там дефолтный
  // снимок Футуриса, как и раньше.
  const hasHubAxis = Boolean(
    classFilter || districtFilter || microdistrictFilter || metroFilter || streetFilter || underConstruction,
  );
  const heroCenter = useMemo(() => (hasHubAxis ? pickHeroCenter(hubCenters) : null), [hasHubAxis, hubCenters]);

  // Классы и районы для чипов — весь набор, встречающийся в данных (не
  // урезанный по другой оси, как было у старого сайдбара): вместо того
  // чтобы прятать варианты, чип показывает живой счётчик и гаснет на нуле.
  // Порядок — как на рынке (A, B+, B, C), а не алфавитный: .sort() ставил
  // «B» перед «B+», потому что для строк «B» < «B+».
  const availableClasses = useMemo(() => {
    const present = new Set((centers ?? []).map((c) => c.businessClass).filter((v): v is NonNullable<typeof v> => !!v));
    return BUSINESS_CENTER_CLASSES.filter((cls) => present.has(cls));
  }, [centers]);
  // Статус — построено/строится — не показываем на хабе «Строящиеся»
  // (/minsk/bcminsk/stroyashchiesya): там ось уже задана маршрутом, чип
  // «Построенные» показал бы только нули.
  const availableStatuses = useMemo(
    () => (underConstruction ? [] : Array.from(new Set((centers ?? []).map((c) => c.status)))),
    [centers, underConstruction],
  );
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
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const status of availableStatuses) m[status] = countWith({ statuses: [status] });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableStatuses, routeScoped, filter, offerIndex]);
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

  const bcCountLabel = centers ? `${visibleCenters.length} ${pluralBusinessCenters(visibleCenters.length)}` : 'бизнес-центры';

  // Полоска сводки над сеткой (К1): пересчитывается под фильтр. С
  // 2026-09-22 это единственная сводка в теле каталога — карточка «Рынок в
  // цифрах» снята и с корня, и с хабов.
  const summary = useMemo(() => catalogSummary(visibleCenters, offerIndex), [visibleCenters, offerIndex]);

  // Для SEO-текста нужны АБСОЛЮТНЫЕ числа по районам, а не счётчики чипов
  // (те зависят от текущего фильтра): фраза «больше всего БЦ приходится на
  // такой-то район» описывает рынок, а не выборку пользователя.
  const districtTotals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) if (c.district) counts[c.district] = (counts[c.district] ?? 0) + 1;
    return counts;
  }, [centers]);

  // Цифры выборки для FAQ (с 2026-09-22 только для него — видимой карточки
  // «Рынок в цифрах» на странице больше нет); метро — по координатам.
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
      ? `у метро ${metroFilter}`
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
  // Ни одна ось не выбрана — голый каталог (то, что раньше называли
  // "главной"). Не зависит от того, пришли ли уже centers — доступно сразу
  // из useParams(), в отличие от isGeneralCatalog ниже.
  const isCatalogRoot = !classFilter && !districtFilter && !microdistrictFilter && !underConstruction && !metroFilter && !streetFilter;
  // Тот же голый каталог, но уже с загруженными зданиями. Владелец,
  // 2026-09-22: именно его расчищаем — срезы каталога и текст «Как устроен
  // рынок бизнес-центров в Минске» уехали отсюда на /minsk/bcminsk/gid,
  // здесь вместо них одна строка-ссылка туда.
  const isGeneralCatalog = isCatalogRoot && centers !== null && centers.length > 0;

  const rentMethodology = summary.rentMedian != null
    ? `Медиана аренды — $${summary.rentMedian}/м² в месяц, по ${summary.rentBuildings} зданиям текущей выборки с объявлениями. Сначала берётся медиана ставки объявлений каждого здания, затем медиана этих значений; при чётном числе — среднее двух центральных. Площадь здания не служит весом.`
    : 'Медиана аренды для текущей выборки не рассчитана: нет доступных медиан по зданиям с объявлениями.';

  const faqItems = useMemo(() => {
    if (centers === null) return [];
    const items: { question: string; answer: string }[] = [];
    const add = (question: string, answer: string) => items.push({ question, answer });
    add(`Сколько бизнес-центров ${scopeLabel} есть в текущей выборке?`, `Найдено ${marketStats.total} зданий с учётом выбранных фильтров.`);
    const groupNames = (entries: [string, number][]) => `${entries.slice(0, 2).map(([name]) => `«${name}»`).join(' и ')}${entries.length > 2 ? ` и ещё ${entries.length - 2}` : ''}`;
    const extremes = (entries: [string, number][], most: string, least: string, equal: string, format: (value: number) => string) => {
      const sorted = [...entries].sort((a, b) => b[1] - a[1]);
      const max = sorted[0][1];
      const min = sorted[sorted.length - 1][1];
      if (max === min) return `${equal} — ${format(max)}.`;
      const high = sorted.filter(([, value]) => value === max);
      const low = sorted.filter(([, value]) => value === min);
      return `${most}: ${groupNames(high)} — ${high.length > 1 ? 'по ' : ''}${format(max)}. ${least}: ${groupNames(low)} — ${low.length > 1 ? 'по ' : ''}${format(min)}.`;
    };
    if (marketStats.withAreaCount > 0) add('Какая суммарная площадь зданий?', `${Math.round(marketStats.totalArea).toLocaleString('ru-RU')} м². Площадь известна у ${marketStats.withAreaCount} из ${marketStats.total} зданий выборки. Суммируем только их площади.`);
    if (Object.keys(marketStats.byClass).length) add('Как здания выборки распределены по классам?', (() => {
      const classes = Object.entries(marketStats.byClass);
      if (classes.length === 1) return `В выборке один известный класс — ${classes[0][0]}. К нему относятся ${classes[0][1]} БЦ.`;
      return `В выборке классов: ${classes.length}. ${extremes(classes, 'Больше всего зданий в классах', 'Меньше всего в классах', 'В каждом классе поровну', (n) => `${n} БЦ`)}`;
    })());
    if (Object.keys(districtTotals).length) add('Как весь каталог распределён по районам?', (() => {
      const districts = Object.entries(districtTotals);
      const parts = [districts.length === 1
        ? `В каталоге один район — «${districts[0][0]}», ${districts[0][1]} БЦ.`
        : `В каталоге районов: ${districts.length}. ${extremes(districts, 'Больше всего БЦ в районах', 'Меньше всего в районах', 'В каждом районе поровну', (n) => `${n} БЦ`)}`];
      const areas: [string, number][] = districts.map(([district]) => [district, (centers ?? []).filter((c) => c.district === district).reduce((sum, c) => sum + (c.totalArea ?? 0), 0)]);
      const knownAreas = areas.filter(([, area]) => area > 0).sort((a, b) => b[1] - a[1]);
      if (knownAreas.length) {
        const largest = knownAreas.filter(([, area]) => area === knownAreas[0][1]);
        parts.push(`Площади сравниваем только у зданий, где они известны. Наибольшая сумма площадей: ${groupNames(largest)} — ${largest.length > 1 ? 'по ' : ''}${Math.round(knownAreas[0][1]).toLocaleString('ru-RU')} м².`);
      }
      const rates: [string, number][] = districts.flatMap(([district]) => {
        const rate = (officeSnapshots ?? []).find((s) => s.sliceType === 'district' && s.deal === 'rent' && s.sliceKey === district)?.median;
        return rate != null ? [[district, rate] as [string, number]] : [];
      });
      if (rates.length === 1) parts.push(`Медиана аренды известна только для района «${rates[0][0]}» — $${rates[0][1]}/м².`);
      else if (rates.length > 1) parts.push(`Медианы аренды есть для ${rates.length} районов. ${extremes(rates, 'Самая высокая медиана', 'Самая низкая', 'Во всех этих районах медиана одинаковая', (rate) => `$${rate}/м²`)}`);
      return parts.join(' ');
    })());
    if (marketStats.withMetroCount > 0) add('Сколько зданий рядом с метро?', `Не дальше 800 м от ближайшего метро — ${marketStats.nearMetro} БЦ. Расстояние известно для ${marketStats.withMetroCount} зданий выборки. Считаем только их.`);
    if (metroFilter && orderedCenters.length) {
      const nearest = [...orderedCenters].sort((a, b) => (metroHubDistance(a, metroFilter) ?? Infinity) - (metroHubDistance(b, metroFilter) ?? Infinity))[0];
      const distance = metroHubDistance(nearest, metroFilter);
      if (distance != null) add(`Какой бизнес-центр ближе всего к метро ${metroFilter}?`, `${shortName(nearest)} — ${distance} м. В подборку станции входят здания не дальше 1,5 км.`);
    }
    add('Сколько зданий в выборке строится?', `Сейчас строится ${marketStats.underConstruction} БЦ.${underConstructionNames.length ? ` ${underConstructionNames.length > 3 ? 'Среди них' : 'Это'}: ${underConstructionNames.slice(0, 3).join(', ')}${underConstructionNames.length > 3 ? ` и ещё ${underConstructionNames.length - 3}` : ''}.` : ''}`);
    if (summary.rentMedian != null) add('Какая медианная ставка аренды и как она рассчитана?', rentMethodology);
    if (showRatesBlock) {
      for (const [label, deal, rate] of [['аренды', 'rent', rateRent], ['продажи', 'sale', rateSale]] as const) {
        if (rate?.median != null) add(`Какая ставка ${label} в блоке рыночных ставок?`, `${formatRate(rate.median, deal)} по ${rate.n} объявлениям Kufar, Realt, Domovita и Megapolis.${rate.period ? ` Период: ${rate.period.slice(0, 7)}.` : ''}${rate.n < MIN_RELIABLE_N ? ' Объявлений мало, ставка лишь ориентировочная.' : ''} Это медиана ставок в объявлениях для выбранной части рынка.`);
      }
    }
    // Управление зданиями, текущие объявления и внешний контекст рынка —
    // переехали на /minsk/bcminsk/analytics вместе с блоками, которые эти
    // ответы описывали (владелец, 2026-09-22, см. комментарий у тизера
    // «Аналитика каталога БЦ» ниже в рендере).
    add('Где посмотреть, кто управляет зданиями и что сейчас сдаётся в каталоге?', 'На странице «Аналитика каталога БЦ». Там указано, кто управляет зданиями: товарищество собственников или единая УК. Там же — здания с активными объявлениями и диапазоны площади лотов. Данные внешних источников помогают оценить рынок офисов в целом.');
    add('Как работают фильтры и подборки?', 'Фильтры оставляют здания с выбранными характеристиками. Список и сводка обновляются вместе с фильтрами. Сортировка меняет порядок. Карточки, таблица и карта помогают просматривать результаты, сравнение — сопоставлять выбранные здания. В справочнике по бизнес-центрам Минска есть подборки по классу и статусу строительства. Там же можно выбрать район, микрорайон, улицу или метро. Полный список названий в справочнике ведёт на страницы зданий.');
    add('Что означает «параметр не известен»?', 'В источниках нет данных об этом параметре. Это не означает, что характеристики или услуги нет. Фильтр по признаку показывает только здания, у которых этот признак подтверждён данными.');
    return items;
  }, [centers, scopeLabel, marketStats, districtTotals, officeSnapshots, metroFilter, orderedCenters, underConstructionNames, summary.rentMedian, rentMethodology, showRatesBlock, rateRent, rateSale]);

  useEffect(() => {
    setFaqJsonLd(pageIsIndexable ? faqItems : []);
    return () => setFaqJsonLd([]);
  }, [faqItems, pageIsIndexable]);

  // ItemList — разметка самого перечня зданий (Ш1 плана
  // docs/bc-catalog-seo-plan.md). До 2026-09-22 её на каталоге и хабах не
  // было вовсе: setItemListJsonLd стоял только на пяти страницах рейтингов,
  // а каталог и 40+ его хабов — то есть основной перечень раздела — уходили
  // в индекс без разметки списка.
  //
  // Размечаем РОВНО ТО, что отрисовано в сетке (тот же срез, что у карточек
  // выше), а не всю выборку: на корне это 141 позиция лишних ~14 КБ в и без
  // того самом тяжёлом HTML раздела, и разметка описывала бы то, чего на
  // странице нет, пока не нажата «Показать ещё». Нажали — список в разметке
  // растёт вместе с сеткой.
  useEffect(() => {
    if (!pageIsIndexable) {
      setItemListJsonLd(null);
      return;
    }
    setItemListJsonLd(
      orderedCenters.slice(0, visibleCount).map((c) => ({
        name: shortName(c),
        url: `https://redevelopment.pro/minsk/bcminsk/${c.slug}`,
      })),
    );
    return () => setItemListJsonLd(null);
  }, [orderedCenters, visibleCount, pageIsIndexable]);

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
      ? `Бизнес-центры у метро ${metroFilter}`
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
      ? `Все бизнес-центры в пешей доступности от станции метро ${metroFilter} — от ближайшего к дальнему. В карточках — подробный обзор каждого бизнес-центра.`
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
          // Голова каталога раньше подменяла статичный INTRO_TEXT на подсчёт
          // зданий сразу после загрузки `centers` — из-за этого на доле
          // секунды был виден один текст, а сразу следом другой (владелец,
          // 2026-09-20: убрать мигание, оставить первую формулировку).
          // Подзаголовок статичный всегда, независимо от состояния загрузки.
          : INTRO_TEXT;

  const heroImages = heroCenter ? [businessCenterPhotoSrc(heroCenter.photos[0], 'detail')] : HERO_IMAGES;
  const heroImageWidth = heroCenter ? 1200 : HERO_IMAGE_WIDTH;
  const heroImageHeight = heroCenter ? 675 : HERO_IMAGE_HEIGHT;
  const heroImageAlt = heroCenter ? heroCenter.name : 'Бизнес-центры Минска';

  return (
    <div className="min-h-svh bg-bg">
      {/* Шапка — общий для всего каталога CatalogTopNav (владелец,
          2026-09-22). Раньше здесь лежала своя копия sticky-шапки с двумя
          ссылками; sticky-поведение («нравится, как на /minsk/minsk-mir
          логотип остаётся при скролле, сделай 1 в 1») переехало в сам
          компонент.
          navOffsetClassName — владелец, 2026-09-22: начало пунктов меню
          должно совпадать с началом ВИДИМОЙ карточки контента, а не с
          границей грид-колонки. На карточке здания это одно и то же, а
          здесь — нет: колонка (`lg:grid-cols-[200px_minmax(0,1fr)]
          lg:gap-10` ниже) шире самого контента, и он внутри неё
          центрируется ещё раз своим `mx-auto w-full max-w-3xl`. Из-за
          этого второго центрирования карточка стоит правее границы
          колонки, и выравнивание по границе (прежнее ml-16) промахивалось
          мимо неё на 40px при широком окне.

          Отсюда две слагаемые отступа:
          · 240px — колонка фильтров (200px) плюс gap-10 (40px);
          · (100% − 1008px) / 2 — то самое второе центрирование, где
            1008px = 240px колонки с gap + 768px (max-w-3xl) контента, а
            100% для margin-left считается от ШИРИНЫ КОНТЕНТА контейнера
            шапки, а она у шапки и у main здесь одна и та же (обе
            `mx-auto max-w-6xl px-4 sm:px-8`). max(0px, …) — потому что
            между lg (1024px) и 1152px контент уже упирается в колонку,
            центрировать нечего, и слагаемое обязано быть нулём, а не
            уводить меню влево.
          Минус ширина логотипа (176px, «REDEVELOPMENT» — текст
          фиксированного кегля, одинаков на любой ширине окна), потому что
          отступ отсчитывается от его конца: 240 − 176 = 64px.
          Активен с lg — раньше боковое меню на этой странице не
          показывается (шторка), совпадать не с чем. */}
      <CatalogTopNav
        centers={centers}
        width="max-w-6xl"
        navOffsetClassName="lg:ml-[calc(64px+max(0px,(100%-1008px)/2))]"
      />

      {/* <main> — единственный main-landmark (Accessibility «Document does
          not have a main landmark»), шапка — вне него. */}
      {/* Сетка и ширина основного контента — как на странице Минск Мира. */}
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-12 sm:px-8 sm:pt-12">
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside aria-label="Фильтры каталога" className="min-w-0 space-y-4 lg:sticky lg:top-24">
          {/* Отдельный блок, не часть CatalogFilterPanel (владелец,
              2026-09-21: "убери из правого бока, перенеси в левое меню, но
              не делай частью меню") — раньше был fixed-плашкой в правом
              нижнем углу и на мобильном перекрывался кнопкой "Фильтры",
              которая занимает то же место. */}
          {favoritesId && favoriteSlugs.length > 0 && (
            <Link
              to={`/favorites/${favoritesId}`}
              className={cn(
                'flex items-center justify-center gap-2 p-3 text-sm font-bold text-ink transition-colors hover:text-primary-hover',
                glassCardClass,
              )}
              style={glassCardShadow}
            >
              <Heart className="h-4 w-4 shrink-0 fill-primary text-primary" />
              Избранное ({favoriteSlugs.length})
            </Link>
          )}
          <CatalogFilterPanel
            state={filter}
            onChange={applyFilter}
            availableClasses={availableClasses}
            availableStatuses={availableStatuses}
            statusCounts={statusCounts}
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
                  {heroImages.length > 0 ? (
                    <HeroImageSlider
                      images={heroImages}
                      alt={heroImageAlt}
                      aspectClassName="h-full"
                      imageWidth={heroImageWidth}
                      imageHeight={heroImageHeight}
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



          {/* Живая сводка под фильтром (К1) убрана с видимой страницы —
              владелец, 2026-09-20: "убрать с главной каталога текст ...".
              `summary` при этом не выброшен — тем же значением пользуется
              SEO-текст (FAQ/подзаголовки хабов) ниже по файлу. */}

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
              <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-5 lg:grid-cols-3">
                {orderedCenters.slice(0, visibleCount).map((c) => (
                  <BusinessCenterCard key={c.slug} center={c} />
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

            {/* Блока «Рынок в цифрах» на каталоге больше нет совсем
                (владелец, 2026-09-22). На голом каталоге он ушёл раньше как
                дубль /minsk/bcminsk/analytics, теперь снят и на тематических
                хабах (метро, улица, класс, район, микрорайон, стройка): те же
                цифры уже есть в полоске сводки над сеткой и в FAQ внизу, а
                отдельная карточка между результатами и картой только
                отодвигала карту. FAQ по-прежнему считается по marketStats —
                это не мёртвый код. */}

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
                  Медиана по объявлениям Kufar, Realt, Domovita и Megapolis{rateSliceType === 'class' ? ` для класса ${rateSliceKey}` : ` в ${districtPrepositional(rateSliceKey ?? '')} районе`}
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

            {/* Разбор рынка по каталогу (районы, управление, что сейчас
                сдаётся, контекст рынка) переехал на отдельную страницу
                (владелец, 2026-09-22): раньше эти четыре блока стояли тут,
                ПОД результатами, и рендерились одинаково на ~286 вариантов
                каталога (хабы класса/района/метро/улицы/микрорайона) — до
                них почти никто не доскролливал, а поисковику это читалось
                как дубль контента. Тизер — единственное, что остаётся
                здесь. */}
            {centers !== null && centers.length > 0 && (
              <Link
                to="/minsk/bcminsk/analytics"
                className={cn(
                  'flex items-center justify-between gap-3 p-6 transition-colors hover:border-primary/40 sm:p-8',
                  glassCardClass,
                )}
                style={glassCardShadow}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-bold text-ink">Аналитика каталога БЦ</h2>
                  <p className="text-sm text-ink-muted">
                    Насыщенность районов, кто управляет зданиями, что сейчас сдаётся и продаётся, контекст рынка.
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-ink-faint" />
              </Link>
            )}

            {/* Ковёр чипов-срезов (районы, микрорайоны, метро, улицы,
                классы) вместе с алфавитным перечнем всех зданий убран
                отсюда и со страницы-гида целиком — владелец, 2026-09-22:
                «срезы каталога из видимой части сайта надо вообще убрать».
                Перелинковка от этого не рвётся: районы, метро, классы и тип
                лежат в сквозном верхнем меню (CatalogTopNav — панель всегда
                в разметке, поэтому попадает в пререндер), микрорайон, улица
                и «класс + район» — в блоках рекомендаций на карточке
                каждого здания (BusinessCenterDetailPage), а до самих зданий
                краулер доходит с хабов района: в самом крупном (Фрунзенский)
                24 здания при лимите сетки в 48 карточек, то есть все
                показаны без «Показать ещё». Плюс все адреса есть в
                sitemap.xml. */}

            {/* На главной вместо двух больших блоков — тизер справочника,
                парный тизеру аналитики выше: и человеку не мешает, и краулер
                по нему доходит до всех хабов и до полного списка зданий. */}
            {isGeneralCatalog && (
              <Link
                to="/minsk/bcminsk/gid"
                className={cn(
                  'flex items-center justify-between gap-3 p-6 transition-colors hover:border-primary/40 sm:p-8',
                  glassCardClass,
                )}
                style={glassCardShadow}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-bold text-ink">Справочник по бизнес-центрам Минска</h2>
                  <p className="text-sm text-ink-muted">
                    Классы A, B+, B и C, география рынка, из чего складывается ставка аренды и на что смотреть
                    при выборе офиса.
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-ink-faint" />
              </Link>
            )}

            {crossHubGroups.length > 0 && (
              <div className={cn('flex flex-col gap-2 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
                <h2 className="text-lg font-bold text-ink">Смежные подборки</h2>
                {crossHubGroups.map((group) => (
                  <p key={group.title} className="text-sm leading-relaxed text-ink-muted">
                    <span className="font-semibold text-ink">{group.title}: </span>
                    {group.links.map((link, i) => (
                      <Fragment key={link.url}>
                        {i > 0 && ' · '}
                        <Link to={link.url} className="text-primary hover:underline">
                          {link.label}
                        </Link>
                      </Fragment>
                    ))}
                  </p>
                ))}
              </div>
            )}

            {faqItems.length > 0 && <FaqAccordion title="Частые вопросы" items={faqItems} id="faq" />}
            <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
              <h2 className="text-lg font-bold text-ink">Источники</h2>
              {/* Владелец, 2026-09-22: один короткий дисклеймер без дат
                  снимков, методологии медианы ставки и имён источников в
                  основном тексте страницы — та же логика, что и на странице
                  БЦ, см. SourcesTrademarkNote. Отдельный фотокредит
                  «Футуриса» отсюда убран (владелец, тем же днём позже) —
                  снимок теперь один из источников в общем попапе
                  (DATA_SOURCE_GROUPS, группа «Энциклопедии и
                  фотоматериалы»), а не отдельная строка на видном месте. */}
              <SourcesTrademarkNote />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
