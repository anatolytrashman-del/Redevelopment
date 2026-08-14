import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

const AUTOPLAY_MS = 5000;

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
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card bg-surface-muted">
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
  );
}
