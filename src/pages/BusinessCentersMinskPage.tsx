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
  Ruler,
  TrainFront,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { setArticleJsonLd, setBreadcrumbJsonLd, setGenericPageMeta } from '../lib/pageMeta';
import { BUSINESS_CENTERS, type BusinessCenter } from '../data/businessCenters';

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

// Заголовок и подзаголовок hero — по просьбе владельца составлены Gemini
// (через ProxyAPI, gemini-2.5-pro) в трёх вариантах каждый, владелец выбрал
// и слегка отредактировал подзаголовок вручную (2026-09-04).
const PAGE_H1 = 'Сравнение бизнес-центров Минска: аналитика для аренды и покупки офиса';
const INTRO_TEXT =
  'Аналитический обзор ключевых бизнес-центров Минска по основным параметрам. Помогаем инвесторам и арендаторам сделать взвешенный выбор офиса для покупки или аренды.';

// Фото hero — владелец подбирает сам ("фотки я сейчас поищу сам"), пока
// пусто. HeroImageSlider (см. DistrictGuidePage.tsx/ObjectLandingPage.tsx)
// при пустом массиве не рендерит ничего — плейсхолдер ниже занимает его место.
const HERO_IMAGES: string[] = [];

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

function BusinessCenterCard({ center }: { center: BusinessCenter }) {
  return (
    <div id={center.slug} className={cn('flex scroll-mt-24 flex-col overflow-hidden', glassCardClass)} style={glassCardShadow}>
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden">
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
  const [classFilter, setClassFilter] = useState<'all' | NonNullable<BusinessCenter['businessClass']>>('all');
  const [districtFilter, setDistrictFilter] = useState<'all' | string>('all');

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
      Array.from(new Set(BUSINESS_CENTERS.map((c) => c.businessClass).filter((v): v is NonNullable<typeof v> => !!v))).sort(),
    [],
  );

  // Районы — только те, что реально встречаются в данных (не хардкожен полный
  // список всех 9 районов Минска: "Аден" вне города, у него district=null и
  // он не попадает ни в один пункт фильтра — виден только при "Все районы").
  const districts = useMemo(
    () =>
      Array.from(new Set(BUSINESS_CENTERS.map((c) => c.district).filter((v): v is string => !!v))).sort((a, b) =>
        a.localeCompare(b, 'ru'),
      ),
    [],
  );
  const districtCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of BUSINESS_CENTERS) if (c.district) counts[c.district] = (counts[c.district] ?? 0) + 1;
    return counts;
  }, []);

  const visibleCenters = useMemo(
    () =>
      BUSINESS_CENTERS.filter(
        (c) =>
          (classFilter === 'all' || c.businessClass === classFilter) &&
          (districtFilter === 'all' || c.district === districtFilter),
      ),
    [classFilter, districtFilter],
  );

  // Боковой список — те же фильтры, что и у самой сетки карточек ниже: список
  // всегда отражает то, что реально видно на странице, ссылки не ведут "в
  // никуда" на скрытую фильтром карточку.
  const sortedForNav = useMemo(
    () => [...visibleCenters].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru')),
    [visibleCenters],
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

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
          <aside className="mb-8 lg:sticky lg:top-24 lg:mb-0 lg:h-fit lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div className={cn('flex flex-col gap-1 p-3 text-sm', glassCardClass)} style={glassCardShadow}>
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
                    className="rounded-control px-2 py-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    {shortName(c)}
                  </a>
                ))
              )}
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

            {availableClasses.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Класс:</span>
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
                    key={cls}
                    type="button"
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
            )}

            {visibleCenters.length === 0 ? (
              <p className="text-sm text-ink-faint">Нет бизнес-центров по выбранным фильтрам.</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
