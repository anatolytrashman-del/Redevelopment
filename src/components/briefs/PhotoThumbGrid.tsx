import { X } from 'lucide-react';

export interface PhotoThumbItem {
  url: string;
  // Сколько точек-комментариев у этого фото — бейдж в углу миниатюры, чтобы
  // не открывать каждое фото ради подсчёта. Undefined — бейдж не нужен
  // (обычная галерея без разметки, например "после"/планировки).
  pinCount?: number;
}

interface PhotoThumbGridProps {
  items: PhotoThumbItem[];
  onOpen: (url: string) => void;
  onRemove?: (url: string) => void;
  captions?: Record<string, string>;
}

// Компактная сетка миниатюр вместо больших фото одно под другим — при
// десятке фото в категории список иначе растягивал страницу на километры.
// Клик по миниатюре открывает PhotoLightbox с крупной версией (там же и
// разметка точками, если она есть).
export function PhotoThumbGrid({ items, onOpen, onRemove, captions }: PhotoThumbGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map(({ url, pinCount }) => (
        <div key={url} className="flex flex-col gap-1">
          <div className="group relative aspect-[4/3] overflow-hidden rounded-control bg-surface-muted">
            <button type="button" onClick={() => onOpen(url)} className="block h-full w-full">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
            {!!pinCount && (
              <span className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pinCount}
              </span>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(url)}
                aria-label="Удалить фото"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {captions?.[url] && <span className="truncate text-xs text-ink-muted">{captions[url]}</span>}
        </div>
      ))}
    </div>
  );
}
