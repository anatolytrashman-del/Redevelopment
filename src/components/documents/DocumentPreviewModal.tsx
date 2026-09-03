import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

export interface PreviewFile {
  url: string;
  fileName: string;
}

type FileKind = 'pdf' | 'image' | 'docx' | 'other';

function fileKind(fileName: string): FileKind {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'docx') return 'docx';
  return 'other';
}

// .doc (старый бинарный формат) сюда сознательно не входит — docx-preview
// понимает только .docx (это по сути zip с XML), .doc так не распарсить.
export function isPreviewable(fileName: string): boolean {
  return fileKind(fileName) !== 'other';
}

// Общая модалка предпросмотра — PDF и картинки открываются как раньше
// (iframe/img), а .docx рендерится прямо в браузере через docx-preview
// (без внешних сервисов вроде Google Docs Viewer — файлы могут быть не
// предназначены для чужих глаз, например сканы договоров с подрядчиками).
// footer — необязательный слот под областью предпросмотра для действий,
// специфичных для места использования (например, "Распознать данные
// автоматически" в переписке с поставщиками, SupplierCorrespondenceTab.tsx)
// — сама модалка общая для всего проекта (документы юрлица, сметы,
// объекты), ничего доменного про счета/КП в неё не зашито.
export function DocumentPreviewModal({
  file,
  onClose,
  footer,
}: {
  file: PreviewFile | null;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!file) return;
    setLoading(true);
    setError(null);
    if (fileKind(file.fileName) !== 'docx') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error('Не удалось загрузить файл');
        const blob = await res.blob();
        if (cancelled || !docxContainerRef.current) return;
        docxContainerRef.current.innerHTML = '';
        await renderAsync(blob, docxContainerRef.current, undefined, { inWrapper: false, ignoreLastRenderedPageBreak: false });
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось показать документ');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return null;
  const kind = fileKind(file.fileName);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={cn('relative flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 p-4', glassCardClass)}
        style={glassCardShadow}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-semibold text-ink">{file.fileName}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative min-h-[70vh] flex-1 overflow-auto rounded-control bg-surface-muted">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Загружаем документ...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-danger">{error}</div>
          )}
          {kind === 'pdf' && (
            <iframe
              src={file.url}
              title={file.fileName}
              onLoad={() => setLoading(false)}
              className="h-full min-h-[70vh] w-full"
            />
          )}
          {kind === 'image' && (
            <img
              src={file.url}
              alt={file.fileName}
              onLoad={() => setLoading(false)}
              className="mx-auto h-full max-h-[70vh] w-auto object-contain"
            />
          )}
          {kind === 'docx' && <div ref={docxContainerRef} className="docx-preview-container mx-auto w-full bg-white" />}
        </div>
        {footer}
      </div>
    </div>,
    document.body,
  );
}
