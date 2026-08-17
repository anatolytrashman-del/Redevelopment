import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { PhotoThumbGrid } from './PhotoThumbGrid';
import { HeroOrGrid } from './HeroOrGrid';
import { PhotoLightbox } from './PhotoLightbox';
import {
  briefPhotoCategories,
  briefPhotoCategoryLabels,
  emptyBriefPhotos,
  FACADE_REFERENCE_CAPTION,
  MAX_BRIEF_PLAN_URLS,
  type Brief,
  type BriefCategoryPhotos,
  type BriefPhotoCategory,
} from '../../data/briefs';
import type { RealtyObject } from '../../data/objects';
import type { Contractor } from '../../data/contractors';
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
  recipientName: '',
  recipientPhone: '',
  planUrls: [] as string[],
  photos: emptyBriefPhotos(),
};

function briefToForm(b: Brief) {
  return {
    objectId: b.objectId,
    recipientName: b.recipientName,
    recipientPhone: b.recipientPhone,
    planUrls: b.planUrls,
    photos: b.photos,
  };
}

// Кнопка загрузки без превью — сами фото со своими отметками рисуют
// PhotoThumbGrid/HeroOrGrid рядом, эта только открывает выбор файлов.
function UploadTile({
  label,
  uploading,
  multiple = true,
  onSelect,
}: {
  label: string;
  uploading: boolean;
  multiple?: boolean;
  onSelect: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={onSelect} />
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

// Какое именно фото открыто крупным планом. "pin" — редактируем точки на
// фото "сейчас" внутри конкретной категории, "plain" — просто увеличенный
// просмотр (планировка или референс "после").
type LightboxState = { kind: 'pin'; category: BriefPhotoCategory; url: string } | { kind: 'plain'; url: string } | null;

interface BriefFormModalProps {
  open: boolean;
  // null — создание нового техзадания, иначе редактирование существующего.
  brief: Brief | null;
  objects: RealtyObject[];
  contractors: Contractor[];
  onClose: () => void;
  onSaved: (b: Brief) => void;
}

export function BriefFormModal({ open, brief, objects, contractors, onClose, onSaved }: BriefFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // "plans" / "facade:before" / "offices:after" — какая именно кнопка сейчас грузит фото.
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  useEffect(() => {
    if (open) {
      setForm(brief ? briefToForm(brief) : emptyForm);
      setSubmitError(null);
      setLightbox(null);
    }
  }, [open, brief]);

  async function uploadMany(files: File[], onEach: (url: string) => void): Promise<string[]> {
    const failed: string[] = [];
    for (const file of files) {
      try {
        const url = await uploadObjectImage(file);
        onEach(url);
      } catch (err) {
        failed.push(`${file.name} — ${errorMessage(err, 'не удалось загрузить')}`);
      }
    }
    return failed;
  }

  async function handlePlansAdd(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingKey('plans');
    setSubmitError(null);
    const remainingSlots = MAX_BRIEF_PLAN_URLS - form.planUrls.length;
    const failed = await uploadMany(files.slice(0, Math.max(remainingSlots, 0)), (url) =>
      setForm((f) => ({ ...f, planUrls: [...f.planUrls, url] })),
    );
    setUploadingKey(null);
    if (failed.length > 0) setSubmitError(`Не удалось загрузить: ${failed.join('; ')}.`);
  }

  function removePlan(url: string) {
    setForm((f) => ({ ...f, planUrls: f.planUrls.filter((u) => u !== url) }));
  }

  function updateCategory(category: BriefPhotoCategory, updater: (c: BriefCategoryPhotos) => BriefCategoryPhotos) {
    setForm((f) => ({ ...f, photos: { ...f.photos, [category]: updater(f.photos[category]) } }));
  }

  async function handleBeforeAdd(category: BriefPhotoCategory, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingKey(`${category}:before`);
    setSubmitError(null);
    const failed = await uploadMany(files, (url) => updateCategory(category, (c) => ({ ...c, beforeUrls: [...c.beforeUrls, url] })));
    setUploadingKey(null);
    if (failed.length > 0) setSubmitError(`Не удалось загрузить: ${failed.join('; ')}.`);
  }

  async function handleAfterAdd(category: BriefPhotoCategory, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadingKey(`${category}:after`);
    setSubmitError(null);
    const failed = await uploadMany(files, (url) => updateCategory(category, (c) => ({ ...c, afterUrls: [...c.afterUrls, url] })));
    setUploadingKey(null);
    if (failed.length > 0) setSubmitError(`Не удалось загрузить: ${failed.join('; ')}.`);
  }

  function removeBeforePhoto(category: BriefPhotoCategory, url: string) {
    updateCategory(category, (c) => {
      const restPins = { ...c.pins };
      delete restPins[url];
      return { ...c, beforeUrls: c.beforeUrls.filter((u) => u !== url), pins: restPins };
    });
    setLightbox((lb) => (lb?.kind === 'pin' && lb.url === url ? null : lb));
  }

  function removeAfterPhoto(category: BriefPhotoCategory, url: string) {
    updateCategory(category, (c) => ({ ...c, afterUrls: c.afterUrls.filter((u) => u !== url) }));
  }

  function addPin(category: BriefPhotoCategory, url: string, x: number, y: number) {
    updateCategory(category, (c) => ({
      ...c,
      pins: {
        ...c.pins,
        [url]: [...(c.pins[url] ?? []), { id: crypto.randomUUID(), x, y, comment: '', referenceImageUrl: '' }],
      },
    }));
  }

  function changePinComment(category: BriefPhotoCategory, url: string, pinId: string, comment: string) {
    updateCategory(category, (c) => ({
      ...c,
      pins: { ...c.pins, [url]: (c.pins[url] ?? []).map((p) => (p.id === pinId ? { ...p, comment } : p)) },
    }));
  }

  function changePinReferenceImage(category: BriefPhotoCategory, url: string, pinId: string, referenceImageUrl: string) {
    updateCategory(category, (c) => ({
      ...c,
      pins: { ...c.pins, [url]: (c.pins[url] ?? []).map((p) => (p.id === pinId ? { ...p, referenceImageUrl } : p)) },
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
    const payload = {
      objectId: form.objectId,
      recipientName: form.recipientName,
      recipientPhone: form.recipientPhone,
      planUrls: form.planUrls,
      photos: form.photos,
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

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <span className="text-sm font-semibold text-ink">Кому направлено</span>
          {contractors.length > 0 && (
            <Select
              label="Подрядчик из базы (необязательно)"
              placeholder="Выбрать из базы"
              options={contractors.map((c) => c.name)}
              value=""
              onChange={(v) => {
                const c = contractors.find((x) => x.name === v);
                if (c) setForm((f) => ({ ...f, recipientName: c.name, recipientPhone: c.phone }));
              }}
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Имя"
              placeholder="Имя инженера"
              value={form.recipientName}
              onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
            />
            <Input
              label="Телефон"
              placeholder="+375 29 ..."
              type="tel"
              value={form.recipientPhone}
              onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm font-semibold text-ink">Планировки (до {MAX_BRIEF_PLAN_URLS})</span>
          <PhotoThumbGrid
            items={form.planUrls.map((url) => ({ url }))}
            onOpen={(url) => setLightbox({ kind: 'plain', url })}
            onRemove={removePlan}
          />
          {form.planUrls.length < MAX_BRIEF_PLAN_URLS && (
            <UploadTile label="Добавить планировки" uploading={uploadingKey === 'plans'} onSelect={handlePlansAdd} />
          )}
        </div>

        {briefPhotoCategories.map((category) => {
          const cat = form.photos[category];
          return (
            <div key={category} className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="text-sm font-semibold text-ink">{briefPhotoCategoryLabels[category]}</span>

              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide text-ink-faint">Сейчас — отметь, что менять</span>
                <PhotoThumbGrid
                  items={cat.beforeUrls.map((url) => ({ url, pinCount: (cat.pins[url] ?? []).length }))}
                  onOpen={(url) => setLightbox({ kind: 'pin', category, url })}
                  onRemove={(url) => removeBeforePhoto(category, url)}
                />
                <UploadTile
                  label={cat.beforeUrls.length > 0 ? 'Добавить ещё фото' : 'Добавить фото'}
                  uploading={uploadingKey === `${category}:before`}
                  onSelect={(e) => handleBeforeAdd(category, e)}
                />
              </div>

              <p className="text-xs text-ink-faint">
                ↓ Отмеченные точками изменения приводят к результату ниже
              </p>

              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide text-ink-faint">Должно стать (референс)</span>
                <HeroOrGrid
                  urls={cat.afterUrls}
                  onOpen={(url) => setLightbox({ kind: 'plain', url })}
                  onRemove={(url) => removeAfterPhoto(category, url)}
                  emptyLabel="Фото не загружены"
                  overlayCaption={category === 'facade' ? FACADE_REFERENCE_CAPTION : undefined}
                />
                <UploadTile
                  label="Добавить"
                  uploading={uploadingKey === `${category}:after`}
                  onSelect={(e) => handleAfterAdd(category, e)}
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

      {lightbox?.kind === 'pin' && (
        <PhotoLightbox
          url={lightbox.url}
          pins={form.photos[lightbox.category].pins[lightbox.url] ?? []}
          editable
          onAddPin={(x, y) => addPin(lightbox.category, lightbox.url, x, y)}
          onChangeComment={(pinId, comment) => changePinComment(lightbox.category, lightbox.url, pinId, comment)}
          onRemovePin={(pinId) => removePin(lightbox.category, lightbox.url, pinId)}
          onChangeReferenceImage={(pinId, url) => changePinReferenceImage(lightbox.category, lightbox.url, pinId, url)}
          onClose={() => setLightbox(null)}
        />
      )}
      {lightbox?.kind === 'plain' && <PhotoLightbox url={lightbox.url} onClose={() => setLightbox(null)} />}
    </Modal>
  );
}
