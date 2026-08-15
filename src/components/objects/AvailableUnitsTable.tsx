import { useState, type ElementType } from 'react';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { zonePrice, zoneTypeLabels, type BuildingPlan, type BuildingPlanZone } from '../../data/buildingPlans';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

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
  // Отдельная кнопка "Посмотреть на плане" — в отличие от onRowClick (который
  // открывает карточку кабинета) только переключает этаж и подсвечивает
  // контур, не закрывая план модалкой.
  onLocateClick: (zone: BuildingPlanZone) => void;
  // Только на публичных страницах — открывает форму брони сразу, без
  // промежуточного клика по кабинету. В админке не передаётся, поэтому
  // кнопка и место под неё там не показываются.
  onBookClick?: (zone: BuildingPlanZone) => void;
  // Только для черновика продающей страницы (/:slug/draft) — см.
  // src/lib/glass.ts. По умолчанию выключено: эта таблица используется ещё
  // в админке и на уже одобренной клиентской /:slug.
  glass?: boolean;
}

export function AvailableUnitsTable({
  plans,
  zones,
  highlightedZoneId,
  onRowClick,
  onRowHover,
  onLocateClick,
  onBookClick,
  glass,
}: AvailableUnitsTableProps) {
  const Wrapper: ElementType = glass ? 'div' : Card;
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

  // Input красит фон общим bg-surface-muted (светло-серый) — на полупрозрачной
  // стеклянной карточке он сливается с фоном, поэтому здесь пробиваем контраст
  // инлайн-стилем: он гарантированно перебивает класс независимо от порядка
  // сборки Tailwind (в отличие от передачи className, где порядок не гарантирован).
  const inputGlassStyle = glass
    ? { backgroundColor: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.7)' }
    : undefined;

  return (
    <Wrapper className={cn('flex flex-col gap-4 p-5', glass && glassCardClass)} style={glass ? glassCardShadow : undefined}>
      <div className="font-bold text-ink">Доступные кабинеты</div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Площадь от, м²" type="number" placeholder="0" value={minArea} onChange={(e) => setMinArea(e.target.value)} style={inputGlassStyle} />
        <Input label="Площадь до, м²" type="number" placeholder="0" value={maxArea} onChange={(e) => setMaxArea(e.target.value)} style={inputGlassStyle} />
        <Input label="Цена от, $" type="number" placeholder="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} style={inputGlassStyle} />
        <Input label="Цена до, $" type="number" placeholder="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} style={inputGlassStyle} />
      </div>

      {units.length === 0 ? (
        <p className="text-sm text-ink-muted">Нет кабинетов, подходящих под фильтр.</p>
      ) : (
        <>
          <div className={cn('overflow-x-auto rounded-control border', glass ? 'border-white/50' : 'border-border')}>
            <div
              className={cn(
                'grid gap-4 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-faint',
                glass ? 'bg-white/55 backdrop-blur-md' : 'bg-surface-muted',
                onBookClick ? 'min-w-[760px] grid-cols-[120px_100px_110px_120px_1fr]' : 'min-w-[560px] grid-cols-[120px_100px_110px_120px_1fr]',
              )}
            >
              <span>Кабинет</span>
              <span>Этаж</span>
              <span>Площадь</span>
              <span>Цена</span>
              <span />
            </div>
            {visibleUnits.map(({ zone, area, price, floor }) => (
              <div
                key={zone.id}
                onClick={() => onRowClick(zone)}
                onMouseEnter={() => onRowHover?.(zone)}
                onMouseLeave={() => onRowHover?.(null)}
                className={cn(
                  'grid w-full cursor-pointer items-center gap-4 border-t px-4 py-2.5 text-sm',
                  glass ? 'border-white/50 bg-white/30 hover:bg-white/50' : 'border-border hover:bg-surface-muted',
                  onBookClick ? 'min-w-[760px] grid-cols-[120px_100px_110px_120px_1fr]' : 'min-w-[560px] grid-cols-[120px_100px_110px_120px_1fr]',
                  zone.id === highlightedZoneId && 'bg-primary/10',
                )}
              >
                <span className="font-medium text-ink">{zone.label || zoneTypeLabels[zone.zoneType]}</span>
                <span className="text-ink-muted">{floor}</span>
                <span className="text-ink">{area} м²</span>
                <span className="font-medium text-ink">{formatMoney(price)}</span>
                <div className="flex shrink-0 items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLocateClick(zone);
                    }}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary',
                      glass ? 'border-white/50 bg-white/30 text-ink backdrop-blur-md' : 'border-border text-ink-muted',
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Посмотреть на плане
                  </button>
                  {onBookClick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookClick(zone);
                      }}
                      className="whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/85"
                    >
                      Забронировать
                    </button>
                  )}
                </div>
              </div>
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
    </Wrapper>
  );
}
