import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pinHasReference, type PhotoPin } from '../../data/briefs';
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

interface BeforePhotoCarouselProps {
  photos: { url: string; pins: PhotoPin[] }[];
  // Клик по самому фото — открыть его ещё крупнее в лайтбоксе (не по
  // стрелкам/точкам слайдера, они отдельные соседние элементы, не внутри
  // кликабельной области фото).
  onOpenPhoto?: (url: string, pins: PhotoPin[]) => void;
}

// Публичный показ "Сейчас" — крупное фото слева со слайдером (несколько
// фото листаются по одному стрелками/точками, а не сеткой мелких
// миниатюр — на миниатюре точки не разглядеть), список правок для
// показанного фото — справа. Один формат для всех категорий, включая
// фасад: если фото одно, слайдер просто без стрелок.
export function BeforePhotoCarousel({ photos, onOpenPhoto }: BeforePhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [openReferencePin, setOpenReferencePin] = useState<PhotoPin | null>(null);

  if (photos.length === 0) return <p className="text-sm text-ink-faint">Фото не загружены</p>;

  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-control bg-surface-muted sm:w-3/5">
        <button type="button" onClick={() => onOpenPhoto?.(current.url, current.pins)} className="block h-full w-full">
          <img src={current.url} alt="" className="h-full w-full object-cover" />
        </button>
        {current.pins.map((pin, i) => (
          <Marker key={pin.id} index={i} x={pin.x} y={pin.y} />
        ))}
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

      <div className="flex flex-1 flex-col gap-3">
        {current.pins.length === 0 && <p className="text-sm text-ink-faint">Отметок нет</p>}
        {current.pins.map((pin, i) => (
          <div key={pin.id} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <p className="whitespace-pre-wrap text-sm text-ink">{pin.comment || '—'}</p>
              {pinHasReference(pin) && (
                <button
                  type="button"
                  onClick={() => setOpenReferencePin(pin)}
                  className="w-fit text-xs font-semibold text-primary underline underline-offset-2"
                >
                  Референс
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {openReferencePin && <ReferencePopup pin={openReferencePin} onClose={() => setOpenReferencePin(null)} />}
    </div>
  );
}
