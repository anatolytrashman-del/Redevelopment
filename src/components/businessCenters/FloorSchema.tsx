// Схема этажа ТЦ: магазины точками на своих местах.
//
// Владелец хотел схему «как в Яндексе, какой магазин где расположен». Сам
// рисунок поэтажного плана Яндекса — его закрытые векторные данные, их мы не
// копируем (2026-09-24). Рисуем своё: у каждого магазина с поэтажного плана в
// карточке Яндекса есть собственная точка внутри здания (scripts/
// yandex-tenant-floors.mjs, --coords), и из этих точек получается схема —
// контур здания условный (оболочка всех точек всех этажей, одна на все этажи,
// чтобы при переключении этажа схема не «прыгала»), магазины кружками,
// цвет — направление, клик — карточка магазина под схемой.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import { formatFloorLabel } from '../../lib/businessCenterTenants';

export type FloorSchemaEntry = TenantOrganizationView & { direction: string };

// Ширина схемы в единицах SVG = её ширина на экране: иначе на телефоне
// кружки ужимаются вместе с рисунком до точек, по которым не попасть.
const DEFAULT_VIEW_W = 640;
const NARROW_VIEW_W = 520;
const ZOOM_STEPS = [1, 1.6, 2.5, 4];
const PAD = 28;
const HULL_MARGIN_M = 9;
// Точка дальше трёх «типичных» расстояний от центра (и дальше 60 м) — ошибка
// в карточке Яндекса, а не магазин этого здания: на схему её не ставим, иначе
// она растянет контур на пол-квартала.
const OUTLIER_FACTOR = 3;
const OUTLIER_MIN_M = 60;
// Магазины с одной и той же точкой (так бывает у островков и киосков) —
// разводим по кругу, чтобы кружки не легли друг на друга.
const SAME_POINT_SPREAD_PX = 9;
// Условное помещение не больше круга такого радиуса вокруг точки магазина.
const CELL_MAX_RADIUS_M = 9;
const CELL_GAP_PX = 1.5;

// Не фирменный красный: на схеме он читался бы как «проблема» (см. CLAUDE.md
// про primary и danger).
const DIRECTION_COLORS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#0891b2', '#db2777'];
// «Другое» и всё, на что не хватило цветов, — одним серым: восемь оттенков
// на схеме уже не различить.
const OTHER_COLOR = '#94a3b8';
const OTHER_LABEL = 'Другое';

type Point = [number, number];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function principalAngle(points: Point[]): number {
  const n = points.length || 1;
  const mx = points.reduce((sum, p) => sum + p[0], 0) / n;
  const my = points.reduce((sum, p) => sum + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

function rotate([x, y]: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
}

function toMeters(coords: Point, origin: Point): Point {
  const [lon0, lat0] = origin;
  const [lon, lat] = coords;
  return [(lon - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180), (lat0 - lat) * 110_540];
}

// Выпуклая оболочка (монотонная цепь Эндрю).
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Оболочка, раздвинутая от центра на запас в метрах: точки стоят в центрах
// помещений, а стены — дальше.
function inflate(hull: Point[], margin: number): Point[] {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * margin, y + (dy / len) * margin];
  });
}

// Отсечение многоугольника полуплоскостью a·x + b·y <= c (Сазерленд — Ходжман).
function clipHalfPlane(polygon: Point[], a: number, b: number, c: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const cur = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const curIn = a * cur[0] + b * cur[1] <= c;
    const nextIn = a * next[0] + b * next[1] <= c;
    if (curIn) out.push(cur);
    if (curIn !== nextIn) {
      const t = (c - a * cur[0] - b * cur[1]) / (a * (next[0] - cur[0]) + b * (next[1] - cur[1]));
      out.push([cur[0] + t * (next[0] - cur[0]), cur[1] + t * (next[1] - cur[1])]);
    }
  }
  return out;
}

// Условное помещение магазина: часть этажа, ближайшая к его точке (ячейка
// Вороного внутри контура), но не дальше maxRadius — иначе магазин на краю
// пустого крыла «занял» бы всё крыло. Чуть ужимаем к центру, чтобы между
// соседями оставался зазор, как стена на плане.
function storeCells(points: Point[], outline: Point[], maxRadius: number, gap: number): Point[][] {
  return points.map((p, i) => {
    let cell = outline;
    for (let k = 0; k < 8 && cell.length > 0; k += 1) {
      const angle = (Math.PI / 4) * k;
      const a = Math.cos(angle);
      const b = Math.sin(angle);
      cell = clipHalfPlane(cell, a, b, a * p[0] + b * p[1] + maxRadius);
    }
    for (let j = 0; j < points.length && cell.length > 0; j += 1) {
      if (j === i) continue;
      const q = points[j];
      const a = q[0] - p[0];
      const b = q[1] - p[1];
      if (a === 0 && b === 0) continue;
      cell = clipHalfPlane(cell, a, b, (q[0] ** 2 + q[1] ** 2 - p[0] ** 2 - p[1] ** 2) / 2);
    }
    if (cell.length < 3) return [];
    const cx = cell.reduce((sum, v) => sum + v[0], 0) / cell.length;
    const cy = cell.reduce((sum, v) => sum + v[1], 0) / cell.length;
    return cell.map(([x, y]) => {
      const len = Math.hypot(x - cx, y - cy) || 1;
      const k = Math.max(0, len - gap) / len;
      return [cx + (x - cx) * k, cy + (y - cy) * k] as Point;
    });
  });
}

function cellBox(cell: Point[]) {
  const xs = cell.map((p) => p[0]);
  const ys = cell.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

// Подпись, которая влезает в помещение: по ширине ~6 px на букву при 10 px.
function fitLabel(name: string, width: number): string | null {
  const chars = Math.floor((width - 6) / 6);
  if (chars < 3) return null;
  return name.length <= chars ? name : `${name.slice(0, Math.max(chars - 1, 2)).trimEnd()}…`;
}

export function FloorSchema({
  entries,
  floor,
  highlighted,
}: {
  entries: FloorSchemaEntry[];
  floor: string;
  // Прошедшие поиск и фильтр направления (null — фильтра нет): остальные
  // кружки бледнеют.
  highlighted: Set<FloorSchemaEntry> | null;
}) {
  const [selected, setSelected] = useState<FloorSchemaEntry | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(DEFAULT_VIEW_W);
  // Масштаб: на целом ТЦ в ширину экрана подписи в помещения не влезают,
  // поэтому схему можно увеличить и листать внутри рамки.
  const [zoom, setZoom] = useState(1);
  const viewW = Math.round(boxW * zoom);
  const scrollRef = useRef<HTMLDivElement>(null);
  // После смены масштаба держим в рамке середину схемы, а не левый верх.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
    box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
  }, [zoom]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([item]) => {
      const width = Math.round(item.contentRect.width);
      if (width > 0) setBoxW(width);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const located = entries.filter((entry): entry is FloorSchemaEntry & { coords: Point } => !!entry.coords && !!entry.floor);
    if (located.length === 0) return null;
    // Центр — медиана, а не среднее: одна ошибочная точка (у «Европы»
    // «Академическое» стоит в 800 м от здания) утащила бы среднее за собой.
    const origin: Point = [median(located.map((e) => e.coords[0])), median(located.map((e) => e.coords[1]))];
    const all = located.map((entry) => ({ entry, m: toMeters(entry.coords, origin) }));
    const typical = median(all.map((item) => Math.hypot(...item.m)));
    const kept = all.filter((item) => Math.hypot(...item.m) <= Math.max(typical * OUTLIER_FACTOR, OUTLIER_MIN_M));
    // Поворачиваем схему длинной стороной здания по горизонтали (главная ось
    // облака точек): вытянутый наискосок ТЦ иначе занимает узкую диагональ
    // и на телефоне сжимается в полоску. Север при этом не вверху — схема
    // и так условная.
    const angle = principalAngle(kept.map((item) => item.m));
    // На узком экране — наоборот, длинной стороной вниз: вертикаль там есть,
    // а ширины нет.
    const turn = boxW < NARROW_VIEW_W ? Math.PI / 2 : 0;
    const meters = kept.map((item) => ({ entry: item.entry, m: rotate(item.m, turn - angle) }));
    const outline = inflate(convexHull(meters.map((item) => item.m)), HULL_MARGIN_M);
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const spanX = Math.max(maxX - minX, 20);
    const spanY = Math.max(maxY - minY, 20);
    const scale = (viewW - PAD * 2) / spanX;
    const viewH = Math.min(Math.max(spanY * scale + PAD * 2, 200), 560 * zoom);
    const fit = Math.min(scale, (viewH - PAD * 2) / spanY);
    const offX = (viewW - spanX * fit) / 2;
    const offY = (viewH - spanY * fit) / 2;
    const project = ([x, y]: Point): Point => [offX + (x - minX) * fit, offY + (y - minY) * fit];
    return { meters, outline: outline.map(project), project, viewH, metersPerPx: 1 / fit };
  }, [entries, viewW, boxW, zoom]);

  const directionColors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.coords && entry.direction !== OTHER_LABEL) counts.set(entry.direction, (counts.get(entry.direction) ?? 0) + 1);
    }
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([d]) => d);
    return new Map(ordered.slice(0, DIRECTION_COLORS.length).map((direction, index) => [direction, DIRECTION_COLORS[index]]));
  }, [entries]);
  const colorOf = (direction: string) => directionColors.get(direction) ?? OTHER_COLOR;

  const dots = useMemo(() => {
    if (!layout) return [];
    const onFloor = layout.meters.filter((item) => item.entry.floor === floor);
    const byPixel = new Map<string, typeof onFloor>();
    for (const item of onFloor) {
      const [px, py] = layout.project(item.m);
      const key = `${Math.round(px / 4)}:${Math.round(py / 4)}`;
      byPixel.set(key, [...(byPixel.get(key) ?? []), item]);
    }
    return [...byPixel.values()].flatMap((group) =>
      group.map((item, index) => {
        const [px, py] = layout.project(item.m);
        if (group.length === 1) return { entry: item.entry, x: px, y: py };
        const angle = (2 * Math.PI * index) / group.length;
        return { entry: item.entry, x: px + Math.cos(angle) * SAME_POINT_SPREAD_PX, y: py + Math.sin(angle) * SAME_POINT_SPREAD_PX };
      }),
    );
  }, [layout, floor]);

  const cells = useMemo(() => {
    if (!layout || dots.length === 0) return [];
    const polygons = storeCells(
      dots.map((dot) => [dot.x, dot.y] as Point),
      layout.outline,
      CELL_MAX_RADIUS_M / layout.metersPerPx,
      CELL_GAP_PX,
    );
    return dots.map((dot, index) => ({ ...dot, cell: polygons[index] }));
  }, [layout, dots]);

  if (!layout) return null;
  const onFloorDirections = new Set(dots.map((dot) => dot.entry.direction));
  const legend = [...directionColors.keys()].filter((direction) => onFloorDirections.has(direction));
  if ([...onFloorDirections].some((direction) => !directionColors.has(direction))) legend.push(OTHER_LABEL);
  const current = selected && selected.floor === floor ? selected : null;
  const scaleBarM = layout.metersPerPx * 100 > 60 ? 50 : 20;

  return (
    <div ref={boxRef} className="overflow-hidden rounded-2xl border border-border bg-white/60">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm">
        <span className="font-semibold text-ink">Схема: {formatFloorLabel(floor)}</span>
        <span className="text-xs text-ink-muted">{dots.length} на схеме</span>
      </div>
      <div className="relative">
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 620 }}>
          <svg
            viewBox={`0 0 ${viewW} ${layout.viewH}`}
            width={viewW}
            height={layout.viewH}
            className="block max-w-none touch-manipulation"
            role="img"
            aria-label={`Схема: ${formatFloorLabel(floor)}, ${dots.length} организаций`}
            onClick={() => setSelected(null)}
          >
            <polygon
              points={layout.outline.map((p) => p.join(',')).join(' ')}
              fill="#f1f5f9"
              stroke="#cbd5e1"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {cells.map(({ entry, x, y, cell }, index) => {
              const dimmed = highlighted !== null && !highlighted.has(entry);
              const isSelected = current === entry;
              const color = colorOf(entry.direction);
              const box = cell.length > 0 ? cellBox(cell) : null;
              const label = box && box.h >= 14 ? fitLabel(entry.name, box.w) : null;
              return (
                <g
                  key={`${entry.name}-${entry.url ?? index}`}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.2 : 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(entry);
                  }}
                >
                  <title>{entry.name}</title>
                  {cell.length > 0 ? (
                    <polygon
                      points={cell.map((p) => p.join(',')).join(' ')}
                      fill={color}
                      fillOpacity={isSelected ? 0.45 : 0.16}
                      stroke={isSelected ? color : '#fff'}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeLinejoin="round"
                    />
                  ) : null}
                  <circle cx={x} cy={y} r={isSelected ? 4.5 : 3} fill={color} />
                  {label && box && (
                    <text
                      x={x}
                      y={y + 13}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill="#1e293b"
                      paintOrder="stroke"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      strokeOpacity={0.8}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
            <g transform={`translate(${PAD}, ${layout.viewH - 14})`} className="text-[11px]">
              <line x1={0} x2={scaleBarM / layout.metersPerPx} y1={0} y2={0} stroke="#94a3b8" strokeWidth={2} />
              <text x={scaleBarM / layout.metersPerPx + 6} y={4} fill="#64748b">
                {scaleBarM} м
              </text>
            </g>
          </svg>
        </div>
        <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-border bg-white/90 text-sm font-semibold text-ink shadow-sm">
          <button
            type="button"
            aria-label="Уменьшить схему"
            disabled={zoom <= ZOOM_STEPS[0]}
            onClick={() => setZoom((value) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(value) - 1)])}
            className="px-3 py-1 hover:bg-white disabled:opacity-35"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Увеличить схему"
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() => setZoom((value) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(value) + 1)])}
            className="border-l border-border px-3 py-1 hover:bg-white disabled:opacity-35"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
        {current ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {current.url ? (
                <a
                  href={current.url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="block truncate text-sm font-semibold text-ink hover:text-primary-hover hover:underline"
                >
                  {current.name}
                </a>
              ) : (
                <p className="truncate text-sm font-semibold text-ink">{current.name}</p>
              )}
              <p className="mt-0.5 truncate text-xs text-ink-muted">{current.rubric ?? current.direction}</p>
            </div>
            {current.rating != null && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                {current.rating.toFixed(1)}
                {current.reviewCount != null && <span className="font-normal text-ink-muted">· {current.reviewCount}</span>}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">Нажмите на помещение, чтобы увидеть магазин.</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          {legend.map((direction) => (
            <span key={direction} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: colorOf(direction) }}
              />
              {direction}
            </span>
          ))}
        </div>
        <p className="text-[11px] leading-snug text-ink-faint">
          Места магазинов — по точкам организаций в Яндекс Картах. Границы помещений и контур здания условные.
        </p>
      </div>
    </div>
  );
}
