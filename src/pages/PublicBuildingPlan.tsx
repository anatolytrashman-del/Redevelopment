import { useEffect, useState } from 'react';
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
import { fetchObjectByShareToken } from '../lib/objectsApi';
import { fetchBuildingPlans, fetchZonesForPlan } from '../lib/buildingPlansApi';
import { cn } from '../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

// Публичная страница-ссылка для клиента: только просмотр планировки и
// статусов кабинетов, без кнопок редактирования и без данных о лиде —
// в отличие от внутренней ZoneDetailModal тут нет имени/контакта/документов.
// Рендер плана/зон/подсказки и легенда переиспользуют BuildingPlanCanvas —
// те же компоненты, что и во внутренней карточке объекта, поэтому брони и
// любые будущие правки вёрстки автоматически показываются в обоих местах.
export function PublicBuildingPlan() {
  const { token } = useParams();
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<BuildingPlanZone | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    fetchObjectByShareToken(token)
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
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить планировку')))
      .finally(() => setLoading(false));
  }, [token]);

  const objectPlans = object
    ? object.buildingPlanIds.map((planId) => plans.find((p) => p.id === planId)).filter((p): p is BuildingPlan => !!p)
    : [];
  const plan = objectPlans.find((p) => p.id === activePlanId) ?? null;
  const isRoom = selectedZone?.zoneType === 'room';
  const highlightZoneId = selectedZone?.id ?? hoveredZoneId;

  function handleZoneSelect(zone: BuildingPlanZone) {
    // Клик по строке таблицы доступных кабинетов может указывать на зону с
    // другого этажа — переключаем вкладку, чтобы план сразу показал нужный.
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setSelectedZone(zone);
  }

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div>
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем планировку...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

        {!loading && !loadError && object && (
          <>
            <div className="text-2xl font-extrabold text-ink">{object.address}</div>

            <Card className="flex flex-col gap-3 p-5">
              <div className="font-bold text-ink">Планировка и нарезка кабинетов</div>

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

            {objectPlans.length > 0 && (
              <AvailableUnitsTable
                plans={objectPlans}
                zones={zones}
                highlightedZoneId={highlightZoneId}
                onRowClick={handleZoneSelect}
                onRowHover={(zone) => setHoveredZoneId(zone?.id ?? null)}
              />
            )}
          </>
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
