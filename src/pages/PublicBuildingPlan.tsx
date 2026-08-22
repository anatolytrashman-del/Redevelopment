import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { PublicPlanAndUnits } from '../components/objects/PublicPlanAndUnits';
import type { BuildingPlan, BuildingPlanZone } from '../data/buildingPlans';
import type { RealtyObject } from '../data/objects';
import { fetchObjectByShareToken } from '../lib/objectsApi';
import { fetchBuildingPlans, fetchZonesForPlan } from '../lib/buildingPlansApi';
import { setNoIndex, clearNoIndex } from '../lib/pageMeta';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Публичная страница-ссылка для клиента: только просмотр планировки,
// статусов кабинетов и бронирование — без внутренних данных о лиде. План,
// таблица и модалка кабинета (включая форму брони) переиспользуют
// PublicPlanAndUnits — тот же блок, что и на продающей странице /:slug,
// поэтому брони и любые будущие правки автоматически показываются везде.
export function PublicBuildingPlan() {
  const { token } = useParams();
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Клиентская ссылка — рассылается в мессенджеры/почту, может содержать
  // данные конкретного лида/сделки, в поиске быть не должна.
  useEffect(() => {
    setNoIndex();
    return () => clearNoIndex();
  }, []);

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
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить планировку')))
      .finally(() => setLoading(false));
  }, [token]);

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
          <PublicPlanAndUnits
            object={object}
            plans={plans}
            zones={zones}
            onZoneUpdated={(z) => setZones((prev) => prev.map((x) => (x.id === z.id ? z : x)))}
          />
        )}
      </div>
    </div>
  );
}
