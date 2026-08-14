import { useEffect, useState } from 'react';
import { ExternalLink, Pencil, Spline, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { ToggleGroup } from '../ui/ToggleGroup';
import {
  zoneFeatures,
  zoneStatuses,
  zoneStatusBadgeClass,
  zoneTypeLabels,
  zoneDownPayment,
  zonePrice,
  type BuildingPlanZone,
  type ZoneStatus,
} from '../../data/buildingPlans';
import type { Lead } from '../../data/leads';
import type { GeneratedDocument } from '../../data/generatedDocuments';
import { updateZone, deleteZone } from '../../lib/buildingPlansApi';
import { cn } from '../../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const NO_LEAD = 'Не выбран';

function leadLabel(l: Lead) {
  return `${l.name} — ${l.contact}`;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

const statusTextClass: Record<string, string> = {
  'Готов к отправке': 'text-ink-muted',
  'Отправлен клиенту': 'text-info-text',
  'Ждём от клиента': 'text-warning',
  'Документ в архиве': 'text-ink-faint',
};

interface ZoneDetailModalProps {
  zone: BuildingPlanZone | null;
  leads: Lead[];
  documents: GeneratedDocument[];
  onClose: () => void;
  onUpdated: (zone: BuildingPlanZone) => void;
  onDeleted: (zoneId: string) => void;
  onRedraw: (zone: BuildingPlanZone) => void;
}

export function ZoneDetailModal({ zone, leads, documents, onClose, onUpdated, onDeleted, onRedraw }: ZoneDetailModalProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<ZoneStatus>('Свободно');
  const [leadId, setLeadId] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!zone) return;
    setMode('view');
    setLabel(zone.label);
    setArea(zone.area != null ? String(zone.area) : '');
    setStatus(zone.status);
    setLeadId(zone.leadId);
    setFeatures(zone.features);
    setError(null);
  }, [zone]);

  if (!zone) return null;

  const isRoom = zone.zoneType === 'room';
  const selectedLead = leads.find((l) => l.id === leadId) ?? null;
  const leadDocuments = leadId ? documents.filter((d) => d.leadId === leadId) : [];

  function startEdit() {
    if (!zone) return;
    setLabel(zone.label);
    setArea(zone.area != null ? String(zone.area) : '');
    setStatus(zone.status);
    setLeadId(zone.leadId);
    setFeatures(zone.features);
    setError(null);
    setMode('edit');
  }

  function toggleFeature(feature: string) {
    setFeatures((prev) => (prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]));
  }

  async function handleSave() {
    if (!zone) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateZone(zone.id, {
        label: label.trim(),
        area: isRoom && area.trim() ? Number(area) : null,
        status: isRoom ? status : zone.status,
        leadId: isRoom ? leadId : '',
        features: isRoom ? features : [],
      });
      onUpdated(updated);
      setMode('view');
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить зону'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!zone || !window.confirm(`Удалить зону «${zone.label || zoneTypeLabels[zone.zoneType]}»?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteZone(zone.id);
      onDeleted(zone.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить зону'));
      setSaving(false);
    }
  }

  return (
    <Modal open={!!zone} onClose={onClose} title={zoneTypeLabels[zone.zoneType]}>
      <div className="flex flex-col gap-3">
        {mode === 'view' ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xl font-bold text-ink">{zone.label || '—'}</span>
              {isRoom && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                    zoneStatusBadgeClass[zone.status],
                  )}
                >
                  {zone.status}
                </span>
              )}
            </div>

            {isRoom && (
              <>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-control bg-surface-muted px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted">Площадь</span>
                    <span className="font-medium text-ink">{zone.area != null ? `${zone.area} м²` : '—'}</span>
                  </div>
                  {zone.area != null && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-muted">Стоимость</span>
                        <span className="font-medium text-ink">{formatMoney(zonePrice(zone.area))}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-muted">Первый взнос</span>
                        <span className="font-medium text-ink">{formatMoney(zoneDownPayment(zone.area))}</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted">Клиент</span>
                    <span className="font-medium text-ink">{selectedLead ? leadLabel(selectedLead) : NO_LEAD}</span>
                  </div>
                </div>

                {zone.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {zone.features.map((f) => (
                      <span key={f} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink">
                        {f}
                      </span>
                    ))}
                  </div>
                )}

                {leadId && leadDocuments.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-ink-muted">Документы клиента</span>
                    {leadDocuments.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-2 rounded-control border border-border px-2.5 py-1.5 text-xs hover:border-primary"
                      >
                        <span className="truncate text-ink">{doc.title}</span>
                        <span className={`shrink-0 font-medium ${statusTextClass[doc.status] ?? 'text-ink-muted'}`}>
                          {doc.status}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-ink-faint" />
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить зону
              </button>
              <Button type="button" icon={<Pencil className="h-4 w-4" />} onClick={startEdit}>
                Редактировать
              </Button>
            </div>
          </>
        ) : (
          <>
            <Input
              label={isRoom ? 'Номер кабинета' : 'Подпись'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />

            <button
              type="button"
              onClick={() => onRedraw(zone)}
              className="flex w-fit items-center gap-2 text-sm font-medium text-ink-muted hover:text-primary"
            >
              <Spline className="h-4 w-4" />
              Перерисовать контур на плане
            </button>

            {isRoom && (
              <>
                <Input label="Площадь, м²" type="number" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} />

                <ToggleGroup label="Статус" options={[...zoneStatuses]} value={status} onChange={(v) => setStatus(v as ZoneStatus)} />

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-ink-muted">Особенности</span>
                  <div className="flex flex-col gap-2">
                    {zoneFeatures.map((feature) => (
                      <label key={feature} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={features.includes(feature)}
                          onChange={() => toggleFeature(feature)}
                          className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary"
                        />
                        {feature}
                      </label>
                    ))}
                  </div>
                </div>

                <Select
                  label="Клиент"
                  options={[NO_LEAD, ...leads.map(leadLabel)]}
                  value={selectedLead ? leadLabel(selectedLead) : NO_LEAD}
                  onChange={(v) => setLeadId(v === NO_LEAD ? '' : leads.find((l) => leadLabel(l) === v)?.id ?? '')}
                />
              </>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Удалить зону
              </button>
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setMode('view')} disabled={saving}>
                  Отмена
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
