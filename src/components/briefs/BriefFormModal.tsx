import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import type { Brief } from '../../data/briefs';
import type { RealtyObject } from '../../data/objects';
import { insertBrief, updateBrief } from '../../lib/briefsApi';
import { uploadObjectImage } from '../../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function objectLabel(o: RealtyObject): string {
  return o.name ? `${o.name} — ${o.address}` : o.address;
}

const emptyForm = {
  objectId: '',
  beforePhotoUrls: [] as string[],
  afterPhotoUrls: [] as string[],
  interiorChanges: '',
  facadeChanges: '',
};

function briefToForm(b: Brief) {
  return {
    objectId: b.objectId,
    beforePhotoUrls: b.beforePhotoUrls,
    afterPhotoUrls: b.afterPhotoUrls,
    interiorChanges: b.interiorChanges,
    facadeChanges: b.facadeChanges,
  };
}

// Галерея загруженных фото с кнопкой добавления — одна и та же вёрстка для
// "до" и "после", разница только в том, какой стейт она обновляет.
function PhotoGallery({
  label,
  urls,
  uploading,
  onAdd,
  onRemove,
}: {
  label: string;
  urls: string[];
  uploading: boolean;
  onAdd: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {urls.map((url) => (
          <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control bg-surface-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(url)}
              aria-label="Удалить фото"
              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onAdd} />
        <Button
          type="button"
          variant="secondary"
          icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Загружаем...' : 'Добавить'}
        </Button>
      </div>
    </div>
  );
}

interface BriefFormModalProps {
  open: boolean;
  // null — создание нового техзадания, иначе редактирование существующего.
  brief: Brief | null;
  objects: RealtyObject[];
  onClose: () => void;
  onSaved: (b: Brief) => void;
}

export function BriefFormModal({ open, brief, objects, onClose, onSaved }: BriefFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(brief ? briefToForm(brief) : emptyForm);
      setSubmitError(null);
    }
  }, [open, brief]);

  async function handleBeforePhotoAdd(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingBefore) return;
    setUploadingBefore(true);
    setSubmitError(null);
    try {
      const url = await uploadObjectImage(file);
      setForm((f) => ({ ...f, beforePhotoUrls: [...f.beforePhotoUrls, url] }));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploadingBefore(false);
    }
  }

  async function handleAfterPhotoAdd(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploadingAfter) return;
    setUploadingAfter(true);
    setSubmitError(null);
    try {
      const url = await uploadObjectImage(file);
      setForm((f) => ({ ...f, afterPhotoUrls: [...f.afterPhotoUrls, url] }));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploadingAfter(false);
    }
  }

  const canSubmit = form.objectId.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      objectId: form.objectId,
      beforePhotoUrls: form.beforePhotoUrls,
      afterPhotoUrls: form.afterPhotoUrls,
      interiorChanges: form.interiorChanges,
      facadeChanges: form.facadeChanges,
    };
    try {
      const saved = brief ? await updateBrief(brief.id, payload) : await insertBrief(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить техзадание'));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedObject = objects.find((o) => o.id === form.objectId);

  return (
    <Modal open={open} onClose={onClose} title={brief ? 'Редактировать техзадание' : 'Новое техзадание'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Объект"
          placeholder="Выберите объект"
          options={objects.map(objectLabel)}
          value={selectedObject ? objectLabel(selectedObject) : ''}
          onChange={(v) => {
            const obj = objects.find((o) => objectLabel(o) === v);
            setForm((f) => ({ ...f, objectId: obj?.id ?? '' }));
          }}
        />

        <PhotoGallery
          label="Фото «до»"
          urls={form.beforePhotoUrls}
          uploading={uploadingBefore}
          onAdd={handleBeforePhotoAdd}
          onRemove={(url) => setForm((f) => ({ ...f, beforePhotoUrls: f.beforePhotoUrls.filter((u) => u !== url) }))}
        />

        <PhotoGallery
          label="Фото «после» (референс)"
          urls={form.afterPhotoUrls}
          uploading={uploadingAfter}
          onAdd={handleAfterPhotoAdd}
          onRemove={(url) => setForm((f) => ({ ...f, afterPhotoUrls: f.afterPhotoUrls.filter((u) => u !== url) }))}
        />

        <Textarea
          label="Изменения внутри помещений"
          placeholder="Например: демонтаж перегородки между 201 и 202, новая стяжка пола на 2 этаже..."
          rows={4}
          value={form.interiorChanges}
          onChange={(e) => setForm((f) => ({ ...f, interiorChanges: e.target.value }))}
        />

        <Textarea
          label="Изменения на фасаде"
          placeholder="Например: замена витражного остекления по всему первому этажу..."
          rows={4}
          value={form.facadeChanges}
          onChange={(e) => setForm((f) => ({ ...f, facadeChanges: e.target.value }))}
        />

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Сохраняем...' : brief ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
