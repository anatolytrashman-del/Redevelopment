import { useState } from 'react';
import { Pencil, Trash2, Plus, Upload, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { EstimateMaterial, EstimateSection } from '../../data/estimates';
import type { DocumentFile } from '../../data/contractorDocuments';
import { uploadSupplierFile } from '../../lib/supplierResearchApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatQty(m: EstimateMaterial): string {
  if (m.quantity == null) return '—';
  return `${m.quantity.toLocaleString('ru-RU')}${m.unit ? ` ${m.unit}` : ''}`;
}

interface EstimateMaterialsPanelProps {
  section: EstimateSection;
  onAdd: () => void;
  onEdit: (material: EstimateMaterial) => void;
  onDelete: (material: EstimateMaterial) => void;
  onFilesChange: (files: DocumentFile[]) => Promise<void>;
}

// Список материалов раздела ("что закупить") + отдельно счета/КП от
// поставщиков на эти материалы (см. комментарий у EstimateMaterial/
// materialFiles в data/estimates.ts — владелец специально попросил
// снабжение (список + документы) отдельно от построчной сметы (цены).
export function EstimateMaterialsPanel({ section, onAdd, onEdit, onDelete, onFilesChange }: EstimateMaterialsPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setFilesError(null);
    try {
      const uploaded = await uploadSupplierFile(file);
      await onFilesChange([...section.materialFiles, uploaded]);
    } catch (err) {
      setFilesError(errorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
    }
  }

  async function handleFileRemove(index: number) {
    setFilesError(null);
    try {
      await onFilesChange(section.materialFiles.filter((_, i) => i !== index));
    } catch (err) {
      setFilesError(errorMessage(err, 'Не удалось удалить файл'));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">Список материалов</span>

        {section.materials.length > 0 && (
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2">Название</th>
                  <th className="px-3 py-2 text-right">Кол-во</th>
                  <th className="px-3 py-2">Заметка</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {section.materials.map((m) => (
                  <tr key={m.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-ink">{m.name}</td>
                    <td className="px-3 py-2 text-right text-ink-muted">{formatQty(m)}</td>
                    <td className="max-w-[240px] px-3 py-2 text-ink-muted">
                      <span className="line-clamp-2">{m.note || '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(m)}
                          aria-label="Редактировать материал"
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(m)}
                          aria-label="Удалить материал"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={onAdd}>
          Добавить материал
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-sm font-medium text-ink">Счета и КП от поставщиков</span>

        {section.materialFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {section.materialFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-primary hover:underline"
                >
                  {f.fileName}
                </a>
                <button
                  type="button"
                  onClick={() => handleFileRemove(i)}
                  aria-label="Удалить файл"
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {filesError && <p className="text-sm text-danger">{filesError}</p>}

        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Загружаем...' : 'Загрузить счёт или КП'}
          <input type="file" className="hidden" disabled={uploading} onChange={handleFileSelect} />
        </label>
      </div>
    </div>
  );
}
