import { useState } from 'react';
import type { MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';

interface PhotoCarouselProps {
  images: string[];
  alt?: string;
  imgClassName?: string;
  onImageClick?: (index: number) => void;
}

// Компактный слайдер по фото объекта — используется и на превью карточки в
// списке объектов (Objects.tsx), и на большом фото в карточке объекта
// (ObjectDetail.tsx). Стрелки сами stopPropagation/preventDefault, чтобы не
// перехватывать клик на само фото (открыть лайтбокс) или клик на всю
// карточку (переход на страницу объекта). Своей обёртки не рисует — родитель
// должен быть position:relative + overflow:hidden, у разных мест
// использования разный aspect-ratio/фон, дублировать их здесь незачем.
export function PhotoCarousel({ images, alt = '', imgClassName, onImageClick }: PhotoCarouselProps) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ImageOff className="h-6 w-6 text-ink-faint" />
      </div>
    );
  }

  const safeIndex = Math.min(index, images.length - 1);

  function go(e: MouseEvent, delta: number) {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + delta + images.length) % images.length);
  }

  return (
    <>
      <img
        src={images[safeIndex]}
        alt={alt}
        onClick={
          onImageClick
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onImageClick(safeIndex);
              }
            : undefined
        }
        className={cn('h-full w-full object-cover', onImageClick && 'cursor-zoom-in', imgClassName)}
      />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, -1)}
            aria-label="Предыдущее фото"
            className="absolute left-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow-sm hover:bg-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => go(e, 1)}
            aria-label="Следующее фото"
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow-sm hover:bg-white"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-1.5 right-1.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-ink shadow-sm">
            {safeIndex + 1}/{images.length}
          </div>
        </>
      )}
    </>
  );
}
