import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface LightboxState {
  urls: string[];
  index: number;
}

interface ImageLightboxProps {
  state: LightboxState | null;
  onChange: (state: LightboxState | null) => void;
}

export function ImageLightbox({ state, onChange }: ImageLightboxProps) {
  useEffect(() => {
    if (!state) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onChange(null);
      if (e.key === 'ArrowLeft') {
        onChange(state ? { ...state, index: (state.index - 1 + state.urls.length) % state.urls.length } : state);
      }
      if (e.key === 'ArrowRight') {
        onChange(state ? { ...state, index: (state.index + 1) % state.urls.length } : state);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state, onChange]);

  if (!state) return null;

  // Портал в document.body — см. комментарий у Modal.tsx: без него фото
  // позиционировалось бы относительно ближайшего предка с backdrop-blur
  // (почти любая карточка в админке), а не всего экрана. z-[60], а не z-50
  // (как у обычных модалок) — лайтбокс должен уметь открыться поверх уже
  // открытой модалки (например, из карточки кабинета).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={() => onChange(null)}>
      <div className="absolute inset-0 bg-ink/70" />
      <img
        src={state.urls[state.index]}
        alt=""
        className="relative max-h-full max-w-full rounded-card object-contain shadow-card"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label="Закрыть"
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-card"
      >
        <X className="h-5 w-5" />
      </button>
      {state.urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ ...state, index: (state.index - 1 + state.urls.length) % state.urls.length });
            }}
            aria-label="Предыдущее фото"
            className="absolute left-6 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-card"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ ...state, index: (state.index + 1) % state.urls.length });
            }}
            aria-label="Следующее фото"
            className="absolute right-6 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink shadow-card"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
