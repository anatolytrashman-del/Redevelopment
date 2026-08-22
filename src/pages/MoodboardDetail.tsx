import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImageOff, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { ImageLightbox, type LightboxState } from '../components/objects/ImageLightbox';
import { emptyMoodboardBlock, type Moodboard, type MoodboardBlock } from '../data/moodboards';
import { fetchMoodboard, updateMoodboard } from '../lib/moodboardsApi';
import { uploadDesignProjectPhoto } from '../lib/designProjectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface BlockCardProps {
  block: MoodboardBlock;
  uploading: boolean;
  onTitleChange: (title: string) => void;
  onNotesChange: (notes: string) => void;
  onAddPhotos: (files: File[]) => void;
  onRemovePhoto: (index: number) => void;
  onRemoveBlock: () => void;
  onPhotoClick: (index: number) => void;
}

function BlockCard({
  block,
  uploading,
  onTitleChange,
  onNotesChange,
  onAddPhotos,
  onRemovePhoto,
  onRemoveBlock,
  onPhotoClick,
}: BlockCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <Input
          value={block.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Заголовок блока"
          className="text-base font-bold"
        />
        <button
          type="button"
          onClick={onRemoveBlock}
          aria-label="Удалить блок"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {block.photoUrls.map((url, i) => (
          <div key={url} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-control bg-surface-muted">
            <img
              src={url}
              alt=""
              onClick={() => onPhotoClick(i)}
              className="h-full w-full cursor-zoom-in object-cover"
            />
            <button
              type="button"
              onClick={() => onRemovePhoto(i)}
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
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (files.length > 0) onAddPhotos(files);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border text-ink-faint hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span className="text-[11px]">{uploading ? 'Грузим' : 'Фото'}</span>
        </button>
      </div>

      <Textarea
        rows={2}
        value={block.notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Описание, ссылки (необязательно)"
      />
    </Card>
  );
}

// Мудборд — плоский набор блоков "заголовок + фото + текст" на одной
// странице (см. комментарий у Moodboard в data/moodboards.ts). Правки полей
// (название, заголовки блоков, заметки) — обычный черновик + одна кнопка
// "Сохранить" на всю страницу. Фото — исключение: сохраняются в базу сразу
// после каждой загрузки/удаления (тот же принцип, что и в
// DesignProjectDetail.tsx) — потерять фото из-за забытого "Сохранить"
// болезненнее, чем потерять недописанный текст.
export function MoodboardDetail() {
  const { id } = useParams();
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const savedRef = useRef<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    fetchMoodboard(id)
      .then((m) => {
        setMoodboard(m);
        savedRef.current = JSON.stringify(m);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить мудборд')))
      .finally(() => setLoading(false));
  }, [id]);

  const dirty = moodboard != null && JSON.stringify(moodboard) !== savedRef.current;

  async function persist(next: Moodboard) {
    const updated = await updateMoodboard(next.id, { name: next.name, blocks: next.blocks });
    setMoodboard(updated);
    savedRef.current = JSON.stringify(updated);
    return updated;
  }

  async function handleSave() {
    if (!moodboard || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await persist(moodboard);
    } catch (err) {
      setSaveError(errorMessage(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  }

  function patchBlock(blockId: string, patch: Partial<MoodboardBlock>) {
    setMoodboard((m) => (m ? { ...m, blocks: m.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) } : m));
  }

  function addBlock() {
    setMoodboard((m) => (m ? { ...m, blocks: [...m.blocks, emptyMoodboardBlock()] } : m));
  }

  async function removeBlock(blockId: string) {
    if (!moodboard) return;
    if (!window.confirm('Удалить блок? Отменить не получится.')) return;
    const next = { ...moodboard, blocks: moodboard.blocks.filter((b) => b.id !== blockId) };
    setMoodboard(next);
    try {
      await persist(next);
    } catch (err) {
      setUploadError(errorMessage(err, 'Не удалось удалить блок'));
    }
  }

  async function addPhotosToBlock(blockId: string, files: File[]) {
    if (!moodboard) return;
    setUploadingBlockId(blockId);
    setUploadError(null);
    const failed: string[] = [];
    // Копим в локальной переменной по ходу цикла, а не читаем состояние на
    // каждой итерации — иначе второй и следующие файлы в одной загрузке
    // перезаписывали бы друг друга поверх исходного массива, а не
    // добавлялись (см. тот же баг и разбор в DesignProjectDetail.tsx).
    let current = moodboard;
    for (const file of files) {
      try {
        const url = await uploadDesignProjectPhoto(file);
        const blocks = current.blocks.map((b) =>
          b.id === blockId ? { ...b, photoUrls: [...b.photoUrls, url] } : b,
        );
        current = await persist({ ...current, blocks });
      } catch (err) {
        failed.push(`${file.name} — ${errorMessage(err, 'не удалось загрузить')}`);
      }
    }
    setUploadingBlockId(null);
    if (failed.length > 0) {
      setUploadError(`Не удалось загрузить: ${failed.join('; ')}.`);
    }
  }

  async function removePhotoFromBlock(blockId: string, index: number) {
    if (!moodboard) return;
    const blocks = moodboard.blocks.map((b) =>
      b.id === blockId ? { ...b, photoUrls: b.photoUrls.filter((_, i) => i !== index) } : b,
    );
    const next = { ...moodboard, blocks };
    setMoodboard(next);
    try {
      await persist(next);
    } catch (err) {
      setUploadError(errorMessage(err, 'Не удалось удалить фото'));
    }
  }

  return (
    <>
      <PageHeader
        title="Мудборд"
        action={
          <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Сохраняем...' : dirty ? 'Сохранить' : 'Сохранено'}
          </Button>
        }
      />

      <Link
        to={id ? `/admin/design-projects/moodboards/${id}` : '/admin/design-projects'}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад к мудборду
      </Link>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}
      {uploadError && <p className="text-sm text-danger">{uploadError}</p>}

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем мудборд...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && moodboard && (
        <>
          <Card className="flex flex-col gap-4 p-5">
            <Input
              label="Название мудборда"
              value={moodboard.name}
              onChange={(e) => setMoodboard((m) => (m ? { ...m, name: e.target.value } : m))}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {moodboard.blocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                uploading={uploadingBlockId === block.id}
                onTitleChange={(title) => patchBlock(block.id, { title })}
                onNotesChange={(notes) => patchBlock(block.id, { notes })}
                onAddPhotos={(files) => addPhotosToBlock(block.id, files)}
                onRemovePhoto={(index) => removePhotoFromBlock(block.id, index)}
                onRemoveBlock={() => removeBlock(block.id)}
                onPhotoClick={(index) => setLightbox({ urls: block.photoUrls, index })}
              />
            ))}
          </div>

          {moodboard.blocks.length === 0 && (
            <Card className="flex flex-col items-center gap-2 py-10 text-sm text-ink-muted">
              <ImageOff className="h-8 w-8 text-ink-faint" />
              Блоков пока нет
            </Card>
          )}

          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={addBlock}>
            Добавить блок
          </Button>
        </>
      )}

      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </>
  );
}
