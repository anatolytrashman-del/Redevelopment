import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ObjectFormModal } from '../components/objects/ObjectFormModal';
import { PhotoCarousel } from '../components/objects/PhotoCarousel';
import { PledgeDetailModal } from '../components/pledges/PledgeDetailModal';
import { PledgeFormModal } from '../components/pledges/PledgeFormModal';
import { PledgePhotoCarousel } from '../components/pledges/PledgePhotoCarousel';
import { objectStatuses, type RealtyObject } from '../data/objects';
import { pledgeTypes, type Pledge } from '../data/pledges';
import { fetchObjects } from '../lib/objectsApi';
import { fetchPledges, deletePledge } from '../lib/pledgesApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatMoney(value: number): string {
  return value ? `$${Math.round(value).toLocaleString('ru-RU')}` : '';
}

// Компактная карточка залога — не отдельная страница (в отличие от объекта
// в проработке), клик открывает детальную карточку с полным набором полей
// и фотографиями, тот же приём, что и у карточки лида/подрядчика.
function PledgeCard({
  pledge,
  onOpen,
  onDelete,
  deleting,
}: {
  pledge: Pledge;
  onOpen: (p: Pledge) => void;
  onDelete: (p: Pledge) => void;
  deleting: boolean;
}) {
  return (
    <div
      onClick={() => onOpen(pledge)}
      className={cn('group flex cursor-pointer flex-col overflow-hidden transition-colors hover:border-primary/40', glassCardClass)}
      style={glassCardShadow}
    >
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-surface-muted">
        <PledgePhotoCarousel paths={pledge.photoPaths} alt={pledge.address} />
        {pledge.propertyType && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm">
            {pledge.propertyType}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-0.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ink">{pledge.address}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(pledge);
            }}
            disabled={deleting}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
            aria-label="Удалить залог"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="truncate text-xs text-ink-muted">
          {pledge.area ? `${pledge.area} м²` : '—'}
          {pledge.marketValue ? ` · ${formatMoney(pledge.marketValue)}` : ''}
        </span>
      </div>
    </div>
  );
}

export function Objects() {
  const navigate = useNavigate();
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [pledgesLoading, setPledgesLoading] = useState(true);
  const [pledgesLoadError, setPledgesLoadError] = useState<string | null>(null);
  const [pledgeFormOpen, setPledgeFormOpen] = useState(false);
  const [editingPledge, setEditingPledge] = useState<Pledge | null>(null);
  const [detailPledgeId, setDetailPledgeId] = useState<string | null>(null);
  const [deletingPledgeId, setDeletingPledgeId] = useState<string | null>(null);
  const [pledgeActionError, setPledgeActionError] = useState<string | null>(null);

  const knownPledgeTypes = useMemo(() => {
    const set = new Set<string>(pledgeTypes);
    pledges.forEach((p) => p.propertyType && set.add(p.propertyType));
    return [...set];
  }, [pledges]);

  const knownObjectStatuses = useMemo(() => {
    const set = new Set<string>(objectStatuses);
    objects.forEach((o) => o.status && set.add(o.status));
    return [...set];
  }, [objects]);

  useEffect(() => {
    fetchObjects()
      .then(setObjects)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить объекты')))
      .finally(() => setLoading(false));

    fetchPledges()
      .then(setPledges)
      .catch((err) => setPledgesLoadError(errorMessage(err, 'Не удалось загрузить залоги')))
      .finally(() => setPledgesLoading(false));
  }, []);

  function handleSaved(saved: RealtyObject) {
    setObjects((prev) => (prev.some((o) => o.id === saved.id) ? prev.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...prev]));
  }

  function openAddPledgeModal() {
    setEditingPledge(null);
    setPledgeFormOpen(true);
  }

  function openEditPledgeModal(p: Pledge) {
    setEditingPledge(p);
    // Карточку закрываем: две модалки одновременно перекрывали бы друг друга.
    setDetailPledgeId(null);
    setPledgeFormOpen(true);
  }

  function handlePledgeSaved(saved: Pledge) {
    setPledges((prev) => (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev]));
  }

  async function handleDeletePledge(p: Pledge) {
    if (deletingPledgeId) return;
    if (!window.confirm(`Удалить объект в залоге «${p.address}»?`)) return;
    setDeletingPledgeId(p.id);
    setPledgeActionError(null);
    try {
      await deletePledge(p.id);
      setPledges((prev) => prev.filter((x) => x.id !== p.id));
      setDetailPledgeId(null);
    } catch (err) {
      setPledgeActionError(errorMessage(err, 'Не удалось удалить залог'));
    } finally {
      setDeletingPledgeId(null);
    }
  }

  const detailPledge = detailPledgeId ? (pledges.find((p) => p.id === detailPledgeId) ?? null) : null;

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

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="text-lg font-bold text-ink">Объекты в проработке</div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {objects.map((o) => (
              <div
                key={o.id}
                onClick={() => navigate(`/admin/objects/${o.landingSlug || o.id}`)}
                className={cn('group flex cursor-pointer flex-col overflow-hidden transition-colors hover:border-primary/40', glassCardClass)}
                style={glassCardShadow}
              >
                <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-surface-muted">
                  <PhotoCarousel images={o.photoUrls} alt={o.name || o.address} imgClassName="transition-transform duration-300 sm:group-hover:scale-105" />
                  {(o.status || o.priority) && (
                    <div className="absolute inset-x-2 top-2 flex flex-wrap items-start gap-1">
                      {o.status && (
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm">
                          {o.status}
                        </span>
                      )}
                      {o.priority && (
                        <span className="ml-auto rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm">
                          🔥 Приоритет
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-0.5 p-3">
                  <div className="truncate text-sm font-semibold text-ink">{o.name || o.address}</div>
                  {o.name && <div className="truncate text-xs text-ink-muted">{o.address}</div>}
                </div>
              </div>
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

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-bold text-ink">Залоги</div>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={openAddPledgeModal}>
              Добавить залог
            </Button>
          </div>

          {pledgeActionError && <p className="text-sm text-danger">{pledgeActionError}</p>}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pledges.map((p) => (
              <PledgeCard
                key={p.id}
                pledge={p}
                onOpen={(p) => setDetailPledgeId(p.id)}
                onDelete={handleDeletePledge}
                deleting={deletingPledgeId === p.id}
              />
            ))}
          </div>

          {pledgesLoading && (
            <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем залоги...
            </Card>
          )}
          {!pledgesLoading && pledgesLoadError && (
            <Card className="py-10 text-center text-sm text-danger">{pledgesLoadError}</Card>
          )}
          {!pledgesLoading && !pledgesLoadError && pledges.length === 0 && (
            <Card className="py-10 text-center text-sm text-ink-muted">Залогов пока нет</Card>
          )}
        </div>
      </div>

      <ObjectFormModal
        open={open}
        onClose={() => setOpen(false)}
        knownStatuses={knownObjectStatuses}
        onSaved={handleSaved}
      />

      <PledgeFormModal
        open={pledgeFormOpen}
        pledge={editingPledge}
        knownTypes={knownPledgeTypes}
        onClose={() => setPledgeFormOpen(false)}
        onSaved={handlePledgeSaved}
      />

      <PledgeDetailModal
        pledge={detailPledge}
        onClose={() => setDetailPledgeId(null)}
        onEdit={openEditPledgeModal}
        onDelete={handleDeletePledge}
        deleting={deletingPledgeId === detailPledge?.id}
      />
    </>
  );
}
