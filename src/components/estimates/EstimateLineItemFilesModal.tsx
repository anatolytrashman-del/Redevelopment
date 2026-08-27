import { useState } from 'react';
import { Loader2, Paperclip, Upload, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { EstimateLineItem } from '../../data/estimates';
import { uploadSupplierFile } from '../../lib/supplierResearchApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface EstimateLineItemFilesModalProps {
  item: EstimateLineItem | null;
  onClose: () => void;
  // Сохраняет строку целиком (с обновлённым files) — тот же принцип, что и
  // у EstimateLineItemCommentsModal (файлы — вложенный массив внутри самой
  // строки, не отдельная таблица).
  onSave: (item: EstimateLineItem) => Promise<void>;
}

// Спецификации материалов и счета/КП от поставщиков конкретно на эту строку
// работ — отдельно от общего списка материалов раздела (EstimateMaterialsPanel):
// там снабжение на весь раздел, здесь — прицельно на одну строку, когда уже
// понятно, какой материал/поставщик к ней относится.
export function EstimateLineItemFilesModal({ item, onClose, onSave }: EstimateLineItemFilesModalProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !item) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadSupplierFile(file);
      await onSave({ ...item, files: [...item.files, uploaded] });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(index: number) {
    if (!item) return;
    setError(null);
    try {
      await onSave({ ...item, files: item.files.filter((_, i) => i !== index) });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить файл'));
    }
  }

  return (
    <Modal open onClose={onClose} title="Спецификации и счета">
      <div className="flex flex-col gap-4">
        <div className="rounded-control bg-surface-muted p-3 text-sm text-ink-muted">{item.workType}</div>

        {item.files.length === 0 && <p className="py-1 text-sm text-ink-faint">Файлов пока нет.</p>}

        <div className="flex flex-col gap-1.5">
          {item.files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary hover:underline">
                {f.fileName}
              </a>
              <button
                type="button"
                onClick={() => handleRemove(i)}
                aria-label="Удалить файл"
                className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Загружаем...' : 'Загрузить спецификацию или счёт'}
          <input type="file" className="hidden" disabled={uploading} onChange={handleUpload} />
        </label>

        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </Modal>
  );
}
