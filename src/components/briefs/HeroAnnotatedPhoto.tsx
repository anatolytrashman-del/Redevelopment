import type { PhotoPin } from '../../data/briefs';
import { cn } from '../../lib/cn';

// Крупное фото "до" (когда оно одно в категории — тот же размер, что и у
// референса "после", вместо мелкой миниатюры) с комментариями прямо на
// подложке поверх фото рядом с точкой, а не в отдельном списке сбоку.
// Экспериментальный формат — если станет нечитаемо при плотных точках,
// вернуться к списку сбоку (см. AnnotatedPhoto).
export function HeroAnnotatedPhoto({ url, pins, onOpen }: { url: string; pins: PhotoPin[]; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative block aspect-[16/9] w-full overflow-hidden rounded-control bg-surface-muted">
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
            {pin.comment && (
              <span className="max-w-[220px] rounded-lg bg-ink/80 px-2 py-1 text-xs text-white shadow-sm backdrop-blur-sm">
                {pin.comment}
              </span>
            )}
          </div>
        );
      })}
    </button>
  );
}
