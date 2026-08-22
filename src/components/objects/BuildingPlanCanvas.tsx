import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  zoneTypeLabels,
  zoneDownPayment,
  zonePrice,
  workstationsRemaining,
  WORKSTATION_PRICE,
  type BuildingPlan,
  type BuildingPlanZone,
  type ZonePoint,
} from '../../data/buildingPlans';
import { cn } from '../../lib/cn';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 300;

function distance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Общие куски рендера планировки — используются и во внутреннем виджете
// (BuildingPlanWidget, с редактированием), и на публичной странице для
// клиента (PublicBuildingPlan, только просмотр). Вынесены сюда, чтобы
// изменения (статусы броней, цвета, подсказка при наведении) сразу
// показывались в обоих местах, а не расходились между двумя копиями.

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

// hideSoldStatus — клиентские поверхности не показывают отдельный статус
// "Продано": для клиента и "Продано", и "Забронировано" означают одно и то
// же — кабинет недоступен, разница между ними важна только для админа.
// hideBookingStatus — сметчику в техзадании (BriefBuildingPlans.tsx) статус
// брони кабинета не нужен вообще, важна только разбивка на кабинет/МОП/
// санузел/техническое: все кабинеты закрашены одним нейтральным цветом
// независимо от status.
export function zoneFillClass(zone: BuildingPlanZone, hideSoldStatus?: boolean, hideBookingStatus?: boolean): string {
  if (zone.zoneType === 'room') {
    if (hideBookingStatus) return 'fill-success/25 stroke-success';
    const status = hideSoldStatus && zone.status === 'Продано' ? 'Забронировано' : zone.status;
    if (status === 'Продано') return 'fill-danger/35 stroke-danger';
    if (status === 'Забронировано') return 'fill-warning/35 stroke-warning';
    return 'fill-success/25 stroke-success';
  }
  if (zone.zoneType === 'bathroom') return 'fill-info-bg/60 stroke-info-text';
  if (zone.zoneType === 'technical') return 'fill-ink-faint/40 stroke-ink-faint';
  return 'fill-ink-faint/25 stroke-ink-faint';
}

export function pointsToAttr(points: ZonePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

// Простое среднее вершин, не геометрический центроид многоугольника —
// для типичной прямоугольной/почти прямоугольной комнаты разницы не видно,
// а формула на порядок проще (см. showAreaLabels ниже).
function polygonCenter(points: ZonePoint[]): ZonePoint {
  if (points.length === 0) return { x: 50, y: 50 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// Ширина/высота охватывающего прямоугольника контура в тех же процентах,
// что и точки, — ограничивает подпись площади шириной самого кабинета
// (см. showAreaLabels), чтобы узкие кабинеты в ряд не накладывали подписи
// друг на друга и на стены.
function polygonBoundsSize(points: ZonePoint[]): { width: number; height: number } {
  if (points.length === 0) return { width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

interface BuildingPlanCanvasProps {
  plan: BuildingPlan;
  zones: BuildingPlanZone[];
  onZoneClick: (zone: BuildingPlanZone) => void;
  onContainerClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  cursorCrosshair?: boolean;
  drawingPoints?: ZonePoint[] | null;
  // Подсвечивает зону поверх обычной заливки — используется, чтобы связать
  // таблицу доступных кабинетов (AvailableUnitsTable) с планом: наведение
  // или клик по строке таблицы должны показать, где кабинет физически
  // находится на плане.
  highlightZoneId?: string | null;
  // Только для клиентских поверхностей (см. zoneFillClass) — админский
  // BuildingPlanWidget этот проп не передаёт, там статус "Продано" виден как есть.
  hideSoldStatus?: boolean;
  // Подсказка при наведении на кабинет по умолчанию показывает стоимость и
  // первый взнос — это нужно клиенту на продающей странице, но не нужно
  // сметчику в техзадании (см. BriefBuildingPlans.tsx): там из подсказки
  // остаётся только площадь.
  hidePricing?: boolean;
  // См. zoneFillClass — убирает статус брони и из заливки, и из подсказки
  // при наведении (там же нужен для условия ветки, отдельно от заливки).
  hideBookingStatus?: boolean;
  // Пинч-зум и панорамирование пальцем — только на клиентских поверхностях
  // (PublicPlanAndUnits), где иначе на мобильном приходится зумить всю
  // страницу через системный pinch-to-zoom браузера: план не читается на
  // маленьком экране, а при открытии модалки кабинета вёрстка "плывёт",
  // потому что зумлена вся страница, а не сам план. В админском виджете
  // (BuildingPlanWidget, там ещё и рисование контуров зон) не включаем —
  // не хотим смешивать жест панорамирования с расстановкой точек.
  zoomable?: boolean;
  // Вместо всплывающей подсказки по наведению/тапу (на телефоне не держится
  // на экране — тап по кабинету триггерит и hover, и click, а click сразу
  // же сбрасывает hoverZone) — статичная подпись с площадью прямо на
  // контуре кабинета, всегда видна, тыкать никуда не нужно. Только для
  // техзадания (см. BriefBuildingPlans.tsx), где смётчику нужны именно
  // площади, а не бронирование/цены.
  showAreaLabels?: boolean;
}

export function BuildingPlanCanvas({
  plan,
  zones,
  onZoneClick,
  onContainerClick,
  cursorCrosshair,
  drawingPoints,
  highlightZoneId,
  hideSoldStatus,
  hidePricing,
  hideBookingStatus,
  zoomable,
  showAreaLabels,
}: BuildingPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverZone, setHoverZone] = useState<{ zone: BuildingPlanZone; x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  // При переключении этажа картинка нового плана грузится не мгновенно, а
  // контуры (чистые данные, без сети) — сразу. Без этой развязки на
  // медленной сети виден кадр, где уже новые контуры кабинетов лежат поверх
  // ещё старой картинки этажа — выглядит как "перепутанные" контуры.
  // Держим старый план на экране, пока новая картинка не догрузится в фоне,
  // и только тогда переключаем и картинку, и контуры одновременно.
  const [displayedPlan, setDisplayedPlan] = useState(plan);
  const switchingPlan = plan.id !== displayedPlan.id;

  useEffect(() => {
    if (plan.imageUrl === displayedPlan.imageUrl) {
      if (plan.id !== displayedPlan.id) setDisplayedPlan(plan);
      return;
    }
    let cancelled = false;
    const preload = new Image();
    preload.onload = () => {
      if (!cancelled) setDisplayedPlan(plan);
    };
    preload.onerror = () => {
      // Не блокируем переключение навсегда, если картинка не догрузилась.
      if (!cancelled) setDisplayedPlan(plan);
    };
    preload.src = plan.imageUrl;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id, plan.imageUrl]);
  // Состояние активного жеста живёт в ref, а не в стейте — трогается на
  // каждый touchmove, ререндер тут не нужен, важны только scale/translate.
  const gestureRef = useRef<{
    mode: 'pinch' | 'pan' | null;
    startDistance: number;
    startScale: number;
    startTranslate: { x: number; y: number };
    startTouch: { x: number; y: number };
  }>({ mode: null, startDistance: 0, startScale: 1, startTranslate: { x: 0, y: 0 }, startTouch: { x: 0, y: 0 } });
  const lastTapRef = useRef(0);

  function handleZoneHover(zone: BuildingPlanZone, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverZone({ zone, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function clampTranslate(t: { x: number; y: number }, s: number, rect: DOMRect) {
    const maxX = (rect.width * (s - 1)) / 2;
    const maxY = (rect.height * (s - 1)) / 2;
    return { x: clamp(t.x, -maxX, maxX), y: clamp(t.y, -maxY, maxY) };
  }

  function resetZoom() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  function zoomBy(delta: number) {
    setScale((s) => {
      const next = clamp(s + delta, MIN_SCALE, MAX_SCALE);
      if (next === MIN_SCALE) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }

  // Нативные listener'ы вместо onTouchMove — React по умолчанию вешает
  // touch-хендлеры как passive, а preventDefault (без него пинч зумит всю
  // страницу поверх нашего) в passive-режиме браузер просто игнорирует.
  useEffect(() => {
    if (!zoomable) return;
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        gestureRef.current = {
          mode: 'pinch',
          startDistance: distance(e.touches[0], e.touches[1]),
          startScale: scale,
          startTranslate: translate,
          startTouch: { x: 0, y: 0 },
        };
      } else if (e.touches.length === 1 && scale > 1) {
        gestureRef.current = {
          mode: 'pan',
          startDistance: 0,
          startScale: scale,
          startTranslate: translate,
          startTouch: { x: e.touches[0].clientX, y: e.touches[0].clientY },
        };
      }
    }

    function onTouchMove(e: TouchEvent) {
      const gesture = gestureRef.current;
      if (!gesture.mode) return;
      const rect = el!.getBoundingClientRect();

      if (gesture.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const ratio = distance(e.touches[0], e.touches[1]) / gesture.startDistance;
        const nextScale = clamp(gesture.startScale * ratio, MIN_SCALE, MAX_SCALE);
        setScale(nextScale);
        setTranslate(clampTranslate(gesture.startTranslate, nextScale, rect));
      } else if (gesture.mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        const dx = e.touches[0].clientX - gesture.startTouch.x;
        const dy = e.touches[0].clientY - gesture.startTouch.y;
        setTranslate(
          clampTranslate(
            { x: gesture.startTranslate.x + dx, y: gesture.startTranslate.y + dy },
            gesture.startScale,
            rect,
          ),
        );
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0) {
        gestureRef.current.mode = null;
        setScale((s) => {
          if (s <= MIN_SCALE + 0.02) {
            setTranslate({ x: 0, y: 0 });
            return MIN_SCALE;
          }
          return s;
        });
        // Двойной тап — быстрый зум без пальцев-«ножниц».
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          setScale((s) => (s > MIN_SCALE ? MIN_SCALE : 2));
          if (scale > MIN_SCALE) setTranslate({ x: 0, y: 0 });
        }
        lastTapRef.current = now;
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [zoomable, scale, translate]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full select-none overflow-hidden rounded-control border border-border',
        cursorCrosshair && 'cursor-crosshair',
        zoomable && 'touch-none',
      )}
      onClick={onContainerClick}
    >
      <div
        className={zoomable ? '' : undefined}
        style={
          zoomable
            ? { transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transformOrigin: 'center center' }
            : undefined
        }
      >
        <img src={displayedPlan.imageUrl} alt={displayedPlan.name} className="w-full" draggable={false} loading="lazy" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {zones
            .filter((zone) => zone.buildingPlanId === displayedPlan.id)
            .map((zone) => (
              <polygon
                key={zone.id}
                points={pointsToAttr(zone.points)}
                className={cn(
                  'cursor-pointer transition-opacity hover:opacity-80',
                  zoneFillClass(zone, hideSoldStatus, hideBookingStatus),
                )}
                strokeWidth={0.3}
                onClick={(e) => {
                  e.stopPropagation();
                  onZoneClick(zone);
                  setHoverZone(null);
                }}
                onMouseEnter={showAreaLabels ? undefined : (e) => handleZoneHover(zone, e)}
                onMouseMove={showAreaLabels ? undefined : (e) => handleZoneHover(zone, e)}
                onMouseLeave={showAreaLabels ? undefined : () => setHoverZone(null)}
              />
            ))}
          {drawingPoints && drawingPoints.length > 0 && (
            <polyline points={pointsToAttr(drawingPoints)} className="fill-none stroke-primary" strokeWidth={0.4} />
          )}
          {drawingPoints?.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={0.7} className="fill-primary" />
          ))}
          {highlightZoneId &&
            zones
              .filter((zone) => zone.buildingPlanId === displayedPlan.id && zone.id === highlightZoneId)
              .map((zone) => (
                <polygon
                  key={`highlight-${zone.id}`}
                  points={pointsToAttr(zone.points)}
                  className="pointer-events-none animate-pulse fill-none stroke-primary"
                  strokeWidth={0.9}
                />
              ))}
        </svg>
        {showAreaLabels &&
          zones
            .filter((zone) => zone.buildingPlanId === displayedPlan.id && zone.zoneType === 'room' && zone.area != null)
            .map((zone) => {
              const center = polygonCenter(zone.points);
              const bounds = polygonBoundsSize(zone.points);
              return (
                <span
                  key={`area-${zone.id}`}
                  // maxWidth/maxHeight — в процентах от того же контейнера, что и
                  // сам контур (см. комментарий у polygonBoundsSize), с запасом
                  // от стен (* 0.85), overflow-hidden режет, если даже мелкий
                  // текст не влезает в совсем узкий кабинет, а не вылезает на
                  // соседей, как раньше при whitespace-nowrap без ограничения.
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-sm bg-white/85 px-0.5 text-center text-[6px] font-semibold leading-[7px] text-ink shadow-sm"
                  style={{
                    left: `${center.x}%`,
                    top: `${center.y}%`,
                    maxWidth: `${bounds.width * 0.85}%`,
                    maxHeight: `${bounds.height * 0.85}%`,
                  }}
                >
                  {zone.area} м²
                </span>
              );
            })}
      </div>

      {switchingPlan && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
          <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
        </div>
      )}

      {zoomable && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            aria-label="Приблизить"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-card hover:bg-white"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            aria-label="Отдалить"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-card hover:bg-white"
          >
            <Minus className="h-4 w-4" />
          </button>
          {scale > 1 && (
            <button
              type="button"
              onClick={resetZoom}
              aria-label="Сбросить масштаб"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-card hover:bg-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {hoverZone && (
        <div
          className="pointer-events-none absolute z-10 flex max-w-[200px] flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2 text-xs shadow-card"
          style={{ left: hoverZone.x + 14, top: hoverZone.y + 14 }}
        >
          <span className="font-semibold text-ink">{hoverZone.zone.label || zoneTypeLabels[hoverZone.zone.zoneType]}</span>
          {hoverZone.zone.workstationCount != null ? (
            <>
              <span className="text-ink-muted">Фиксированные рабочие места</span>
              {!hideBookingStatus &&
                (() => {
                  const remaining = workstationsRemaining(hoverZone.zone);
                  return remaining > 0 ? (
                    <span className="font-semibold text-success">
                      Свободно {remaining} из {hoverZone.zone.workstationCount}
                    </span>
                  ) : (
                    <span className="font-semibold text-danger">Все места заняты</span>
                  );
                })()}
              {!hidePricing && <span className="text-ink-muted">Цена: {formatMoney(WORKSTATION_PRICE)} / место</span>}
            </>
          ) : hoverZone.zone.zoneType === 'room' && hoverZone.zone.status !== 'Свободно' && !hideBookingStatus ? (
            (() => {
              const status =
                hideSoldStatus && hoverZone.zone.status === 'Продано' ? 'Забронировано' : hoverZone.zone.status;
              return (
                <span className={cn('font-semibold', status === 'Продано' ? 'text-danger' : 'text-warning')}>
                  {status}
                </span>
              );
            })()
          ) : (
            <>
              <span className="text-ink-muted">{zoneTypeLabels[hoverZone.zone.zoneType]}</span>
              {hoverZone.zone.zoneType === 'room' && (
                <>
                  <span className="text-ink-muted">
                    {hoverZone.zone.area != null ? `${hoverZone.zone.area} м²` : 'Площадь не указана'}
                  </span>
                  {!hidePricing && hoverZone.zone.area != null && (
                    <>
                      <span className="text-ink-muted">Стоимость: {formatMoney(zonePrice(hoverZone.zone.area))}</span>
                      <span className="text-ink-muted">Первый взнос: {formatMoney(zoneDownPayment(hoverZone.zone.area))}</span>
                    </>
                  )}
                  {hoverZone.zone.features.length > 0 && (
                    <span className="text-ink-muted">{hoverZone.zone.features.join(', ')}</span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BuildingPlanLegend({
  hideSoldStatus,
  hideBookingStatus,
}: { hideSoldStatus?: boolean; hideBookingStatus?: boolean } = {}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
      {hideBookingStatus ? (
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-success/40" /> Кабинет
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-success/40" /> Свободно
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-warning/40" /> Забронировано
          </span>
          {!hideSoldStatus && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-danger/40" /> Продано
            </span>
          )}
        </>
      )}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-ink-faint/40" /> МОП
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-info-bg" /> Санузел
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-ink-faint/40" /> Техническое
      </span>
    </div>
  );
}

interface BuildingPlanTabsProps {
  plans: BuildingPlan[];
  activePlanId: string | null;
  onSelect: (id: string) => void;
  trailing?: ReactNode;
}

export function BuildingPlanTabs({ plans, activePlanId, onSelect, trailing }: BuildingPlanTabsProps) {
  return (
    <div className="flex items-end gap-1 overflow-x-auto border-b border-border">
      {plans.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-t-control border border-b-0 px-4 py-2 text-sm font-medium transition-colors',
            p.id === activePlanId
              ? 'border-border bg-surface text-ink'
              : 'border-transparent bg-surface-muted text-ink-muted hover:text-ink',
          )}
        >
          {p.name}
        </button>
      ))}
      {trailing}
    </div>
  );
}
