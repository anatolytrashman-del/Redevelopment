import { X } from 'lucide-react';
import type { PhotoPin } from '../../data/briefs';

// Мини-карточка референса на конкретную модель/товар — открывается по
// ссылке "Референс" у отметки, а не показывается сразу картинкой (та
// загораживала бы само фото "до"). Ссылка на товар открывается в новой
// вкладке намеренно: это внешняя страница поставщика, не наше изображение.
export function ReferencePopup({ pin, onClose }: { pin: PhotoPin; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        // Компонент часто монтируется внутри кликабельной обёртки фото
        // (HeroAnnotatedPhoto) — без остановки клик по подложке долетел бы
        // и до неё, открыв заодно и лайтбокс с фото.
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="absolute inset-0 bg-ink/70" />
      <div
        className="relative flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="max-w-[85%] break-words text-sm font-bold text-ink">{pin.comment || 'Референс'}</span>
        {pin.referenceImageUrl && (
          <img src={pin.referenceImageUrl} alt="" className="aspect-[4/3] w-full rounded-control object-cover" />
        )}
        {pin.referenceDescription && (
          <p className="whitespace-pre-wrap text-sm text-ink-muted">{pin.referenceDescription}</p>
        )}
        {pin.referenceUrl && (
          <a
            href={pin.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm font-semibold text-primary underline underline-offset-2"
          >
            Ссылка на товар
          </a>
        )}
      </div>
    </div>
  );
}
