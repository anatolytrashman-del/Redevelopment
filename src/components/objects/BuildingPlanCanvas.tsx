import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  zoneTypeLabels,
  zoneDownPayment,
  zonePrice,
  type BuildingPlan,
  type BuildingPlanZone,
  type ZonePoint,
} from '../../data/buildingPlans';
import { cn } from '../../lib/cn';

// Общие куски рендера планировки — используются и во внутреннем виджете
// (BuildingPlanWidget, с редактированием), и на публичной странице для
// клиента (PublicBuildingPlan, только просмотр). Вынесены сюда, чтобы
// изменения (статусы броней, цвета, подсказка при наведении) сразу
// показывались в обоих местах, а не расходились между двумя копиями.

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

export function zoneFillClass(zone: BuildingPlanZone): string {
  if (zone.zoneType === 'room') {
    if (zone.status === 'Продано') return 'fill-danger/35 stroke-danger';
    if (zone.status === 'Забронировано') return 'fill-warning/35 stroke-warning';
    return 'fill-success/25 stroke-success';
  }
  if (zone.zoneType === 'bathroom') return 'fill-info-bg/60 stroke-info-text';
  if (zone.zoneType === 'technical') return 'fill-ink-faint/40 stroke-ink-faint';
  return 'fill-ink-faint/25 stroke-ink-faint';
}

export function pointsToAttr(points: ZonePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

interface BuildingPlanCanvasProps {
  plan: BuildingPlan;
  zones: BuildingPlanZone[];
  onZoneClick: (zone: BuildingPlanZone) => void;
  onContainerClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  cursorCrosshair?: boolean;
  drawingPoints?: ZonePoint[] | null;
}

export function BuildingPlanCanvas({
  plan,
  zones,
  onZoneClick,
  onContainerClick,
  cursorCrosshair,
  drawingPoints,
}: BuildingPlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverZone, setHoverZone] = useState<{ zone: BuildingPlanZone; x: number; y: number } | null>(null);

  function handleZoneHover(zone: BuildingPlanZone, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverZone({ zone, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full select-none overflow-hidden rounded-control border border-border',
        cursorCrosshair && 'cursor-crosshair',
      )}
      onClick={onContainerClick}
    >
      <img src={plan.imageUrl} alt={plan.name} className="w-full" draggable={false} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {zones
          .filter((zone) => zone.buildingPlanId === plan.id)
          .map((zone) => (
            <polygon
              key={zone.id}
              points={pointsToAttr(zone.points)}
              className={cn('cursor-pointer transition-opacity hover:opacity-80', zoneFillClass(zone))}
              strokeWidth={0.3}
              onClick={(e) => {
                e.stopPropagation();
                onZoneClick(zone);
                setHoverZone(null);
              }}
              onMouseEnter={(e) => handleZoneHover(zone, e)}
              onMouseMove={(e) => handleZoneHover(zone, e)}
              onMouseLeave={() => setHoverZone(null)}
            />
          ))}
        {drawingPoints && drawingPoints.length > 0 && (
          <polyline points={pointsToAttr(drawingPoints)} className="fill-none stroke-primary" strokeWidth={0.4} />
        )}
        {drawingPoints?.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.7} className="fill-primary" />
        ))}
      </svg>

      {hoverZone && (
        <div
          className="pointer-events-none absolute z-10 flex max-w-[200px] flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2 text-xs shadow-card"
          style={{ left: hoverZone.x + 14, top: hoverZone.y + 14 }}
        >
          <span className="font-semibold text-ink">{hoverZone.zone.label || zoneTypeLabels[hoverZone.zone.zoneType]}</span>
          <span className="text-ink-muted">{zoneTypeLabels[hoverZone.zone.zoneType]}</span>
          {hoverZone.zone.zoneType === 'room' && (
            <>
              <span className="text-ink-muted">
                {hoverZone.zone.area != null ? `${hoverZone.zone.area} м²` : 'Площадь не указана'}
              </span>
              {hoverZone.zone.area != null && (
                <>
                  <span className="text-ink-muted">Стоимость: {formatMoney(zonePrice(hoverZone.zone.area))}</span>
                  <span className="text-ink-muted">Первый взнос: {formatMoney(zoneDownPayment(hoverZone.zone.area))}</span>
                </>
              )}
              <span className="text-ink-muted">
                {hoverZone.zone.features.length > 0 ? hoverZone.zone.features.join(', ') : 'Без особенностей'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BuildingPlanLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-success/40" /> Свободно
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-warning/40" /> Забронировано
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-danger/40" /> Продано
      </span>
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
