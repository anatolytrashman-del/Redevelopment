import { useEffect, useRef, useState } from 'react';
import { Loader2, ImageOff, FileText, Upload, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { AddableSelect } from '../ui/AddableSelect';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { contactChannels, pricePerMeter, type ContactChannel, type ObjectDocumentFile, type RealtyObject } from '../../data/objects';
import { insertObject, updateObject, uploadObjectDocument, uploadObjectImage } from '../../lib/objectsApi';

const MAX_PHOTOS = 10;
const MAX_FLOOR_PLANS = 10;
const MAX_RENDER_IMAGES = 10;

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

const emptyForm = {
  name: '',
  status: '',
  address: '',
  area: '',
  startPrice: '',
  photoUrls: [] as string[],
  floorPlanUrls: [] as string[],
  listingUrl: '',
  owner: '',
  ownerContact: '',
  contactName: '',
  contactPosition: '',
  contactChannel: '' as ContactChannel | '',
  notes: '',
  landingSlug: '',
  renderImageUrls: [] as string[],
  intentAgreementFile: null as ObjectDocumentFile | null,
  mapEmbedUrl: '',
  priority: false,
};

function objectToForm(o: RealtyObject) {
  return {
    name: o.name,
    status: o.status,
    address: o.address,
    area: String(o.area),
    startPrice: String(o.startPrice),
    photoUrls: o.photoUrls,
    floorPlanUrls: o.floorPlanUrls,
    listingUrl: o.listingUrl,
    owner: o.owner,
    ownerContact: o.ownerContact,
    contactName: o.contactName,
    contactPosition: o.contactPosition,
    contactChannel: o.contactChannel,
    notes: o.notes,
    landingSlug: o.landingSlug,
    renderImageUrls: o.renderImageUrls,
    intentAgreementFile: o.intentAgreementFile,
    mapEmbedUrl: o.mapEmbedUrl,
    priority: o.priority,
  };
}

interface ObjectFormModalProps {
  open: boolean;
  onClose: () => void;
  editing?: RealtyObject | null;
  // Известные статусы (пресет + фактически встречающиеся значения) —
  // считает родитель по всем объектам, тот же паттерн, что knownTypes у
  // PledgeFormModal.
  knownStatuses: string[];
  onSaved: (obj: RealtyObject) => void;
}

export function ObjectFormModal({ open, onClose, editing, knownStatuses, onSaved }: ObjectFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [floorPlanUploadError, setFloorPlanUploadError] = useState<string | null>(null);
  const [uploadingRenderImage, setUploadingRenderImage] = useState(false);
  const [renderImageUploadError, setRenderImageUploadError] = useState<string | null>(null);
  const [uploadingAgreement, setUploadingAgreement] = useState(false);
  const [agreementUploadError, setAgreementUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);
  const renderImageInputRef = useRef<HTMLInputElement>(null);
  const agreementInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? objectToForm(editing) : emptyForm);
    setSubmitError(null);
    setUploadError(null);
    setFloorPlanUploadError(null);
  }, [open, editing]);

  const canSubmit = form.address && form.area && form.startPrice && form.owner && form.ownerContact;

  async function handlePhotosSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    const failed: string[] = [];
    let remainingSlots = MAX_PHOTOS - form.photoUrls.length;

    for (const file of files) {
      if (remainingSlots <= 0) break;
      try {
        const url = await uploadObjectImage(file);
        setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, url] }));
        remainingSlots -= 1;
      } catch (err) {
        failed.push(`${file.name} — ${errorMessage(err, 'не удалось загрузить')}`);
      }
    }

    setUploading(false);
    if (failed.length > 0) {
      setUploadError(`Не удалось загрузить: ${failed.join('; ')}.`);
    }
  }

  function removePhoto(index: number) {
    setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((_, i) => i !== index) }));
  }

  async function handleFloorPlanSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (floorPlanInputRef.current) floorPlanInputRef.current.value = '';
    if (files.length === 0) return;

    setUploadingFloorPlan(true);
    setFloorPlanUploadError(null);
    const failed: string[] = [];
    let remainingSlots = MAX_FLOOR_PLANS - form.floorPlanUrls.length;

    for (const file of files) {
      if (remainingSlots <= 0) break;
      try {
        const url = await uploadObjectImage(file);
        setForm((f) => ({ ...f, floorPlanUrls: [...f.floorPlanUrls, url] }));
        remainingSlots -= 1;
      } catch (err) {
        failed.push(`${file.name} — ${errorMessage(err, 'не удалось загрузить')}`);
      }
    }

    setUploadingFloorPlan(false);
    if (failed.length > 0) {
      setFloorPlanUploadError(`Не удалось загрузить: ${failed.join('; ')}.`);
    }
  }

  function removeFloorPlan(index: number) {
    setForm((f) => ({ ...f, floorPlanUrls: f.floorPlanUrls.filter((_, i) => i !== index) }));
  }

  async function handleRenderImagesSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (renderImageInputRef.current) renderImageInputRef.current.value = '';
    if (files.length === 0) return;

    setUploadingRenderImage(true);
    setRenderImageUploadError(null);
    const failed: string[] = [];
    let remainingSlots = MAX_RENDER_IMAGES - form.renderImageUrls.length;

    for (const file of files) {
      if (remainingSlots <= 0) break;
      try {
        const url = await uploadObjectImage(file);
        setForm((f) => ({ ...f, renderImageUrls: [...f.renderImageUrls, url] }));
        remainingSlots -= 1;
      } catch (err) {
        failed.push(`${file.name} — ${errorMessage(err, 'не удалось загрузить')}`);
      }
    }

    setUploadingRenderImage(false);
    if (failed.length > 0) {
      setRenderImageUploadError(
        `Не удалось загрузить: ${failed.join('; ')}. Если файл большой (рендеры часто весят много) — попробуйте сжать изображение и загрузить снова.`,
      );
    }
  }

  function removeRenderImage(index: number) {
    setForm((f) => ({ ...f, renderImageUrls: f.renderImageUrls.filter((_, i) => i !== index) }));
  }

  async function handleAgreementSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAgreement(true);
    setAgreementUploadError(null);
    try {
      const uploaded = await uploadObjectDocument(file);
      setForm((f) => ({ ...f, intentAgreementFile: { ...uploaded, uploadedAt: new Date().toISOString() } }));
    } catch (err) {
      setAgreementUploadError(errorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setUploadingAgreement(false);
      if (agreementInputRef.current) agreementInputRef.current.value = '';
    }
  }

  function removeAgreement() {
    setForm((f) => ({ ...f, intentAgreementFile: null }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      name: form.name,
      status: form.status,
      address: form.address,
      area: Number(form.area),
      startPrice: Number(form.startPrice),
      photoUrls: form.photoUrls,
      floorPlanUrls: form.floorPlanUrls,
      listingUrl: form.listingUrl,
      owner: form.owner,
      ownerContact: form.ownerContact,
      contactName: form.contactName,
      contactPosition: form.contactPosition,
      contactChannel: form.contactChannel,
      notes: form.notes,
      landingSlug: form.landingSlug.trim(),
      concept: editing?.concept ?? '',
      demandLinks: editing?.demandLinks ?? [],
      inspectionMediaUrl: editing?.inspectionMediaUrl ?? '',
      buildingPlanIds: editing?.buildingPlanIds ?? [],
      buildingSpecs: editing?.buildingSpecs ?? null,
      documents: editing?.documents ?? {},
      renderImageUrls: form.renderImageUrls,
      intentAgreementFile: form.intentAgreementFile,
      mapEmbedUrl: form.mapEmbedUrl,
      priority: form.priority,
    };
    try {
      const saved = editing ? await updateObject(editing.id, payload) : await insertObject(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить объект'));
    } finally {
      setSubmitting(false);
    }
  }

  const formArea = Number(form.area);
  const formPrice = Number(form.startPrice);
  const formPricePerMeter = pricePerMeter(formArea, formPrice);

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Редактировать объект' : 'Новый объект'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Фото (до {MAX_PHOTOS}, листаются слайдером на карточке и в лайтбоксе)</span>
          <div className="flex flex-wrap items-center gap-3">
            {form.photoUrls.map((url, i) => (
              <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label="Удалить фото"
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {form.photoUrls.length < MAX_PHOTOS && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotosSelect}
                />
                <Button
                  type="button"
                  variant="secondary"
                  icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Загружаем...' : 'Добавить'}
                </Button>
              </>
            )}
          </div>
          {uploadError && <p className="text-sm text-danger">{uploadError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Планировки (до {MAX_FLOOR_PLANS})</span>
          <div className="flex flex-wrap items-center gap-3">
            {form.floorPlanUrls.map((url, i) => (
              <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFloorPlan(i)}
                  aria-label="Удалить планировку"
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {form.floorPlanUrls.length < MAX_FLOOR_PLANS && (
              <>
                <input
                  ref={floorPlanInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFloorPlanSelect}
                />
                <Button
                  type="button"
                  variant="secondary"
                  icon={uploadingFloorPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  onClick={() => floorPlanInputRef.current?.click()}
                  disabled={uploadingFloorPlan}
                >
                  {uploadingFloorPlan ? 'Загружаем...' : 'Добавить'}
                </Button>
              </>
            )}
          </div>
          {floorPlanUploadError && <p className="text-sm text-danger">{floorPlanUploadError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Рендеры для слайдера на продающей странице (до {MAX_RENDER_IMAGES})</span>
          <div className="flex flex-wrap items-center gap-3">
            {form.renderImageUrls.map((url, i) => (
              <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeRenderImage(i)}
                  aria-label="Удалить рендер"
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {form.renderImageUrls.length < MAX_RENDER_IMAGES && (
              <>
                <input
                  ref={renderImageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleRenderImagesSelect}
                />
                <Button
                  type="button"
                  variant="secondary"
                  icon={uploadingRenderImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  onClick={() => renderImageInputRef.current?.click()}
                  disabled={uploadingRenderImage}
                >
                  {uploadingRenderImage ? 'Загружаем...' : 'Добавить'}
                </Button>
              </>
            )}
          </div>
          {renderImageUploadError && <p className="text-sm text-danger">{renderImageUploadError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Шаблон соглашения о намерениях (для продающей страницы)</span>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
              {form.intentAgreementFile ? (
                <FileText className="h-5 w-5 text-ink-muted" />
              ) : (
                <ImageOff className="h-5 w-5 text-ink-faint" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {form.intentAgreementFile && (
                <div className="truncate text-sm text-ink">{form.intentAgreementFile.fileName}</div>
              )}
              <input ref={agreementInputRef} type="file" className="hidden" onChange={handleAgreementSelect} />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  icon={uploadingAgreement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  onClick={() => agreementInputRef.current?.click()}
                  disabled={uploadingAgreement}
                >
                  {uploadingAgreement ? 'Загружаем...' : form.intentAgreementFile ? 'Заменить файл' : 'Загрузить файл'}
                </Button>
                {form.intentAgreementFile && (
                  <Button type="button" variant="secondary" onClick={removeAgreement}>
                    Удалить
                  </Button>
                )}
              </div>
            </div>
          </div>
          {agreementUploadError && <p className="text-sm text-danger">{agreementUploadError}</p>}
        </div>

        <Input
          label="Название"
          placeholder="Например, Red One — необязательно"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />

        <AddableSelect
          label="Статус"
          placeholder="Не выбрано"
          options={knownStatuses}
          value={form.status}
          onChange={(v) => setForm((f) => ({ ...f, status: v }))}
          addLabel="+ Добавить статус"
          newPlaceholder="Название статуса"
        />

        <label className="flex w-fit items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.checked }))}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          🔥 Приоритет (первым в списке, с бейджем на превью)
        </label>

        <Input
          label="Адрес"
          placeholder="Город, улица, дом"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Площадь, м²"
            type="number"
            step="0.01"
            placeholder="0"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            required
          />
          <Input
            label="Стартовая цена, $"
            type="number"
            step="0.01"
            placeholder="0"
            value={form.startPrice}
            onChange={(e) => setForm((f) => ({ ...f, startPrice: e.target.value }))}
            required
          />
        </div>

        <div>
          <span className="text-sm text-ink-muted">Стартовая цена/метр</span>
          <div className="text-lg font-bold text-ink">
            {formPricePerMeter ? `${formatMoney(formPricePerMeter)}/м²` : '—'}
          </div>
        </div>

        <Input
          label="Ссылка на объявление"
          placeholder="https://..."
          value={form.listingUrl}
          onChange={(e) => setForm((f) => ({ ...f, listingUrl: e.target.value }))}
        />

        <div>
          <Input
            label="Ссылка на карту (эмбед из Яндекс.Карт Конструктора)"
            placeholder="https://yandex.ru/map-widget/v1/?..."
            value={form.mapEmbedUrl}
            onChange={(e) => setForm((f) => ({ ...f, mapEmbedUrl: e.target.value }))}
          />
          <p className="mt-1.5 text-xs text-ink-faint">
            constructor.yandex.ru → впиши адрес объекта, поставь метку → скопируй ссылку на готовую карту (не код для
            вставки, а именно ссылку) и вставь сюда.
          </p>
        </div>

        <div>
          <Input
            label="URL продающей страницы"
            placeholder="one"
            value={form.landingSlug}
            onChange={(e) => setForm((f) => ({ ...f, landingSlug: e.target.value.trim() }))}
          />
          {form.landingSlug && (
            <p className="mt-1.5 text-xs text-ink-faint">redevelopment.pro/{form.landingSlug}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Собственник"
            placeholder="Имя или компания"
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
            required
          />
          <Input
            label="Контакт собственника"
            placeholder="Телефон, Telegram..."
            value={form.ownerContact}
            onChange={(e) => setForm((f) => ({ ...f, ownerContact: e.target.value }))}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Имя"
            placeholder="Имя контактного лица"
            value={form.contactName}
            onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
          />
          <Input
            label="Должность"
            placeholder="Например, Директор"
            value={form.contactPosition}
            onChange={(e) => setForm((f) => ({ ...f, contactPosition: e.target.value }))}
          />
        </div>

        <Select
          label="Где общаемся"
          options={[...contactChannels]}
          value={form.contactChannel}
          onChange={(v) => setForm((f) => ({ ...f, contactChannel: v as ContactChannel }))}
        />

        <Textarea
          label="Заметки по объекту"
          placeholder="Свободные заметки..."
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting || uploading}>
            {submitting ? 'Сохраняем...' : editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
