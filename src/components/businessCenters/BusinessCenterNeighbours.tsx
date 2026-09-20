import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BusFront, Coffee, Dumbbell, Landmark, MapPin, Pill, ShoppingBag, TrainFront, Utensils } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName } from '../../lib/businessCenterDisplay';
import { loadYmaps } from '../../lib/yandexMaps';
import { useInView } from '../../lib/useInView';
import { formatMeters, groupNearbyPlaces, hasNearbyContent } from '../../lib/nearbyPlaces';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../../data/businessCenterNearbyPlaces';

// Б3 и Б6 плана docs/bc-catalog-redesign-plan.md — карта здания с соседями и
// похожие БЦ. До 2026-09-16 на карточке бизнес-центра НЕ БЫЛО КАРТЫ ВООБЩЕ:
// страница рассказывала про здание, но не показывала, где оно и что вокруг.
//
// Соседи считаются по прямой от координат (Д2). Именно «по прямой», и так
// и подписано: маршрутов у нас нет, и превращать 400 метров по воздуху в
// «5 минут пешком» значило бы выдумать данные.

const DEFAULT_ZOOM = 15;

// Сколько точек категории показывать текстом: дальше список перестаёт быть
// справкой и становится выгрузкой базы — остальное видно на карте.
const NEARBY_LIST_LIMIT = 5;

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
            { hintContent: shortName(center), iconContent: shortName(center) },
            { preset: 'islands#blackStretchyIcon' },
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
  const groups = useMemo(() => groupNearbyPlaces(places), [places]);
  if (center.lat == null || center.lng == null) return null;
  const hasContent = hasNearbyContent(center, places);

  return (
    <div id="map" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <MapPin className="h-5 w-5 shrink-0 text-ink-muted" />
          {hasContent ? 'Инфраструктура рядом' : 'Расположение на карте'}
        </h2>
        {!hasContent && (
          <p className="text-xs text-ink-faint">
            Где стоит здание. Снимок окружающей инфраструктуры для него ещё не собран.
          </p>
        )}
      </div>

      <MiniMap center={center} places={places} />

      {/* Легенда к карте, не текстовый абзац: та же точка цвета, что и метка
          на карте, дальше — сами объекты и расстояния одной строкой на
          категорию. Без неё (краулер, пререндер, выключенный JS,
          заблокированный домен ключа) от блока не оставалось бы ничего —
          страница ничего не рассказывала о том, что именно стоит рядом. */}
      {groups.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label="Легенда карты">
          {groups.map((group) => {
            const meta = CATEGORY_META[group.category] ?? CATEGORY_META.other;
            const shown = group.places.slice(0, NEARBY_LIST_LIMIT);
            const rest = group.places.length - shown.length;
            return (
              <li key={group.category} className="flex items-baseline gap-2 text-sm">
                <span
                  className="mt-1 h-2 w-2 shrink-0 self-start rounded-full"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden
                />
                <p className="text-ink-muted">
                  <span className="font-semibold text-ink">{group.label}:</span>{' '}
                  {shown.map((place, index) => (
                    <span key={place.id}>
                      {place.name} — {formatMeters(place.distanceMeters)}
                      {index < shown.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                  {rest > 0 ? `, и ещё ${rest} — на карте выше` : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}

    </div>
  );
}
