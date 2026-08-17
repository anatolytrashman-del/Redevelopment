import { X } from 'lucide-react';
import { PhotoThumbGrid } from './PhotoThumbGrid';

interface HeroOrGridProps {
  urls: string[];
  onOpen: (url: string) => void;
  onRemove?: (url: string) => void;
  emptyLabel: string;
}

// Одно фото — крупно на всю ширину блока (обычная ситуация для "после":
// один референс). Несколько — обычная компактная сетка миниатюр.
export function HeroOrGrid({ urls, onOpen, onRemove, emptyLabel }: HeroOrGridProps) {
  if (urls.length === 0) return <p className="text-sm text-ink-faint">{emptyLabel}</p>;

  if (urls.length === 1) {
    const url = urls[0];
    return (
      <div className="group relative aspect-[16/9] w-full overflow-hidden rounded-control bg-surface-muted">
        <button type="button" onClick={() => onOpen(url)} className="block h-full w-full">
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(url)}
            aria-label="Удалить фото"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return <PhotoThumbGrid items={urls.map((url) => ({ url }))} onOpen={onOpen} onRemove={onRemove} />;
}
