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
const CELL_GAP_PX = 1;

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


type Room = { x0: number; y0: number; x1: number; y1: number };

// Условные помещения — прямоугольники вдоль осей схемы, как на поэтажном
// плане (владелец, 2026-09-24: «в яндексе чёткая схема с прямоугольными
// границами, а у нас нет»; первая версия с ячейками Вороного давала косые
// многоугольники). Каждому магазину — квадрат со стороной 2·maxRadius вокруг
// его точки, дальше с каждым соседом помещения делятся стенкой посередине
// поперёк того направления, где они дальше друг от друга: сосед справа —
// вертикальная стенка, сосед снизу — горизонтальная. Любые два помещения
// так разделены хотя бы одной стенкой и не пересекаются, а то, что никому
// не досталось, остаётся проходом.
function rectRooms(points: Point[], maxRadius: number, gap: number): Room[] {
  return points.map(([px, py], i) => {
    const room = { x0: px - maxRadius, x1: px + maxRadius, y0: py - maxRadius, y1: py + maxRadius };
    points.forEach(([qx, qy], j) => {
      if (j === i) return;
      const dx = qx - px;
      const dy = qy - py;
      if (Math.abs(dx) > 2 * maxRadius || Math.abs(dy) > 2 * maxRadius) return;
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > 0) room.x1 = Math.min(room.x1, px + dx / 2);
        else if (dx < 0) room.x0 = Math.max(room.x0, px + dx / 2);
      } else if (dy > 0) room.y1 = Math.min(room.y1, py + dy / 2);
      else room.y0 = Math.max(room.y0, py + dy / 2);
    });
    return { x0: room.x0 + gap, x1: room.x1 - gap, y0: room.y0 + gap, y1: room.y1 - gap };
  });
}

// Подпись в помещении: до двух строк по словам, шрифт от 11 до 8 px — самый
// крупный, при котором название влезает в ширину помещения целиком. Не влезает
// и на 8 px — в помещении пишем номер, а название с тем же номером стоит в
// списке под схемой (обрезанное «Jus…» не читается, владелец 2026-09-24).
const CHAR_W = 0.6; // средняя ширина буквы в долях кегля
const LABEL_PAD = 2;
type Label = { lines: string[]; size: number; w: number; h: number };

function splitTwoLines(name: string, maxChars: number): string[] | null {
  if (name.length <= maxChars) return [name];
  const words = name.split(/\s+/);
  for (let cut = words.length - 1; cut > 0; cut -= 1) {
    const first = words.slice(0, cut).join(' ');
    const second = words.slice(cut).join(' ');
    if (first.length <= maxChars && second.length <= maxChars) return [first, second];
  }
  return null;
}

function layoutLabel(name: string, width: number, height: number): Label | null {
  for (let size = 11; size >= 8; size -= 1) {
    const maxChars = Math.floor((width * 0.9) / (size * CHAR_W));
    if (maxChars < 3) continue;
    const lines = splitTwoLines(name, maxChars);
    if (lines && lines.length * size * 1.15 <= height * 0.9) {
      return { lines, size, w: Math.max(...lines.map((l) => l.length)) * size * CHAR_W, h: lines.length * size * 1.15 };
    }
  }
  return null;
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
    // Контур — оболочка углов помещений всех этажей (у каждого магазина
    // квадрат ±CELL_MAX_RADIUS_M), тогда ни одно помещение не вылезает
    // наружу, и контур один на все этажи.
    const r = CELL_MAX_RADIUS_M + 1;
    const outline = convexHull(
      meters.flatMap(({ m: [x, y] }) => [
        [x - r, y - r],
        [x + r, y - r],
        [x - r, y + r],
        [x + r, y + r],
      ] as Point[]),
    );
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const spanX = Math.max(maxX - minX, 20);
    const spanY = Math.max(maxY - minY, 20);
    const scale = (viewW - PAD * 2) / spanX;
    // На узком экране схема стоит вертикально и высотой не ограничена: иначе
    // здание ужимается по высоте и помещения выходят мельче пальца.
    const maxH = boxW < NARROW_VIEW_W ? Infinity : 560 * zoom;
    const viewH = Math.min(Math.max(spanY * scale + PAD * 2, 200), maxH);
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
    const rooms = rectRooms(dots.map((dot) => [dot.x, dot.y] as Point), CELL_MAX_RADIUS_M / layout.metersPerPx, CELL_GAP_PX);
    const order = [...dots].sort((a, b) => a.entry.name.localeCompare(b.entry.name, 'ru'));
    const numberOf = new Map(order.map((dot, index) => [dot.entry, index + 1]));
    const withCells = dots.map((dot, index) => {
      const room = rooms[index];
      const box =
        room.x1 - room.x0 > 2 && room.y1 - room.y0 > 2
          ? { cx: (room.x0 + room.x1) / 2, cy: (room.y0 + room.y1) / 2, w: room.x1 - room.x0, h: room.y1 - room.y0 }
          : null;
      const number = numberOf.get(dot.entry) ?? 0;
      const named = box ? layoutLabel(dot.entry.name, box.w, box.h) : null;
      const numbered: Label = { lines: [String(number)], size: 10, w: String(number).length * 6 + 2, h: 11.5 };
      return { ...dot, room, box, number, isName: !!named, label: named ?? (box ? numbered : null) };
    });
    // Подписи не должны налезать друг на друга: ставим начиная с крупных
    // помещений, а подпись, задевающая уже поставленную, прячется.
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const item of [...withCells].sort((a, b) => (b.box ? b.box.w * b.box.h : 0) - (a.box ? a.box.w * a.box.h : 0))) {
      if (!item.label || !item.box) continue;
      const rect = {
        x0: item.box.cx - item.label.w / 2 - LABEL_PAD,
        x1: item.box.cx + item.label.w / 2 + LABEL_PAD,
        y0: item.box.cy - item.label.h / 2 - LABEL_PAD * 2,
        y1: item.box.cy + item.label.h / 2 + LABEL_PAD * 2,
      };
      if (!placed.some((r) => rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0)) {
        placed.push(rect);
        continue;
      }
      // Название не встало — пробуем хотя бы номер.
      if (!item.isName) {
        item.label = null;
        continue;
      }
      const n = String(item.number);
      const small = { x0: item.box.cx - n.length * 3 - 1, x1: item.box.cx + n.length * 3 + 1, y0: item.box.cy - 6, y1: item.box.cy + 6 };
      if (placed.some((r) => small.x0 < r.x1 && small.x1 > r.x0 && small.y0 < r.y1 && small.y1 > r.y0)) item.label = null;
      else {
        item.label = { lines: [n], size: 10, w: n.length * 6 + 2, h: 11.5 };
        item.isName = false;
        placed.push(small);
      }
    }
    return withCells;
  }, [layout, dots]);

  if (!layout) return null;
  const onFloorDirections = new Set(dots.map((dot) => dot.entry.direction));
  const legend = [...directionColors.keys()].filter((direction) => onFloorDirections.has(direction));
  if ([...onFloorDirections].some((direction) => !directionColors.has(direction))) legend.push(OTHER_LABEL);
  const current = selected && selected.floor === floor ? selected : null;
  const floorNames = [...cells].sort((a, b) => a.number - b.number);
  const scaleBarM = layout.metersPerPx * 100 > 60 ? 50 : 20;

  return (
    <div ref={boxRef} className="overflow-hidden rounded-2xl border border-border bg-white/60">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm">
        <span className="font-semibold text-ink">Схема: {formatFloorLabel(floor)}</span>
        <span className="text-xs text-ink-muted">{dots.length} на схеме</span>
      </div>
      <div className="relative">
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: boxW < NARROW_VIEW_W ? 900 : 620 }}>
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
            {cells.map(({ entry, x, y, box, label }, index) => {
              const dimmed = highlighted !== null && !highlighted.has(entry);
              const isSelected = current === entry;
              const color = colorOf(entry.direction);
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
                  {box && (
                    <rect
                      x={box.cx - box.w / 2}
                      y={box.cy - box.h / 2}
                      width={box.w}
                      height={box.h}
                      rx={1.5}
                      fill={color}
                      fillOpacity={isSelected ? 0.45 : 0.18}
                      stroke={isSelected ? color : '#ffffff'}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                  )}
                  {!label && <circle cx={x} cy={y} r={isSelected ? 4.5 : 3} fill={color} />}
                  {label && box && (
                    <text
                      x={box.cx}
                      y={box.cy - ((label.lines.length - 1) * label.size * 1.15) / 2 + label.size * 0.35}
                      textAnchor="middle"
                      fontSize={label.size}
                      fontWeight={600}
                      fill="#1e293b"
                      paintOrder="stroke"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      strokeOpacity={0.8}
                      pointerEvents="none"
                    >
                      {label.lines.map((line, lineIndex) => (
                        <tspan key={lineIndex} x={box.cx} dy={lineIndex === 0 ? 0 : label.size * 1.15}>
                          {line}
                        </tspan>
                      ))}
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
        {/* Все магазины этажа по алфавиту: на телефоне подписи в мелких
            помещениях не помещаются, а здесь видно каждое название; нажатие
            подсвечивает помещение на схеме. */}
        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
          {floorNames.map(({ entry, number }, index) => (
            <button
              key={`${entry.name}-${entry.url ?? index}`}
              type="button"
              onClick={() => setSelected(entry)}
              className={
                current === entry
                  ? 'rounded-full border border-ink bg-ink px-2.5 py-0.5 text-xs font-medium text-white'
                  : 'rounded-full border border-border bg-white/80 px-2.5 py-0.5 text-xs font-medium text-ink hover:border-primary/30'
              }
            >
              <span
                className="mr-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                style={{ background: colorOf(entry.direction) }}
              >
                {number}
              </span>
              {entry.name}
            </button>
          ))}
        </div>
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
