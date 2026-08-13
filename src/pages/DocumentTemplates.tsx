import { useEffect, useState } from 'react';
import { Plus, Loader2, Pencil, FileText, ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import type { DocumentTemplate } from '../data/documentTemplates';
import { fetchDocumentTemplates, insertDocumentTemplate, updateDocumentTemplate } from '../lib/documentTemplatesApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

const emptyForm = { name: '', url: '' };

function templateToForm(t: DocumentTemplate) {
  return { name: t.name, url: t.url };
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

  useEffect(() => {
    fetchDocumentTemplates()
      .then(setTemplates)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить шаблоны')))
      .finally(() => setLoading(false));
  }, []);

  const canSubmit = form.name.trim() && form.url.trim();

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = { name: form.name.trim(), url: form.url.trim() };
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
    </>
  );
}
