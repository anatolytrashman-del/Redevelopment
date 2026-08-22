import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PhotoCarousel } from '../components/objects/PhotoCarousel';
import { ImageLightbox, type LightboxState } from '../components/objects/ImageLightbox';
import type { DesignProject } from '../data/designProjects';
import { fetchDesignProject } from '../lib/designProjectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Режим просмотра — большое фото на всю правую колонку + слайдер между
// снимками, в отличие от DesignProjectDetail (форма редактирования: мелкие
// миниатюры, загрузка, поля ввода). Один и тот же проект, два экрана —
// сюда попадают из списка, "Редактировать" ведёт на форму и обратно.
export function DesignProjectView() {
  const { id } = useParams();
  const [project, setProject] = useState<DesignProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchDesignProject(id)
      .then(setProject)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить дизайн-проект')))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <PageHeader
        title={project?.name ?? 'Дизайн-проект'}
        action={
          id && (
            <Link to={`/admin/design-projects/${id}/edit`}>
              <Button type="button" icon={<Pencil className="h-4 w-4" />}>
                Редактировать
              </Button>
            </Link>
          )
        }
      />

      <Link to="/admin/design-projects" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Все дизайн-проекты
      </Link>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем дизайн-проект...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && project && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5 lg:order-2">
            {project.photoUrls.length > 0 ? (
              <div className="relative h-96 w-full overflow-hidden rounded-control bg-surface-muted sm:h-[520px] lg:h-[640px]">
                <PhotoCarousel
                  images={project.photoUrls}
                  alt={project.name}
                  fit="contain"
                  onImageClick={(i) => setLightbox({ urls: project.photoUrls, index: i })}
                />
              </div>
            ) : (
              <Card className="flex h-96 flex-col items-center justify-center gap-3 text-sm text-ink-muted">
                <ImageOff className="h-8 w-8 text-ink-faint" />
                Фото ещё не загружены
                <Link to={`/admin/design-projects/${id}/edit`}>
                  <Button type="button" variant="secondary">
                    Добавить фото
                  </Button>
                </Link>
              </Card>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:order-1">
            <Card className="flex flex-col gap-1 p-5">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">Создан</span>
              <span className="text-sm text-ink">{formatDate(project.createdAt)}</span>
            </Card>
            <Card className="flex flex-col gap-2 p-5">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">Заметки</span>
              {project.notes ? (
                <p className="whitespace-pre-wrap text-sm text-ink">{project.notes}</p>
              ) : (
                <p className="text-sm text-ink-faint">Заметок пока нет</p>
              )}
            </Card>
          </div>
        </div>
      )}

      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </>
  );
}
