import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BusFront, ChevronDown, Coffee, Dumbbell, Landmark, MapPin, Pill, ShoppingBag, TrainFront, Utensils } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { formatMeters, groupNearbyPlaces } from '../../lib/nearbyPlaces';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../../data/businessCenterNearbyPlaces';
import { loadYmaps } from '../../lib/yandexMaps';

// ВАРИАНТ «В»: обычная карточка объекта, как на сайтах недвижимости.
// Без плиток-кнопок (вариант А оказался похож на диспетчерскую) и без
// сплошного текста (вариант Б). Строка = категория: что это, что ближайшее,
// сколько метров. Строка раскрывается, если хочется подробностей.

const META: Record<NearbyPlaceCategory, { label: string; icon: typeof MapPin; names: boolean }> = {
  metro: { label: 'Метро', icon: TrainFront, names: true },
  transport_stop: { label: 'Остановки', icon: BusFront, names: true },
  grocery: { label: 'Продукты', icon: ShoppingBag, names: true },
  pharmacy: { label: 'Аптеки', icon: Pill, names: true },
  bank: { label: 'Банки', icon: Landmark, names: true },
  atm: { label: 'Банкоматы', icon: Banknote, names: false },
  coffee: { label: 'Кофейни', icon: Coffee, names: true },
  cafe: { label: 'Кафе и рестораны', icon: Utensils, names: true },
  fitness: { label: 'Фитнес', icon: Dumbbell, names: true },
  shop: { label: 'Магазины', icon: ShoppingBag, names: true },
  other: { label: 'Другое', icon: MapPin, names: true },
};


// Карта монохромная и без фильтров: список под ней и есть фильтр. Пока строка
// не раскрыта — подписано ближайшее в каждой категории, раскрыли — её точки
// без подписей (имена уже видны в списке).
function QuietMap({
  center,
  title,
  points,
}: {
  center: { lat: number; lng: number };
  title: string;
  points: { place: BusinessCenterNearbyPlace; label: string | null }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const marksRef = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadYmaps().then((ymaps) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new ymaps.Map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 15,
        controls: ['zoomControl', 'fullscreenControl'],
      }, { suppressMapOpenBlock: true });
      map.behaviors.disable('scrollZoom');
      map.geoObjects.add(new ymaps.Placemark([center.lat, center.lng], { iconContent: title }, {
        preset: 'islands#blackStretchyIcon',
        zIndex: 900,
      }));
      mapRef.current = map;
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; mapRef.current?.destroy?.(); mapRef.current = null; };
  }, [center.lat, center.lng, title]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    void (async () => {
      const ymaps = await loadYmaps();
      for (const mark of marksRef.current) map.geoObjects.remove(mark);
      marksRef.current = [];
      for (const { place, label } of points) {
        const mark = new ymaps.Placemark([place.lat, place.lng], {
          iconContent: label ?? '',
          hintContent: `${place.name} — ${formatMeters(place.distanceMeters)}`,
        }, {
          preset: label ? 'islands#stretchyIcon' : 'islands#circleIcon',
          iconColor: '#14151a',
        });
        map.geoObjects.add(mark);
        marksRef.current.push(mark);
      }
    })();
  }, [points, status]);

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-80">
      <div ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
          {status === 'error' ? 'Не удалось загрузить карту' : 'Загрузка карты…'}
        </div>
      )}
    </div>
  );
}

export function NearbyInfrastructureV4({
  title,
  center,
  places,
}: {
  title: string;
  center: { lat: number; lng: number };
  places: BusinessCenterNearbyPlace[];
}) {
  const groups = useMemo(() => groupNearbyPlaces(places).filter((group) => group.category !== 'shop'), [places]);
  const [openKey, setOpenKey] = useState<NearbyPlaceCategory | null>(null);

  const openGroup = groups.find((group) => group.category === openKey) ?? null;
  // Карта показывает ближайшее из каждой категории, пока строка не раскрыта;
  // раскрыли строку — только её точки. Никакой отдельной панели фильтров:
  // список и есть фильтр.
  const points = openGroup
    ? openGroup.places.map((place) => ({ place, label: null }))
    : groups.map((group) => ({ place: group.places[0], label: META[group.category].names ? group.places[0].name : null }));

  return (
    <div className={cn('flex flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-ink">Что рядом</h2>
        <p className="text-sm text-ink-muted">
          Ближайшее в каждой категории — на карте. Нажмите строку, чтобы увидеть остальное.
        </p>
      </div>

      <QuietMap center={center} title={title} points={points} />

      {/* Ровный список строк — как характеристики объекта: слева что, справа
          сколько метров. Ничего не мигает цветом и ничего не нужно «читать»:
          строку видно целиком за секунду. */}
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {groups.map((group) => {
          const meta = META[group.category];
          const Icon = meta.icon;
          const isOpen = openKey === group.category;
          const nearest = group.places[0];
          return (
            <li key={group.category}>
              <button
                type="button"
                onClick={() => setOpenKey(isOpen ? null : group.category)}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-muted/60"
              >
                <Icon className="h-4.5 w-4.5 shrink-0 text-ink-faint" />
                <span className="w-36 shrink-0 text-sm font-semibold text-ink sm:w-44">{meta.label}</span>
                <span className="flex-1 truncate text-sm text-ink-muted">
                  {meta.names ? nearest.name : `${group.places.length} поблизости`}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-ink">{formatMeters(nearest.distanceMeters)}</span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-180')}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div className="pb-3 pl-8 pr-2">
                  {meta.names ? (
                    <ul className="flex flex-col gap-1">
                      {group.places.slice(1).map((place) => (
                        <li key={place.id} className="flex items-baseline justify-between gap-4 text-sm text-ink-muted">
                          <span className="truncate">{place.name}</span>
                          <span className="shrink-0 tabular-nums text-ink-faint">{formatMeters(place.distanceMeters)}</span>
                        </li>
                      ))}
                      {group.places.length === 1 && <li className="text-sm text-ink-faint">Других в радиусе 850 м нет.</li>}
                    </ul>
                  ) : (
                    <p className="text-sm text-ink-muted">
                      Ещё {group.places.length - 1} в радиусе 850 метров — все показаны на карте. Названия банков здесь ни на что
                      не влияют, поэтому списком не выводим.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-ink-faint">Расстояния — по прямой от здания, по данным Яндекс.Карт.</p>
    </div>
  );
}
