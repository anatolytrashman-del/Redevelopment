import { useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { BuildingPlanCanvas, BuildingPlanLegend, BuildingPlanTabs } from './BuildingPlanCanvas';
import { AvailableUnitsTable } from './AvailableUnitsTable';
import {
  zoneStatusBadgeClass,
  zoneTypeLabels,
  zoneDownPayment,
  zonePrice,
  type BuildingPlan,
  type BuildingPlanZone,
} from '../../data/buildingPlans';
import type { RealtyObject } from '../../data/objects';
import { cn } from '../../lib/cn';

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

interface PublicPlanAndUnitsProps {
  object: RealtyObject;
  plans: BuildingPlan[];
  zones: BuildingPlanZone[];
}

// Планировка + таблица доступных кабинетов — общий блок для всех публичных
// поверхностей объекта (/plan/:token, продающая страница /:slug и её
// черновик /:slug/draft), чтобы подсветка, переключение этажей и кнопка
// "Посмотреть на плане" вели себя одинаково и не расходились между копиями.
export function PublicPlanAndUnits({ object, plans, zones }: PublicPlanAndUnitsProps) {
  const [activePlanId, setActivePlanId] = useState<string | null>(object.buildingPlanIds[0] ?? null);
  const [selectedZone, setSelectedZone] = useState<BuildingPlanZone | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [pinnedZoneId, setPinnedZoneId] = useState<string | null>(null);
  const planCardRef = useRef<HTMLDivElement>(null);

  const objectPlans = object.buildingPlanIds
    .map((planId) => plans.find((p) => p.id === planId))
    .filter((p): p is BuildingPlan => !!p);
  const plan = objectPlans.find((p) => p.id === activePlanId) ?? null;
  const isRoom = selectedZone?.zoneType === 'room';
  const highlightZoneId = selectedZone?.id ?? pinnedZoneId ?? hoveredZoneId;

  function handleZoneSelect(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setSelectedZone(zone);
  }

  function handleLocateOnPlan(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setPinnedZoneId(zone.id);
    planCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      <div ref={planCardRef}>
        <Card className="flex flex-col gap-3 p-5">
          <div className="font-bold text-ink">Планировка и доступные кабинеты</div>

          {objectPlans.length === 0 ? (
            <p className="text-sm text-ink-muted">Планировка для этого объекта пока не добавлена.</p>
          ) : (
            <>
              <BuildingPlanTabs plans={objectPlans} activePlanId={activePlanId} onSelect={setActivePlanId} />
              {plan && (
                <>
                  <BuildingPlanCanvas
                    plan={plan}
                    zones={zones}
                    onZoneClick={handleZoneSelect}
                    highlightZoneId={highlightZoneId}
                  />
                  <BuildingPlanLegend />
                </>
              )}
            </>
          )}
        </Card>
      </div>

      {objectPlans.length > 0 && (
        <AvailableUnitsTable
          plans={objectPlans}
          zones={zones}
          highlightedZoneId={highlightZoneId}
          onRowClick={handleZoneSelect}
          onRowHover={(zone) => setHoveredZoneId(zone?.id ?? null)}
          onLocateClick={handleLocateOnPlan}
        />
      )}

      <Modal
        open={!!selectedZone}
        onClose={() => setSelectedZone(null)}
        title={selectedZone ? zoneTypeLabels[selectedZone.zoneType] : ''}
      >
        {selectedZone && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xl font-bold text-ink">{selectedZone.label || '—'}</span>
              {isRoom && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                    zoneStatusBadgeClass[selectedZone.status],
                  )}
                >
                  {selectedZone.status}
                </span>
              )}
            </div>

            {isRoom && (
              <>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-control bg-surface-muted px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted">Площадь</span>
                    <span className="font-medium text-ink">{selectedZone.area != null ? `${selectedZone.area} м²` : '—'}</span>
                  </div>
                  {selectedZone.area != null && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-muted">Стоимость</span>
                        <span className="font-medium text-ink">{formatMoney(zonePrice(selectedZone.area))}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-muted">Первый взнос</span>
                        <span className="font-medium text-ink">{formatMoney(zoneDownPayment(selectedZone.area))}</span>
                      </div>
                    </>
                  )}
                </div>

                {selectedZone.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedZone.features.map((f) => (
                      <span key={f} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
