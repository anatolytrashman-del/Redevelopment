import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Pencil, Check, X, Link2Off } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AttachBuildingPlanModal } from './AttachBuildingPlanModal';
import { zoneTypes, zoneTypeLabels, type BuildingPlan, type BuildingPlanZone, type ZonePoint, type ZoneType } from '../../data/buildingPlans';
import type { RealtyObject } from '../../data/objects';
import {
  fetchBuildingPlans,
  fetchZonesForPlan,
  insertZone,
  deleteZone as deleteZoneApi,
} from '../../lib/buildingPlansApi';
import { fetchObjects } from '../../lib/objectsApi';
import { cn } from '../../lib/cn';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function zoneFillClass(zone: BuildingPlanZone, objects: RealtyObject[]): string {
  if (zone.zoneType === 'room') {
    const status = objects.find((o) => o.id === zone.objectId)?.bookingStatus ?? 'Свободно';
    if (status === 'Продано') return 'fill-danger/35 stroke-danger';
    if (status === 'Забронировано') return 'fill-warning/35 stroke-warning';
    return 'fill-success/25 stroke-success';
  }
  if (zone.zoneType === 'bathroom') return 'fill-info-bg stroke-info-text';
  if (zone.zoneType === 'technical') return 'fill-ink-faint/40 stroke-ink-faint';
  return 'fill-surface-muted stroke-ink-faint';
}

function pointsToAttr(points: ZonePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

interface NewZoneFormProps {
  objects: RealtyObject[];
  onCancel: () => void;
  onSave: (input: { zoneType: ZoneType; label: string; objectId: string }) => void;
  saving: boolean;
}

function NewZoneForm({ objects, onCancel, onSave, saving }: NewZoneFormProps) {
  const [zoneType, setZoneType] = useState<ZoneType>('room');
  const [label, setLabel] = useState('');
  const [objectId, setObjectId] = useState('');

  const objectLabel = (o: RealtyObject) => `${o.address} — ${o.area} м²`;
  const canSave = zoneType === 'room' ? !!objectId : label.trim();

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
      {zoneType === 'room' ? (
        <Select
          label="Объект"
          options={objects.map(objectLabel)}
          value={objects.find((o) => o.id === objectId) ? objectLabel(objects.find((o) => o.id === objectId)!) : ''}
          onChange={(v) => setObjectId(objects.find((o) => objectLabel(o) === v)?.id ?? '')}
        />
      ) : (
        <Input label="Подпись" placeholder="Например, Санузел" value={label} onChange={(e) => setLabel(e.target.value)} />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          onClick={() =>
            onSave({
              zoneType,
              label: zoneType === 'room' ? objects.find((o) => o.id === objectId)?.address ?? '' : label.trim(),
              objectId,
            })
          }
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
  onDetachPlan: () => Promise<void>;
}

export function BuildingPlanWidget({ object, onAttachPlan, onDetachPlan }: BuildingPlanWidgetProps) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<BuildingPlan[]>([]);
  const [zones, setZones] = useState<BuildingPlanZone[]>([]);
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<ZonePoint[] | null>(null);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const plan = plans.find((p) => p.id === object.buildingPlanId) ?? null;

  useEffect(() => {
    if (!object.buildingPlanId) {
      setZones([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchBuildingPlans(), fetchZonesForPlan(object.buildingPlanId), fetchObjects()])
      .then(([planList, zoneList, objectList]) => {
        setPlans(planList);
        setZones(zoneList);
        setObjects(objectList);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить планировку')))
      .finally(() => setLoading(false));
  }, [object.buildingPlanId]);

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
  }

  async function saveZone(input: { zoneType: ZoneType; label: string; objectId: string }) {
    if (!plan || !drawingPoints || drawingPoints.length < 3) return;
    setSavingZone(true);
    setZoneError(null);
    try {
      const created = await insertZone({
        buildingPlanId: plan.id,
        zoneType: input.zoneType,
        label: input.label,
        objectId: input.zoneType === 'room' ? input.objectId : '',
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

  async function handleZoneClick(zone: BuildingPlanZone) {
    if (editMode) {
      if (!window.confirm('Удалить зону?')) return;
      try {
        await deleteZoneApi(zone.id);
        setZones((prev) => prev.filter((z) => z.id !== zone.id));
      } catch (err) {
        setZoneError(errorMessage(err, 'Не удалось удалить зону'));
      }
      return;
    }
    if (zone.zoneType !== 'room' || !zone.objectId) return;
    if (zone.objectId === object.id) return;
    navigate(`/objects/${zone.objectId}`);
  }

  if (!object.buildingPlanId) {
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
          onAttached={onAttachPlan}
        />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <div className="font-bold text-ink">Планировка{plan ? ` — ${plan.name}` : ''}</div>
        <div className="flex items-center gap-2">
          {editMode && !drawingPoints && (
            <Button type="button" variant="secondary" onClick={startDrawing}>
              Добавить зону
            </Button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditMode((v) => !v);
              cancelDrawing();
            }}
            aria-label="Редактировать зоны"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
              editMode ? 'border-primary text-primary' : 'border-border text-ink-muted hover:border-primary hover:text-primary',
            )}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.confirm('Отвязать план от этого объекта?') && onDetachPlan()}
            aria-label="Отвязать план"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger"
          >
            <Link2Off className="h-4 w-4" />
          </button>
        </div>
      </div>

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
            className={cn('relative w-full select-none overflow-hidden rounded-control border border-border', editMode && drawingPoints !== null && 'cursor-crosshair')}
            onClick={handleContainerClick}
          >
            <img src={plan.imageUrl} alt={plan.name} className="w-full" draggable={false} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {zones.map((zone) => (
                <polygon
                  key={zone.id}
                  points={pointsToAttr(zone.points)}
                  className={cn(
                    zoneFillClass(zone, objects),
                    editMode ? 'cursor-pointer' : zone.zoneType === 'room' && zone.objectId ? 'cursor-pointer' : '',
                    zone.objectId === object.id && 'stroke-[0.6]',
                  )}
                  strokeWidth={zone.objectId === object.id ? 0.6 : 0.3}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleZoneClick(zone);
                  }}
                >
                  <title>{zone.label}</title>
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
              <span>Кликайте по плану, чтобы отметить точки контура ({drawingPoints.length})</span>
              <div className="flex gap-2">
                <button type="button" onClick={cancelDrawing} aria-label="Отменить" className="text-ink-muted hover:text-danger">
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowZoneForm(true)}
                  disabled={drawingPoints.length < 3}
                  aria-label="Готово"
                  className="text-ink-muted hover:text-primary disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {showZoneForm && (
            <NewZoneForm objects={objects} onCancel={cancelDrawing} onSave={saveZone} saving={savingZone} />
          )}

          {zoneError && <p className="text-sm text-danger">{zoneError}</p>}

          <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
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
              <span className="h-3 w-3 rounded-sm bg-surface-muted" /> МОП
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
    </Card>
  );
}
