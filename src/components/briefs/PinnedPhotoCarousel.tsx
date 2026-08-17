import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { changeHasReference, type PhotoChange, type PhotoMarker } from '../../data/briefs';
import { ReferencePopup } from './ReferencePopup';
import { cn } from '../../lib/cn';

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

interface PinnedPhotoCarouselProps {
  photos: { url: string; markers: PhotoMarker[] }[];
  // Общий список правок категории — текст/референс живут тут, метки на
  // фото хранят только ссылку (changeId).
  changesById: Record<string, PhotoChange>;
  // Клик по самому фото — открыть его ещё крупнее в лайтбоксе (не по
  // стрелкам/точкам слайдера, они отдельные соседние элементы, не внутри
  // кликабельной области фото).
  onOpenPhoto?: (url: string, markers: PhotoMarker[]) => void;
  emptyLabel?: string;
  // Подпись поверх текущего фото (например, "дизайн сгенерирован ИИ" у
  // референса фасада) — применима к любому кадру слайдера.
  overlayCaption?: string;
}

// Показ фото с метками правок — крупное фото слева со слайдером (несколько
// фото листаются по одному стрелками/точками, а не сеткой мелких миниатюр —
// на миниатюре точки не разглядеть), список правок для показанного фото —
// справа. Один формат и для "до", и для "после": обе стороны используют
// общий список правок категории (changesById), метки хранят только
// координаты и ссылку на правку.
export function PinnedPhotoCarousel({
  photos,
  changesById,
  onOpenPhoto,
  emptyLabel = 'Фото не загружены',
  overlayCaption,
}: PinnedPhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [openReferenceChange, setOpenReferenceChange] = useState<PhotoChange | null>(null);

  if (photos.length === 0) return <p className="text-sm text-ink-faint">{emptyLabel}</p>;

  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-control bg-surface-muted sm:w-3/5">
        <button type="button" onClick={() => onOpenPhoto?.(current.url, current.markers)} className="block h-full w-full">
          <img src={current.url} alt="" className="h-full w-full object-cover" />
        </button>
        {current.markers.map((m, i) => (
          <Marker key={m.id} index={i} x={m.x} y={m.y} />
        ))}
        {overlayCaption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-3 pb-2 pt-8">
            <span className="text-xs text-white">{overlayCaption}</span>
          </div>
        )}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
              aria-label="Предыдущее фото"
              className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white hover:bg-ink/80"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % photos.length)}
              aria-label="Следующее фото"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-ink/60 text-white hover:bg-ink/80"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Фото ${i + 1}`}
                  className={cn('h-1.5 w-1.5 rounded-full', i === index ? 'bg-white' : 'bg-white/40')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* max-h + overflow — иначе при переключении слайда список меняет
          высоту вслед за числом отметок у конкретного фото, и вся страница
          под блоком дёргается вверх-вниз. */}
      <div className="flex max-h-80 flex-1 flex-col gap-3 overflow-y-auto">
        {current.markers.length === 0 && <p className="text-sm text-ink-faint">Отметок нет</p>}
        {current.markers.map((m, i) => {
          const change = changesById[m.changeId] ?? emptyChange;
          return (
            <div key={m.id} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <p className="whitespace-pre-wrap text-sm text-ink">{change.comment || '—'}</p>
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
            </div>
          );
        })}
      </div>

      {openReferenceChange && <ReferencePopup change={openReferenceChange} onClose={() => setOpenReferenceChange(null)} />}
    </div>
  );
}
