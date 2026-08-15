import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bath,
  Building2,
  Cctv,
  Clock,
  Loader2,
  Ruler,
  ShieldCheck,
  Sparkles,
  SquareParking,
  TreePine,
  Wifi,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { HeroImageSlider } from '../components/objects/HeroImageSlider';
import { PublicPlanAndUnits } from '../components/objects/PublicPlanAndUnits';
import { BookingTermsCard } from '../components/objects/BookingTermsCard';
import { zonePrice, type BuildingPlan, type BuildingPlanZone } from '../data/buildingPlans';
import type { RealtyObject } from '../data/objects';
import { fetchObjectByLandingSlug } from '../lib/objectsApi';
import { fetchBuildingPlans, fetchZonesForPlan } from '../lib/buildingPlansApi';

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

// Пока продающая страница только у одного объекта, оффер и буллеты на
// главном экране — фиксированный текст под него, а не поле в базе.
// Когда появится второй объект с такой страницей — вынести в данные объекта.
const heroFeatures: { icon: LucideIcon; text: string }[] = [
  { icon: Ruler, text: 'Площади от 11 м² до 40 м²' },
  { icon: Sparkles, text: 'Дизайнерский ремонт' },
  { icon: ShieldCheck, text: 'Бронирование без предоплаты' },
];

const complexFeatures: { icon: LucideIcon; text: string }[] = [
  { icon: Building2, text: 'Отдельно стоящее здание' },
  { icon: Clock, text: 'Доступ 24/7' },
  { icon: Cctv, text: 'Видеонаблюдение' },
  { icon: Bath, text: 'Много санузлов' },
  { icon: SquareParking, text: 'Большая бесплатная парковка' },
  { icon: Zap, text: 'Все центральные коммуникации' },
  { icon: Wifi, text: 'Телефон и интернет' },
  { icon: TreePine, text: 'Благоустроенная территория' },
];

// Черновик продающей страницы (/:slug/draft) — здесь обкатывается дизайн
// главного экрана (оффер, буллеты, слайдер рендеров), пока не готов
// показывать его клиентам. Публичный /:slug тем временем отдаёт только
// планировку и список кабинетов — см. ObjectLandingPage.
export function ObjectLandingDraftPage() {
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

  const cheapestUnit = zones
    .filter((z) => z.zoneType === 'room' && z.status === 'Свободно' && z.area != null)
    .reduce<number | null>((min, z) => {
      const price = zonePrice(z.area as number);
      return min === null || price < min ? price : min;
    }, null);

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
        <span className="ml-3 rounded-full bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning">
          Черновик, клиентам не показывать
        </span>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
            Свой кабинет в клубном комплексе у Минск Мира{cheapestUnit != null && <> от</>}{' '}
            {cheapestUnit != null && (
              <span
                className="inline-flex translate-y-[-2px] items-center whitespace-nowrap bg-primary px-5 py-1.5 align-middle text-white"
                style={{ clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' }}
              >
                <span className="text-lg font-extrabold">{formatMoney(cheapestUnit)}</span>
              </span>
            )}
          </h1>
          <div className="flex flex-col gap-3">
            {heroFeatures.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-base font-medium text-ink">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <HeroImageSlider images={object.renderImageUrls} />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 shadow-card backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-ink">Бесплатная онлайн-бронь</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:px-8">
        <Card className="flex flex-col gap-5 p-5">
          <div className="text-xl font-extrabold text-ink">Клубный деловой комплекс Minsk One</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {complexFeatures.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-ink">{text}</span>
              </div>
            ))}
          </div>
        </Card>

        <BookingTermsCard agreement={object.intentAgreementFile} />

        <PublicPlanAndUnits
          object={object}
          plans={plans}
          zones={zones}
          onZoneUpdated={(z) => setZones((prev) => prev.map((x) => (x.id === z.id ? z : x)))}
        />
      </div>
    </div>
  );
}
