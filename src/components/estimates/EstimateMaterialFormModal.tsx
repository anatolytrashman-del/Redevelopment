import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import type { EstimateMaterial } from '../../data/estimates';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm: Omit<EstimateMaterial, 'id'> = { name: '', unit: '', quantity: null, note: '' };

interface EstimateMaterialFormModalProps {
  open: boolean;
  material: EstimateMaterial | null;
  onClose: () => void;
  onSaved: (material: EstimateMaterial) => Promise<void>;
}

// Позиция списка материалов раздела — название/ед./кол-во/заметка, без
// цены (это не построчная смета, снабжение — что закупить и сколько,
// см. комментарий у EstimateMaterial в data/estimates.ts).
export function EstimateMaterialFormModal({ open, material, onClose, onSaved }: EstimateMaterialFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(material ? { name: material.name, unit: material.unit, quantity: material.quantity, note: material.note } : emptyForm);
      setSubmitError(null);
    }
  }, [open, material]);

  const canSubmit = form.name.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const saved: EstimateMaterial = {
      id: material?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      unit: form.unit.trim(),
      quantity: form.quantity,
      note: form.note.trim(),
    };
    try {
      await onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить материал'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={material ? 'Редактировать материал' : 'Новый материал'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Название"
          placeholder="Например, Керамогранит 600×600"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Ед. изм."
            placeholder="м², шт., уп. ..."
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          />
          <Input
            label="Кол-во"
            type="number"
            value={form.quantity ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value === '' ? null : Number(e.target.value) }))}
          />
        </div>
        <Textarea
          label="Заметка"
          placeholder="Поставщик, срок, особенности..."
          rows={2}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
        />

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting} icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {submitting ? 'Сохраняем...' : material ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
