import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, MapPin, Send } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
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
import { insertLead } from '../lib/leadsApi';
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

const emptyLeadForm = { name: '', contact: '', comment: '' };

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
  const contactRef = useRef<HTMLDivElement>(null);

  const [leadForm, setLeadForm] = useState(emptyLeadForm);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadSent, setLeadSent] = useState(false);

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

  const availableUnits = zones.filter((z) => z.zoneType === 'room' && z.status === 'Свободно' && z.area != null);
  const cheapestUnit = availableUnits.reduce<number | null>((min, z) => {
    const price = zonePrice(z.area as number);
    return min === null || price < min ? price : min;
  }, null);

  function handleZoneSelect(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setSelectedZone(zone);
  }

  function handleLocateOnPlan(zone: BuildingPlanZone) {
    if (zone.buildingPlanId !== activePlanId) setActivePlanId(zone.buildingPlanId);
    setPinnedZoneId(zone.id);
    planCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function scrollToContact() {
    contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!object || !leadForm.name.trim() || !leadForm.contact.trim() || submittingLead) return;
    setSubmittingLead(true);
    setLeadError(null);
    try {
      await insertLead({
        name: leadForm.name.trim(),
        source: 'Сайт',
        businessType: '',
        area: '',
        requirement: leadForm.comment.trim(),
        contact: leadForm.contact.trim(),
        status: 'Новая заявка с сайта',
        isWarm: false,
        objectId: object.id,
      });
      setLeadSent(true);
      setLeadForm(emptyLeadForm);
    } catch (err) {
      setLeadError(errorMessage(err, 'Не удалось отправить заявку'));
    } finally {
      setSubmittingLead(false);
    }
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

      <div className="relative flex flex-col items-center gap-5 overflow-hidden px-4 py-14 text-center sm:px-8">
        {object.photoUrl && (
          <>
            <img src={object.photoUrl} alt={object.address} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-ink/65" />
          </>
        )}
        <div className={cn('relative flex max-w-2xl flex-col items-center gap-4', object.photoUrl ? 'text-white' : 'text-ink')}>
          <span className={cn('flex items-center gap-1.5 text-sm font-medium', object.photoUrl ? 'text-white/80' : 'text-ink-muted')}>
            <MapPin className="h-4 w-4" />
            {object.address}
          </span>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{object.address}</h1>
          {object.concept && (
            <p className={cn('max-w-xl text-base leading-relaxed', object.photoUrl ? 'text-white/90' : 'text-ink-muted')}>
              {object.concept}
            </p>
          )}
          {cheapestUnit != null && (
            <div
              className={cn(
                'rounded-control px-5 py-3 text-lg font-bold',
                object.photoUrl ? 'bg-white/15 text-white backdrop-blur' : 'bg-primary-soft text-primary',
              )}
            >
              Кабинеты от {formatMoney(cheapestUnit)}
            </div>
          )}
          <Button type="button" onClick={scrollToContact}>
            Оставить заявку
          </Button>
        </div>
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

        <div ref={contactRef}>
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <div className="font-bold text-ink">Оставить заявку</div>
              <p className="text-sm text-ink-muted">Расскажем подробнее и подберём подходящий кабинет</p>
            </div>

            {leadSent ? (
              <p className="text-sm font-medium text-success">Спасибо! Мы скоро с вами свяжемся.</p>
            ) : (
              <form onSubmit={handleLeadSubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Имя"
                    placeholder="Как к вам обращаться"
                    value={leadForm.name}
                    onChange={(e) => setLeadForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                  <Input
                    label="Телефон или Telegram"
                    placeholder="+375 29 ..."
                    value={leadForm.contact}
                    onChange={(e) => setLeadForm((f) => ({ ...f, contact: e.target.value }))}
                    required
                  />
                </div>
                <Textarea
                  label="Комментарий (необязательно)"
                  placeholder="Какая площадь интересует, вопросы..."
                  rows={3}
                  value={leadForm.comment}
                  onChange={(e) => setLeadForm((f) => ({ ...f, comment: e.target.value }))}
                />
                {leadError && <p className="text-sm text-danger">{leadError}</p>}
                <Button type="submit" icon={<Send className="h-4 w-4" />} disabled={submittingLead} className="w-fit">
                  {submittingLead ? 'Отправляем...' : 'Отправить заявку'}
                </Button>
              </form>
            )}
          </Card>
        </div>
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
