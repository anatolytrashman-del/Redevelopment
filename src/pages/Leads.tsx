import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Modal } from '../components/ui/Modal';
import { leadSources, leadRequirements, type Lead, type LeadSource } from '../data/leads';
import { badgeColor } from '../lib/badgeColor';
import { fetchLeads, insertLead, updateLead } from '../lib/leadsApi';

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
  requirement: leadRequirements[0] as string,
  contact: '',
  status: '',
};

function leadToForm(l: Lead) {
  return {
    name: l.name,
    source: l.source,
    businessType: l.businessType,
    area: l.area,
    requirement: l.requirement,
    contact: l.contact,
    status: l.status,
  };
}

export function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const knownRequirements = useMemo(() => {
    const set = new Set<string>(leadRequirements);
    leads.forEach((l) => set.add(l.requirement));
    return [...set];
  }, [leads]);

  useEffect(() => {
    fetchLeads()
      .then(setLeads)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить лиды')))
      .finally(() => setLoading(false));
  }, []);

  const canSubmit =
    form.name && form.businessType && form.area && form.requirement && form.contact && form.status;

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
          <div className="grid min-w-[1150px] grid-cols-[140px_90px_1fr_120px_140px_1fr_140px_44px] gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Имя</span>
            <span>Источник</span>
            <span>Сфера деятельности</span>
            <span>Площадь</span>
            <span>Требования</span>
            <span>Контакт</span>
            <span>Статус</span>
            <span />
          </div>
          {leads.map((l) => (
            <div
              key={l.id}
              className="grid min-w-[1150px] grid-cols-[140px_90px_1fr_120px_140px_1fr_140px_44px] items-center gap-4 border-t border-border px-6 py-4 text-sm"
            >
              <span className="font-semibold text-ink">{l.name}</span>
              <span className="text-ink-muted">{l.source}</span>
              <span className="text-ink">{l.businessType}</span>
              <span className="text-ink-muted">{l.area}</span>
              <span>
                <Badge style={{ backgroundColor: badgeColor(l.requirement).bg, color: badgeColor(l.requirement).text }}>
                  {l.requirement}
                </Badge>
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
