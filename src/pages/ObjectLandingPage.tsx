import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PublicPlanAndUnits } from '../components/objects/PublicPlanAndUnits';
import type { BuildingPlan, BuildingPlanZone } from '../data/buildingPlans';
import type { RealtyObject } from '../data/objects';
import { fetchObjectByLandingSlug } from '../lib/objectsApi';
import { fetchBuildingPlans, fetchZonesForPlan } from '../lib/buildingPlansApi';

// Публичная продающая страница объекта под коротким URL (/:slug, см.
// RealtyObject.landingSlug) — намеренно минимальная (планировка + список
// кабинетов), пока маркетинговый дизайн главного экрана ещё не готов
// показывать клиентам. Полная версия с оффером/слайдером обкатывается
// на /:slug/draft (см. ObjectLandingDraftPage) и переезжает сюда, когда
// дизайн утверждён.
export function ObjectLandingPage() {
  const { slug } = useParams();
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div>
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем планировку...
          </div>
        )}
        {!loading && (notFound || !object) && (
          <p className="py-10 text-center text-sm text-ink-muted">Страница не найдена.</p>
        )}

        {!loading && !notFound && object && <PublicPlanAndUnits object={object} plans={plans} zones={zones} />}
      </div>
    </div>
  );
}
