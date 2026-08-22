import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2, ImageOff } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { DesignProject } from '../data/designProjects';
import { fetchDesignProjects, insertDesignProject, deleteDesignProject } from '../lib/designProjectsApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function DesignProjects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<DesignProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDesignProjects()
      .then(setProjects)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить дизайн-проекты')))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await insertDesignProject({ name: 'Новый проект' });
      setProjects((prev) => [created, ...prev]);
      navigate(`/admin/design-projects/${created.id}`);
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось создать проект'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(p: DesignProject) {
    if (deletingId) return;
    if (!window.confirm(`Удалить дизайн-проект «${p.name}»? Фото из галереи не удаляются автоматически.`)) return;
    setDeletingId(p.id);
    setActionError(null);
    try {
      await deleteDesignProject(p.id);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить проект'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Дизайн-проекты"
        action={
          <Button icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} onClick={handleCreate} disabled={creating}>
            {creating ? 'Создаём...' : 'Новый проект'}
          </Button>
        }
      />

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/admin/design-projects/${p.id}`)}
            className={cn('flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:border-primary/40', glassCardClass)}
            style={glassCardShadow}
          >
            <div className="flex h-36 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
              {p.photoUrls[0] ? (
                <img src={p.photoUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-8 w-8 text-ink-faint" />
              )}
            </div>
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-semibold text-ink">{p.name}</span>
                <span className="text-sm text-ink-muted">
                  {p.photoUrls.length} {p.photoUrls.length === 1 ? 'фото' : 'фото'} · создан {formatDate(p.createdAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleDelete(p);
                }}
                disabled={deletingId === p.id}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                aria-label="Удалить проект"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <Card className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем дизайн-проекты...
          </Card>
        )}
        {!loading && loadError && (
          <Card className="col-span-full py-10 text-center text-sm text-danger">{loadError}</Card>
        )}
        {!loading && !loadError && projects.length === 0 && (
          <Card className="col-span-full py-10 text-center text-sm text-ink-muted">Дизайн-проектов пока нет</Card>
        )}
      </div>
    </>
  );
}
