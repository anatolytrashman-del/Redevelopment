import { useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Check, X, Link2Off, Maximize2, Minimize2, ImageUp, Plus } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AttachBuildingPlanModal } from './AttachBuildingPlanModal';
import { ZoneDetailModal } from './ZoneDetailModal';
import {
  zoneTypes,
  zoneTypeLabels,
  type BuildingPlan,
  type BuildingPlanZone,
  type ZonePoint,
  type ZoneType,
} from '../../data/buildingPlans';
import type { RealtyObject } from '../../data/objects';
import type { Lead } from '../../data/leads';
import type { GeneratedDocument } from '../../data/generatedDocuments';
import {
  fetchBuildingPlans,
  fetchZonesForPlan,
  insertZone,
  updateBuildingPlan,
  updateZone,
  uploadBuildingPlanImage,
} from '../../lib/buildingPlansApi';
import { fetchLeads } from '../../lib/leadsApi';
import { fetchGeneratedDocuments } from '../../lib/generatedDocumentsApi';
import { cn } from '../../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function zoneFillClass(zone: BuildingPlanZone): string {
  if (zone.zoneType === 'room') {
    if (zone.status === 'Продано') return 'fill-danger/35 stroke-danger';
    if (zone.status === 'Забронировано') return 'fill-warning/35 stroke-warning';
    return 'fill-success/25 stroke-success';
  }
  if (zone.zoneType === 'bathroom') return 'fill-info-bg/60 stroke-info-text';
  if (zone.zoneType === 'technical') return 'fill-ink-faint/40 stroke-ink-faint';
  return 'fill-ink-faint/25 stroke-ink-faint';
}

function pointsToAttr(points: ZonePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

interface NewZoneFormProps {
  onCancel: () => void;
  onSave: (input: { zoneType: ZoneType; label: string; area: number | null }) => void;
  saving: boolean;
}

function NewZoneForm({ onCancel, onSave, saving }: NewZoneFormProps) {
  const [zoneType, setZoneType] = useState<ZoneType>('room');
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('');

  const isRoom = zoneType === 'room';
  const canSave = isRoom ? label.trim() : label.trim();

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border bg-surface-muted p-4">
      <Select
        label="Тип зоны"
        options={zoneTypes.map((t) => zoneTypeLabels[t])}
        value={zoneTypeLabels[zoneType]}
        onChange={(v) => {
          const type = zoneTypes.find((t) => zoneTypeLabels[t] === v) ?? 'room';
          setZoneType(type);
        }}
      />
      <Input
        label={isRoom ? 'Номер кабинета' : 'Подпись'}
        placeholder={isRoom ? 'Например, 11' : 'Например, Санузел'}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      {isRoom && (
        <Input label="Площадь, м²" type="number" step="0.1" placeholder="0" value={area} onChange={(e) => setArea(e.target.value)} />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          onClick={() => onSave({ zoneType, label: label.trim(), area: isRoom && area.trim() ? Number(area) : null })}
          disabled={!canSave || saving}
        >
          {saving ? 'Сохраняем...' : 'Сохранить зону'}
        </Button>
      </div>
    </div>
  );
}

interface BuildingPlanWidgetProps {
  object: RealtyObject;
  onAttachPlan: (planId: string) => Promise<void>;
  onDetachPlan: (planId: string) => Promise<void>;
}

export function BuildingPlanWidget({ object, onAttachPlan, onDetachPlan }: BuildingPlanWidgetProps) {
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<ZonePoint[] | null>(null);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<BuildingPlanZone | null>(null);
  const [redrawZoneId, setRedrawZoneId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [replacingImage, setReplacingImage] = useState(false);
  const [replaceImageError, setReplaceImageError] = useState<string | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  const objectPlans = object.buildingPlanIds
    .map((id) => plans.find((p) => p.id === id))
    .filter((p): p is BuildingPlan => !!p);
  const plan = objectPlans.find((p) => p.id === activePlanId) ?? null;

  useEffect(() => {
    if (object.buildingPlanIds.length === 0) {
      setZones([]);
      setActivePlanId(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetchBuildingPlans(),
      Promise.all(object.buildingPlanIds.map((id) => fetchZonesForPlan(id))),
      fetchLeads(),
      fetchGeneratedDocuments(),
    ])
      .then(([planList, zoneLists, leadList, docList]) => {
        setPlans(planList);
        setZones(zoneLists.flat());
        setLeads(leadList);
        setDocuments(docList);
        setActivePlanId((prev) => (prev && object.buildingPlanIds.includes(prev) ? prev : object.buildingPlanIds[0]));
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить планировку')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.buildingPlanIds.join(',')]);

  useEffect(() => {
    if (attachOpen && plans.length === 0) {
      fetchBuildingPlans()
        .then(setPlans)
        .catch(() => {});
    }
  }, [attachOpen, plans.length]);

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!editMode || drawingPoints === null || showZoneForm) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawingPoints((prev) => [...(prev ?? []), { x, y }]);
  }

  function startDrawing() {
    setDrawingPoints([]);
    setShowZoneForm(false);
    setZoneError(null);
  }

  function cancelDrawing() {
    setDrawingPoints(null);
    setShowZoneForm(false);
    setRedrawZoneId(null);
  }

  function startRedraw(zone: BuildingPlanZone) {
    setSelectedZone(null);
    setEditMode(true);
    setDrawingPoints([]);
    setShowZoneForm(false);
    setZoneError(null);
    setRedrawZoneId(zone.id);
  }

  async function saveZone(input: { zoneType: ZoneType; label: string; area: number | null }) {
    if (!plan || !drawingPoints || drawingPoints.length < 3) return;
    setSavingZone(true);
    setZoneError(null);
    try {
      const created = await insertZone({
        buildingPlanId: plan.id,
        zoneType: input.zoneType,
        label: input.label,
        area: input.zoneType === 'room' ? input.area : null,
        status: 'Свободно',
        leadId: '',
        features: [],
        points: drawingPoints,
      });
      setZones((prev) => [...prev, created]);
      setDrawingPoints(null);
      setShowZoneForm(false);
    } catch (err) {
      setZoneError(errorMessage(err, 'Не удалось сохранить зону'));
    } finally {
      setSavingZone(false);
    }
  }

  function handleZoneClick(zone: BuildingPlanZone) {
    if (drawingPoints !== null) return;
    setSelectedZone(zone);
  }

  async function saveRedrawnPoints() {
    if (!redrawZoneId || !drawingPoints || drawingPoints.length < 3) return;
    setSavingZone(true);
    setZoneError(null);
    try {
      const updated = await updateZone(redrawZoneId, { points: drawingPoints });
      setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
      setDrawingPoints(null);
      setRedrawZoneId(null);
    } catch (err) {
      setZoneError(errorMessage(err, 'Не удалось сохранить контур'));
    } finally {
      setSavingZone(false);
    }
  }

  async function handleReplaceImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !plan) return;
    setReplacingImage(true);
    setReplaceImageError(null);
    try {
      const url = await uploadBuildingPlanImage(file);
      const updated = await updateBuildingPlan(plan.id, { imageUrl: url });
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      setReplaceImageError(errorMessage(err, 'Не удалось заменить картинку'));
    } finally {
      setReplacingImage(false);
      if (replaceImageInputRef.current) replaceImageInputRef.current.value = '';
    }
  }

  async function addFloor(planId: string) {
    await onAttachPlan(planId);
    setActivePlanId(planId);
  }

  async function handleDetachFloor() {
    if (!plan || !window.confirm(`Отвязать «${plan.name}» от этого объекта?`)) return;
    await onDetachPlan(plan.id);
    setActivePlanId(null);
  }

  if (object.buildingPlanIds.length === 0) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <div className="font-bold text-ink">Планировка</div>
        <p className="text-sm text-ink-muted">План здания ещё не привязан к этому объекту.</p>
        <Button type="button" variant="secondary" className="w-fit" onClick={() => setAttachOpen(true)}>
          Привязать план
        </Button>
        <AttachBuildingPlanModal
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          plans={plans}
          onAttached={addFloor}
        />
      </Card>
    );
  }

  const content = (
    <>
      <div className="flex items-end gap-1 overflow-x-auto">
        {objectPlans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePlanId(p.id)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-t-control border border-b-0 px-4 py-2 text-sm font-medium transition-colors',
              p.id === activePlanId
                ? 'border-border bg-surface text-ink'
                : 'border-transparent bg-surface-muted text-ink-muted hover:text-ink',
            )}
          >
            {p.name}
          </button>
        ))}
        {editMode && (
          <button
            type="button"
            onClick={() => setAttachOpen(true)}
            aria-label="Добавить этаж"
            className="flex shrink-0 items-center justify-center rounded-t-control border border-b-0 border-transparent px-3 py-2 text-ink-muted hover:text-primary"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="font-bold text-ink">Планировка</div>
        <div className="flex items-center gap-2">
          {editMode && !drawingPoints && (
            <Button type="button" variant="secondary" onClick={startDrawing}>
              Добавить зону
            </Button>
          )}
          {editMode && (
            <>
              <input
                ref={replaceImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleReplaceImage}
              />
              <button
                type="button"
                onClick={() => replaceImageInputRef.current?.click()}
                disabled={replacingImage}
                aria-label="Заменить картинку плана"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {replacingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleDetachFloor}
                aria-label="Отвязать план"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger"
              >
                <Link2Off className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setEditMode((v) => !v);
              cancelDrawing();
            }}
            aria-label="Режим добавления зон"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
              editMode ? 'border-primary text-primary' : 'border-border text-ink-muted hover:border-primary hover:text-primary',
            )}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? 'Свернуть' : 'Развернуть во весь экран'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {replaceImageError && <p className="text-sm text-danger">{replaceImageError}</p>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем планировку...
        </div>
      )}
      {!loading && loadError && <p className="text-sm text-danger">{loadError}</p>}

      {!loading && !loadError && plan && (
        <>
          <div
            className={cn(
              'relative w-full select-none overflow-hidden rounded-control border border-border',
              editMode && drawingPoints !== null && 'cursor-crosshair',
            )}
            onClick={handleContainerClick}
          >
            <img src={plan.imageUrl} alt={plan.name} className="w-full" draggable={false} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {zones.filter((zone) => zone.buildingPlanId === plan.id).map((zone) => (
                <polygon
                  key={zone.id}
                  points={pointsToAttr(zone.points)}
                  className={cn('cursor-pointer transition-opacity hover:opacity-80', zoneFillClass(zone))}
                  strokeWidth={0.3}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleZoneClick(zone);
                  }}
                >
                  <title>{zone.label || zoneTypeLabels[zone.zoneType]}</title>
                </polygon>
              ))}
              {drawingPoints && drawingPoints.length > 0 && (
                <polyline points={pointsToAttr(drawingPoints)} className="fill-none stroke-primary" strokeWidth={0.4} />
              )}
              {drawingPoints?.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={0.7} className="fill-primary" />
              ))}
            </svg>
          </div>

          {editMode && drawingPoints !== null && !showZoneForm && (
            <div className="flex items-center justify-between gap-3 rounded-control bg-surface-muted px-4 py-3 text-sm text-ink-muted">
              <span>
                {redrawZoneId ? 'Отметьте новые точки контура' : 'Кликайте по плану, чтобы отметить точки контура'} (
                {drawingPoints.length})
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={cancelDrawing} aria-label="Отменить" className="text-ink-muted hover:text-danger">
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (redrawZoneId ? saveRedrawnPoints() : setShowZoneForm(true))}
                  disabled={drawingPoints.length < 3 || savingZone}
                  aria-label="Готово"
                  className="text-ink-muted hover:text-primary disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {showZoneForm && <NewZoneForm onCancel={cancelDrawing} onSave={saveZone} saving={savingZone} />}

          {zoneError && <p className="text-sm text-danger">{zoneError}</p>}

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-success/40" /> Свободно
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-warning/40" /> Забронировано
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-danger/40" /> Продано
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-ink-faint/40" /> МОП
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-info-bg" /> Санузел
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-ink-faint/40" /> Техническое
            </span>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {fullscreen ? (
        <div
          className="fixed inset-0 z-40 overflow-y-auto bg-ink/60 p-6"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="mx-auto flex max-w-6xl flex-col gap-3 rounded-card bg-surface p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </div>
        </div>
      ) : (
        <Card className="flex flex-col gap-3 p-5">{content}</Card>
      )}

      <ZoneDetailModal
        zone={selectedZone}
        leads={leads}
        documents={documents}
        onClose={() => setSelectedZone(null)}
        onUpdated={(updated) => setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)))}
        onDeleted={(zoneId) => setZones((prev) => prev.filter((z) => z.id !== zoneId))}
        onRedraw={startRedraw}
      />

      <AttachBuildingPlanModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        plans={plans}
        onAttached={addFloor}
      />
    </>
  );
}
