import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PhotoChange } from '../../data/briefs';

// Мини-карточка референса на конкретную модель/товар — открывается по
// ссылке "Референс" у правки, а не показывается сразу картинкой (та
// загораживала бы само фото "до"). Ссылка на товар открывается в новой
// вкладке намеренно: это внешняя страница поставщика, не наше изображение.
export function ReferencePopup({ change, onClose }: { change: PhotoChange; onClose: () => void }) {
  // Портал в document.body — см. комментарий у Modal.tsx: иначе "fixed"
  // считает своим предком ближайшую карточку с backdrop-blur и накрывает
  // не весь экран, а только её область.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        // Защита на случай, если компонент смонтирован внутри кликабельной
        // обёртки фото — без остановки клик по подложке долетел бы и до
        // неё, открыв заодно и лайтбокс с фото.
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
        <span className="max-w-[85%] break-words text-sm font-bold text-ink">{change.comment || 'Референс'}</span>
        {change.referenceImageUrl && (
          <img src={change.referenceImageUrl} alt="" className="aspect-[4/3] w-full rounded-control object-cover" />
        )}
        {change.referenceDescription && (
          <p className="whitespace-pre-wrap text-sm text-ink-muted">{change.referenceDescription}</p>
        )}
        {change.referenceUrl && (
          <a
            href={change.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm font-semibold text-primary underline underline-offset-2"
          >
            Ссылка на товар
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}
