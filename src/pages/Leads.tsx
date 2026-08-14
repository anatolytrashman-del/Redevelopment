import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Pencil, Flame, Droplet, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddableSelect } from '../components/ui/AddableSelect';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import { leadSources, leadRequirements, type Lead, type LeadSource } from '../data/leads';
import type { RealtyObject } from '../data/objects';
import { zoneStatusBadgeClass, zoneTypeLabels, type BuildingPlan, type BuildingPlanZone } from '../data/buildingPlans';
import { badgeColor } from '../lib/badgeColor';
import { cn } from '../lib/cn';
import { fetchLeads, insertLead, updateLead } from '../lib/leadsApi';
import { fetchObjects } from '../lib/objectsApi';
import { fetchBookedZones, fetchBuildingPlans } from '../lib/buildingPlansApi';

const NO_OBJECT = 'Не привязан';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = {
  name: '',
  source: leadSources[0] as LeadSource,
  businessType: '',
  area: '',
  requirement: '',
  contact: '',
  status: '',
  isWarm: false,
  objectId: '',
};

function RequirementBadge({ requirement }: { requirement: string }) {
  if (!requirement) return <span className="text-ink-faint">—</span>;
  if (requirement === 'Мокрая точка') {
    return (
      <span
        title="Мокрая точка"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-info-bg text-info-text"
      >
        <Droplet className="h-4 w-4" />
      </span>
    );
  }
  return (
    <Badge style={{ backgroundColor: badgeColor(requirement).bg, color: badgeColor(requirement).text }}>
      {requirement}
    </Badge>
  );
}

function leadToForm(l: Lead) {
  return {
    name: l.name,
    source: l.source,
    businessType: l.businessType,
    area: l.area,
    requirement: l.requirement,
    contact: l.contact,
    status: l.status,
    isWarm: l.isWarm,
    objectId: l.objectId,
  };
}

export function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [bookedZones, setBookedZones] = useState<BuildingPlanZone[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const knownRequirements = useMemo(() => {
    const set = new Set<string>(leadRequirements);
    leads.forEach((l) => set.add(l.requirement));
    return [...set];
  }, [leads]);

  const bookedLeadIds = useMemo(() => new Set(bookedZones.map((z) => z.leadId).filter(Boolean)), [bookedZones]);

  // Тёплые лиды всегда наверху, порядок внутри группы (по дате создания) сохраняется.
  // Лиды с бронью кабинета показываются отдельным блоком ниже, а не в общем списке.
  const sortedLeads = useMemo(
    () => [...leads].filter((l) => !bookedLeadIds.has(l.id)).sort((a, b) => Number(b.isWarm) - Number(a.isWarm)),
    [leads, bookedLeadIds],
  );

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  // Для каждого плана — объект недвижимости, к которому он привязан (план могут
  // привязать только к одному объекту, но привязку хранит объект, а не план).
  const objectByPlanId = useMemo(() => {
    const map = new Map<string, RealtyObject>();
    for (const obj of objects) {
      for (const planId of obj.buildingPlanIds) {
        if (!map.has(planId)) map.set(planId, obj);
      }
    }
    return map;
  }, [objects]);

  useEffect(() => {
    fetchLeads()
      .then(setLeads)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить лиды')))
      .finally(() => setLoading(false));
    fetchObjects()
      .then(setObjects)
      .catch(() => setObjects([]));
    fetchBuildingPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
    fetchBookedZones()
      .then(setBookedZones)
      .catch(() => setBookedZones([]));
  }, []);

  const objectOptions = [NO_OBJECT, ...objects.map((o) => o.address)];

  function objectLabel(objectId: string) {
    return objects.find((o) => o.id === objectId)?.address ?? NO_OBJECT;
  }

  const canSubmit = form.name && form.businessType && form.area && form.contact && form.status;

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(l: Lead) {
    setEditingId(l.id);
    setForm(leadToForm(l));
    setSubmitError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      name: form.name,
      source: form.source,
      businessType: form.businessType,
      area: form.area,
      requirement: form.requirement,
      contact: form.contact,
      status: form.status,
      isWarm: form.isWarm,
      objectId: form.objectId,
    };
    try {
      if (editingId) {
        const updated = await updateLead(editingId, payload);
        setLeads((prev) => prev.map((l) => (l.id === editingId ? updated : l)));
      } else {
        const created = await insertLead(payload);
        setLeads((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить лид'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleWarm(l: Lead) {
    if (togglingId) return;
    setTogglingId(l.id);
    setToggleError(null);
    const next = { ...l, isWarm: !l.isWarm };
    setLeads((prev) => prev.map((x) => (x.id === l.id ? next : x)));
    try {
      const { id, ...payload } = next;
      const updated = await updateLead(id, payload);
      setLeads((prev) => prev.map((x) => (x.id === l.id ? updated : x)));
    } catch (err) {
      setLeads((prev) => prev.map((x) => (x.id === l.id ? l : x)));
      setToggleError(errorMessage(err, 'Не удалось изменить статус'));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Лиды"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить лид
          </Button>
        }
      />

      <Card className="flex flex-col gap-4 p-0">
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-[36px_130px_90px_1fr_100px_56px_1fr_130px_44px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span />
            <span>Имя</span>
            <span>Источник</span>
            <span>Сфера деятельности</span>
            <span>Площадь</span>
            <span title="Требования">Треб.</span>
            <span>Контакт</span>
            <span>Статус</span>
            <span />
          </div>
          {sortedLeads.map((l) => (
            <div
              key={l.id}
              className="grid min-w-[900px] grid-cols-[36px_130px_90px_1fr_100px_56px_1fr_130px_44px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
            >
              <button
                type="button"
                onClick={() => toggleWarm(l)}
                disabled={togglingId === l.id}
                className="flex h-6 w-6 items-center justify-center disabled:opacity-50"
                aria-label="Отметить тёплым лидом"
              >
                <Flame className={cn('h-4 w-4', l.isWarm ? 'fill-warning text-warning' : 'text-ink-faint')} />
              </button>
              <span className="font-semibold text-ink">{l.name}</span>
              <span className="text-ink-muted">{l.source}</span>
              <span className="text-ink">{l.businessType}</span>
              <span className="text-ink-muted">{l.area}</span>
              <span>
                <RequirementBadge requirement={l.requirement} />
              </span>
              <span className="truncate text-ink-muted">{l.contact}</span>
              <span className="text-ink-muted">{l.status}</span>
              <button
                type="button"
                onClick={() => openEditModal(l)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                aria-label="Редактировать лид"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем лиды...
            </div>
          )}
          {!loading && loadError && <div className="px-6 py-10 text-center text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && leads.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-ink-muted">Лидов пока нет</div>
          )}
        </div>
      </Card>

      {toggleError && <p className="text-sm text-danger">{toggleError}</p>}

      {bookedZones.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="text-lg font-bold text-ink">Брони кабинетов</div>
          <Card className="flex flex-col gap-4 p-0">
            <div className="overflow-x-auto">
              <div className="grid min-w-[900px] grid-cols-[1fr_150px_1fr_130px_140px_44px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
                <span>Лид</span>
                <span>Кабинет</span>
                <span>Объект</span>
                <span>Статус</span>
                <span />
                <span />
              </div>
              {bookedZones.map((zone) => {
                const lead = leadById.get(zone.leadId);
                const plan = planById.get(zone.buildingPlanId);
                const object = objectByPlanId.get(zone.buildingPlanId);
                return (
                  <div
                    key={zone.id}
                    className="grid min-w-[900px] grid-cols-[1fr_150px_1fr_130px_140px_44px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{lead?.name ?? '—'}</div>
                      <div className="truncate text-xs text-ink-muted">{lead?.contact}</div>
                    </div>
                    <span className="text-ink">
                      {zone.label || zoneTypeLabels[zone.zoneType]}
                      {zone.area != null && <span className="text-ink-muted"> · {zone.area} м²</span>}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-ink">{object?.address ?? '—'}</div>
                      {plan && <div className="truncate text-xs text-ink-muted">{plan.name}</div>}
                    </div>
                    <span
                      className={cn(
                        'w-fit rounded-full px-3 py-1 text-xs font-semibold',
                        zoneStatusBadgeClass[zone.status],
                      )}
                    >
                      {zone.status}
                    </span>
                    {object ? (
                      <Link
                        to={`/admin/objects/${object.landingSlug || object.id}`}
                        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        На план
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span />
                    )}
                    {lead ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(lead)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                        aria-label="Редактировать лид"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать лид' : 'Новый лид'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Имя"
              placeholder="Имя контакта"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Select
              label="Источник"
              options={[...leadSources]}
              value={form.source}
              onChange={(v) => setForm((f) => ({ ...f, source: v as LeadSource }))}
            />
          </div>

          <Input
            label="Сфера деятельности"
            placeholder="Например, общепит, ритейл..."
            value={form.businessType}
            onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
            required
          />

          <Input
            label="Нужная площадь"
            placeholder="Например, 120 м² или 100–150 м²"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            required
          />

          <AddableSelect
            label="Требования"
            placeholder="Не выбрано"
            options={knownRequirements}
            value={form.requirement}
            onChange={(v) => setForm((f) => ({ ...f, requirement: v }))}
            addLabel="+ Добавить требование"
            newPlaceholder="Название требования"
          />

          <Input
            label="Контакт или ссылка на диалог"
            placeholder="Телефон, Telegram, ссылка на переписку..."
            value={form.contact}
            onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            required
          />

          <Input
            label="Статус"
            placeholder="Например, первичный контакт, показ назначен..."
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            required
          />

          <Select
            label="Объект недвижимости"
            options={objectOptions}
            value={objectLabel(form.objectId)}
            onChange={(v) => {
              if (v === NO_OBJECT) {
                setForm((f) => ({ ...f, objectId: '' }));
                return;
              }
              const obj = objects.find((o) => o.address === v);
              setForm((f) => ({ ...f, objectId: obj?.id ?? '' }));
            }}
          />

          <ToggleGroup
            label="Тёплый лид"
            options={['Да', 'Нет']}
            value={form.isWarm ? 'Да' : 'Нет'}
            onChange={(v) => setForm((f) => ({ ...f, isWarm: v === 'Да' }))}
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
