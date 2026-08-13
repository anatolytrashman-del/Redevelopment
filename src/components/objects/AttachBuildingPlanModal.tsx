import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Modal } from '../ui/Modal';
import { ToggleGroup } from '../ui/ToggleGroup';
import type { BuildingPlan } from '../../data/buildingPlans';
import { insertBuildingPlan, uploadBuildingPlanImage } from '../../lib/buildingPlansApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface AttachBuildingPlanModalProps {
  open: boolean;
  onClose: () => void;
  plans: BuildingPlan[];
  onAttached: (planId: string) => Promise<void> | void;
}

export function AttachBuildingPlanModal({ open, onClose, plans, onAttached }: AttachBuildingPlanModalProps) {
  const [mode, setMode] = useState<'Существующий' | 'Новый'>('Существующий');
  const [selectedPlanName, setSelectedPlanName] = useState('');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(plans.length > 0 ? 'Существующий' : 'Новый');
    setSelectedPlanName('');
    setName('');
    setFile(null);
    setError(null);
  }, [open, plans.length]);

  const canSubmit = mode === 'Существующий' ? !!selectedPlanName : name.trim() && !!file;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      let planId: string;
      if (mode === 'Существующий') {
        planId = plans.find((p) => p.name === selectedPlanName)?.id ?? '';
      } else {
        setUploading(true);
        const imageUrl = await uploadBuildingPlanImage(file!);
        setUploading(false);
        const created = await insertBuildingPlan({ name: name.trim(), imageUrl });
        planId = created.id;
      }
      await onAttached(planId);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось привязать план'));
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Планировка здания">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {plans.length > 0 && (
          <ToggleGroup label="Источник" options={['Существующий', 'Новый']} value={mode} onChange={(v) => setMode(v as typeof mode)} />
        )}

        {mode === 'Существующий' ? (
          <Select
            label="План здания"
            options={plans.map((p) => p.name)}
            value={selectedPlanName}
            onChange={setSelectedPlanName}
          />
        ) : (
          <>
            <Input
              label="Название"
              placeholder="Например, Полтавская 10 — 2 этаж"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-muted">Изображение плана</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="secondary"
                icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-fit"
              >
                {file ? file.name : 'Загрузить изображение'}
              </Button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Сохраняем...' : 'Привязать'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
