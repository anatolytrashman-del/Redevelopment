import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  Calendar,
  Camera,
  Car,
  Globe,
  HardHat,
  Layers,
  MapPin,
  Menu,
  Ruler,
  TrainFront,
  X,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { ObjectMapWidget } from '../components/objects/ObjectMapWidget';
import { setArticleJsonLd, setBreadcrumbJsonLd, setGenericPageMeta } from '../lib/pageMeta';
import type { BusinessCenter } from '../data/businessCenters';
import { fetchBusinessCenters } from '../lib/businessCentersApi';

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
const OG_IMAGE = 'https://redevelopment.pro/og-image.png';

// Заголовок и подзаголовок hero — первая версия составлена Gemini (через
// ProxyAPI), владелец затем переписал оба текста вручную (2026-09-04).
const PAGE_H1 = 'Аналитика всех бизнес-центров Минска для аренды и покупки офиса';
const INTRO_TEXT =
  'Помогаем инвесторам и арендаторам сделать взвешенный выбор офиса и бизнес-центра для покупки или аренды помещения.';

// Фото hero — владелец подбирает сам ("фотки я сейчас поищу сам"), пополняется
// по мере присылки. HeroImageSlider (см. DistrictGuidePage.tsx/
// ObjectLandingPage.tsx) при пустом массиве не рендерит ничего — плейсхолдер
// ниже занимает его место, пока список пуст.
const HERO_IMAGES: string[] = ['/images/business-centers-hero/hero-1.jpg'];

// Карта всех БЦ из списка (владелец, 2026-09-04) — тот же принцип, что и у
// карты объекта в ObjectMapWidget.tsx: ссылка не из JS API/координат, а
// готовая embed-ссылка из Яндекс.Карт Конструктора (constructor.yandex.ru),
// куда владелец загрузил CSV/XLSX с координатами всех БЦ (см. журнал
// CLAUDE.md — там же про формат этого файла). Владелец прислал два варианта
// встраивания — <script src="api-maps.yandex.ru/services/constructor/...">
// и страницу yandex.ru/maps/?um=constructor:<id> — ни один не подходит как
// src iframe (тот же нюанс, что уже задокументирован в ObjectMapWidget.tsx
// и в CLAUDE.md про карту объекта): нужен именно map-widget/v1 с тем же id.
const MAP_EMBED_URL =
  'https://yandex.ru/map-widget/v1/?um=constructor:40aec344a3d242ccc8c9562de875da3b03e8a49f93d956273f82830664696b1a&source=constructorLink';

// Только дата последнего пересмотра фактов/добавления БЦ — держать в одном
// месте, тот же принцип, что и DATE_MODIFIED в DistrictGuidePage.tsx.
const DATE_MODIFIED = '2026-09-04';

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

const businessClassTone: Record<NonNullable<BusinessCenter['businessClass']>, 'primary' | 'success' | 'neutral'> = {
  A: 'primary',
  'B+': 'success',
  B: 'neutral',
  C: 'neutral',
};

// Короткое имя без "Бизнес-центр «...»" — для бокового меню и быстрой
// навигации (владелец: "БЦ по алфавиту, но без «Бизнес-Центр», просто
// названия"). Тот же принцип, что и в scripts-сгенерированном xlsx для
// Конструктора карт — там метки на карте называются так же.
function shortName(center: BusinessCenter): string {
  if (center.slug === 'mfc-minsk-mir') return 'МФЦ (Минск Мир)';
  const quoted = center.name.match(/«([^»]+)»/);
  if (quoted) return quoted[1];
  const paren = center.name.match(/\(([^)]+)\)/);
  if (paren) return paren[1];
  return center.name;
}

function PhotoBlock({ center }: { center: BusinessCenter }) {
  if (center.photos.length > 0) {
    return <img src={center.photos[0]} alt={center.name} className="h-full w-full object-cover" loading="lazy" />;
  }
  // Фото ещё нет — владелец добавит сам (см. комментарий в data-файле).
  // Тот же визуальный приём, что у карточки "ещё не построен" в Залогах
  // (Objects.tsx) — заливка градиентом вместо пустого места; для строящихся
  // объектов бейдж говорит про стройку, а не про "фото скоро появятся".
  if (center.status === 'under_construction') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-muted to-border">
        <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink shadow-sm">
          <HardHat className="h-3.5 w-3.5 shrink-0" />
          {center.yearBuilt ? `Строится · сдача в ${center.yearBuilt} г.` : 'Строится'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-muted to-border">
      <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted shadow-sm">
        <Camera className="h-3.5 w-3.5 shrink-0" />
        Фото скоро
      </span>
    </div>
  );
}

function FactRow({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-ink-muted">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
      <span>{children}</span>
    </div>
  );
}

// Карточка на всю ширину, фото слева/контент справа на sm+ (владелец,
// 2026-09-04: "не нравится внешний вид карточек... по 1 карточке на всю
// ширину экрана" — двухколоночная сетка карточек была тесной для растущего
// набора полей, особенно с прицелом на данные по аренде/продаже, которые
// владелец обещал добавить позже). На мобильном — фото сверху, как раньше.
function BusinessCenterCard({ center }: { center: BusinessCenter }) {
  return (
    <div
      id={center.slug}
      className={cn('flex scroll-mt-24 flex-col overflow-hidden sm:flex-row', glassCardClass)}
      style={glassCardShadow}
    >
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-auto sm:w-2/5">
        <PhotoBlock center={center} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">{center.name}</h2>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {center.status === 'under_construction' && <Badge tone="warning">Строится</Badge>}
            {center.businessClass && (
              <Badge tone={businessClassTone[center.businessClass]}>Класс {center.businessClass}</Badge>
            )}
          </div>
        </div>

        <FactRow icon={MapPin}>{center.address}</FactRow>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {center.totalArea != null && <FactRow icon={Ruler}>{center.totalArea.toLocaleString('ru-RU')} м² общая площадь</FactRow>}
          {center.yearBuilt != null && (
            <FactRow icon={Calendar}>
              {center.status === 'under_construction' ? `Ожидаемая сдача — ${center.yearBuilt} г.` : `Сдан в ${center.yearBuilt} г.`}
            </FactRow>
          )}
          {center.floors != null && <FactRow icon={Layers}>{center.floors} этажей</FactRow>}
          {center.metro && <FactRow icon={TrainFront}>{center.metro}</FactRow>}
          {center.parking && <FactRow icon={Car}>{center.parking}</FactRow>}
          {center.developer && <FactRow icon={Building2}>{center.developer}</FactRow>}
        </div>

        {center.description && <p className="text-sm text-ink-muted">{center.description}</p>}

        {center.website && (
          <a
            href={center.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Globe className="h-4 w-4 shrink-0" />
            {center.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
    </div>
  );
}

export function BusinessCentersMinskPage() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [classFilter, setClassFilter] = useState<'all' | NonNullable<BusinessCenter['businessClass']>>('all');
  const [districtFilter, setDistrictFilter] = useState<'all' | string>('all');
  // Боковое меню на мобильном скрыто за плавающей кнопкой (владелец, 2026-09-04:
  // "сделай конструктивно как на странице Минск Мира, чтобы оно с мобилки
  // скрывалось") — тот же паттерн шторки, что и SECTION_NAV в DistrictGuidePage.tsx.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
  }, []);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, image: OG_IMAGE, ogType: 'article' });
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: '2026-09-04',
      dateModified: DATE_MODIFIED,
      image: OG_IMAGE,
    });
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска' },
    ]);
  }, []);

  const availableClasses = useMemo(
    () =>
      Array.from(new Set((centers ?? []).map((c) => c.businessClass).filter((v): v is NonNullable<typeof v> => !!v))).sort(),
    [centers],
  );

  // Районы — только те, что реально встречаются в данных (не хардкожен полный
  // список всех 9 районов Минска — растёт из AddableSelect в админке, см.
  // BusinessCentersAdminTab.tsx; "За городом" для объектов вне города, как
  // "Аден", тоже просто одно из значений этого поля).
  const districts = useMemo(
    () =>
      Array.from(new Set((centers ?? []).map((c) => c.district).filter((v): v is string => !!v))).sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [centers],
  );
  const districtCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) if (c.district) counts[c.district] = (counts[c.district] ?? 0) + 1;
    return counts;
  }, [centers]);

  const visibleCenters = useMemo(
    () =>
      (centers ?? []).filter(
        (c) =>
          (classFilter === 'all' || c.businessClass === classFilter) &&
          (districtFilter === 'all' || c.district === districtFilter),
      ),
    [centers, classFilter, districtFilter],
  );

  // Боковой список — те же фильтры, что и у самой сетки карточек ниже: список
  // всегда отражает то, что реально видно на странице, ссылки не ведут "в
  // никуда" на скрытую фильтром карточку.
  const sortedForNav = useMemo(
    () => [...visibleCenters].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru')),
    [visibleCenters],
  );

  // Содержимое бокового меню — общий JSX для десктопной sticky-колонки и
  // мобильной шторки (владелец: "боковое меню... как на странице Минск
  // Мира, чтобы оно с мобилки скрывалось"), см. рендер обоих ниже.
  const filterContent = (
    <>
      <span className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Район</span>
      <button
        type="button"
        onClick={() => setDistrictFilter('all')}
        className={cn(
          'rounded-control px-2 py-1.5 text-left transition-colors hover:text-primary',
          districtFilter === 'all' ? 'bg-primary/10 font-bold text-primary' : 'font-medium text-ink',
        )}
      >
        Все районы
      </button>
      {districts.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDistrictFilter(d)}
          className={cn(
            'flex items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left transition-colors hover:text-primary',
            districtFilter === d ? 'bg-primary/10 font-bold text-primary' : 'font-medium text-ink',
          )}
        >
          <span>{d}</span>
          <span className="text-xs text-ink-faint">{districtCounts[d]}</span>
        </button>
      ))}

      {availableClasses.length > 0 && (
        <>
          <div className="my-2 border-t border-border" />

          <span className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Класс</span>
          {/* Компактные пилюли с одной буквой класса (владелец: "выбор класса
              слишком большой по размеру, хватит букв, А/В") — было вертикальным
              списком со словом "Класс" перед каждым пунктом. */}
          <div className="flex flex-wrap gap-1.5 px-2 pb-1">
            <button
              type="button"
              onClick={() => setClassFilter('all')}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                classFilter === 'all' ? 'bg-primary text-white' : 'bg-surface-muted text-ink-muted hover:text-ink',
              )}
            >
              Все
            </button>
            {availableClasses.map((cls) => (
              <button
                type="button"
                key={cls}
                onClick={() => setClassFilter(cls)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  classFilter === cls ? 'bg-primary text-white' : 'bg-surface-muted text-ink-muted hover:text-ink',
                )}
              >
                {cls}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="my-2 border-t border-border" />

      <span className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Бизнес-центры
      </span>
      {sortedForNav.length === 0 ? (
        <span className="px-2 py-1.5 text-xs text-ink-faint">Нет объектов в этом районе</span>
      ) : (
        sortedForNav.map((c) => (
          <a
            key={c.slug}
            href={`#${c.slug}`}
            onClick={() => setMobileNavOpen(false)}
            className="rounded-control px-2 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            {shortName(c)}
          </a>
        ))
      )}
    </>
  );

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </Link>
        </div>
      </div>

      {/* Плавающая кнопка + шторка ниже lg — тот же паттерн, что и
          "Содержание гайда" в DistrictGuidePage.tsx. От lg и шире — обычная
          sticky-колонка слева (аналог Sidebar.tsx: lg:sticky работает
          благодаря overflow-x: clip на body/#root, см. index.css). */}
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-30 flex items-center gap-2 px-4 py-3 text-sm font-semibold text-ink lg:hidden',
          glassPillClass,
        )}
        style={glassPillShadow}
      >
        <Menu className="h-4 w-4 shrink-0" />
        Фильтры
      </button>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-svh w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto border-r border-white/50 bg-white/70 px-5 py-6 backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200 ease-out lg:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Фильтры</span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Закрыть меню"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {filterContent}
      </aside>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
          <aside className="hidden lg:sticky lg:top-24 lg:block lg:h-fit lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className={cn('flex flex-col gap-1 p-3 text-sm', glassCardClass)} style={glassCardShadow}>
              {filterContent}
            </div>
          </aside>

          <div className="flex flex-col gap-10">
            <div
              className={cn('grid grid-cols-1 gap-6 p-6 sm:grid-cols-[3fr_2fr] sm:items-center sm:p-8', glassCardClass)}
              style={glassCardShadow}
            >
              <div className="flex flex-col gap-3">
                <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
                <p className="text-base text-ink-muted">{INTRO_TEXT}</p>
                <span className="flex w-fit items-center gap-1.5 rounded-full border border-success/30 bg-success-bg px-3 py-1 text-xs font-semibold text-success">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                  {UPDATED_BADGE_LABEL}
                </span>
              </div>
              <div className="mx-auto w-full max-w-xs sm:max-w-none">
                {HERO_IMAGES.length > 0 ? (
                  <HeroImageSlider images={HERO_IMAGES} alt="Бизнес-центры Минска" aspectClassName="aspect-[4/5]" />
                ) : (
                  <div className="flex aspect-[4/5] w-full items-center justify-center rounded-3xl bg-gradient-to-br from-surface-muted to-border">
                    <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted shadow-sm">
                      <Camera className="h-3.5 w-3.5 shrink-0" />
                      Фото скоро
                    </span>
                  </div>
                )}
              </div>
            </div>

            <ObjectMapWidget address="Бизнес-центры Минска" mapEmbedUrl={MAP_EMBED_URL} />

            {centers === null ? (
              <p className="text-sm text-ink-faint">Загрузка…</p>
            ) : visibleCenters.length === 0 ? (
              <p className="text-sm text-ink-faint">Нет бизнес-центров по выбранным фильтрам.</p>
            ) : (
              <div className="flex flex-col gap-6">
                {visibleCenters.map((c) => (
                  <BusinessCenterCard key={c.slug} center={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
