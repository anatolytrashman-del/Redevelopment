import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { AnnotatedPhoto } from './AnnotatedPhoto';
import {
  briefPhotoCategories,
  briefPhotoCategoryLabels,
  emptyBriefPhotos,
  type Brief,
  type BriefCategoryPhotos,
  type BriefPhotoCategory,
} from '../../data/briefs';
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
  photos: emptyBriefPhotos(),
};

function briefToForm(b: Brief) {
  return {
    objectId: b.objectId,
    photos: b.photos,
  };
}

// Кнопка загрузки без превью — сами фото со своими отметками рисует
// AnnotatedPhoto/PlainGallery рядом, эта только открывает выбор файла.
function UploadTile({
  label,
  uploading,
  onSelect,
}: {
  label: string;
  uploading: boolean;
  onSelect: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onSelect} />
      <Button
        type="button"
        variant="secondary"
        icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Загружаем...' : label}
      </Button>
    </div>
  );
}

// Простая галерея без отметок — для фото "после": это референс целевого
// уровня отделки, комментировать точками там нечего.
function PlainGallery({
  urls,
  uploading,
  onAdd,
  onRemove,
}: {
  urls: string[];
  uploading: boolean;
  onAdd: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (url: string) => void;
}) {
  return (
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
      <UploadTile label="Добавить" uploading={uploading} onSelect={onAdd} />
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
  // "facade:before" / "offices:after" — какая именно кнопка сейчас грузит фото.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(brief ? briefToForm(brief) : emptyForm);
      setSubmitError(null);
    }
  }, [open, brief]);

  function updateCategory(category: BriefPhotoCategory, updater: (c: BriefCategoryPhotos) => BriefCategoryPhotos) {
    setForm((f) => ({ ...f, photos: { ...f.photos, [category]: updater(f.photos[category]) } }));
  }

  async function handleBeforeAdd(category: BriefPhotoCategory, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingKey(`${category}:before`);
    setSubmitError(null);
    try {
      const url = await uploadObjectImage(file);
      updateCategory(category, (c) => ({ ...c, beforeUrls: [...c.beforeUrls, url] }));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleAfterAdd(category: BriefPhotoCategory, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingKey(`${category}:after`);
    setSubmitError(null);
    try {
      const url = await uploadObjectImage(file);
      updateCategory(category, (c) => ({ ...c, afterUrls: [...c.afterUrls, url] }));
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploadingKey(null);
    }
  }

  function removeBeforePhoto(category: BriefPhotoCategory, url: string) {
    updateCategory(category, (c) => {
      const restPins = { ...c.pins };
      delete restPins[url];
      return { ...c, beforeUrls: c.beforeUrls.filter((u) => u !== url), pins: restPins };
    });
  }

  function removeAfterPhoto(category: BriefPhotoCategory, url: string) {
    updateCategory(category, (c) => ({ ...c, afterUrls: c.afterUrls.filter((u) => u !== url) }));
  }

  function addPin(category: BriefPhotoCategory, url: string, x: number, y: number) {
    updateCategory(category, (c) => ({
      ...c,
      pins: { ...c.pins, [url]: [...(c.pins[url] ?? []), { id: crypto.randomUUID(), x, y, comment: '' }] },
    }));
  }

  function changePinComment(category: BriefPhotoCategory, url: string, pinId: string, comment: string) {
    updateCategory(category, (c) => ({
      ...c,
      pins: { ...c.pins, [url]: (c.pins[url] ?? []).map((p) => (p.id === pinId ? { ...p, comment } : p)) },
    }));
  }

  function removePin(category: BriefPhotoCategory, url: string, pinId: string) {
    updateCategory(category, (c) => ({
      ...c,
      pins: { ...c.pins, [url]: (c.pins[url] ?? []).filter((p) => p.id !== pinId) },
    }));
  }

  const canSubmit = form.objectId.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = { objectId: form.objectId, photos: form.photos };
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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

        {briefPhotoCategories.map((category) => {
          const cat = form.photos[category];
          return (
            <div key={category} className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="text-sm font-semibold text-ink">{briefPhotoCategoryLabels[category]}</span>

              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide text-ink-faint">До</span>
                {cat.beforeUrls.map((url) => (
                  <AnnotatedPhoto
                    key={url}
                    url={url}
                    pins={cat.pins[url] ?? []}
                    editable
                    onAddPin={(x, y) => addPin(category, url, x, y)}
                    onChangeComment={(pinId, comment) => changePinComment(category, url, pinId, comment)}
                    onRemovePin={(pinId) => removePin(category, url, pinId)}
                    onRemovePhoto={() => removeBeforePhoto(category, url)}
                  />
                ))}
                <UploadTile
                  label={cat.beforeUrls.length > 0 ? 'Добавить ещё фото «до»' : 'Добавить фото «до»'}
                  uploading={uploadingKey === `${category}:before`}
                  onSelect={(e) => handleBeforeAdd(category, e)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide text-ink-faint">После (референс)</span>
                <PlainGallery
                  urls={cat.afterUrls}
                  uploading={uploadingKey === `${category}:after`}
                  onAdd={(e) => handleAfterAdd(category, e)}
                  onRemove={(url) => removeAfterPhoto(category, url)}
                />
              </div>
            </div>
          );
        })}

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
