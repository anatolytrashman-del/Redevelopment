import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { glassCardShadow } from '../../lib/glass';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Портал в document.body — иначе фиксированная модалка позиционируется
  // не относительно вьюпорта, а относительно ближайшего предка с transform/
  // filter/backdrop-filter (у нас почти на каждой карточке — см. glassCardClass
  // с backdrop-blur), и часть контента страницы вылезает поверх модалки.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      {/* Не переиспользуем glassCardClass: он полупрозрачный и рассчитан на
          светлый фон страницы позади (как у Card). У модалки позади — тёмная
          затемняющая подложка выше, и то же стекло поверх неё выглядело мутным
          и плохо читаемым. Модалке нужен непрозрачный фон вне зависимости от
          того, что под ней. */}
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-3xl border border-white/80 bg-white p-6"
        style={glassCardShadow}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 break-words text-xl font-extrabold text-ink">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
