import { useEffect, useRef, useState } from 'react';
import { Loader2, ImageOff, Upload, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { contactChannels, pricePerMeter, type ContactChannel, type RealtyObject } from '../../data/objects';
import { insertObject, updateObject, uploadObjectImage } from '../../lib/objectsApi';

const MAX_FLOOR_PLANS = 3;

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
  address: '',
  area: '',
  startPrice: '',
  photoUrl: '',
  floorPlanUrls: [] as string[],
  listingUrl: '',
  owner: '',
  ownerContact: '',
  contactName: '',
  contactPosition: '',
  contactChannel: '' as ContactChannel | '',
  notes: '',
};

function objectToForm(o: RealtyObject) {
  return {
    address: o.address,
    area: String(o.area),
    startPrice: String(o.startPrice),
    photoUrl: o.photoUrl,
    floorPlanUrls: o.floorPlanUrls,
    listingUrl: o.listingUrl,
    owner: o.owner,
    ownerContact: o.ownerContact,
    contactName: o.contactName,
    contactPosition: o.contactPosition,
    contactChannel: o.contactChannel,
    notes: o.notes,
  };
}

interface ObjectFormModalProps {
  open: boolean;
  onClose: () => void;
  editing?: RealtyObject | null;
  onSaved: (obj: RealtyObject) => void;
}

export function ObjectFormModal({ open, onClose, editing, onSaved }: ObjectFormModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [floorPlanUploadError, setFloorPlanUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? objectToForm(editing) : emptyForm);
    setSubmitError(null);
    setUploadError(null);
    setFloorPlanUploadError(null);
  }, [open, editing]);

  const canSubmit = form.address && form.area && form.startPrice && form.owner && form.ownerContact;

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadObjectImage(file);
      setForm((f) => ({ ...f, photoUrl: url }));
    } catch (err) {
      setUploadError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleFloorPlanSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFloorPlan(true);
    setFloorPlanUploadError(null);
    try {
      const url = await uploadObjectImage(file);
      setForm((f) => ({ ...f, floorPlanUrls: [...f.floorPlanUrls, url].slice(0, MAX_FLOOR_PLANS) }));
    } catch (err) {
      setFloorPlanUploadError(errorMessage(err, 'Не удалось загрузить планировку'));
    } finally {
      setUploadingFloorPlan(false);
      if (floorPlanInputRef.current) floorPlanInputRef.current.value = '';
    }
  }

  function removeFloorPlan(index: number) {
    setForm((f) => ({ ...f, floorPlanUrls: f.floorPlanUrls.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      address: form.address,
      area: Number(form.area),
      startPrice: Number(form.startPrice),
      photoUrl: form.photoUrl,
      floorPlanUrls: form.floorPlanUrls,
      listingUrl: form.listingUrl,
      owner: form.owner,
      ownerContact: form.ownerContact,
      contactName: form.contactName,
      contactPosition: form.contactPosition,
      contactChannel: form.contactChannel,
      notes: form.notes,
      concept: editing?.concept ?? '',
      demandLinks: editing?.demandLinks ?? [],
      inspectionMediaUrl: editing?.inspectionMediaUrl ?? '',
      buildingPlanIds: editing?.buildingPlanIds ?? [],
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
          <span className="text-sm text-ink-muted">Фото</span>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-5 w-5 text-ink-faint" />
              )}
            </span>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
            <Button
              type="button"
              variant="secondary"
              icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Загружаем...' : form.photoUrl ? 'Заменить фото' : 'Загрузить фото'}
            </Button>
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

        <Input
          label="Адрес"
          placeholder="Город, улица, дом"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          required
        />

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
