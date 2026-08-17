import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { PhotoThumbGrid } from './PhotoThumbGrid';
import { PhotoLightbox } from './PhotoLightbox';
import { BriefBuildingPlans } from './BriefBuildingPlans';
import {
  briefPhotoCategories,
  briefPhotoCategoryLabels,
  emptyBriefPhotos,
  PLAN_REQUEST_NOTE,
  pruneEmptyOrphanChanges,
  type Brief,
  type BriefCategoryPhotos,
  type BriefPhotoCategory,
  type PhotoChange,
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
  photos: emptyBriefPhotos(),
};

function briefToForm(b: Brief) {
  return {
    objectId: b.objectId,
    recipientName: b.recipientName,
    recipientPhone: b.recipientPhone,
    photos: b.photos,
  };
}

// Кнопка загрузки без превью — сами фото со своими отметками рисует
// PhotoThumbGrid рядом, эта только открывает выбор файлов.
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
// фото "сейчас" (или "после") внутри конкретной категории.
type LightboxState = { kind: 'pin'; category: BriefPhotoCategory; url: string } | null;

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
      // Заполненные правки (changes) не трогаем — удаляемое фото могло быть
      // лишь одним из мест, где правку отмечали. Уходят только пустышки,
      // оставшиеся вообще без меток.
      const restMarkers = { ...c.markers };
      delete restMarkers[url];
      return pruneEmptyOrphanChanges({ ...c, beforeUrls: c.beforeUrls.filter((u) => u !== url), markers: restMarkers });
    });
    setLightbox((lb) => (lb?.kind === 'pin' && lb.url === url ? null : lb));
  }

  function removeAfterPhoto(category: BriefPhotoCategory, url: string) {
    updateCategory(category, (c) => {
      const restMarkers = { ...c.markers };
      delete restMarkers[url];
      return pruneEmptyOrphanChanges({ ...c, afterUrls: c.afterUrls.filter((u) => u !== url), markers: restMarkers });
    });
    setLightbox((lb) => (lb?.kind === 'pin' && lb.url === url ? null : lb));
  }

  // Новая правка (описание печатается впервые) + метка на конкретном фото.
  function createChangeWithMarker(category: BriefPhotoCategory, url: string, x: number, y: number) {
    const changeId = crypto.randomUUID();
    updateCategory(category, (c) => ({
      ...c,
      changes: [
        ...c.changes,
        { id: changeId, comment: '', referenceImageUrl: '', referenceDescription: '', referenceUrl: '' },
      ],
      markers: { ...c.markers, [url]: [...(c.markers[url] ?? []), { id: crypto.randomUUID(), changeId, x, y }] },
    }));
  }

  // Метка на уже существующую правку — комментарий/референс не дублируются,
  // просто ещё одна точка со ссылкой на тот же changeId. Именно это заменяет
  // прежнюю кнопку "Скопировать": вместо копирования текста в новый объект
  // теперь несколько меток ссылаются на один и тот же текст.
  function attachExistingChange(category: BriefPhotoCategory, url: string, changeId: string, x: number, y: number) {
    updateCategory(category, (c) => ({
      ...c,
      markers: { ...c.markers, [url]: [...(c.markers[url] ?? []), { id: crypto.randomUUID(), changeId, x, y }] },
    }));
  }

  function updateChange(category: BriefPhotoCategory, changeId: string, patch: Partial<PhotoChange>) {
    updateCategory(category, (c) => ({
      ...c,
      changes: c.changes.map((ch) => (ch.id === changeId ? { ...ch, ...patch } : ch)),
    }));
  }

  // Убирает метку с конкретного фото — саму правку (текст/референс) не
  // трогает, она может быть отмечена и на других фото. Исключение —
  // совсем пустая правка, оставшаяся вообще без меток: её незачем держать
  // в списке выбора (см. pruneEmptyOrphanChanges).
  function removeMarker(category: BriefPhotoCategory, url: string, markerId: string) {
    updateCategory(category, (c) =>
      pruneEmptyOrphanChanges({
        ...c,
        markers: { ...c.markers, [url]: (c.markers[url] ?? []).filter((m) => m.id !== markerId) },
      }),
    );
  }

  const canSubmit = form.objectId.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    // Чистим пустышки перед сохранением — иначе правка, заведённая кликом по
    // фото и так и не заполненная, уедет в базу и всплывёт в списке выбора
    // при следующем открытии.
    const photos = { ...form.photos };
    for (const category of briefPhotoCategories) photos[category] = pruneEmptyOrphanChanges(photos[category]);
    const payload = {
      objectId: form.objectId,
      recipientName: form.recipientName,
      recipientPhone: form.recipientPhone,
      photos,
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
          <span className="text-sm font-semibold text-ink">Планировки</span>
          <p className="text-sm text-ink-muted">{PLAN_REQUEST_NOTE}</p>
          {selectedObject ? (
            <BriefBuildingPlans object={selectedObject} />
          ) : (
            <p className="text-sm text-ink-faint">Сначала выберите объект</p>
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
                  items={cat.beforeUrls.map((url) => ({ url, pinCount: (cat.markers[url] ?? []).length }))}
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
                <span className="text-xs uppercase tracking-wide text-ink-faint">Должно стать (референс) — отметь при желании</span>
                <PhotoThumbGrid
                  items={cat.afterUrls.map((url) => ({ url, pinCount: (cat.markers[url] ?? []).length }))}
                  onOpen={(url) => setLightbox({ kind: 'pin', category, url })}
                  onRemove={(url) => removeAfterPhoto(category, url)}
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
          markers={form.photos[lightbox.category].markers[lightbox.url] ?? []}
          changes={form.photos[lightbox.category].changes}
          editable
          onCreateChange={(x, y) => createChangeWithMarker(lightbox.category, lightbox.url, x, y)}
          onAttachChange={(changeId, x, y) => attachExistingChange(lightbox.category, lightbox.url, changeId, x, y)}
          onChangeComment={(changeId, comment) => updateChange(lightbox.category, changeId, { comment })}
          onRemoveMarker={(markerId) => removeMarker(lightbox.category, lightbox.url, markerId)}
          onChangeReferenceImage={(changeId, referenceImageUrl) =>
            updateChange(lightbox.category, changeId, { referenceImageUrl })
          }
          onChangeReferenceDescription={(changeId, referenceDescription) =>
            updateChange(lightbox.category, changeId, { referenceDescription })
          }
          onChangeReferenceUrl={(changeId, referenceUrl) => updateChange(lightbox.category, changeId, { referenceUrl })}
          onClose={() => setLightbox(null)}
        />
      )}
    </Modal>
  );
}
