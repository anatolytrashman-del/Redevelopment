import { useRef } from 'react';
import type { MouseEvent } from 'react';
import { X } from 'lucide-react';
import { Textarea } from '../ui/Textarea';
import { cn } from '../../lib/cn';
import type { PhotoPin } from '../../data/briefs';

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
  onRemovePhoto?: () => void;
}

// Фото с точками-комментариями поверх — клик по фото (в редактируемом
// режиме) ставит точку и заводит для неё пустой комментарий. Список
// комментариев показан сбоку от фото, пронумерован в тон меткам на самом
// фото — что и как менять в этом месте.
export function AnnotatedPhoto({
  url,
  pins,
  editable = false,
  onAddPin,
  onChangeComment,
  onRemovePin,
  onRemovePhoto,
}: AnnotatedPhotoProps) {
  const photoRef = useRef<HTMLDivElement>(null);

  function handlePhotoClick(e: MouseEvent<HTMLDivElement>) {
    if (!editable || !onAddPin) return;
    const rect = photoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    onAddPin(x, y);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div
        ref={photoRef}
        onClick={handlePhotoClick}
        className={cn(
          'relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-control bg-surface-muted sm:w-1/2',
          editable && 'cursor-crosshair',
        )}
      >
        <img src={url} alt="" className="pointer-events-none h-full w-full select-none object-cover" />
        {pins.map((pin, i) => (
          <Marker key={pin.id} index={i} x={pin.x} y={pin.y} />
        ))}
        {editable && onRemovePhoto && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemovePhoto();
            }}
            aria-label="Удалить фото"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
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
              <>
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
              </>
            ) : (
              <p className="whitespace-pre-wrap pt-1 text-sm text-ink">{pin.comment || '—'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
