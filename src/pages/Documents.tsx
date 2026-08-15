import { useEffect, useState } from 'react';
import {
  Plus,
  Loader2,
  Pencil,
  FileText,
  ExternalLink,
  X,
  FileCheck,
  Send,
  Hourglass,
  Archive,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { CreateDocumentModal } from '../components/documents/CreateDocumentModal';
import { documentStatuses, type DocumentStatus, type GeneratedDocument } from '../data/generatedDocuments';
import type { DocumentTemplate, TemplateField, TemplateFieldType } from '../data/documentTemplates';
import type { Lead } from '../data/leads';
import { fetchGeneratedDocuments, updateGeneratedDocumentStatus } from '../lib/generatedDocumentsApi';
import { fetchDocumentTemplates, insertDocumentTemplate, updateDocumentTemplate } from '../lib/documentTemplatesApi';
import { fetchLeads } from '../lib/leadsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

const statusMeta: Record<DocumentStatus, { icon: LucideIcon; className: string }> = {
  'Готов к отправке': { icon: FileCheck, className: 'bg-surface-muted text-ink-muted' },
  'Отправлен клиенту': { icon: Send, className: 'bg-info-bg text-info-text' },
  'Ждём от клиента': { icon: Hourglass, className: 'bg-warning-bg text-warning' },
  'Документ в архиве': { icon: Archive, className: 'bg-surface-muted text-ink-faint' },
};

const fieldTypes: TemplateFieldType[] = ['text', 'date', 'gender'];
const fieldTypeLabels: Record<TemplateFieldType, string> = { text: 'Текст', date: 'Дата', gender: 'Пол' };

const emptyTemplateForm = { name: '', url: '', fields: [] as TemplateField[] };

function templateToForm(t: DocumentTemplate) {
  return { name: t.name, url: t.url, fields: t.fields };
}

export function Documents() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateSubmitError, setTemplateSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchGeneratedDocuments()
      .then(setDocuments)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить документы')))
      .finally(() => setLoading(false));
    fetchDocumentTemplates()
      .then(setTemplates)
      .catch((err) => setTemplatesError(errorMessage(err, 'Не удалось загрузить шаблоны')))
      .finally(() => setTemplatesLoading(false));
    fetchLeads()
      .then(setLeads)
      .catch(() => setLeads([]));
  }, []);

  function templateName(templateId: string) {
    return templates.find((t) => t.id === templateId)?.name ?? '—';
  }

  function leadName(leadId: string) {
    return leads.find((l) => l.id === leadId)?.name ?? '—';
  }

  async function handleStatusChange(doc: GeneratedDocument, status: string) {
    if (updatingId) return;
    setUpdatingId(doc.id);
    setUpdateError(null);
    const next = { ...doc, status: status as DocumentStatus };
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? next : d)));
    try {
      const updated = await updateGeneratedDocumentStatus(doc.id, status as DocumentStatus);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
    } catch (err) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
      setUpdateError(errorMessage(err, 'Не удалось изменить статус'));
    } finally {
      setUpdatingId(null);
    }
  }

  const canSubmitTemplate =
    templateForm.name.trim() &&
    templateForm.url.trim() &&
    templateForm.fields.every((f) => f.key.trim() && f.label.trim());

  function openAddTemplateModal() {
    setEditingTemplateId(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateSubmitError(null);
    setTemplateModalOpen(true);
  }

  function openEditTemplateModal(t: DocumentTemplate) {
    setEditingTemplateId(t.id);
    setTemplateForm(templateToForm(t));
    setTemplateSubmitError(null);
    setTemplateModalOpen(true);
  }

  function addTemplateField() {
    setTemplateForm((f) => ({ ...f, fields: [...f.fields, { key: '', label: '', type: 'text' }] }));
  }

  function updateTemplateField(index: number, patch: Partial<TemplateField>) {
    setTemplateForm((f) => ({
      ...f,
      fields: f.fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    }));
  }

  function removeTemplateField(index: number) {
    setTemplateForm((f) => ({ ...f, fields: f.fields.filter((_, i) => i !== index) }));
  }

  async function handleTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitTemplate || templateSubmitting) return;

    setTemplateSubmitting(true);
    setTemplateSubmitError(null);
    const payload = { name: templateForm.name.trim(), url: templateForm.url.trim(), fields: templateForm.fields };
    try {
      if (editingTemplateId) {
        const updated = await updateDocumentTemplate(editingTemplateId, payload);
        setTemplates((prev) => prev.map((t) => (t.id === editingTemplateId ? updated : t)));
      } else {
        const created = await insertDocumentTemplate(payload);
        setTemplates((prev) => [...prev, created]);
      }
      setTemplateForm(emptyTemplateForm);
      setEditingTemplateId(null);
      setTemplateModalOpen(false);
    } catch (err) {
      setTemplateSubmitError(errorMessage(err, 'Не удалось сохранить шаблон'));
    } finally {
      setTemplateSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Документы"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Создать документ
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {documents.map((doc) => {
          const meta = statusMeta[doc.status];
          const Icon = meta?.icon ?? FileCheck;
          return (
            <Card key={doc.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta?.className ?? 'bg-surface-muted text-ink-muted'}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{doc.title}</div>
                  <div className="truncate text-sm text-ink-muted">
                    {templateName(doc.templateId)} · {leadName(doc.leadId)} · {formatDate(doc.createdAt)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <div className="w-full sm:w-52">
                  <Select
                    pill
                    options={[...documentStatuses]}
                    value={doc.status}
                    onChange={(v) => handleStatusChange(doc, v)}
                    triggerClassName={meta?.className}
                  />
                </div>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  aria-label="Открыть документ"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </Card>
          );
        })}

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем документы...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
        {!loading && !loadError && documents.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Документов пока нет</Card>
        )}
        {updateError && <p className="text-sm text-danger">{updateError}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-bold text-ink">Шаблоны</div>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={openAddTemplateModal}>
          Добавить шаблон
        </Button>
      </div>

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
              onClick={() => openEditTemplateModal(t)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
              aria-label="Редактировать шаблон"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </Card>
        ))}

        {templatesLoading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем шаблоны...
          </Card>
        )}
        {!templatesLoading && templatesError && (
          <Card className="py-10 text-center text-sm text-danger">{templatesError}</Card>
        )}
        {!templatesLoading && !templatesError && templates.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Шаблонов пока нет</Card>
        )}
      </div>

      <CreateDocumentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        templates={templates}
        leads={leads}
        onCreated={(doc) => setDocuments((prev) => [doc, ...prev])}
      />

      <Modal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title={editingTemplateId ? 'Редактировать шаблон' : 'Новый шаблон'}
      >
        <form onSubmit={handleTemplateSubmit} className="flex flex-col gap-4">
          <Input
            label="Название"
            placeholder="Например, Соглашение о намерениях"
            value={templateForm.name}
            onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Ссылка на документ"
            placeholder="https://docs.google.com/..."
            value={templateForm.url}
            onChange={(e) => setTemplateForm((f) => ({ ...f, url: e.target.value }))}
            required
          />

          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-muted">
              Поля для заполнения — ключ должен совпадать с меткой {'{{ключ}}'} внутри документа
            </span>
            {templateForm.fields.map((field, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    label="Название поля"
                    placeholder="Например, ФИО покупателя"
                    value={field.label}
                    onChange={(e) => updateTemplateField(i, { label: e.target.value })}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    label="Ключ {{...}}"
                    placeholder="buyer_name"
                    value={field.key}
                    onChange={(e) => updateTemplateField(i, { key: e.target.value })}
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Select
                    label="Тип"
                    options={fieldTypes.map((t) => fieldTypeLabels[t])}
                    value={fieldTypeLabels[field.type]}
                    onChange={(v) => {
                      const type = fieldTypes.find((t) => fieldTypeLabels[t] === v) ?? 'text';
                      updateTemplateField(i, { type });
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeTemplateField(i)}
                  aria-label="Удалить поле"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              icon={<Plus className="h-4 w-4" />}
              onClick={addTemplateField}
              className="w-fit"
            >
              Добавить поле
            </Button>
          </div>

          {templateSubmitError && <p className="text-sm text-danger">{templateSubmitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setTemplateModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmitTemplate || templateSubmitting}>
              {templateSubmitting ? 'Сохраняем...' : editingTemplateId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
