import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, X, Plus, ImageOff } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import type { EstimatePosition, EstimateProductRef } from '../../data/estimates';
import { uploadObjectImage } from '../../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function positionToForm(p: EstimatePosition) {
  return { title: p.title, opsText: p.ops.join('\n'), products: p.products };
}

const emptyForm = { title: '', opsText: '', products: [] as EstimateProductRef[] };

interface EstimatePositionFormModalProps {
  open: boolean;
  position: EstimatePosition | null;
  onClose: () => void;
  onSaved: (position: EstimatePosition) => void;
}

// Позиция сметы — название + референсы на товары (фото + ссылка, "Дверь",
// "Замок" и т.п. — сколько нужно) + состав работ. Фото референсов грузятся в
// тот же публичный бакет, что и фото объекта (uploadObjectImage) — свой
// отдельный бакет под сметы пока не нужен, это тоже просто публичная картинка.
export function EstimatePositionFormModal({ open, position, onClose, onSaved }: EstimatePositionFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (open) {
      setForm(position ? positionToForm(position) : emptyForm);
      setSubmitError(null);
    }
  }, [open, position]);

  function addProduct() {
    setForm((f) => ({ ...f, products: [...f.products, { id: crypto.randomUUID(), label: '', photoUrl: '', link: '' }] }));
  }

  function removeProduct(id: string) {
    setForm((f) => ({ ...f, products: f.products.filter((p) => p.id !== id) }));
  }

  function updateProduct(id: string, patch: Partial<EstimateProductRef>) {
    setForm((f) => ({ ...f, products: f.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }

  async function handlePhotoSelect(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProductId(id);
    setSubmitError(null);
    try {
      const url = await uploadObjectImage(file);
      updateProduct(id, { photoUrl: url });
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploadingProductId(null);
      const input = fileInputRefs.current[id];
      if (input) input.value = '';
    }
  }

  const canSubmit = form.title.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const ops = form.opsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const saved: EstimatePosition = {
      id: position?.id ?? crypto.randomUUID(),
      title: form.title.trim(),
      ops,
      products: form.products,
    };
    onSaved(saved);
    setSubmitting(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={position ? 'Редактировать позицию' : 'Новая позиция'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Название работы"
          placeholder="Например, Замена входных дверей"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-muted">Товары/референсы (фото + ссылка)</span>
          {form.products.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-control border border-border p-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-5 w-5 text-ink-faint" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input
                  placeholder="Например, Дверь или Замок"
                  value={p.label}
                  onChange={(e) => updateProduct(p.id, { label: e.target.value })}
                />
                <Input
                  placeholder="Ссылка на товар (https://...)"
                  value={p.link}
                  onChange={(e) => updateProduct(p.id, { link: e.target.value })}
                />
                <input
                  ref={(el) => {
                    fileInputRefs.current[p.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoSelect(p.id, e)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  icon={uploadingProductId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  onClick={() => fileInputRefs.current[p.id]?.click()}
                  disabled={uploadingProductId === p.id}
                  className="w-fit"
                >
                  {uploadingProductId === p.id ? 'Загружаем...' : p.photoUrl ? 'Заменить фото' : 'Загрузить фото'}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => removeProduct(p.id)}
                aria-label="Удалить товар"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={addProduct}>
            Добавить товар
          </Button>
        </div>

        <Textarea
          label="Состав работ (каждый пункт с новой строки)"
          placeholder={'Демонтаж старой двери\nМонтаж новой двери\nГерметизация примыканий'}
          value={form.opsText}
          onChange={(e) => setForm((f) => ({ ...f, opsText: e.target.value }))}
          rows={6}
        />

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {position ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
