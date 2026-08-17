import { useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Textarea } from '../ui/Textarea';
import { cn } from '../../lib/cn';
import type { PhotoPin } from '../../data/briefs';
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

interface AnnotatedPhotoProps {
  url: string;
  pins: PhotoPin[];
  // Редактируемый режим — клик по фото ставит точку, комментарий можно
  // печатать и удалять. В режиме просмотра (публичная страница) — только
  // метки и текст, без взаимодействия.
  editable?: boolean;
  onAddPin?: (x: number, y: number) => void;
  onChangeComment?: (pinId: string, comment: string) => void;
  onRemovePin?: (pinId: string) => void;
  onChangeReferenceImage?: (pinId: string, url: string) => void;
  // Крупный показ внутри PhotoLightbox — фото занимает больше места, чтобы
  // по нему было реально удобно кликать точками (в маленькой миниатюре
  // не попасть).
  large?: boolean;
}

// Фото с точками-комментариями поверх — клик по фото (в редактируемом
// режиме) ставит точку и заводит для неё пустой комментарий. Список
// комментариев показан сбоку от фото, пронумерован в тон меткам на самом
// фото — что и как менять в этом месте. Удаление самого фото — забота
// вызывающего (миниатюра в PhotoThumbGrid), не этого компонента.
//
// aspect-[16/9] у фото — намеренно тот же, что и у HeroAnnotatedPhoto: у
// object-cover кадрирование зависит от соотношения сторон контейнера, и при
// разных aspect-ratio в двух местах одна и та же точка (x/y в процентах)
// визуально съезжает. Единственный способ не ловить этот баг — держать
// соотношение сторон одинаковым везде, где рисуются реальные метки.
export function AnnotatedPhoto({
  url,
  pins,
  editable = false,
  onAddPin,
  onChangeComment,
  onRemovePin,
  onChangeReferenceImage,
  large = false,
}: AnnotatedPhotoProps) {
  const photoRef = useRef<HTMLDivElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [pendingPinId, setPendingPinId] = useState<string | null>(null);
  const [uploadingPinId, setUploadingPinId] = useState<string | null>(null);

  function handlePhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (!editable || !onAddPin) return;
    const rect = photoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onAddPin(x, y);
  }

  function triggerReferenceUpload(pinId: string) {
    setPendingPinId(pinId);
    referenceInputRef.current?.click();
  }

  async function handleReferenceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const pinId = pendingPinId;
    setPendingPinId(null);
    if (!file || !pinId) return;
    setUploadingPinId(pinId);
    try {
      const url = await uploadObjectImage(file);
      onChangeReferenceImage?.(pinId, url);
    } catch {
      // намеренно молча — необязательное поле, не блокируем работу с формой
    } finally {
      setUploadingPinId(null);
    }
  }

  return (
    <div className={cn('flex flex-col gap-4', large ? 'sm:flex-row sm:items-start' : 'sm:flex-row')}>
      <div
        ref={photoRef}
        onClick={handlePhotoClick}
        className={cn(
          'relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-control bg-surface-muted',
          large ? 'sm:w-3/5' : 'sm:w-1/2',
          editable && 'cursor-crosshair',
        )}
      >
        <img src={url} alt="" className="pointer-events-none h-full w-full select-none object-cover" />
        {pins.map((pin, i) => (
          <Marker key={pin.id} index={i} x={pin.x} y={pin.y} />
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {pins.length === 0 && (
          <p className="text-sm text-ink-faint">
            {editable ? 'Кликни по фото, чтобы отметить место изменения' : 'Отметок нет'}
          </p>
        )}
        {pins.map((pin, i) => (
          <div key={pin.id} className="flex items-start gap-2">
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {i + 1}
            </span>
            {editable ? (
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-start gap-2">
                  <Textarea
                    value={pin.comment}
                    onChange={(e) => onChangeComment?.(pin.id, e.target.value)}
                    rows={2}
                    placeholder="Что изменить в этом месте..."
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onRemovePin?.(pin.id)}
                    aria-label="Удалить отметку"
                    className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {pin.referenceImageUrl ? (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-surface-muted">
                    <img src={pin.referenceImageUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onChangeReferenceImage?.(pin.id, '')}
                      aria-label="Убрать фото модели"
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink/70 text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => triggerReferenceUpload(pin.id)}
                    disabled={uploadingPinId === pin.id}
                    className="flex w-fit items-center gap-1 text-xs text-ink-muted underline underline-offset-2 hover:text-primary disabled:opacity-50"
                  >
                    {uploadingPinId === pin.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    {uploadingPinId === pin.id ? 'Загружаем...' : 'Добавить фото модели/образца'}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="whitespace-pre-wrap pt-1 text-sm text-ink">{pin.comment || '—'}</p>
                {pin.referenceImageUrl && (
                  <img src={pin.referenceImageUrl} alt="" className="h-16 w-16 rounded-control object-cover" />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <input ref={referenceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceFileChange} />
    </div>
  );
}
