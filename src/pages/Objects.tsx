import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Pencil, Link as LinkIcon, ImageOff } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ObjectFormModal } from '../components/objects/ObjectFormModal';
import { ImageLightbox, type LightboxState } from '../components/objects/ImageLightbox';
import { pricePerMeter, objectImages, type RealtyObject } from '../data/objects';
import { fetchObjects } from '../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('ru-RU')} $`;
}

export function Objects() {
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RealtyObject | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    fetchObjects()
      .then(setObjects)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить объекты')))
      .finally(() => setLoading(false));
  }, []);

  function openAddModal() {
    setEditing(null);
    setOpen(true);
  }

  function openEditModal(o: RealtyObject) {
    setEditing(o);
    setOpen(true);
  }

  function handleSaved(saved: RealtyObject) {
    setObjects((prev) => (prev.some((o) => o.id === saved.id) ? prev.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...prev]));
  }

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
          const images = objectImages(o);
          return (
            <Card key={o.id} className="flex gap-6 p-5">
              <div className="flex w-1/5 min-w-[140px] shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => o.photoUrl && setLightbox({ urls: images, index: 0 })}
                  className="aspect-[4/3] overflow-hidden rounded-control bg-surface-muted"
                  disabled={!o.photoUrl}
                >
                  {o.photoUrl ? (
                    <img src={o.photoUrl} alt={o.address} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageOff className="h-6 w-6 text-ink-faint" />
                    </div>
                  )}
                </button>
                {o.floorPlanUrls.length > 0 && (
                  <div className="flex gap-2">
                    {o.floorPlanUrls.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setLightbox({ urls: images, index: images.indexOf(url) })}
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
                    <Link
                      to={`/objects/${o.id}`}
                      className="block truncate text-lg font-bold text-ink hover:text-primary"
                    >
                      {o.address}
                    </Link>
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

      <ObjectFormModal open={open} onClose={() => setOpen(false)} editing={editing} onSaved={handleSaved} />
      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </>
  );
}
