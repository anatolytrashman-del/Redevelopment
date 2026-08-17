import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Textarea } from '../ui/Textarea';
import { Input } from '../ui/Input';
import { ReferencePopup } from './ReferencePopup';
import { cn } from '../../lib/cn';
import { changeHasReference, type PhotoChange, type PhotoMarker } from '../../data/briefs';
import { uploadObjectImage } from '../../lib/objectsApi';

function Marker({ index, x, y }: { index: number; x: number; y: number }) {
  return (
    <div
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-sm"
    >
      {index + 1}
    </div>
  );
}

const emptyChange: PhotoChange = { id: '', comment: '', referenceImageUrl: '', referenceDescription: '', referenceUrl: '' };

interface AnnotatedPhotoProps {
  url: string;
  markers: PhotoMarker[];
  // Все правки категории (не только те, что уже отмечены на этом фото) —
  // нужны для выбора "это та же правка, что и на другом фото" при простановке
  // новой метки.
  changes: PhotoChange[];
  // Редактируемый режим — клик по фото ставит метку, комментарий можно
  // печатать и удалять. В режиме просмотра (публичная страница) — только
  // метки и текст, без взаимодействия.
  editable?: boolean;
  // Клик по пустому месту фото создаёт метку — но сначала нужно решить,
  // это новая правка или уже существующая (см. pendingXY ниже).
  onCreateChange?: (x: number, y: number) => void;
  onAttachChange?: (changeId: string, x: number, y: number) => void;
  onChangeComment?: (changeId: string, comment: string) => void;
  onRemoveMarker?: (markerId: string) => void;
  onChangeReferenceImage?: (changeId: string, url: string) => void;
  onChangeReferenceDescription?: (changeId: string, description: string) => void;
  onChangeReferenceUrl?: (changeId: string, url: string) => void;
  // Крупный показ внутри PhotoLightbox — фото на всю ширину (то же, что и
  // на публичной странице), список комментариев под ним, а не сбоку: так
  // фото занимает максимум места и по нему реально удобно кликать точками.
  large?: boolean;
}

// Фото с метками правок поверх — клик по фото (в редактируемом режиме)
// ставит метку. Если в категории уже есть хотя бы одна правка, сначала
// спрашивает "это та же правка, что и раньше, или новая" — так текст
// комментария печатается один раз и переиспользуется на всех фото, где
// отмечена та же правка, вместо копирования копипастой. Список комментариев
// показан под фото, пронумерован в тон меткам на самом фото. Удаление самого
// фото — забота вызывающего (миниатюра в PhotoThumbGrid), не этого компонента.
//
// aspect-[16/9] у фото — намеренно тот же, что и у PinnedPhotoCarousel: у
// object-cover кадрирование зависит от соотношения сторон контейнера, и при
// разных aspect-ratio в двух местах одна и та же точка (x/y в процентах)
// визуально съезжает. Единственный способ не ловить этот баг — держать
// соотношение сторон одинаковым везде, где рисуются реальные метки.
export function AnnotatedPhoto({
  url,
  markers,
  changes,
  editable = false,
  onCreateChange,
  onAttachChange,
  onChangeComment,
  onRemoveMarker,
  onChangeReferenceImage,
  onChangeReferenceDescription,
  onChangeReferenceUrl,
  large = false,
}: AnnotatedPhotoProps) {
  const photoRef = useRef<HTMLDivElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [pendingPinId, setPendingPinId] = useState<string | null>(null);
  const [uploadingPinId, setUploadingPinId] = useState<string | null>(null);
  const [openReferenceChange, setOpenReferenceChange] = useState<PhotoChange | null>(null);
  // Клик по фото поставил точку — ждём, к какой правке её привязать
  // (существующей или новой), прежде чем реально создавать метку.
  const [pendingXY, setPendingXY] = useState<{ x: number; y: number } | null>(null);

  const changesById = useMemo(() => {
    const map: Record<string, PhotoChange> = {};
    for (const c of changes) map[c.id] = c;
    return map;
  }, [changes]);

  function handlePhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (!editable) return;
    const rect = photoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    if (changes.length === 0) {
      onCreateChange?.(x, y);
    } else {
      setPendingXY({ x, y });
    }
  }

  function pickExisting(changeId: string) {
    if (!pendingXY) return;
    onAttachChange?.(changeId, pendingXY.x, pendingXY.y);
    setPendingXY(null);
  }

  function pickNew() {
    if (!pendingXY) return;
    onCreateChange?.(pendingXY.x, pendingXY.y);
    setPendingXY(null);
  }

  function triggerReferenceUpload(changeId: string) {
    setPendingPinId(changeId);
    referenceInputRef.current?.click();
  }

  async function handleReferenceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const changeId = pendingPinId;
    setPendingPinId(null);
    if (!file || !changeId) return;
    setUploadingPinId(changeId);
    try {
      const url = await uploadObjectImage(file);
      onChangeReferenceImage?.(changeId, url);
    } catch {
      // намеренно молча — необязательное поле, не блокируем работу с формой
    } finally {
      setUploadingPinId(null);
    }
  }

  return (
    <div className={cn('flex flex-col gap-4', !large && 'sm:flex-row')}>
      <div
        ref={photoRef}
        onClick={handlePhotoClick}
        className={cn(
          'relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-control bg-surface-muted',
          !large && 'sm:w-1/2',
          editable && 'cursor-crosshair',
        )}
      >
        <img src={url} alt="" className="pointer-events-none h-full w-full select-none object-cover" />
        {markers.map((m, i) => (
          <Marker key={m.id} index={i} x={m.x} y={m.y} />
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {markers.length === 0 && pendingXY === null && (
          <p className="text-sm text-ink-faint">
            {editable ? 'Кликни по фото, чтобы отметить место изменения' : 'Отметок нет'}
          </p>
        )}

        {editable && pendingXY && (
          <div className="flex flex-col gap-2 rounded-control border border-primary bg-primary/5 p-3">
            <span className="text-xs font-medium text-ink-muted">Это та же правка, что и на другом фото, или новая?</span>
            {changes.length > 0 && (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {changes.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickExisting(c.id)}
                    className="rounded-control border border-border px-2 py-1.5 text-left text-sm text-ink hover:border-primary"
                  >
                    <span className="font-semibold">{i + 1}.</span> {c.comment || 'Без описания'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={pickNew} className="text-sm font-semibold text-primary underline underline-offset-2">
                + Новая правка
              </button>
              <button
                type="button"
                onClick={() => setPendingXY(null)}
                className="text-sm text-ink-faint underline underline-offset-2"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {markers.map((m, i) => {
          const change = changesById[m.changeId] ?? emptyChange;
          return (
            <div key={m.id} className="flex items-start gap-2">
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {i + 1}
              </span>
              {editable ? (
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Textarea
                      value={change.comment}
                      onChange={(e) => onChangeComment?.(m.changeId, e.target.value)}
                      rows={2}
                      placeholder="Что изменить в этом месте..."
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveMarker?.(m.id)}
                      aria-label="Убрать метку с этого фото"
                      className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 rounded-control border border-border p-2">
                    <span className="text-xs font-medium text-ink-muted">Референс на модель/товар (необязательно)</span>
                    <div className="flex items-start gap-2">
                      {change.referenceImageUrl ? (
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                          <img src={change.referenceImageUrl} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => onChangeReferenceImage?.(m.changeId, '')}
                            aria-label="Убрать фото модели"
                            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink/70 text-white"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => triggerReferenceUpload(m.changeId)}
                          disabled={uploadingPinId === m.changeId}
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-control border border-dashed border-border text-ink-faint hover:border-border-strong disabled:opacity-50"
                        >
                          {uploadingPinId === m.changeId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <span className="text-[9px]">Фото</span>
                        </button>
                      )}
                      <Input
                        placeholder="Ссылка на товар"
                        value={change.referenceUrl}
                        onChange={(e) => onChangeReferenceUrl?.(m.changeId, e.target.value)}
                        className="flex-1 py-2.5"
                      />
                    </div>
                    <Textarea
                      value={change.referenceDescription}
                      onChange={(e) => onChangeReferenceDescription?.(m.changeId, e.target.value)}
                      rows={2}
                      placeholder="Описание модели: материал, цвет, производитель..."
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="whitespace-pre-wrap pt-1 text-sm text-ink">{change.comment || '—'}</p>
                  {changeHasReference(change) && (
                    <button
                      type="button"
                      onClick={() => setOpenReferenceChange(change)}
                      className="w-fit text-xs font-semibold text-primary underline underline-offset-2"
                    >
                      Референс
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <input ref={referenceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceFileChange} />
      {openReferenceChange && <ReferencePopup change={openReferenceChange} onClose={() => setOpenReferenceChange(null)} />}
    </div>
  );
}
