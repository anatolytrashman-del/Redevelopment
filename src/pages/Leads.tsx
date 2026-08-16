import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Pencil, ArrowRight, Download, Trash2, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddableSelect } from '../components/ui/AddableSelect';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Modal } from '../components/ui/Modal';
import { leadSources, leadRequirements, leadContactMethods, type Lead, type LeadSource } from '../data/leads';
import type { RealtyObject } from '../data/objects';
import { zoneStatusBadgeClass, zoneTypeLabels, type BuildingPlan, type BuildingPlanZone } from '../data/buildingPlans';
import { cn } from '../lib/cn';
import { fetchLeads, insertLead, updateLead, deleteLead } from '../lib/leadsApi';
import { markLeadsViewed } from '../lib/leadsSeen';
import { fetchObjects } from '../lib/objectsApi';
import { fetchBookedZones, fetchBuildingPlans, fetchZonesByIds, updateZone } from '../lib/buildingPlansApi';
import { fetchSignedAgreementsForZones, type SignedAgreementSummary } from '../lib/agreementSigningApi';
import {
  fetchWorkstationSeatLeads,
  deleteWorkstationSeatLead,
  type WorkstationSeatLead,
} from '../lib/workstationSeatLeadsApi';

const NO_OBJECT = 'Не привязан';
// Статус лида, который жёстко ставится в PublicPlanAndUnits.tsx при брони с
// сайта — используем его же, чтобы отметить бронь как ещё не подтверждённую
// менеджером: как только статус лида поменяют в карточке, отметка сама уйдёт.
const NEW_BOOKING_LEAD_STATUS = 'Заявка на бронирование';

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
  contactMethod: '',
  phone: '',
  status: '',
  isWarm: false,
  objectId: '',
  lastContactedAt: '',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Дата "как в html-инпуте" (YYYY-MM-DD) — и для value контролируемого
// <input type="date">, и для отправки в last_contacted_at (колонка типа date).
function todayIsoDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Контакт хранит и телефон, и телеграм-юзернейм, и голую ссылку на переписку
// (например, диалог на Kufar) — способ связи (contactMethod) подсказывает,
// как из этого сделать кликабельную ссылку, ведущую сразу в диалог:
// Telegram-юзернейм превращается в t.me-ссылку, любой готовый http(s)-адрес
// (Kufar и т.п.) используется как есть. Номера телефонов ссылкой не
// становятся — с ними это ничего не открывает.
function buildDialogLink(contactMethod: string, contact: string): string | null {
  const trimmed = contact.trim();
  if (!trimmed) return null;
  if (contactMethod === 'Telegram') {
    const handle = trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^(t\.me|telegram\.me)\//i, '')
      .replace(/^@/, '');
    return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle) ? `https://t.me/${handle}` : null;
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function ContactValue({ contact, contactMethod }: { contact: string; contactMethod?: string }) {
  if (!contact) return null;
  const href = buildDialogLink(contactMethod ?? '', contact);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
        {contact}
      </a>
    );
  }
  return <>{contact}</>;
}

// "Статус" в смысле важности лида — это isWarm, отдельно от status
// (свободный текст вроде "первичный контакт", он теперь только в карточке).
function WarmBadge({ lead, onToggle, disabled }: { lead: Lead; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      className={cn(
        'w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50',
        lead.isWarm ? 'bg-warning/15 text-warning' : 'bg-surface-muted text-ink-muted',
      )}
    >
      {lead.isWarm ? 'Важный' : 'Интересант'}
    </button>
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
    contactMethod: l.contactMethod,
    phone: l.phone,
    status: l.status,
    isWarm: l.isWarm,
    objectId: l.objectId,
    lastContactedAt: l.lastContactedAt,
  };
}

export function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [bookedZones, setBookedZones] = useState<BuildingPlanZone[]>([]);
  const [seatLeads, setSeatLeads] = useState<WorkstationSeatLead[]>([]);
  const [seatZones, setSeatZones] = useState<BuildingPlanZone[]>([]);
  const [signedAgreements, setSignedAgreements] = useState<SignedAgreementSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const knownRequirements = useMemo(() => {
    const set = new Set<string>(leadRequirements);
    leads.forEach((l) => set.add(l.requirement));
    return [...set];
  }, [leads]);

  const knownContactMethods = useMemo(() => {
    const set = new Set<string>(leadContactMethods);
    leads.forEach((l) => l.contactMethod && set.add(l.contactMethod));
    return [...set];
  }, [leads]);

  const bookedLeadIds = useMemo(
    () => new Set([...bookedZones.map((z) => z.leadId).filter(Boolean), ...seatLeads.map((s) => s.leadId)]),
    [bookedZones, seatLeads],
  );

  // Тёплые лиды всегда наверху, порядок внутри группы (по дате создания) сохраняется.
  // Лиды с бронью кабинета показываются отдельным блоком ниже, а не в общем списке.
  const sortedLeads = useMemo(
    () => [...leads].filter((l) => !bookedLeadIds.has(l.id)).sort((a, b) => Number(b.isWarm) - Number(a.isWarm)),
    [leads, bookedLeadIds],
  );

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const seatZoneById = useMemo(() => new Map(seatZones.map((z) => [z.id, z])), [seatZones]);

  // Строки для брони отдельных рабочих мест — одна на каждого лида, купившего
  // место в зоне с workstationCount (в отличие от bookedZones, где строка на
  // всю зону целиком с единственным лидом).
  const seatBookingRows = useMemo(
    () =>
      seatLeads
        .map((seat) => ({ seat, zone: seatZoneById.get(seat.zoneId), lead: leadById.get(seat.leadId) }))
        .filter((r): r is { seat: WorkstationSeatLead; zone: BuildingPlanZone; lead: Lead } => !!r.zone && !!r.lead),
    [seatLeads, seatZoneById, leadById],
  );

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
    markLeadsViewed();
  }, []);

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
    Promise.all([fetchBookedZones(), fetchWorkstationSeatLeads()])
      .then(async ([zones, seats]) => {
        setBookedZones(zones);
        setSeatLeads(seats);
        const seatZoneIds = [...new Set(seats.map((s) => s.zoneId))];
        fetchZonesByIds(seatZoneIds)
          .then(setSeatZones)
          .catch(() => setSeatZones([]));
        const allZoneIds = [...new Set([...zones.map((z) => z.id), ...seatZoneIds])];
        fetchSignedAgreementsForZones(allZoneIds)
          .then(setSignedAgreements)
          .catch(() => setSignedAgreements([]));
      })
      .catch(() => {
        setBookedZones([]);
        setSeatLeads([]);
      });
  }, []);

  // Ключ — зона+лид, а не просто зона: у зоны с рабочими местами может быть
  // несколько подписанных соглашений (по одному на лида).
  const signedAgreementByKey = useMemo(
    () => new Map(signedAgreements.map((a) => [`${a.zoneId}:${a.leadId}`, a])),
    [signedAgreements],
  );

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
      contactMethod: form.contactMethod,
      phone: form.phone,
      status: form.status,
      isWarm: form.isWarm,
      objectId: form.objectId,
      lastContactedAt: form.lastContactedAt,
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
      const updated = await updateLead(l.id, {
        name: next.name,
        source: next.source,
        businessType: next.businessType,
        area: next.area,
        requirement: next.requirement,
        contact: next.contact,
        contactMethod: next.contactMethod,
        phone: next.phone,
        status: next.status,
        isWarm: next.isWarm,
        objectId: next.objectId,
        lastContactedAt: next.lastContactedAt,
      });
      setLeads((prev) => prev.map((x) => (x.id === l.id ? updated : x)));
    } catch (err) {
      setLeads((prev) => prev.map((x) => (x.id === l.id ? l : x)));
      setToggleError(errorMessage(err, 'Не удалось изменить статус'));
    } finally {
      setTogglingId(null);
    }
  }

  // Если лид держит бронь кабинета, сначала возвращаем кабинет в "Свободно"
  // (снимаем lead_id), потом удаляем сам лид — иначе кабинет навсегда
  // останется висеть "Забронирован" на удалённого лида.
  async function handleDeleteLead(lead: Lead) {
    if (deletingId) return;
    const zone = bookedZones.find((z) => z.leadId === lead.id);
    const seat = seatLeads.find((s) => s.leadId === lead.id);
    const seatZone = seat ? seatZoneById.get(seat.zoneId) : undefined;
    const confirmed = window.confirm(
      zone
        ? `Удалить лид «${lead.name}»? Бронь кабинета «${zone.label || zoneTypeLabels[zone.zoneType]}» будет снята.`
        : seatZone
          ? `Удалить лид «${lead.name}»? Место в «${seatZone.label || zoneTypeLabels[seatZone.zoneType]}» будет освобождено.`
          : `Удалить лид «${lead.name}»?`,
    );
    if (!confirmed) return;

    setDeletingId(lead.id);
    setToggleError(null);
    try {
      if (zone) {
        await updateZone(zone.id, { status: 'Свободно', leadId: '' });
        setBookedZones((prev) => prev.filter((z) => z.id !== zone.id));
      }
      if (seat && seatZone) {
        const nextSold = Math.max(seatZone.workstationsSold - 1, 0);
        const releasedZone = await updateZone(seatZone.id, { workstationsSold: nextSold, status: 'Свободно' });
        await deleteWorkstationSeatLead(seat.id);
        setSeatLeads((prev) => prev.filter((s) => s.id !== seat.id));
        setSeatZones((prev) => prev.map((z) => (z.id === releasedZone.id ? releasedZone : z)));
      }
      await deleteLead(lead.id);
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    } catch (err) {
      setToggleError(errorMessage(err, 'Не удалось удалить лид'));
    } finally {
      setDeletingId(null);
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
        {/* От md и шире — таблица-грид с горизонтальным скроллом при нехватке места.
            Ниже md та же строка неудобна для узкого экрана, поэтому там вместо неё —
            карточка на лид (см. блок md:hidden сразу за этим). */}
        <div className="hidden overflow-x-auto md:block">
          <div className="grid min-w-[820px] grid-cols-[110px_1fr_130px_1fr_120px_48px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Статус</span>
            <span>Имя</span>
            <span>Способ связи</span>
            <span>Ссылка на диалог</span>
            <span>Посл. контакт</span>
            <span />
          </div>
          {sortedLeads.map((l) => (
            <div
              key={l.id}
              onClick={() => openEditModal(l)}
              className="grid min-w-[820px] cursor-pointer grid-cols-[110px_1fr_130px_1fr_120px_48px] items-center gap-4 border-t border-border px-6 py-4 text-sm hover:bg-surface-muted/60"
            >
              <WarmBadge lead={l} onToggle={() => toggleWarm(l)} disabled={togglingId === l.id} />
              <span className="truncate font-semibold text-ink">{l.name}</span>
              <span className="truncate text-ink-muted">{l.contactMethod || '—'}</span>
              <span className="truncate text-ink-muted" onClick={(e) => e.stopPropagation()}>
                <ContactValue contact={l.contact} contactMethod={l.contactMethod} />
              </span>
              <span className="text-ink-muted">{formatDate(l.lastContactedAt)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteLead(l);
                }}
                disabled={deletingId === l.id}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                aria-label="Удалить лид"
              >
                <Trash2 className="h-4 w-4" />
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

        <div className="flex flex-col gap-3 p-4 md:hidden">
          {sortedLeads.map((l) => (
            <div
              key={l.id}
              onClick={() => openEditModal(l)}
              className="flex cursor-pointer flex-col gap-2.5 rounded-control border border-border p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <WarmBadge lead={l} onToggle={() => toggleWarm(l)} disabled={togglingId === l.id} />
                  <span className="min-w-0 truncate font-semibold text-ink">{l.name}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteLead(l);
                  }}
                  disabled={deletingId === l.id}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                  aria-label="Удалить лид"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                {l.contactMethod && <span>{l.contactMethod}</span>}
                {l.contact && (
                  <span className="truncate" onClick={(e) => e.stopPropagation()}>
                    <ContactValue contact={l.contact} contactMethod={l.contactMethod} />
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-faint">Посл. контакт: {formatDate(l.lastContactedAt)}</div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем лиды...
            </div>
          )}
          {!loading && loadError && <div className="py-10 text-center text-sm text-danger">{loadError}</div>}
          {!loading && !loadError && leads.length === 0 && (
            <div className="py-10 text-center text-sm text-ink-muted">Лидов пока нет</div>
          )}
        </div>
      </Card>

      {toggleError && <p className="text-sm text-danger">{toggleError}</p>}

      {(bookedZones.length > 0 || seatBookingRows.length > 0) && (
        <div className="flex flex-col gap-4">
          <div className="text-lg font-bold text-ink">Брони кабинетов</div>
          <Card className="flex flex-col gap-4 p-0">
            <div className="hidden overflow-x-auto md:block">
              <div className="grid min-w-[1020px] grid-cols-[1fr_150px_1fr_150px_150px_140px_84px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
                <span>Лид</span>
                <span>Кабинет</span>
                <span>Объект</span>
                <span>Статус</span>
                <span>Соглашение</span>
                <span />
                <span />
              </div>
              {bookedZones.map((zone) => {
                const lead = leadById.get(zone.leadId);
                const plan = planById.get(zone.buildingPlanId);
                const object = objectByPlanId.get(zone.buildingPlanId);
                const agreement = signedAgreementByKey.get(`${zone.id}:${zone.leadId}`);
                return (
                  <div
                    key={zone.id}
                    className="grid min-w-[1020px] grid-cols-[1fr_150px_1fr_150px_150px_140px_84px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{lead?.name ?? '—'}</div>
                      <div className="truncate text-xs text-ink-muted">
                        {lead && <ContactValue contact={lead.contact} contactMethod={lead.contactMethod} />}
                      </div>
                    </div>
                    <span className="text-ink">
                      {zone.label || zoneTypeLabels[zone.zoneType]}
                      {zone.area != null && <span className="text-ink-muted"> · {zone.area} м²</span>}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-ink">{object?.address ?? '—'}</div>
                      {plan && <div className="truncate text-xs text-ink-muted">{plan.name}</div>}
                    </div>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'w-fit rounded-full px-3 py-1 text-xs font-semibold',
                          zoneStatusBadgeClass[zone.status],
                        )}
                      >
                        {zone.status}
                      </span>
                      {lead?.status === NEW_BOOKING_LEAD_STATUS && (
                        <span
                          title="Новая бронь с сайта — ещё не подтверждена"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </span>
                    {agreement ? (
                      <a
                        href={agreement.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Подписано
                      </a>
                    ) : (
                      <span className="text-ink-faint">Не подписано</span>
                    )}
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
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(lead)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                          aria-label="Редактировать лид"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLead(lead)}
                          disabled={deletingId === lead.id}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                          aria-label="Удалить лид"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
              {seatBookingRows.map(({ seat, zone, lead }) => {
                const plan = planById.get(zone.buildingPlanId);
                const object = objectByPlanId.get(zone.buildingPlanId);
                const agreement = signedAgreementByKey.get(`${zone.id}:${lead.id}`);
                return (
                  <div
                    key={seat.id}
                    className="grid min-w-[1020px] grid-cols-[1fr_150px_1fr_150px_150px_140px_84px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{lead.name}</div>
                      <div className="truncate text-xs text-ink-muted">
                        <ContactValue contact={lead.contact} contactMethod={lead.contactMethod} />
                      </div>
                    </div>
                    <span className="text-ink">
                      {zone.label || zoneTypeLabels[zone.zoneType]}
                      <span className="text-ink-muted"> · место</span>
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-ink">{object?.address ?? '—'}</div>
                      {plan && <div className="truncate text-xs text-ink-muted">{plan.name}</div>}
                    </div>
                    <span className="flex items-center gap-1.5">
                      <span className="w-fit rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                        Место забронировано
                      </span>
                      {lead.status === NEW_BOOKING_LEAD_STATUS && (
                        <span
                          title="Новая бронь с сайта — ещё не подтверждена"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </span>
                    {agreement ? (
                      <a
                        href={agreement.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Подписано
                      </a>
                    ) : (
                      <span className="text-ink-faint">Не подписано</span>
                    )}
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
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(lead)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                        aria-label="Редактировать лид"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLead(lead)}
                        disabled={deletingId === lead.id}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                        aria-label="Удалить лид"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 p-4 md:hidden">
              {bookedZones.map((zone) => {
                const lead = leadById.get(zone.leadId);
                const plan = planById.get(zone.buildingPlanId);
                const object = objectByPlanId.get(zone.buildingPlanId);
                const agreement = signedAgreementByKey.get(`${zone.id}:${zone.leadId}`);
                return (
                  <div key={zone.id} className="flex flex-col gap-2.5 rounded-control border border-border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{lead?.name ?? '—'}</div>
                        {lead?.contact && (
                          <div className="truncate text-xs text-ink-muted">
                            <ContactValue contact={lead.contact} contactMethod={lead.contactMethod} />
                          </div>
                        )}
                      </div>
                      {lead && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(lead)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                            aria-label="Редактировать лид"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLead(lead)}
                            disabled={deletingId === lead.id}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                            aria-label="Удалить лид"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-ink">
                      {zone.label || zoneTypeLabels[zone.zoneType]}
                      {zone.area != null && <span className="text-ink-muted"> · {zone.area} м²</span>}
                    </div>
                    <div className="min-w-0 text-sm">
                      <div className="truncate text-ink">{object?.address ?? '—'}</div>
                      {plan && <div className="truncate text-xs text-ink-muted">{plan.name}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'w-fit rounded-full px-3 py-1 text-xs font-semibold',
                          zoneStatusBadgeClass[zone.status],
                        )}
                      >
                        {zone.status}
                      </span>
                      {lead?.status === NEW_BOOKING_LEAD_STATUS && (
                        <span
                          title="Новая бронь с сайта — ещё не подтверждена"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                      {agreement ? (
                        <a
                          href={agreement.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-fit items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Подписано
                        </a>
                      ) : (
                        <span className="text-ink-faint">Не подписано</span>
                      )}
                      {object && (
                        <Link
                          to={`/admin/objects/${object.landingSlug || object.id}`}
                          className="flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          На план
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
              {seatBookingRows.map(({ seat, zone, lead }) => {
                const plan = planById.get(zone.buildingPlanId);
                const object = objectByPlanId.get(zone.buildingPlanId);
                const agreement = signedAgreementByKey.get(`${zone.id}:${lead.id}`);
                return (
                  <div key={seat.id} className="flex flex-col gap-2.5 rounded-control border border-border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{lead.name}</div>
                        {lead.contact && (
                          <div className="truncate text-xs text-ink-muted">
                            <ContactValue contact={lead.contact} contactMethod={lead.contactMethod} />
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(lead)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                          aria-label="Редактировать лид"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLead(lead)}
                          disabled={deletingId === lead.id}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                          aria-label="Удалить лид"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-ink">
                      {zone.label || zoneTypeLabels[zone.zoneType]}
                      <span className="text-ink-muted"> · место</span>
                    </div>
                    <div className="min-w-0 text-sm">
                      <div className="truncate text-ink">{object?.address ?? '—'}</div>
                      {plan && <div className="truncate text-xs text-ink-muted">{plan.name}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-fit rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                        Место забронировано
                      </span>
                      {lead.status === NEW_BOOKING_LEAD_STATUS && (
                        <span
                          title="Новая бронь с сайта — ещё не подтверждена"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                      {agreement ? (
                        <a
                          href={agreement.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-fit items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Подписано
                        </a>
                      ) : (
                        <span className="text-ink-faint">Не подписано</span>
                      )}
                      {object && (
                        <Link
                          to={`/admin/objects/${object.landingSlug || object.id}`}
                          className="flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          На план
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать лид' : 'Новый лид'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            label="Телефон"
            placeholder="+375 29 ..."
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Контакт или ссылка на диалог"
              placeholder="@username, ссылка на переписку..."
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              required
            />
            <AddableSelect
              label="Способ связи"
              placeholder="Не выбрано"
              options={knownContactMethods}
              value={form.contactMethod}
              onChange={(v) => setForm((f) => ({ ...f, contactMethod: v }))}
              addLabel="+ Добавить способ"
              newPlaceholder="Название способа связи"
            />
          </div>
          <p className="-mt-2 text-xs text-ink-faint">
            Для Telegram укажи способ связи "Telegram" — тогда юзернейм (с @ или без) сам превратится в ссылку,
            открывающую диалог.
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Дата последнего контакта"
                type="date"
                value={form.lastContactedAt}
                onChange={(e) => setForm((f) => ({ ...f, lastContactedAt: e.target.value }))}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => setForm((f) => ({ ...f, lastContactedAt: todayIsoDate() }))}>
              Сегодня
            </Button>
          </div>

          {editingId && (
            <p className="text-xs text-ink-faint">
              Лид создан: {formatDate(leads.find((l) => l.id === editingId)?.createdAt ?? '')}
            </p>
          )}

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
