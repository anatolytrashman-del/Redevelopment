import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

const AUTOPLAY_MS = 5000;

// Диагональные скосы у двух противоположных углов (верхний правый и нижний
// левый) вместо стандартных скруглений — одна и та же форма используется и
// для самой картинки, и для подложки под ней (см. ниже), чтобы срезы совпадали.
const CLIP_PATH =
  'polygon(0 0, calc(100% - 56px) 0, 100% 56px, 100% 100%, 56px 100%, 0 calc(100% - 56px))';

interface HeroImageSliderProps {
  images: string[];
}

// Слайдер рендеров кабинетов на продающей странице объекта — пока нет
// фото самого здания, это основная картинка на главном экране.
export function HeroImageSlider({ images }: HeroImageSliderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) return null;

  function go(delta: number) {
    setIndex((i) => (i + delta + images.length) % images.length);
  }

  return (
    <div className="relative aspect-video w-full">
      {/* Пастельная подложка, сдвинутая вниз-вправо, — создаёт эффект "слоёной"
          карточки вместо плоского прямоугольника. */}
      <div className="absolute inset-0 translate-x-3 translate-y-3 bg-warning-bg" style={{ clipPath: CLIP_PATH }} />

      {/* Обводка по всему контуру, включая диагональные срезы: box-shadow/ring
          не подходит — clip-path обрезает и его тоже, оставляя дыры на срезах.
          Вместо этого — сплошная заливка-рамка того же контура, а внутри неё
          с отступом (padding) вложен второй слой с тем же clip-path. Толще и
          тем же приглушённым пастельным тоном, что и подложка выше, а не
          ярким основным цветом. */}
      <div className="absolute inset-0 bg-warning-bg p-2.5" style={{ clipPath: CLIP_PATH }}>
        <div className="relative h-full w-full overflow-hidden bg-surface-muted" style={{ clipPath: CLIP_PATH }}>
          <img src={images[index]} alt="" className="h-full w-full object-cover" />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Предыдущее фото"
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow-card hover:bg-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Следующее фото"
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow-card hover:bg-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {images.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Показать фото ${i + 1}`}
                    className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/60')}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
