import { useEffect, useRef, useState } from 'react';
import { Plus, Loader2, Pencil, Link as LinkIcon, ImageOff, Upload, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { pricePerMeter, type RealtyObject } from '../data/objects';
import { fetchObjects, insertObject, updateObject, uploadObjectImage } from '../lib/objectsApi';

const MAX_FLOOR_PLANS = 3;

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
  floorPlanUrls: [] as string[],
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
    floorPlanUrls: o.floorPlanUrls,
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
  const [uploadingFloorPlan, setUploadingFloorPlan] = useState(false);
  const [floorPlanUploadError, setFloorPlanUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchObjects()
      .then(setObjects)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить объекты')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft') setLightbox((lb) => (lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : lb));
      if (e.key === 'ArrowRight') setLightbox((lb) => (lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : lb));
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightbox]);

  function openLightbox(urls: string[], index: number) {
    setLightbox({ urls, index });
  }

  const canSubmit = form.address && form.area && form.startPrice && form.owner && form.ownerContact;

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setUploadError(null);
    setFloorPlanUploadError(null);
    setOpen(true);
  }

  function openEditModal(o: RealtyObject) {
    setEditingId(o.id);
    setForm(objectToForm(o));
    setSubmitError(null);
    setUploadError(null);
    setFloorPlanUploadError(null);
    setOpen(true);
  }

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
              <div className="flex w-1/5 min-w-[140px] shrink-0 flex-col gap-2">
                <div className="aspect-[4/3] overflow-hidden rounded-control bg-surface-muted">
                  {o.photoUrl ? (
                    <img src={o.photoUrl} alt={o.address} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-6 w-6 text-ink-faint" />
                    </div>
                  )}
                </div>
                {o.floorPlanUrls.length > 0 && (
                  <div className="flex gap-2">
                    {o.floorPlanUrls.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => openLightbox(o.floorPlanUrls, i)}
                        title="Планировка"
                        className="aspect-square flex-1 overflow-hidden rounded-control border border-border bg-surface-muted"
                      >
                        <img src={url} alt={`Планировка ${i + 1}`} className="h-full w-full object-cover" />
                      </button>
                    ))}
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

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="absolute inset-0 bg-ink/70" />
          <img
            src={lightbox.urls[lightbox.index]}
            alt=""
            className="relative max-h-full max-w-full rounded-card object-contain shadow-card"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Закрыть"
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-card"
          >
            <X className="h-5 w-5" />
          </button>
          {lightbox.urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) => (lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : lb));
                }}
                aria-label="Предыдущая планировка"
                className="absolute left-6 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-card"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) => (lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : lb));
                }}
                aria-label="Следующая планировка"
                className="absolute right-6 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-card"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
