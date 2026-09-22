import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BusFront, ChevronDown, Coffee, Dumbbell, Landmark, MapPin, Pill, ShoppingBag, TrainFront, Utensils } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName } from '../../lib/businessCenterDisplay';
import { loadYmaps } from '../../lib/yandexMaps';
import { useInView } from '../../lib/useInView';
import { formatMeters, groupNearbyPlaces, hasNearbyContent } from '../../lib/nearbyPlaces';
import { nearbyPinHtml, NEARBY_PIN_SIZE } from '../../lib/nearbyPinIcons';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../../data/businessCenterNearbyPlaces';

// Б3 и Б6 плана docs/bc-catalog-redesign-plan.md — карта здания с соседями.
// До 2026-09-16 на карточке бизнес-центра НЕ БЫЛО КАРТЫ ВООБЩЕ: страница
// рассказывала про здание, но не показывала, где оно и что вокруг.
//
// Соседи считаются по прямой от координат (Д2). Именно «по прямой», и так и
// подписано: маршрутов у нас нет, и превращать 400 метров по воздуху в
// «5 минут пешком» значило бы выдумать данные.
//
// 2026-09-22 — блок переосмыслен (владелец: «по умолчанию много точек, ничего
// непонятно; категории не влезают в экран; расстояния до каждой точки — лишняя
// инфа; банкоматы показаны наполовину»). Вместо ряда чипов с горизонтальным
// скроллом, восьмидесяти меток разом и легенды с обрывом «и ещё 16 — на карте
// выше» здесь список-характеристики: строка на категорию, в ней ближайшее место
// и расстояние до него, раскрытие — остальные места этой категории. На карте
// по умолчанию только ближайшее из каждой категории.
//
// Две предыдущие редакции макета владелец отклонил: сетку цветных плиток с
// кольцами радиусов («похоже на пункт управления полётами»), затем пересказ
// связным текстом. Отсюда нынешняя монохромная сухость — она намеренная.

const DEFAULT_ZOOM = 15;

const CATEGORY_META: Record<NearbyPlaceCategory, { label: string; icon: typeof MapPin; names: boolean }> = {
  metro: { label: 'Метро', icon: TrainFront, names: true },
  transport_stop: { label: 'Остановки', icon: BusFront, names: true },
  grocery: { label: 'Продукты', icon: ShoppingBag, names: true },
  pharmacy: { label: 'Аптеки', icon: Pill, names: true },
  bank: { label: 'Банки', icon: Landmark, names: true },
  // Имя банкомата («Приорбанк», «МТбанк») ничего не сообщает: важны факт и
  // расстояние, поэтому у категории нет ни списка, ни подписи на карте.
  atm: { label: 'Банкоматы', icon: Banknote, names: false },
  coffee: { label: 'Кофейни', icon: Coffee, names: true },
  cafe: { label: 'Кафе и рестораны', icon: Utensils, names: true },
  fitness: { label: 'Фитнес', icon: Dumbbell, names: true },
  shop: { label: 'Магазины', icon: ShoppingBag, names: true },
  other: { label: 'Другое', icon: MapPin, names: true },
};

const PIN_COLOR = '#14151a';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char] ?? char);
}

interface MapPoint {
  place: BusinessCenterNearbyPlace;
  category: NearbyPlaceCategory;
  label: string | null;
}

function NeighboursMap({ center, points }: { center: BusinessCenter; points: MapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const marksRef = useRef<any[]>([]);
  const layoutsRef = useRef<{ pin: any; labelled: any } | null>(null);
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
            { preset: 'islands#blackStretchyIcon', zIndex: 900 },
          ),
        );
        // Свои метки вместо цветных капель `islands#dotIcon`: по цвету было не
        // понять, что за точка, а легенду приходилось держать рядом. Метку
        // рисует сам ymaps по HTML-шаблону, поэтому иконка приезжает строкой
        // (см. lib/nearbyPinIcons.ts), а не React-компонентом.
        layoutsRef.current = {
          pin: ymaps.templateLayoutFactory.createClass('$[properties.pinHtml]'),
          labelled: ymaps.templateLayoutFactory.createClass(
            '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;">'
            + '$[properties.pinHtml]'
            + '<span style="background:#fff;border:1px solid rgba(20,21,26,.18);border-radius:9999px;'
            + 'box-shadow:0 2px 6px rgba(0,0,0,.14);color:#14151a;font:600 12px/1 Montserrat,system-ui,sans-serif;'
            + 'padding:5px 9px;">$[properties.labelText]</span></div>',
          ),
        };
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
      marksRef.current = [];
      layoutsRef.current = null;
    };
  }, [inView, center.slug, center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const layouts = layoutsRef.current;
    if (!map || !layouts || status !== 'ready') return;
    void (async () => {
      const ymaps = await loadYmaps();
      for (const mark of marksRef.current) map.geoObjects.remove(mark);
      marksRef.current = [];
      for (const { place, category, label } of points) {
        const pinHtml = nearbyPinHtml(category, PIN_COLOR);
        const balloonLines = [
          `<strong>${escapeHtml(place.name)}</strong>`,
          `${CATEGORY_META[category]?.label ?? ''} · ${formatMeters(place.distanceMeters)} от здания`,
        ];
        if (place.address) balloonLines.push(escapeHtml(place.address));
        if (place.sourceUrl) {
          balloonLines.push(
            `<a href="${escapeHtml(place.sourceUrl)}" target="_blank" rel="noopener noreferrer">Открыть в Яндекс.Картах</a>`,
          );
        }
        const mark = new ymaps.Placemark(
          [place.lat, place.lng],
          {
            pinHtml,
            labelText: escapeHtml(place.name),
            hintContent: `${place.name} — ${formatMeters(place.distanceMeters)}`,
            balloonContent: balloonLines.join('<br>'),
          },
          {
            iconLayout: label ? layouts.labelled : layouts.pin,
            // Без iconShape ymaps не знает, где уHTML-метки кликабельная зона,
            // и хинт с балуном перестают открываться.
            iconShape: {
              type: 'Circle',
              coordinates: [0, 0],
              radius: NEARBY_PIN_SIZE / 2,
            },
            iconOffset: [-NEARBY_PIN_SIZE / 2, -NEARBY_PIN_SIZE / 2],
          },
        );
        map.geoObjects.add(mark);
        marksRef.current.push(mark);
      }
    })();
  }, [points, status]);

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
  const [openKey, setOpenKey] = useState<NearbyPlaceCategory | null>(null);
  const openGroup = groups.find((group) => group.category === openKey) ?? null;

  // Пока строка не раскрыта, на карте ближайшее из каждой категории с подписью;
  // раскрыли — все точки этой категории, уже без подписей: имена в этот момент
  // перечислены строчками прямо под ней.
  const points = useMemo<MapPoint[]>(() => {
    if (openGroup) {
      return openGroup.places.map((place) => ({ place, category: openGroup.category, label: null }));
    }
    return groups.map((group) => ({
      place: group.places[0],
      category: group.category,
      label: CATEGORY_META[group.category]?.names ? group.places[0].name : null,
    }));
  }, [groups, openGroup]);

  if (center.lat == null || center.lng == null) return null;
  const hasContent = hasNearbyContent(center, places);

  return (
    <div id="map" className={cn('mt-6 flex scroll-mt-32 flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <MapPin className="h-5 w-5 shrink-0 text-ink-muted" />
          {hasContent ? 'Что рядом' : 'Расположение'}
        </h2>
        <p className="text-sm text-ink-muted">
          {hasContent
            ? 'Ближайшее в каждой категории — на карте. Нажмите строку, чтобы увидеть остальное.'
            : 'Где стоит здание. Снимок окружающей инфраструктуры для него ещё не собран.'}
        </p>
      </div>

      <NeighboursMap center={center} points={points} />

      {/* Список-характеристики: слева категория, посередине ближайшее место,
          справа расстояние. Он же и фильтр карты — отдельного ряда кнопок над
          картой больше нет. Без него (краулер, пререндер, выключенный JS,
          заблокированный домен ключа) от блока не оставалось бы ничего. */}
      {groups.length > 0 && (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {groups.map((group) => {
            const meta = CATEGORY_META[group.category] ?? CATEGORY_META.other;
            const Icon = meta.icon;
            const isOpen = openKey === group.category;
            const nearest = group.places[0];
            return (
              <li key={group.category}>
                <button
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : group.category)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-muted/60"
                >
                  <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="w-32 shrink-0 text-sm font-semibold text-ink sm:w-44">{meta.label}</span>
                  <span className="flex-1 truncate text-sm text-ink-muted">
                    {meta.names ? nearest.name : `${group.places.length} поблизости`}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink">{formatMeters(nearest.distanceMeters)}</span>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform', isOpen && 'rotate-180')} aria-hidden />
                </button>

                {isOpen && (
                  <div className="pb-3 pl-7 pr-2">
                    {meta.names ? (
                      group.places.length > 1 ? (
                        <ul className="flex flex-col gap-1">
                          {group.places.slice(1).map((place) => (
                            <li key={place.id} className="flex items-baseline justify-between gap-4 text-sm text-ink-muted">
                              <span className="truncate">{place.name}</span>
                              <span className="shrink-0 tabular-nums text-ink-faint">{formatMeters(place.distanceMeters)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-ink-faint">Других поблизости не нашлось.</p>
                      )
                    ) : (
                      <p className="text-sm text-ink-muted">
                        Ещё {group.places.length - 1} поблизости — все показаны на карте. Какой это банк, видно по метке;
                        списком не выводим, потому что на выбор здания это не влияет.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-faint">Расстояния — по прямой от здания, по данным Яндекс.Карт.</p>
    </div>
  );
}
