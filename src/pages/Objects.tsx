import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, ImageOff, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ObjectFormModal } from '../components/objects/ObjectFormModal';
import { pricePerMeter, type RealtyObject } from '../data/objects';
import { fetchObjects } from '../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('ru-RU')}`;
}

export function Objects() {
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchObjects()
      .then(setObjects)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить объекты')))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(saved: RealtyObject) {
    setObjects((prev) => (prev.some((o) => o.id === saved.id) ? prev.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...prev]));
  }

  return (
    <>
      <PageHeader
        title="Объекты"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Добавить объект
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="text-lg font-bold text-ink">Объекты в проработке</div>

        {objects.map((o) => {
          const perMeter = pricePerMeter(o.area, o.startPrice);
          return (
            <Link
              key={o.id}
              to={`/admin/objects/${o.landingSlug || o.id}`}
              className="flex items-center gap-5 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary"
            >
              <div className="aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                {o.photoUrl ? (
                  <img src={o.photoUrl} alt={o.address} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-6 w-6 text-ink-faint" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold text-ink">{o.address}</div>
                <div className="mt-1 text-sm text-ink-muted">
                  Цена/м² <span className="text-base font-bold text-ink">{perMeter ? formatMoney(perMeter) : '—'}</span>
                </div>
              </div>

              <span className="flex shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-ink">
                Открыть
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
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

      <ObjectFormModal open={open} onClose={() => setOpen(false)} onSaved={handleSaved} />
    </>
  );
}
