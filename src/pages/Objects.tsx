import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2, Pencil, Link as LinkIcon, ImageOff, Upload } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { pricePerMeter, type RealtyObject } from '../data/objects';
import { fetchObjects, insertObject, updateObject, uploadObjectPhoto } from '../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} $`;
}

const emptyForm = {
  address: '',
  area: '',
  startPrice: '',
  photoUrl: '',
  listingUrl: '',
  owner: '',
  ownerContact: '',
  notes: '',
};

function objectToForm(o: RealtyObject) {
  return {
    address: o.address,
    area: String(o.area),
    startPrice: String(o.startPrice),
    photoUrl: o.photoUrl,
    listingUrl: o.listingUrl,
    owner: o.owner,
    ownerContact: o.ownerContact,
    notes: o.notes,
  };
}

export function Objects() {
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchObjects()
      .then(setObjects)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить объекты')))
      .finally(() => setLoading(false));
  }, []);

  const canSubmit = form.address && form.area && form.startPrice && form.owner && form.ownerContact;

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setUploadError(null);
    setOpen(true);
  }

  function openEditModal(o: RealtyObject) {
    setEditingId(o.id);
    setForm(objectToForm(o));
    setSubmitError(null);
    setUploadError(null);
    setOpen(true);
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadObjectPhoto(file);
      setForm((f) => ({ ...f, photoUrl: url }));
    } catch (err) {
      setUploadError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      listingUrl: form.listingUrl,
      owner: form.owner,
      ownerContact: form.ownerContact,
      notes: form.notes,
    };
    try {
      if (editingId) {
        const updated = await updateObject(editingId, payload);
        setObjects((prev) => prev.map((o) => (o.id === editingId ? updated : o)));
      } else {
        const created = await insertObject(payload);
        setObjects((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
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
    <>
      <PageHeader
        title="Объекты"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить объект
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="text-lg font-bold text-ink">Объекты в проработке</div>

        {objects.map((o) => {
          const perMeter = pricePerMeter(o.area, o.startPrice);
          return (
            <Card key={o.id} className="flex gap-6 p-5">
              <div className="aspect-[4/3] w-1/5 min-w-[140px] shrink-0 overflow-hidden rounded-control bg-surface-muted">
                {o.photoUrl ? (
                  <img src={o.photoUrl} alt={o.address} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-6 w-6 text-ink-faint" />
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold text-ink">{o.address}</div>
                    <div className="text-sm text-ink-muted">{o.area} м²</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {o.listingUrl && (
                      <a
                        href={o.listingUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Открыть объявление"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                      >
                        <LinkIcon className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(o)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                      aria-label="Редактировать объект"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-10 gap-y-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Цена</div>
                    <div className="text-xl font-bold text-ink">{formatMoney(o.startPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Цена/м²</div>
                    <div className="text-xl font-bold text-ink">{perMeter ? formatMoney(perMeter) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Собственник</div>
                    <div className="text-sm text-ink">{o.owner}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Контакт</div>
                    <div className="text-sm text-ink">{o.ownerContact}</div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем объекты...
          </Card>
        )}
        {!loading && loadError && (
          <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>
        )}
        {!loading && !loadError && objects.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Объектов пока нет</Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать объект' : 'Новый объект'}>
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
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

          <Textarea
            label="Заметки по объекту"
            placeholder="Свободные заметки..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting || uploading}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
