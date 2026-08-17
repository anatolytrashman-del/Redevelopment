import { X } from 'lucide-react';
import { AnnotatedPhoto } from './AnnotatedPhoto';
import type { PhotoPin } from '../../data/briefs';
import { cn } from '../../lib/cn';

interface PhotoLightboxProps {
  // null — закрыт. Открывается кликом по миниатюре в PhotoThumbGrid/галерее.
  url: string | null;
  onClose: () => void;
  // Если передан pins — показывается большая версия AnnotatedPhoto (точки +
  // список комментариев сбоку). Без pins — просто увеличенное фото, без
  // разметки (планировки, референс "после").
  pins?: PhotoPin[];
  editable?: boolean;
  onAddPin?: (x: number, y: number) => void;
  onChangeComment?: (pinId: string, comment: string) => void;
  onRemovePin?: (pinId: string) => void;
  onChangeReferenceImage?: (pinId: string, url: string) => void;
  onChangeReferenceDescription?: (pinId: string, description: string) => void;
  onChangeReferenceUrl?: (pinId: string, url: string) => void;
  copyTargets?: { url: string; label: string }[];
  onCopyPins?: (targetUrls: string[]) => void;
}

// Просмотр фото поверх страницы вместо открытия новой вкладки. Размер
// зависит от того, зачем открыли: редактирование точек (editable) требует
// крупного фото, чтобы реально можно было точно попасть кликом — там во
// всю ширину. Обычный просмотр (посмотреть планировку/референс/точки на
// публичной странице) — компактное окно, примерно треть экрана, полноэкранный
// размер тут не нужен и только мешает.
export function PhotoLightbox({
  url,
  onClose,
  pins,
  editable,
  onAddPin,
  onChangeComment,
  onRemovePin,
  onChangeReferenceImage,
  onChangeReferenceDescription,
  onChangeReferenceUrl,
  copyTargets,
  onCopyPins,
}: PhotoLightboxProps) {
  if (!url) return null;

  const compact = !editable;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/70" />
      <div
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-6',
          compact ? 'max-w-md' : 'max-w-4xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink-muted hover:text-ink"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>

        {pins ? (
          <AnnotatedPhoto
            url={url}
            pins={pins}
            editable={editable}
            onAddPin={onAddPin}
            onChangeComment={onChangeComment}
            onRemovePin={onRemovePin}
            onChangeReferenceImage={onChangeReferenceImage}
            onChangeReferenceDescription={onChangeReferenceDescription}
            onChangeReferenceUrl={onChangeReferenceUrl}
            copyTargets={copyTargets}
            onCopyPins={onCopyPins}
            large
          />
        ) : (
          <img src={url} alt="" className="max-h-[80vh] w-full rounded-control object-contain" />
        )}
      </div>
    </div>
  );
}
