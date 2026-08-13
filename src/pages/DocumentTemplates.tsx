import { useEffect, useState } from 'react';
import { Plus, Loader2, Pencil, FileText, ExternalLink, WandSparkles, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { GenerateDocumentModal } from '../components/documentTemplates/GenerateDocumentModal';
import type { DocumentTemplate, TemplateField, TemplateFieldType } from '../data/documentTemplates';
import { fetchDocumentTemplates, insertDocumentTemplate, updateDocumentTemplate } from '../lib/documentTemplatesApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const fieldTypes: TemplateFieldType[] = ['text', 'date'];
const fieldTypeLabels: Record<TemplateFieldType, string> = { text: 'Текст', date: 'Дата' };

const emptyForm = { name: '', url: '', fields: [] as TemplateField[] };

function templateToForm(t: DocumentTemplate) {
  return { name: t.name, url: t.url, fields: t.fields };
}

export function DocumentTemplates() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState<DocumentTemplate | null>(null);

  useEffect(() => {
    fetchDocumentTemplates()
      .then(setTemplates)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить шаблоны')))
      .finally(() => setLoading(false));
  }, []);

  const canSubmit = form.name.trim() && form.url.trim() && form.fields.every((f) => f.key.trim() && f.label.trim());

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setSubmitError(null);
    setOpen(true);
  }

  function openEditModal(t: DocumentTemplate) {
    setEditingId(t.id);
    setForm(templateToForm(t));
    setSubmitError(null);
    setOpen(true);
  }

  function addField() {
    setForm((f) => ({ ...f, fields: [...f.fields, { key: '', label: '', type: 'text' }] }));
  }

  function updateField(index: number, patch: Partial<TemplateField>) {
    setForm((f) => ({
      ...f,
      fields: f.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  }

  function removeField(index: number) {
    setForm((f) => ({ ...f, fields: f.fields.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = { name: form.name.trim(), url: form.url.trim(), fields: form.fields };
    try {
      if (editingId) {
        const updated = await updateDocumentTemplate(editingId, payload);
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
      } else {
        const created = await insertDocumentTemplate(payload);
        setTemplates((prev) => [...prev, created]);
      }
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось сохранить шаблон'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Шаблоны документов"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAddModal}>
            Добавить шаблон
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {templates.map((t) => (
          <Card key={t.id} className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">{t.name}</div>
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-info-text hover:underline"
              >
                Открыть шаблон
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={<WandSparkles className="h-4 w-4" />}
              onClick={() => setGeneratingTemplate(t)}
            >
              Заполнить
            </Button>
            <button
              type="button"
              onClick={() => openEditModal(t)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
              aria-label="Редактировать шаблон"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </Card>
        ))}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем шаблоны...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && templates.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Шаблонов пока нет</Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? 'Редактировать шаблон' : 'Новый шаблон'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Название"
            placeholder="Например, Соглашение о намерениях"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Ссылка на документ"
            placeholder="https://docs.google.com/..."
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            required
          />

          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-muted">
              Поля для заполнения — ключ должен совпадать с меткой {'{{ключ}}'} внутри документа
            </span>
            {form.fields.map((field, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    label="Название поля"
                    placeholder="Например, ФИО покупателя"
                    value={field.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    label="Ключ {{...}}"
                    placeholder="buyer_name"
                    value={field.key}
                    onChange={(e) => updateField(i, { key: e.target.value })}
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Select
                    label="Тип"
                    options={fieldTypes.map((t) => fieldTypeLabels[t])}
                    value={fieldTypeLabels[field.type]}
                    onChange={(v) => {
                      const type = fieldTypes.find((t) => fieldTypeLabels[t] === v) ?? 'text';
                      updateField(i, { type });
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  aria-label="Удалить поле"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addField} className="w-fit">
              Добавить поле
            </Button>
          </div>

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <GenerateDocumentModal template={generatingTemplate} onClose={() => setGeneratingTemplate(null)} />
    </>
  );
}
