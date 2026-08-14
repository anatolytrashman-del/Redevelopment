import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { zonePrice, zoneTypeLabels, type BuildingPlan, type BuildingPlanZone } from '../../data/buildingPlans';
import { cn } from '../../lib/cn';

const VISIBLE_LIMIT = 5;

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

// Общая таблица свободных кабинетов — используется и во внутренней карточке
// объекта (после BuildingPlanWidget), и на публичной странице для клиента,
// с одинаковыми фильтрами и расчётом цены (см. zonePrice в data/buildingPlans).
interface AvailableUnitsTableProps {
  plans: BuildingPlan[];
  zones: BuildingPlanZone[];
  highlightedZoneId?: string | null;
  onRowClick: (zone: BuildingPlanZone) => void;
  onRowHover?: (zone: BuildingPlanZone | null) => void;
}

export function AvailableUnitsTable({ plans, zones, highlightedZoneId, onRowClick, onRowHover }: AvailableUnitsTableProps) {
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [expanded, setExpanded] = useState(false);

  const planNameById = new Map(plans.map((p) => [p.id, p.name]));

  const units = zones
    .filter((z) => z.zoneType === 'room' && z.status === 'Свободно' && z.area != null)
    .map((z) => ({ zone: z, area: z.area as number, price: zonePrice(z.area as number), floor: planNameById.get(z.buildingPlanId) ?? '—' }))
    .filter((u) => !minArea.trim() || u.area >= Number(minArea))
    .filter((u) => !maxArea.trim() || u.area <= Number(maxArea))
    .filter((u) => !minPrice.trim() || u.price >= Number(minPrice))
    .filter((u) => !maxPrice.trim() || u.price <= Number(maxPrice))
    .sort((a, b) => a.area - b.area);

  const visibleUnits = expanded ? units : units.slice(0, VISIBLE_LIMIT);
  const hiddenCount = units.length - visibleUnits.length;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="font-bold text-ink">Доступные кабинеты</div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Площадь от, м²" type="number" placeholder="0" value={minArea} onChange={(e) => setMinArea(e.target.value)} />
        <Input label="Площадь до, м²" type="number" placeholder="0" value={maxArea} onChange={(e) => setMaxArea(e.target.value)} />
        <Input label="Цена от, $" type="number" placeholder="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
        <Input label="Цена до, $" type="number" placeholder="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
      </div>

      {units.length === 0 ? (
        <p className="text-sm text-ink-muted">Нет кабинетов, подходящих под фильтр.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-control border border-border">
            <div className="grid min-w-[480px] grid-cols-[1fr_1fr_1fr_1fr] gap-4 bg-surface-muted px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              <span>Кабинет</span>
              <span>Этаж</span>
              <span>Площадь</span>
              <span>Цена</span>
            </div>
            {visibleUnits.map(({ zone, area, price, floor }) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => onRowClick(zone)}
                onMouseEnter={() => onRowHover?.(zone)}
                onMouseLeave={() => onRowHover?.(null)}
                className={cn(
                  'grid w-full min-w-[480px] grid-cols-[1fr_1fr_1fr_1fr] items-center gap-4 border-t border-border px-4 py-2.5 text-left text-sm hover:bg-surface-muted',
                  zone.id === highlightedZoneId && 'bg-primary/10',
                )}
              >
                <span className="font-medium text-ink">{zone.label || zoneTypeLabels[zone.zoneType]}</span>
                <span className="text-ink-muted">{floor}</span>
                <span className="text-ink">{area} м²</span>
                <span className="font-medium text-ink">{formatMoney(price)}</span>
              </button>
            ))}
          </div>

          {(hiddenCount > 0 || expanded) && units.length > VISIBLE_LIMIT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {expanded ? (
                <>
                  Свернуть
                  <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  Показать ещё {hiddenCount}
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
