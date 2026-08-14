import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { BuildingPlanCanvas, BuildingPlanLegend, BuildingPlanTabs } from '../components/objects/BuildingPlanCanvas';
import { AvailableUnitsTable } from '../components/objects/AvailableUnitsTable';
import {
  zoneStatusBadgeClass,
  zoneTypeLabels,
  zoneDownPayment,
  zonePrice,
  type BuildingPlan,
  type BuildingPlanZone,
} from '../data/buildingPlans';
import type { RealtyObject } from '../data/objects';
import { fetchObjectByLandingSlug } from '../lib/objectsApi';
import { fetchBuildingPlans, fetchZonesForPlan } from '../lib/buildingPlansApi';
import { cn } from '../lib/cn';

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

// Продающая страница объекта под коротким URL (/:slug, см. RealtyObject.landingSlug)
// — в отличие от /plan/:token (голая планировка для тех, у кого уже есть
// ссылка от менеджера) это публичная маркетинговая страница с оффером и
// формой заявки, на которую можно вести рекламу. Блок планировки и таблицы
// кабинетов переиспользует те же компоненты, что и /plan/:token и админка.
export function ObjectLandingPage() {
  const { slug } = useParams();
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<BuildingPlanZone | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [pinnedZoneId, setPinnedZoneId] = useState<string | null>(null);
  const planCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetchObjectByLandingSlug(slug)
      .then(async (obj) => {
        setObject(obj);
        if (obj.buildingPlanIds.length === 0) return;
        const [planList, zoneLists] = await Promise.all([
          fetchBuildingPlans(),
          Promise.all(obj.buildingPlanIds.map((planId) => fetchZonesForPlan(planId))),
        ]);
        setPlans(planList);
        setZones(zoneLists.flat());
        setActivePlanId(obj.buildingPlanIds[0]);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const objectPlans = object
    ? object.buildingPlanIds.map((planId) => plans.find((p) => p.id === planId)).filter((p): p is BuildingPlan => !!p)
    : [];
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

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bg">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (notFound || !object) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-bg px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
          <p className="text-sm text-ink-muted">Страница не найдена.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border px-4 py-5 sm:px-8">
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
      </div>

      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8 sm:px-8">
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
      </div>

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
    </div>
  );
}
