import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Upload, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import type { DesignProject } from '../data/designProjects';
import { fetchDesignProject, updateDesignProject, uploadDesignProjectPhoto } from '../lib/designProjectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Фотографии сохраняются в базу сразу после каждой успешной загрузки (не
// ждут отдельного "Сохранить") — потерять прогресс после загрузки десятков
// фото было бы намного болезненнее, чем для текстовых полей. Имя и заметки,
// наоборот, дешёво перепечатать — для них обычный черновик + кнопка.
export function DesignProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<DesignProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [nameDraft, setNameDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchDesignProject(id)
      .then((p) => {
        setProject(p);
        setNameDraft(p.name);
        setNotesDraft(p.notes);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить дизайн-проект')))
      .finally(() => setLoading(false));
  }, [id]);

  const dirty = project != null && (nameDraft !== project.name || notesDraft !== project.notes);

  async function handleSave() {
    if (!project || saving || !nameDraft.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateDesignProject(project.id, { name: nameDraft.trim(), notes: notesDraft });
      setProject(updated);
      setNameDraft(updated.name);
      setNotesDraft(updated.notes);
    } catch (err) {
      setSaveError(errorMessage(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotosSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0 || !project) return;

    setUploading(true);
    setUploadError(null);
    const failed: string[] = [];
    // Накапливаем в локальной переменной, а не читаем project.photoUrls на
    // каждой итерации — project остаётся замыканием на состояние на момент
    // вызова обработчика, второй и следующие файлы иначе перезаписывали бы
    // друг друга поверх одного и того же исходного массива, а не добавлялись.
    let photoUrls = project.photoUrls;

    for (const file of files) {
      try {
        const url = await uploadDesignProjectPhoto(file);
        photoUrls = [...photoUrls, url];
        const updated = await updateDesignProject(project.id, { photoUrls });
        setProject(updated);
      } catch (err) {
        failed.push(`${file.name} — ${errorMessage(err, 'не удалось загрузить')}`);
      }
    }

    setUploading(false);
    if (failed.length > 0) {
      setUploadError(`Не удалось загрузить: ${failed.join('; ')}.`);
    }
  }

  async function removePhoto(index: number) {
    if (!project) return;
    const photoUrls = project.photoUrls.filter((_, i) => i !== index);
    setProject({ ...project, photoUrls });
    try {
      await updateDesignProject(project.id, { photoUrls });
    } catch (err) {
      setUploadError(errorMessage(err, 'Не удалось удалить фото'));
    }
  }

  return (
    <>
      <PageHeader
        title="Дизайн-проект"
        action={
          <Button type="button" onClick={handleSave} disabled={!dirty || saving || !nameDraft.trim()}>
            {saving ? 'Сохраняем...' : dirty ? 'Сохранить' : 'Сохранено'}
          </Button>
        }
      />

      <Link
        to={id ? `/admin/design-projects/${id}` : '/admin/design-projects'}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к проекту
      </Link>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем дизайн-проект...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && project && (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <Input label="Название проекта" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="text-lg font-bold text-ink">Фото</div>
            <div className="flex flex-wrap items-center gap-3">
              {project.photoUrls.map((url, i) => (
                <div key={url} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="Удалить фото"
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePhotosSelect}
              />
              <Button
                type="button"
                variant="secondary"
                icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Загружаем...' : 'Добавить фото'}
              </Button>
            </div>
            {uploadError && <p className="text-sm text-danger">{uploadError}</p>}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <div className="text-lg font-bold text-ink">Заметки</div>
            <Textarea rows={10} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Свободные заметки по проекту" />
          </Card>
        </>
      )}
    </>
  );
}
