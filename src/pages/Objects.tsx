import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, ImageOff } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ObjectFormModal } from '../components/objects/ObjectFormModal';
import type { RealtyObject } from '../data/objects';
import { fetchObjects } from '../lib/objectsApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {objects.map((o) => (
            <Link
              key={o.id}
              to={`/admin/objects/${o.landingSlug || o.id}`}
              className={cn('group flex flex-col overflow-hidden transition-colors hover:border-primary/40', glassCardClass)}
              style={glassCardShadow}
            >
              <div className="aspect-[16/9] w-full shrink-0 overflow-hidden bg-surface-muted">
                {o.photoUrl ? (
                  <img
                    src={o.photoUrl}
                    alt={o.name || o.address}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-8 w-8 text-ink-faint" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-0.5 p-5">
                <div className="truncate text-lg font-bold text-ink">{o.name || o.address}</div>
                {o.name && <div className="truncate text-sm text-ink-muted">{o.address}</div>}
              </div>
            </Link>
          ))}
        </div>

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
