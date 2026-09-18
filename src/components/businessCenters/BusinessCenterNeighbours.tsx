import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Building2, BusFront, Coffee, Dumbbell, Landmark, MapPin, Pill, ShoppingBag, TrainFront, Utensils } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName } from '../../lib/businessCenterDisplay';
import { loadYmaps } from '../../lib/yandexMaps';
import { useInView } from '../../lib/useInView';
import type { CatalogOfferIndex } from '../../lib/businessCenterCatalogFilter';
import { nearestNeighbours } from '../../lib/businessCenterMarketPosition';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../../data/businessCenterNearbyPlaces';

// Б3 и Б6 плана docs/bc-catalog-redesign-plan.md — карта здания с соседями и
// похожие БЦ. До 2026-09-16 на карточке бизнес-центра НЕ БЫЛО КАРТЫ ВООБЩЕ:
// страница рассказывала про здание, но не показывала, где оно и что вокруг.
//
// Соседи считаются по прямой от координат (Д2). Именно «по прямой», и так
// и подписано: маршрутов у нас нет, и превращать 400 метров по воздуху в
// «5 минут пешком» значило бы выдумать данные.

const DEFAULT_ZOOM = 16;

const CATEGORY_META: Record<NearbyPlaceCategory, { label: string; color: string; icon: typeof MapPin }> = {
  metro: { label: 'Метро', color: '#e4152b', icon: TrainFront },
  transport_stop: { label: 'Остановки', color: '#2563eb', icon: BusFront },
  cafe: { label: 'Кафе', color: '#b45309', icon: Coffee },
  restaurant: { label: 'Рестораны', color: '#c2410c', icon: Utensils },
  grocery: { label: 'Продукты', color: '#15803d', icon: ShoppingBag },
  shop: { label: 'Магазины', color: '#7c3aed', icon: ShoppingBag },
  pharmacy: { label: 'Аптеки', color: '#059669', icon: Pill },
  bank: { label: 'Банки', color: '#475569', icon: Landmark },
  atm: { label: 'Банкоматы', color: '#64748b', icon: Banknote },
  fitness: { label: 'Фитнес', color: '#db2777', icon: Dumbbell },
  other: { label: 'Другое', color: '#6e7781', icon: MapPin },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char] ?? char);
}

function MiniMap({ center, places }: { center: BusinessCenter; places: BusinessCenterNearbyPlace[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  // Карта Яндекса — 689 КиБ и 2+ с CPU (PAGESPEED_PLAN.md), а блок стоит в
  // середине длинной страницы: грузим, только когда до него доскроллили.
  const [viewportRef, inView] = useInView<HTMLDivElement>();

  useEffect(() => {
    if (!inView || center.lat == null || center.lng == null) return;
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new ymaps.Map(containerRef.current, {
          center: [center.lat as number, center.lng as number],
          zoom: DEFAULT_ZOOM,
          controls: ['zoomControl', 'fullscreenControl'],
        });
        map.geoObjects.add(
          new ymaps.Placemark(
            [center.lat as number, center.lng as number],
            { hintContent: shortName(center) },
            { preset: 'islands#dotIcon', iconColor: '#d1002a' },
          ),
        );
        map.geoObjects.add(
          new ymaps.Circle(
            [[center.lat as number, center.lng as number], 500],
            {},
            { fillColor: '#e4152b0d', strokeColor: '#e4152b66', strokeWidth: 1 },
          ),
        );
        for (const place of places) {
          const meta = CATEGORY_META[place.category] ?? CATEGORY_META.other;
          map.geoObjects.add(
            new ymaps.Placemark(
              [place.lat, place.lng],
              {
                hintContent: place.name,
                balloonContent: `<strong>${escapeHtml(place.name)}</strong><br>${meta.label} · ${place.distanceMeters} м от БЦ`,
              },
              { preset: 'islands#dotIcon', iconColor: meta.color },
            ),
          );
        }
        mapRef.current = map;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, center.slug, places]);

  return (
    <div ref={viewportRef} className="relative h-64 w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-80">
      <div ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
          {status === 'error' ? 'Не удалось загрузить карту' : 'Загрузка карты…'}
        </div>
      )}
    </div>
  );
}

export function NearbyInfrastructureBlock({
  center,
  places,
}: {
  center: BusinessCenter;
  places: BusinessCenterNearbyPlace[];
}) {
  const categories = useMemo(() => {
    const counts = new Map<NearbyPlaceCategory, number>();
    for (const place of places) counts.set(place.category, (counts.get(place.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [places]);
  const [activeCategories, setActiveCategories] = useState<Set<NearbyPlaceCategory>>(new Set());
  const visiblePlaces = useMemo(
    () => activeCategories.size === 0 ? places : places.filter((place) => activeCategories.has(place.category)),
    [activeCategories, places],
  );
  if (center.lat == null || center.lng == null || places.length === 0) return null;

  const toggleCategory = (category: NearbyPlaceCategory) => {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div id="map" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <MapPin className="h-5 w-5 shrink-0 text-ink-muted" />
          Инфраструктура рядом
        </h2>
        <p className="text-xs text-ink-faint">
          Метро, остановки, магазины и сервисы в радиусе 500 метров. Точки собраны заранее и периодически обновляются.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Фильтры объектов инфраструктуры">
        {categories.map(([category, count]) => {
          const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
          const Icon = meta.icon;
          const active = activeCategories.size === 0 || activeCategories.has(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active ? 'border-border bg-surface text-ink' : 'border-transparent bg-surface-muted text-ink-faint',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label} · {count}
            </button>
          );
        })}
      </div>
      <MiniMap center={center} places={visiblePlaces} />
      <p className="text-xs text-ink-faint">
        Данные на {new Date(Math.max(...places.map((place) => new Date(place.collectedAt).getTime()))).toLocaleDateString('ru-RU')}.
        Расстояния указаны по прямой.
      </p>
    </div>
  );
}

// --- Б6. Похожие бизнес-центры -----------------------------------------

// «Похожий» — тот же класс и тот же район; если таких меньше трёх,
// расширяем до того же класса по городу. Сортируем по близости площади:
// здание на 40 000 м² и на 900 м² одного класса решают разные задачи.
export function similarCenters(
  center: BusinessCenter,
  all: BusinessCenter[],
  limit = 6,
  // Слаги, уже показанные в блоке «Другие бизнес-центры рядом». Соседи и похожие —
  // ДВЕ РАЗНЫЕ подборки (одна про расположение, другая про замену), и одно и
  // то же здание в обеих читается как то, что список нечем наполнить.
  exclude: ReadonlySet<string> = new Set(),
): BusinessCenter[] {
  const pool = all.filter(
    (c) => c.slug !== center.slug && !exclude.has(c.slug) && c.businessClass === center.businessClass,
  );
  const sameDistrict = center.district ? pool.filter((c) => c.district === center.district) : [];
  const base = sameDistrict.length >= 3 ? sameDistrict : pool;
  if (center.totalArea == null) return base.slice(0, limit);
  return [...base]
    .sort(
      (a, b) =>
        Math.abs((a.totalArea ?? Infinity) - (center.totalArea as number)) -
        Math.abs((b.totalArea ?? Infinity) - (center.totalArea as number)),
    )
    .slice(0, limit);
}

export function SimilarCentersBlock({
  center,
  all,
  offers,
  hubChips,
}: {
  center: BusinessCenter;
  all: BusinessCenter[];
  offers: CatalogOfferIndex;
  hubChips: { label: string; url: string }[];
}) {
  const similar = useMemo(() => {
    const neighbourSlugs = new Set(nearestNeighbours(center, all, 5).map((n) => n.center.slug));
    return similarCenters(center, all, 6, neighbourSlugs);
  }, [center, all]);
  if (similar.length === 0 && hubChips.length === 0) return null;
  return (
    <div id="similar" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Building2 className="h-5 w-5 shrink-0 text-ink-muted" />
          Похожие бизнес-центры
        </h2>
        <p className="text-xs text-ink-faint">
          Тот же класс и тот же район, ближайшие по размеру здания; те, что уже перечислены
          выше как соседние, сюда не попадают.
        </p>
      </div>
      {similar.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {similar.map((c) => {
            const rent = offers.rentBySlug.get(c.slug)?.median ?? null;
            return (
              <Link
                key={c.slug}
                to={`/minsk/bcminsk/${c.slug}`}
                className="flex flex-col gap-0.5 rounded-2xl bg-surface-muted px-4 py-3 transition-colors hover:bg-border/40"
              >
                <span className="text-sm font-semibold text-ink">{shortName(c)}</span>
                <span className="text-xs text-ink-muted">
                  {[
                    c.businessClass ? `класс ${c.businessClass}` : null,
                    c.district,
                    c.totalArea != null ? `${c.totalArea.toLocaleString('ru-RU')} м²` : null,
                    rent != null ? `$${rent}/м²` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {/* Хабы чипами вместо простого текста (пункт «ссылки на хабы» из
          BCMINSK_SEO_PLAN.md): те же ссылки, но их видно и по ним кликают. */}
      {hubChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hubChips.map((chip) => (
            <Link
              key={chip.url}
              to={chip.url}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary-hover"
            >
              {chip.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
