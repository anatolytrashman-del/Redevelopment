import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Trash2, ImageOff } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import type { DesignProject } from '../data/designProjects';
import { fetchDesignProjects, insertDesignProject, deleteDesignProject } from '../lib/designProjectsApi';
import type { Moodboard } from '../data/moodboards';
import { fetchMoodboards, insertMoodboard, deleteMoodboard } from '../lib/moodboardsApi';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Мозаика-превью для карточки мудборда — одно фото на весь блок скрывало
// бы, что внутри много разных решений; коллаж из нескольких (как обложка
// доски в Pinterest) честнее отражает содержимое. Раскладка зависит от
// количества фото: 1 — во всю карточку, 2 — пополам, 3 — большое слева +
// два маленьких справа, 4+ — сетка 2×2 (берём первые 4 по всем блокам).
function MoodboardPreview({ photoUrls }: { photoUrls: string[] }) {
  if (photoUrls.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-control bg-surface-muted">
        <ImageOff className="h-8 w-8 text-ink-faint" />
      </div>
    );
  }

  const photos = photoUrls.slice(0, 4);

  return (
    <div className="grid h-36 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-control bg-surface-muted">
      {photos.length === 1 && <img src={photos[0]} alt="" className="col-span-2 row-span-2 h-full w-full object-cover" />}
      {photos.length === 2 &&
        photos.map((url) => <img key={url} src={url} alt="" className="row-span-2 h-full w-full object-cover" />)}
      {photos.length === 3 && (
        <>
          <img src={photos[0]} alt="" className="row-span-2 h-full w-full object-cover" />
          <img src={photos[1]} alt="" className="h-full w-full object-cover" />
          <img src={photos[2]} alt="" className="h-full w-full object-cover" />
        </>
      )}
      {photos.length >= 4 && photos.map((url) => <img key={url} src={url} alt="" className="h-full w-full object-cover" />)}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TABS = ['Проекты', 'Мудборды'] as const;
type Tab = (typeof TABS)[number];

export function DesignProjects() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('Проекты');

  const [projects, setProjects] = useState<DesignProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [moodboards, setMoodboards] = useState<Moodboard[]>([]);
  const [moodboardsLoaded, setMoodboardsLoaded] = useState(false);
  const [moodboardsLoading, setMoodboardsLoading] = useState(false);
  const [moodboardsError, setMoodboardsError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDesignProjects()
      .then(setProjects)
      .catch((err) => setProjectsError(errorMessage(err, 'Не удалось загрузить дизайн-проекты')))
      .finally(() => setProjectsLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'Мудборды' || moodboardsLoaded) return;
    setMoodboardsLoading(true);
    fetchMoodboards()
      .then((m) => {
        setMoodboards(m);
        setMoodboardsLoaded(true);
      })
      .catch((err) => setMoodboardsError(errorMessage(err, 'Не удалось загрузить мудборды')))
      .finally(() => setMoodboardsLoading(false));
  }, [tab, moodboardsLoaded]);

  async function handleCreateProject() {
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

  async function handleDeleteProject(p: DesignProject) {
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

  async function handleCreateMoodboard() {
    if (creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await insertMoodboard({ name: 'Новый мудборд' });
      setMoodboards((prev) => [created, ...prev]);
      navigate(`/admin/design-projects/moodboards/${created.id}`);
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось создать мудборд'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteMoodboard(m: Moodboard) {
    if (deletingId) return;
    if (!window.confirm(`Удалить мудборд «${m.name}»? Фото из блоков не удаляются автоматически.`)) return;
    setDeletingId(m.id);
    setActionError(null);
    try {
      await deleteMoodboard(m.id);
      setMoodboards((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось удалить мудборд'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Дизайн-проекты"
        action={
          tab === 'Проекты' ? (
            <Button icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} onClick={handleCreateProject} disabled={creating}>
              {creating ? 'Создаём...' : 'Новый проект'}
            </Button>
          ) : (
            <Button icon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} onClick={handleCreateMoodboard} disabled={creating}>
              {creating ? 'Создаём...' : 'Новый мудборд'}
            </Button>
          )
        }
      />

      <ToggleGroup options={[...TABS]} value={tab} onChange={(v) => setTab(v as Tab)} />

      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      {tab === 'Проекты' && (
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
                    {p.photoUrls.length} фото · создан {formatDate(p.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleDeleteProject(p);
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

          {projectsLoading && (
            <Card className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем дизайн-проекты...
            </Card>
          )}
          {!projectsLoading && projectsError && (
            <Card className="col-span-full py-10 text-center text-sm text-danger">{projectsError}</Card>
          )}
          {!projectsLoading && !projectsError && projects.length === 0 && (
            <Card className="col-span-full py-10 text-center text-sm text-ink-muted">Дизайн-проектов пока нет</Card>
          )}
        </div>
      )}

      {tab === 'Мудборды' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moodboards.map((m) => {
            const previewPhotos = m.blocks.flatMap((b) => b.photoUrls);
            return (
              <div
                key={m.id}
                onClick={() => navigate(`/admin/design-projects/moodboards/${m.id}`)}
                className={cn('flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:border-primary/40', glassCardClass)}
                style={glassCardShadow}
              >
                <MoodboardPreview photoUrls={previewPhotos} />
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-semibold text-ink">{m.name}</span>
                    <span className="text-sm text-ink-muted">
                      {m.blocks.length} {m.blocks.length === 1 ? 'блок' : 'блока'} · создан {formatDate(m.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleDeleteMoodboard(m);
                    }}
                    disabled={deletingId === m.id}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                    aria-label="Удалить мудборд"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {moodboardsLoading && (
            <Card className="col-span-full flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем мудборды...
            </Card>
          )}
          {!moodboardsLoading && moodboardsError && (
            <Card className="col-span-full py-10 text-center text-sm text-danger">{moodboardsError}</Card>
          )}
          {!moodboardsLoading && !moodboardsError && moodboardsLoaded && moodboards.length === 0 && (
            <Card className="col-span-full py-10 text-center text-sm text-ink-muted">Мудбордов пока нет</Card>
          )}
        </div>
      )}
    </>
  );
}
