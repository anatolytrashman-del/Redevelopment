import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { lineItemMaterialTotal, lineItemTotal, lineItemWorkTotal, type EstimateLineItem } from '../../data/estimates';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function itemToForm(item: EstimateLineItem) {
  return { ...item };
}

const emptyForm: Omit<EstimateLineItem, 'id'> = {
  zone: '',
  workType: '',
  unit: '',
  length: null,
  width: null,
  height: null,
  volume: null,
  quantity: null,
  workUnitPrice: null,
  materialUnitPrice: null,
  note: '',
};

function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

interface EstimateLineItemFormModalProps {
  open: boolean;
  item: EstimateLineItem | null;
  onClose: () => void;
  onSaved: (item: EstimateLineItem) => Promise<void>;
}

// Строка построчной сметы — вид работ, объём/размеры (для справки, не
// участвуют в расчёте) и цена работ/материалов за единицу измерения. Кол-во
// — то, на что реально умножаются цены (см. lineItemWorkTotal и т.п.), а не
// площадь/объём, потому что у части строк (например, "Мелкие строительные
// работы", ч.ч.) единица измерения вообще не площадь.
export function EstimateLineItemFormModal({ open, item, onClose, onSaved }: EstimateLineItemFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(item ? itemToForm(item) : emptyForm);
      setSubmitError(null);
    }
  }, [open, item]);

  const canSubmit = form.workType.trim().length > 0;

  const previewWork = lineItemWorkTotal(form as EstimateLineItem);
  const previewMaterial = lineItemMaterialTotal(form as EstimateLineItem);
  const previewTotal = lineItemTotal(form as EstimateLineItem);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const saved: EstimateLineItem = {
      id: item?.id ?? crypto.randomUUID(),
      ...form,
      zone: form.zone.trim(),
      workType: form.workType.trim(),
      unit: form.unit.trim(),
      note: form.note.trim(),
    };
    try {
      await onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить строку'));
    } finally {
      setSubmitting(false);
    }
  }

  function numField(key: 'length' | 'width' | 'height' | 'volume' | 'quantity' | 'workUnitPrice' | 'materialUnitPrice') {
    return {
      value: form[key] ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value === '' ? null : Number(e.target.value) })),
    };
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Редактировать строку' : 'Новая строка сметы'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Вид работ"
          placeholder="Например, Укладка керамогранита"
          value={form.workType}
          onChange={(e) => setForm((f) => ({ ...f, workType: e.target.value }))}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Помещение / зона"
            placeholder="Например, 1 этаж — коридор"
            value={form.zone}
            onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
          />
          <Input
            label="Ед. изм."
            placeholder="м², шт., м.п. ..."
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Длина, м" type="number" {...numField('length')} />
          <Input label="Ширина, м" type="number" {...numField('width')} />
          <Input label="Высота, м" type="number" {...numField('height')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Площадь/объём, м²/м³" type="number" {...numField('volume')} />
          <Input label="Кол-во (для расчёта)" type="number" {...numField('quantity')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Цена работ за ед., BYN" type="number" {...numField('workUnitPrice')} />
          <Input label="Цена материалов за ед., BYN" type="number" {...numField('materialUnitPrice')} />
        </div>

        <div className="flex flex-col gap-1 rounded-control border border-border bg-surface-muted p-3 text-sm">
          <div className="flex items-center justify-between text-ink-muted">
            <span>Стоимость работ</span>
            <span className="font-medium text-ink">{formatMoney(previewWork)} Br</span>
          </div>
          <div className="flex items-center justify-between text-ink-muted">
            <span>Стоимость материалов</span>
            <span className="font-medium text-ink">{formatMoney(previewMaterial)} Br</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1 font-semibold text-ink">
            <span>Итого</span>
            <span>{formatMoney(previewTotal)} Br</span>
          </div>
        </div>

        <Textarea
          label="Примечание"
          placeholder="Необязательно"
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          rows={2}
        />

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting} icon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}>
            {submitting ? 'Сохраняем...' : item ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
