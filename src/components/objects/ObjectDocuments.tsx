import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, FileText, Loader2, Upload, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import {
  objectDocumentCategories,
  objectDocumentLabels,
  type ObjectDocumentCategory,
  type ObjectDocumentFile,
  type ObjectDocuments,
} from '../../data/objects';
import { uploadObjectDocument } from '../../lib/objectsApi';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isPreviewable(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
}

interface ObjectDocumentsCardProps {
  documents: ObjectDocuments;
  onChange: (documents: ObjectDocuments) => Promise<void>;
}

export function ObjectDocumentsCard({ documents, onChange }: ObjectDocumentsCardProps) {
  const [uploadingCategory, setUploadingCategory] = useState<ObjectDocumentCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ObjectDocumentFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const inputRefs = useRef<Partial<Record<ObjectDocumentCategory, HTMLInputElement | null>>>({});

  function openPreview(file: ObjectDocumentFile) {
    setPreviewLoading(true);
    setPreview(file);
  }

  async function handleFile(category: ObjectDocumentCategory, file: File) {
    setUploadingCategory(category);
    setError(null);
    try {
      const uploaded = await uploadObjectDocument(file);
      const nextFile: ObjectDocumentFile = { ...uploaded, uploadedAt: new Date().toISOString() };
      await onChange({ ...documents, [category]: nextFile });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    } finally {
      setUploadingCategory(null);
    }
  }

  async function handleRemove(category: ObjectDocumentCategory) {
    setError(null);
    const next = { ...documents };
    delete next[category];
    try {
      await onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить файл');
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="font-bold text-ink">Документы объекта</div>
      <div className="flex flex-col gap-2">
        {objectDocumentCategories.map((category) => {
          const file = documents[category];
          const uploading = uploadingCategory === category;
          return (
            <div key={category} className="flex items-center gap-3 rounded-control border border-border px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{objectDocumentLabels[category]}</div>
                {file ? (
                  <div className="truncate text-xs text-ink-muted">
                    {file.fileName} · {formatDate(file.uploadedAt)}
                  </div>
                ) : (
                  <div className="text-xs text-ink-faint">Файл не загружен</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {file && isPreviewable(file.fileName) && (
                  <button
                    type="button"
                    onClick={() => openPreview(file)}
                    aria-label="Просмотреть"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                {file && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Скачать"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                )}
                <input
                  ref={(el) => {
                    inputRefs.current[category] = el;
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) handleFile(category, f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputRefs.current[category]?.click()}
                  disabled={uploading}
                  aria-label={file ? 'Заменить файл' : 'Загрузить файл'}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </button>
                {file && (
                  <button
                    type="button"
                    onClick={() => handleRemove(category)}
                    aria-label="Удалить файл"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {preview &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setPreview(null)} />
            <div className={cn('relative flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 p-4', glassCardClass)} style={glassCardShadow}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{preview.fileName}</span>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="Закрыть"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative min-h-[70vh] flex-1 overflow-hidden rounded-control bg-surface-muted">
                {previewLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-muted">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Загружаем документ...
                  </div>
                )}
                {preview.fileName.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={preview.url}
                    title={preview.fileName}
                    onLoad={() => setPreviewLoading(false)}
                    className="h-full min-h-[70vh] w-full"
                  />
                ) : (
                  <img
                    src={preview.url}
                    alt={preview.fileName}
                    onLoad={() => setPreviewLoading(false)}
                    className="mx-auto h-full max-h-[70vh] w-auto object-contain"
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Card>
  );
}
