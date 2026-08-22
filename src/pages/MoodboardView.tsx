import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ImageLightbox, type LightboxState } from '../components/objects/ImageLightbox';
import type { Moodboard } from '../data/moodboards';
import { fetchMoodboard } from '../lib/moodboardsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Режим просмотра — блоки без полей ввода/кнопок удаления, крупнее
// миниатюры, клик по фото открывает лайтбокс. То же разделение, что и у
// дизайн-проекта (DesignProjectView/DesignProjectDetail): сюда попадают из
// списка, "Редактировать" ведёт на форму (MoodboardDetail) и обратно.
export function MoodboardView() {
  const { id } = useParams();
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchMoodboard(id)
      .then(setMoodboard)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить мудборд')))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <PageHeader
        title={moodboard?.name ?? 'Мудборд'}
        action={
          id && (
            <Link to={`/admin/design-projects/moodboards/${id}/edit`}>
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
          Загружаем мудборд...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && moodboard && (
        <>
          {moodboard.blocks.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-10 text-sm text-ink-muted">
              <ImageOff className="h-8 w-8 text-ink-faint" />
              Блоков пока нет
              <Link to={`/admin/design-projects/moodboards/${id}/edit`}>
                <Button type="button" variant="secondary">
                  Добавить блоки
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {moodboard.blocks.map((block) => (
                <Card key={block.id} className="flex flex-col gap-3 p-5">
                  <div className="text-base font-bold text-ink">{block.title || 'Без названия'}</div>
                  {block.photoUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-2.5">
                      {block.photoUrls.map((url, i) => (
                        <div key={url} className="h-28 w-28 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                          <img
                            src={url}
                            alt=""
                            onClick={() => setLightbox({ urls: block.photoUrls, index: i })}
                            className="h-full w-full cursor-zoom-in object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-control bg-surface-muted">
                      <ImageOff className="h-6 w-6 text-ink-faint" />
                    </div>
                  )}
                  {block.notes && <p className="whitespace-pre-wrap text-sm text-ink-muted">{block.notes}</p>}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </>
  );
}
