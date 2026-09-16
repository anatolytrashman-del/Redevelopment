import { useRef, useState } from 'react';
import { Loader2, Paperclip, Plus, X } from 'lucide-react';
import { Button } from './Button';
import { uploadObjectDocument } from '../../lib/objectsApi';
import type { DocumentFile } from '../../data/contractorDocuments';

// Один прикреплённый файл: загрузить, открыть, заменить, убрать. Заведён для
// закупок (доверенность, счёт, платёжка), но ничего специфичного для них не
// знает — обычное поле формы, отдающее наружу {url, fileName}.
//
// Бакет тот же общий `object-documents`, что у карточки организации и
// документов объекта (см. uploadObjectDocument).

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

export function FileField({
  label,
  file,
  onChange,
  addLabel = 'Загрузить',
}: {
  label?: string;
  file: DocumentFile | null;
  onChange: (file: DocumentFile | null) => void;
  addLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(selected: File | null) {
    if (!selected) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadObjectDocument(selected));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
      // Сброс значения — иначе повторный выбор ТОГО ЖЕ файла не даёт события
      // change и загрузка молча не стартует.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <div className="flex flex-wrap items-center gap-2">
        {file && (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-ink hover:border-primary"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{file.fileName}</span>
          </a>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        >
          {uploading ? 'Загружаем...' : file ? 'Заменить' : addLabel}
        </Button>
        {file && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)} icon={<X className="h-4 w-4" />}>
            Убрать
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}
