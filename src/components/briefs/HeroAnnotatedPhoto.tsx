import { useState } from 'react';
import { pinHasReference, type PhotoPin } from '../../data/briefs';
import { ReferencePopup } from './ReferencePopup';
import { cn } from '../../lib/cn';

// Крупное фото "до" (когда оно одно в категории — тот же размер, что и у
// референса "после", вместо мелкой миниатюры) с комментариями прямо на
// подложке поверх фото рядом с точкой, а не в отдельном списке сбоку.
// Фото модели/товара не выводится сразу картинкой (загораживала бы кадр) —
// вместо неё ссылка "Референс", открывающая мини-карточку (ReferencePopup).
export function HeroAnnotatedPhoto({ url, pins, onOpen }: { url: string; pins: PhotoPin[]; onOpen: () => void }) {
  const [openReferencePin, setOpenReferencePin] = useState<PhotoPin | null>(null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="relative block aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-control bg-surface-muted"
    >
      <img src={url} alt="" className="h-full w-full object-cover" />
      {pins.map((pin, i) => {
        const alignRight = pin.x > 60;
        return (
          <div
            key={pin.id}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            className={cn(
              'absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5',
              alignRight && 'flex-row-reverse',
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-sm">
              {i + 1}
            </span>
            {(pin.comment || pinHasReference(pin)) && (
              <div className="flex max-w-[220px] flex-col gap-1 rounded-lg bg-ink/80 px-2 py-1.5 text-xs text-white shadow-sm backdrop-blur-sm">
                {pin.comment && <span>{pin.comment}</span>}
                {pinHasReference(pin) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenReferencePin(pin);
                    }}
                    className="w-fit font-semibold underline underline-offset-2"
                  >
                    Референс
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {openReferencePin && (
        <ReferencePopup
          pin={openReferencePin}
          onClose={() => setOpenReferencePin(null)}
        />
      )}
    </div>
  );
}
