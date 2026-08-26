import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Grid2x2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { loadYmaps } from '../../lib/yandexMaps';
import { DISTRICT_PLACE_CATEGORIES } from '../../data/districtPlaces';
import { DISTRICT_QUARTERS } from '../../data/districtQuarters';
import { countsByQuarter } from '../../lib/districtQuarterMatch';
import { computeLocationQuotients } from '../../lib/locationQuotient';

// Карта конкуренции бизнеса по кварталам — владелец: "плотность ниш по
// конкретным кварталам минск мира, чтобы было похоже на аналитику best
// place... Минск Мир разбит на конкретные кварталы, которые легко
// гуглятся". Границы кварталов — не свои полигоны "на глаз", а построены
// по официальному справочнику застройщика "дом → квартал" (владелец
// прислал файл, 2026-08-25, см. data/districtQuarters.ts) — там же
// объяснение, почему у части точек нет квартала (справочник покрывает не
// все дома района). В отличие от DistrictMap.tsx (точки, много категорий
// разом), тут ровно одна выбранная категория и заливка кварталов по её
// плотности — выбор категории меняет заливку, а не набор меток.

const HEAT_LIGHT = { r: 0xfd, g: 0xe3, b: 0xe5 }; // --color-primary-soft
const HEAT_DARK = { r: 0xe4, g: 0x15, b: 0x2b }; // --color-primary

function heatColor(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(HEAT_LIGHT.r + (HEAT_DARK.r - HEAT_LIGHT.r) * t);
  const g = Math.round(HEAT_LIGHT.g + (HEAT_DARK.g - HEAT_LIGHT.g) * t);
  const b = Math.round(HEAT_LIGHT.b + (HEAT_DARK.b - HEAT_LIGHT.b) * t);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function polygonCentroid(polygon: [number, number][]): [number, number] {
  const lat = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const lon = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  return [lat, lon];
}

// Грубая оценка площади в градусах² — только чтобы выбрать САМЫЙ большой
// под-полигон квартала под единственную подпись-число (у квартала может
// быть несколько отдельных фигур, см. комментарий в data/districtQuarters.ts
// — цифра на карте не должна дублироваться на каждом кусочке).
function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [lat1, lon1] = polygon[i];
    const [lat2, lon2] = polygon[(i + 1) % polygon.length];
    area += lat1 * lon2 - lat2 * lon1;
  }
  return Math.abs(area / 2);
}

const DEFAULT_CENTER: [number, number] = [53.866, 27.5435];
const DEFAULT_ZOOM = 15;

function CategoryToggle({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = DISTRICT_PLACE_CATEGORIES.find((c) => c.key === value);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-border"
      >
        {current?.label ?? 'Категория'}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 pt-2">
          <div className="flex max-h-80 w-56 flex-col gap-0.5 overflow-y-auto rounded-control border border-border bg-surface p-1.5 shadow-card">
            {DISTRICT_PLACE_CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => {
                  onChange(category.key);
                  setOpen(false);
                }}
                className={cn(
                  'rounded-control px-3 py-1.5 text-left text-xs font-semibold transition-colors',
                  value === category.key ? 'bg-surface-muted text-primary' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// LQ (location quotient) > этого порога — категория заметно
// переконцентрирована в квартале относительно района ("выше среднего"),
// < обратного порога — недопредставлена ("ниже среднего"). Пороги —
// стандартная практика ритейл-аналитики (обычно 1.25/0.75), взяли чуть
// шире (1.3/0.7), чтобы не дёргаться на пограничных значениях при малой
// выборке (28 точек на квартал — это мало для строгой статистики).
const LQ_HIGH_THRESHOLD = 1.3;
const LQ_LOW_THRESHOLD = 0.7;

function lqColor(lq: number | null): string {
  if (lq === null) return 'var(--color-ink-faint)';
  if (lq >= LQ_HIGH_THRESHOLD) return 'var(--color-primary)';
  if (lq <= LQ_LOW_THRESHOLD) return '#4B7BEC';
  return 'var(--color-ink-faint)';
}

function lqLabel(lq: number | null): string {
  if (lq === null) return 'нет данных по району';
  if (lq >= LQ_HIGH_THRESHOLD) return 'выше среднего по району';
  if (lq <= LQ_LOW_THRESHOLD) return 'ниже среднего — возможна ниша';
  return 'типично для района';
}

// Разбивка по укрупнённым "корзинам" бизнеса (lib/businessBuckets.ts) с
// location quotient — владелец: "предложи формат определения плотности
// бизнесов", ответ — LQ вместо сырого счётчика (см. комментарий в
// lib/locationQuotient.ts). Показывается только для кварталов, у которых
// есть исчерпывающие поквартирные данные (сейчас — только "Мировые
// танцы", категория 'quarter-test-full' в data/districtPlaces.ts).
function LocationQuotientPanel({ quarterId, quarterLabel }: { quarterId: string; quarterLabel: string }) {
  const rows = useMemo(() => computeLocationQuotients(quarterId), [quarterId]);
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => (b.lq ?? 0) - (a.lq ?? 0));
  const maxAbsLog = Math.max(1, ...sorted.map((r) => (r.lq ? Math.abs(Math.log2(r.lq)) : 0)));

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-4">
      <h3 className="text-sm font-bold text-ink">Индекс концентрации по нишам — {quarterLabel}</h3>
      <p className="text-xs text-ink-muted">
        Location quotient — доля ниши в квартале относительно её доли по всему району. Больше 1 — ниша
        переконцентрирована здесь (высокая конкуренция), меньше 1 — недопредставлена (возможная свободная ниша).
      </p>
      <div className="flex flex-col gap-1.5 pt-1">
        {sorted.map((row) => {
          const barRatio = row.lq ? Math.abs(Math.log2(row.lq)) / maxAbsLog : 0;
          const color = lqColor(row.lq);
          return (
            // flex-col на мобильном — метка ("Услуги для дома и техники",
            // "Недвижимость и бизнес-услуги") + полоса + значение + счётчик
            // в одну строку с фиксированной шириной метки (w-40) не
            // помещались на 375px, метка обрезалась посреди слова.
            // Название на своей строке (без truncate/фикс. ширины на
            // мобильном) решает это, не трогая компактный вид на sm+.
            <div key={row.bucketId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              {/* sm:w-56 (224px), не w-40 (160px) — самая длинная метка
                  ("Недвижимость и бизнес-услуги") рендерится ~200px реальным
                  шрифтом страницы (замерено на живой странице, не
                  синтетическим sans-serif — тот давал заниженную оценку
                  ~174px), в w-40 и даже в w-48 обрезалась бы посреди слова. */}
              <span className="text-xs text-ink-muted sm:w-56 sm:shrink-0 sm:truncate">{row.label}</span>
              <div className="flex items-center gap-3">
                <div className="relative h-5 flex-1 rounded-full bg-surface-muted">
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={
                      row.lq !== null && row.lq < 1
                        ? { right: '50%', width: `${barRatio * 50}%`, backgroundColor: color }
                        : { left: '50%', width: `${barRatio * 50}%`, backgroundColor: color }
                    }
                  />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                </div>
                <span className="w-14 shrink-0 text-right text-xs font-bold" style={{ color }}>
                  {row.lq !== null ? `×${row.lq.toFixed(1)}` : '—'}
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-ink-faint">{row.localCount} шт.</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-faint">
        Красным — {lqLabel(LQ_HIGH_THRESHOLD)}, синим — {lqLabel(LQ_LOW_THRESHOLD)}. Один квартал с полными данными —
        район как база сравнения посчитан по нашим текущим (неполным) категориям, точность вырастет по мере сбора
        исчерпывающих списков по остальным кварталам.
      </p>
    </div>
  );
}

// ВРЕМЕННО — проверяем контур по точкам, снятым владельцем своим
// инструментом (клики по углам квартала на живой карте), остальные 15
// скрыты из отрисовки. Убрать фильтр (вернуть DISTRICT_QUARTERS как есть),
// когда подтвердит, что контур совпадает с дорогами на реальной карте.
const TEST_ONLY_QUARTER_ID = 'world-dances';
const VISIBLE_QUARTERS = DISTRICT_QUARTERS.filter((q) => q.id === TEST_ONLY_QUARTER_ID);

export function DistrictQuarterMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [categoryKey, setCategoryKey] = useState('quarter-test-full');

  const counts = useMemo(() => countsByQuarter(categoryKey), [categoryKey]);
  const maxCount = useMemo(() => Math.max(1, ...Object.values(counts)), [counts]);
  const matchedTotal = useMemo(() => Object.values(counts).reduce((sum, n) => sum + n, 0), [counts]);
  const categoryTotal = DISTRICT_PLACE_CATEGORIES.find((c) => c.key === categoryKey)?.places.length ?? 0;

  const rankedQuarters = useMemo(
    () =>
      VISIBLE_QUARTERS.map((q) => ({ ...q, count: counts[q.id] ?? 0 })).sort((a, b) => b.count - a.count),
    [counts],
  );

  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return;
        const map = new ymaps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          controls: ['zoomControl'],
        });
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
  }, []);

  // Перерисовываем заливку кварталов при смене категории — не пересоздаём
  // саму карту (центр/зум/скрипт API не меняются, только цвет/подписи).
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !window.ymaps) return;
    const ymaps = window.ymaps;

    if (layerRef.current) {
      map.geoObjects.remove(layerRef.current);
    }
    const layer = new ymaps.GeoObjectCollection();
    for (const quarter of VISIBLE_QUARTERS) {
      const count = counts[quarter.id] ?? 0;
      const ratio = count / maxCount;
      const fillColor = heatColor(count > 0 ? Math.max(ratio, 0.12) : 0);
      const balloonBody = `${count} точек категории «${DISTRICT_PLACE_CATEGORIES.find((c) => c.key === categoryKey)?.label}»`;

      // Квартал может состоять из нескольких отдельных фигур (см. комментарий
      // в data/districtQuarters.ts) — рисуем каждую тем же цветом, подпись с
      // числом ставим только на самой крупной, чтобы не дублировать цифру.
      let largestIndex = 0;
      let largestArea = -1;
      quarter.polygons.forEach((poly, i) => {
        const area = polygonArea(poly);
        if (area > largestArea) {
          largestArea = area;
          largestIndex = i;
        }
      });

      quarter.polygons.forEach((poly, i) => {
        const polygon = new ymaps.Polygon(
          [poly],
          {
            balloonContentHeader: quarter.label,
            balloonContentBody: balloonBody,
            hintContent: `${quarter.label}: ${count}`,
          },
          {
            fillColor,
            fillOpacity: count > 0 ? 0.75 : 0.35,
            strokeColor: '#ffffff',
            strokeWidth: 2,
            strokeOpacity: 0.9,
          },
        );
        layer.add(polygon);

        if (i === largestIndex) {
          const [lat, lon] = polygonCentroid(poly);
          const label = new ymaps.Placemark(
            [lat, lon],
            { iconContent: String(count) },
            { preset: 'islands#blackStretchyIcon' },
          );
          layer.add(label);
        }
      });
    }
    map.geoObjects.add(layer);
    layerRef.current = layer;
  }, [status, counts, maxCount, categoryKey]);

  return (
    <div className="flex flex-col gap-3">
      {/* flex-col на мобильном — заголовок длинный ("Конкуренция бизнеса по
          кварталам") и в одну строку с CategoryToggle (тоже может быть
          длинным — выбранная категория) не помещались, оба сжимались и
          переносились некрасиво (проверено на 375px). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Grid2x2 className="h-5 w-5 shrink-0 text-ink" />
          <h2 className="text-lg font-bold text-ink">Конкуренция бизнеса по кварталам</h2>
        </div>
        <CategoryToggle value={categoryKey} onChange={setCategoryKey} />
      </div>
      <p className="text-sm text-ink-muted">
        Плотность выбранной категории по официальным кварталам застройки Минск Мира — чем темнее квартал, тем выше
        концентрация точек этой категории.
      </p>
      {/* data-allow-pinch-zoom — см. комментарий в App.tsx (usePreventPageZoom)
          и в DistrictMap.tsx — исключает эту карту из глобальной блокировки
          двупальцевого touchmove, иначе щипок для зума карты не работал. */}
      <div data-allow-pinch-zoom className="relative h-[420px] overflow-hidden rounded-control border border-border">
        {status === 'error' && (
          <div className="flex h-full items-center justify-center text-sm text-ink-faint">Не удалось загрузить карту</div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface text-sm text-ink-faint">
            Загрузка карты…
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-ink-faint">Меньше</span>
        <div className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${heatColor(0.12)}, ${heatColor(1)})` }} />
        <span className="text-xs font-medium text-ink-faint">Больше</span>
      </div>

      {/* grid-cols-1 на мобильном — при 2 колонках длинные названия
          кварталов ("Мировые танцы", "Тропические острова" и т.п.)
          обрезались посередине слова (truncate на слишком узкой ячейке). */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {rankedQuarters.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-2 rounded-control bg-surface-muted px-2.5 py-1.5">
            <span className="truncate text-xs text-ink-muted">{q.label}</span>
            <span className="shrink-0 text-xs font-bold text-ink">{q.count}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-faint">
        Учтено {matchedTotal} из {categoryTotal} точек категории «{DISTRICT_PLACE_CATEGORIES.find((c) => c.key === categoryKey)?.label}»
        — справочник застройщика покрывает не все дома района (например, паркинги и часть коммерческих зданий вне
        жилых кварталов в него не входят).
      </p>

      {VISIBLE_QUARTERS.map((q) => (
        <LocationQuotientPanel key={q.id} quarterId={q.id} quarterLabel={q.label} />
      ))}
    </div>
  );
}
