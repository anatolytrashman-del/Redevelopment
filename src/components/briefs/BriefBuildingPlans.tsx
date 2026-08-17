import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BuildingPlanCanvas, BuildingPlanLegend, BuildingPlanTabs } from '../objects/BuildingPlanCanvas';
import type { BuildingPlan, BuildingPlanZone } from '../../data/buildingPlans';
import type { RealtyObject } from '../../data/objects';
import { fetchBuildingPlans, fetchZonesForPlan } from '../../lib/buildingPlansApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface BriefBuildingPlansProps {
  object: RealtyObject;
}

// Планировки объекта в техзадании — те же данные и тот же компонент
// (BuildingPlanCanvas), что видит клиент на продающей странице и админ в
// карточке объекта: зумируемый план с переключением этажей и подсветкой
// кабинетов, вместо статичных картинок, которые раньше грузили в само
// техзадание вручную. Только чтение — точки/зоны правятся в карточке
// объекта (ObjectDetail), сметчику это не нужно.
export function BriefBuildingPlans({ object }: BriefBuildingPlansProps) {
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [loading, setLoading] = useState(object.buildingPlanIds.length > 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(object.buildingPlanIds[0] ?? null);

  useEffect(() => {
    if (object.buildingPlanIds.length === 0) {
      setPlans([]);
      setZones([]);
      setActivePlanId(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchBuildingPlans(), Promise.all(object.buildingPlanIds.map((id) => fetchZonesForPlan(id)))])
      .then(([planList, zoneLists]) => {
        setPlans(planList);
        setZones(zoneLists.flat());
        setActivePlanId((prev) => (prev && object.buildingPlanIds.includes(prev) ? prev : object.buildingPlanIds[0]));
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить планировку')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.buildingPlanIds.join(',')]);

  if (object.buildingPlanIds.length === 0) {
    return <p className="text-sm text-ink-faint">Планировки для этого объекта пока не привязаны</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загружаем планировку...
      </div>
    );
  }

  if (loadError) return <p className="text-sm text-danger">{loadError}</p>;

  const objectPlans = object.buildingPlanIds.map((id) => plans.find((p) => p.id === id)).filter((p): p is BuildingPlan => !!p);
  const plan = objectPlans.find((p) => p.id === activePlanId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <BuildingPlanTabs plans={objectPlans} activePlanId={activePlanId} onSelect={setActivePlanId} />
      {plan && (
        <>
          <BuildingPlanCanvas plan={plan} zones={zones} onZoneClick={() => {}} hidePricing hideBookingStatus zoomable />
          <BuildingPlanLegend hideBookingStatus />
        </>
      )}
    </div>
  );
}
