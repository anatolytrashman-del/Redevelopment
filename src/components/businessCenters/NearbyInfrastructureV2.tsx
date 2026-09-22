import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BusFront, Coffee, Dumbbell, Landmark, MapPin, Pill, ShoppingBag, TrainFront, Utensils } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { loadYmaps } from '../../lib/yandexMaps';
import { formatMeters, groupNearbyPlaces, type NearbyCategoryGroup } from '../../lib/nearbyPlaces';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../../data/businessCenterNearbyPlaces';

// ПРОТОТИП переосмысленного блока «Инфраструктура рядом» (макет для владельца).
// Отличия от BusinessCenterNeighbours.tsx:
//  1) единица блока — категория, а не точка: сетка плиток вместо ряда чипов
//     с горизонтальным скроллом (влезает в экран, переносится по строкам);
//  2) карта по умолчанию показывает ОДНУ метку на категорию (ближайшую) —
//     9 подписанных меток вместо 86 безымянных;
//  3) расстояние — одно на категорию (до ближайшего), а не у каждой точки;
//  4) полный список показывается только для ВЫБРАННОЙ категории и нумерован
//     теми же номерами, что метки на карте, — список читается без кликов.

const NEAREST_KEY = 'nearest';
const WALK_LIMIT_METERS = 500;

const CATEGORY_META: Record<NearbyPlaceCategory, { label: string; short: string; color: string; icon: typeof MapPin; namesMatter: boolean; forms?: [string, string, string] }> = {
  metro: { label: 'Метро', short: 'станция', color: '#e4152b', icon: TrainFront, namesMatter: true },
  transport_stop: { label: 'Остановки', short: 'остановка', color: '#2563eb', icon: BusFront, namesMatter: true },
  grocery: { label: 'Продукты', short: 'магазин', color: '#15803d', icon: ShoppingBag, namesMatter: true },
  pharmacy: { label: 'Аптеки', short: 'аптека', color: '#059669', icon: Pill, namesMatter: true },
  bank: { label: 'Банки', short: 'отделение', color: '#475569', icon: Landmark, namesMatter: true },
  atm: { label: 'Банкоматы', short: 'банкомат', forms: ['банкомат', 'банкомата', 'банкоматов'] as [string, string, string], color: '#64748b', icon: Banknote, namesMatter: false },
  coffee: { label: 'Кофейни', short: 'кофейня', color: '#b45309', icon: Coffee, namesMatter: true },
  cafe: { label: 'Кафе и рестораны', short: 'кафе', color: '#c2410c', icon: Utensils, namesMatter: true },
  fitness: { label: 'Фитнес', short: 'зал', color: '#db2777', icon: Dumbbell, namesMatter: true },
  shop: { label: 'Магазины', short: 'магазин', color: '#7c3aed', icon: ShoppingBag, namesMatter: true },
  other: { label: 'Другое', short: 'объект', color: '#6e7781', icon: MapPin, namesMatter: true },
};

// «21 банкомат», «2 банкомата», «5 банкоматов» — без этого сводка по категории
// без имён читается как машинный вывод («21 банкомата»).
function plural(count: number, forms: [string, string, string]): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char] ?? char);
}

function MiniMap({
  center,
  title,
  groups,
  activeKey,
  focusId,
}: {
  center: { lat: number; lng: number };
  title: string;
  groups: NearbyCategoryGroup[];
  activeKey: string;
  focusId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const marksRef = useRef<Record<string, any>>({});
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
      // Кольца 300/600/850 м — линейка масштаба: расстояние читается с карты,
      // поэтому цифры у каждой точки в тексте больше не нужны.
      for (const [radius, label] of [[300, '300 м'], [600, '600 м'], [850, '850 м']] as [number, string][]) {
        map.geoObjects.add(new ymaps.Circle([[center.lat, center.lng], radius], {}, {
          fillColor: radius === 300 ? '#e4152b08' : '#00000000',
          strokeColor: '#e4152b55',
          strokeWidth: 1,
          strokeStyle: radius === 850 ? 'solid' : 'shortdash',
        }));
        void label;
      }
      map.geoObjects.add(new ymaps.Placemark([center.lat, center.lng], {
        iconContent: title,
      }, { preset: 'islands#blackStretchyIcon', zIndex: 900 }));
      mapRef.current = map;
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; mapRef.current?.destroy?.(); mapRef.current = null; };
  }, [center.lat, center.lng, title]);

  // Метки перерисовываются под режим: «Ближайшее» — одна подписанная метка на
  // категорию; выбранная категория — все её точки, пронумерованные так же,
  // как строки списка под картой.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;
    void (async () => {
      const ymaps = await loadYmaps();
      for (const mark of Object.values(marksRef.current)) map.geoObjects.remove(mark);
      marksRef.current = {};
      const render = (place: BusinessCenterNearbyPlace, label: string) => {
        const meta = CATEGORY_META[place.category] ?? CATEGORY_META.other;
        const mark = new ymaps.Placemark([place.lat, place.lng], {
          iconContent: label,
          hintContent: place.name,
          balloonContent: `<strong>${escapeHtml(place.name)}</strong><br>${meta.label} · ${formatMeters(place.distanceMeters)} по прямой`,
        }, {
          preset: 'islands#circleIcon',
          iconColor: meta.color,
        });
        map.geoObjects.add(mark);
        marksRef.current[place.id] = mark;
      };
      if (activeKey === NEAREST_KEY) {
        for (const group of groups) render(group.places[0], '');
      } else {
        const group = groups.find((item) => item.category === activeKey);
        // Номера — только там, где под картой есть нумерованный список; у
        // категорий без имён (банкоматы) списка нет, и номер вести некуда.
        const numbered = CATEGORY_META[activeKey as NearbyPlaceCategory]?.namesMatter ?? true;
        group?.places.forEach((place, index) => render(place, numbered ? String(index + 1) : ''));
      }
    })();
  }, [activeKey, groups, status]);

  useEffect(() => {
    const mark = focusId ? marksRef.current[focusId] : null;
    if (!mark || !mapRef.current) return;
    mapRef.current.setCenter(mark.geometry.getCoordinates(), 16, { duration: 250 });
    mark.balloon.open();
  }, [focusId]);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-96">
      <div ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
          {status === 'error' ? 'Не удалось загрузить карту' : 'Загрузка карты…'}
        </div>
      )}
    </div>
  );
}

export function NearbyInfrastructureV2({
  title,
  center,
  places,
}: {
  title: string;
  center: { lat: number; lng: number };
  places: BusinessCenterNearbyPlace[];
}) {
  const groups = useMemo(() => groupNearbyPlaces(places).filter((group) => group.category !== 'shop'), [places]);
  const [activeKey, setActiveKey] = useState<string>(NEAREST_KEY);
  const [focusId, setFocusId] = useState<string | null>(null);
  const activeGroup = groups.find((group) => group.category === activeKey) ?? null;

  // Вердикт считается из тех же данных, что и всё остальное: сколько категорий
  // имеет ближайший объект в пределах 500 м.
  const walkable = groups.filter((group) => group.places[0].distanceMeters <= WALK_LIMIT_METERS);

  return (
    <div className={cn('flex flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1.5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <MapPin className="h-5 w-5 shrink-0 text-ink-muted" />
          Инфраструктура рядом
        </h2>
        <p className="text-sm text-ink-muted">
          {walkable.length === groups.length ? (
            <>
              <span className="font-semibold text-ink">Всё в пешей доступности</span> — объекты всех {groups.length} категорий
              есть в пределах 500 метров от здания.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">{walkable.length} из {groups.length} категорий</span> — в пределах 500 метров
              от здания: {walkable.map((group) => group.label.toLocaleLowerCase('ru-RU')).join(', ')}.
            </>
          )}
        </p>
      </div>

      {/* Сетка плиток вместо ряда чипов с горизонтальным скроллом: все категории
          видны сразу, переносятся по строкам, и каждая плитка сама по себе —
          ответ на вопрос «есть ли рядом и далеко ли ближайшее». */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => { setActiveKey(NEAREST_KEY); setFocusId(null); }}
          className={cn(
            'flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition-colors',
            activeKey === NEAREST_KEY ? 'border-ink bg-ink text-white' : 'border-border bg-surface hover:border-border-strong',
          )}
        >
          <MapPin className={cn('h-5 w-5', activeKey === NEAREST_KEY ? 'text-white' : 'text-ink-muted')} />
          <span className="text-sm font-semibold leading-tight">Ближайшее</span>
          <span className={cn('text-xs', activeKey === NEAREST_KEY ? 'text-white/70' : 'text-ink-faint')}>обзор на карте</span>
        </button>
        {groups.map((group) => {
          const meta = CATEGORY_META[group.category] ?? CATEGORY_META.other;
          const Icon = meta.icon;
          const isActive = activeKey === group.category;
          return (
            <button
              key={group.category}
              type="button"
              onClick={() => { setActiveKey(isActive ? NEAREST_KEY : group.category); setFocusId(null); }}
              className={cn(
                'flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition-colors',
                isActive ? 'text-white' : 'border-border bg-surface hover:border-border-strong',
              )}
              style={isActive ? { backgroundColor: meta.color, borderColor: meta.color } : undefined}
            >
              <Icon className="h-5 w-5" style={{ color: isActive ? '#ffffff' : meta.color }} />
              <span className="text-sm font-semibold leading-tight">{group.label}</span>
              {/* Вместо «11 · от 147 м» — сразу ближайший объект с именем: плитка
                  отвечает на вопрос целиком, и подписи не нужно дублировать на
                  карте (там они налезали друг на друга в плотном центре). */}
              <span className={cn('text-xs leading-tight', isActive ? 'text-white/90' : 'text-ink')}>
                {meta.namesMatter ? group.places[0].name : 'ближайший'} — {formatMeters(group.places[0].distanceMeters)}
              </span>
              {group.places.length > 1 && (
                <span className={cn('text-[11px]', isActive ? 'text-white/70' : 'text-ink-faint')}>
                  ещё {group.places.length - 1} {plural(group.places.length - 1, ['рядом', 'рядом', 'рядом'])}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <MiniMap center={center} title={title} groups={groups} activeKey={activeKey} focusId={focusId} />

      {activeGroup ? (
        CATEGORY_META[activeGroup.category].namesMatter ? (
          /* Полный список ОДНОЙ выбранной категории — без «и ещё 16»: номера
             строк совпадают с номерами меток на карте, поэтому список читается
             целиком и без кликов по точкам. */
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">
              {activeGroup.label}: все {activeGroup.places.length} — номера совпадают с метками на карте
            </p>
            <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {activeGroup.places.map((place, index) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => setFocusId(place.id)}
                    className="flex w-full items-baseline gap-2 rounded-control px-1.5 py-1 text-left text-sm hover:bg-surface-muted"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: CATEGORY_META[activeGroup.category].color }}
                    >
                      {index + 1}
                    </span>
                    <span className="flex-1 text-ink">{place.name}</span>
                    <span className="shrink-0 text-ink-faint">{formatMeters(place.distanceMeters)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          /* Категории, где имя объекта ничего не говорит (банкоматы): вместо
             двадцати одного названия — факт, ближайший и метки на карте. */
          <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">
              {activeGroup.places.length}{' '}
              {plural(activeGroup.places.length, CATEGORY_META[activeGroup.category].forms ?? ['объект', 'объекта', 'объектов'])}
            </span>{' '}
            в пределах 850 метров, ближайший — {activeGroup.places[0].name}, {formatMeters(activeGroup.places[0].distanceMeters)}.
            Названия здесь ничего не добавляют — важен сам факт и расстояние, поэтому вместо списка из {activeGroup.places.length} строк
            только метки на карте.
          </p>
        )
      ) : (
        <p className="text-sm text-ink-muted">
          На карте — по одному ближайшему объекту из каждой категории. Нажмите плитку, чтобы увидеть все точки категории и список к ним.
        </p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Полный список всех {places.length} объектов рядом</summary>
        <div className="mt-2 flex flex-col gap-1 text-ink-muted">
          {groups.map((group) => (
            <p key={group.category}>
              <span className="font-semibold text-ink">{group.label}:</span>{' '}
              {group.places.map((place) => `${place.name} — ${formatMeters(place.distanceMeters)}`).join(', ')}
            </p>
          ))}
        </div>
      </details>

      <p className="text-xs text-ink-faint">
        Расстояния — по прямой от здания, по данным Яндекс.Карт. Пешеходные маршруты не считались.
      </p>
    </div>
  );
}
