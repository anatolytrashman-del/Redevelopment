import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Calendar, Camera, Car, Globe, HardHat, Layers, MapPin, Ruler, TrainFront } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass } from '../lib/glass';
import { Badge } from '../components/ui/Badge';
import { setArticleJsonLd, setBreadcrumbJsonLd, setGenericPageMeta } from '../lib/pageMeta';
import { BUSINESS_CENTERS, type BusinessCenter } from '../data/businessCenters';

// Справочная SEO-страница по бизнес-центрам Минска (владелец, 2026-09-04) —
// см. комментарий в data/businessCenters.ts про источник списка и принцип
// "не выдумываем факты, чего нет — то не показываем". По структуре и
// визуальному языку — младшая сестра DistrictGuidePage.tsx (тот же
// glassCard/шапка с логотипом), но без сложного fixed-оглавления: тут один
// длинный список карточек, не десяток тематических разделов.
const TITLE = 'Бизнес-центры Минска — список, адреса, класс, площадь';
const DESCRIPTION =
  'Справочник бизнес-центров Минска: адреса, деловой класс, площадь, год постройки, застройщик и управляющая компания.';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk';
const OG_IMAGE = 'https://redevelopment.pro/og-image.png';

// Только дата последнего пересмотра фактов/добавления БЦ — держать в одном
// месте, тот же принцип, что и DATE_MODIFIED в DistrictGuidePage.tsx.
const DATE_MODIFIED = '2026-09-04';

const businessClassTone: Record<NonNullable<BusinessCenter['businessClass']>, 'primary' | 'success' | 'neutral'> = {
  A: 'primary',
  'B+': 'success',
  B: 'neutral',
  C: 'neutral',
};

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

  const visibleCenters = useMemo(
    () => (classFilter === 'all' ? BUSINESS_CENTERS : BUSINESS_CENTERS.filter((c) => c.businessClass === classFilter)),
    [classFilter],
  );

  const sortedForNav = useMemo(() => [...BUSINESS_CENTERS].sort((a, b) => a.name.localeCompare(b.name, 'ru')), []);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-8">
          <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </Link>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-8">
        <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Бизнес-центры Минска</h1>
          <p className="max-w-3xl text-ink-muted">
            Справочник бизнес-центров Минска — действующих и строящихся: адреса, деловой класс, площадь, год
            постройки, застройщик и управляющая компания — для тех, кто выбирает офис в аренду или под покупку.
          </p>
        </div>

        {sortedForNav.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedForNav.map((c) => (
              <a
                key={c.slug}
                href={`#${c.slug}`}
                className={cn('px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink', glassPillClass)}
              >
                {c.name}
              </a>
            ))}
          </div>
        )}

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
          <p className="text-sm text-ink-faint">Страница наполняется — список бизнес-центров скоро появится.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {visibleCenters.map((c) => (
              <BusinessCenterCard key={c.slug} center={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
