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
const PAD = 28;
const HULL_MARGIN_M = 9;
// Магазины с одной и той же точкой (так бывает у островков и киосков) —
// разводим по кругу, чтобы кружки не легли друг на друга.
const SAME_POINT_SPREAD_PX = 9;

// Не фирменный красный: на схеме он читался бы как «проблема» (см. CLAUDE.md
// про primary и danger).
const DIRECTION_COLORS = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#0891b2', '#db2777'];
// «Другое» и всё, на что не хватило цветов, — одним серым: восемь оттенков
// на схеме уже не различить.
const OTHER_COLOR = '#94a3b8';
const OTHER_LABEL = 'Другое';

type Point = [number, number];

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
  const [viewW, setViewW] = useState(DEFAULT_VIEW_W);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([item]) => {
      const width = Math.round(item.contentRect.width);
      if (width > 0) setViewW(width);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    const located = entries.filter((entry): entry is FloorSchemaEntry & { coords: Point } => !!entry.coords && !!entry.floor);
    if (located.length === 0) return null;
    const origin: Point = [
      located.reduce((s, e) => s + e.coords[0], 0) / located.length,
      located.reduce((s, e) => s + e.coords[1], 0) / located.length,
    ];
    const meters = located.map((entry) => ({ entry, m: toMeters(entry.coords, origin) }));
    const outline = inflate(convexHull(meters.map((item) => item.m)), HULL_MARGIN_M);
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const spanX = Math.max(maxX - minX, 20);
    const spanY = Math.max(maxY - minY, 20);
    const scale = (viewW - PAD * 2) / spanX;
    const viewH = Math.min(Math.max(spanY * scale + PAD * 2, 200), 560);
    const fit = Math.min(scale, (viewH - PAD * 2) / spanY);
    const offX = (viewW - spanX * fit) / 2;
    const offY = (viewH - spanY * fit) / 2;
    const project = ([x, y]: Point): Point => [offX + (x - minX) * fit, offY + (y - minY) * fit];
    return { meters, outline: outline.map(project), project, viewH, metersPerPx: 1 / fit };
  }, [entries, viewW]);

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
      <svg
        viewBox={`0 0 ${viewW} ${layout.viewH}`}
        className="block h-auto w-full touch-manipulation"
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
        {dots.map(({ entry, x, y }, index) => {
          const dimmed = highlighted !== null && !highlighted.has(entry);
          const isSelected = current === entry;
          return (
            <g
              key={`${entry.name}-${entry.url ?? index}`}
              className="cursor-pointer"
              opacity={dimmed ? 0.18 : 1}
              onClick={(event) => {
                event.stopPropagation();
                setSelected(entry);
              }}
            >
              <title>{entry.name}</title>
              {/* Невидимая зона побольше — чтобы попадать пальцем. */}
              <circle cx={x} cy={y} r={12} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 8 : 5.5}
                fill={colorOf(entry.direction)}
                stroke="#fff"
                strokeWidth={isSelected ? 3 : 1.5}
              />
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
          <p className="text-xs text-ink-muted">Нажмите на точку, чтобы увидеть магазин.</p>
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
          Места магазинов — по точкам организаций в Яндекс Картах, контур здания условный.
        </p>
      </div>
    </div>
  );
}
