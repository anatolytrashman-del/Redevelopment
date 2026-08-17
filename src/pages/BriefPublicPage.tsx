import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { BriefDocument } from '../components/briefs/BriefDocument';
import type { Brief } from '../data/briefs';
import type { RealtyObject } from '../data/objects';
import type { BuildingPlan } from '../data/buildingPlans';
import { fetchBriefByToken } from '../lib/briefsApi';
import { fetchObject } from '../lib/objectsApi';
import { fetchBuildingPlans } from '../lib/buildingPlansApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Публичная ссылка для внешнего инженера, который считает смету ремонта —
// без пароля админки. Собирает воедино техпаспорт и планировки объекта
// (уже есть в базе, не дублируются) и то, что специфично для этого
// техзадания: фото "до"/"после" и список изменений. Сама вёрстка — в
// BriefDocument, здесь только загрузка данных по токену.
export function BriefPublicPage() {
  const { token } = useParams();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [object, setObject] = useState<RealtyObject | null>(null);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    fetchBriefByToken(token)
      .then(async (b) => {
        setBrief(b);
        const obj = await fetchObject(b.objectId);
        setObject(obj);
        if (obj.buildingPlanIds.length > 0) {
          const allPlans = await fetchBuildingPlans();
          setPlans(allPlans.filter((p) => obj.buildingPlanIds.includes(p.id)));
        }
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить техзадание')))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading || loadError || !brief || !object) {
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
              Загружаем техзадание...
            </Card>
          )}
          {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:px-8">
      <BriefDocument brief={brief} object={object} plans={plans} />
    </div>
  );
}
