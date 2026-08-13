import { useEffect, useState } from 'react';
import { Plus, Loader2, ExternalLink, FileCheck, Send, Hourglass, Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { CreateDocumentModal } from '../components/documents/CreateDocumentModal';
import { documentStatuses, type DocumentStatus, type GeneratedDocument } from '../data/generatedDocuments';
import type { DocumentTemplate } from '../data/documentTemplates';
import type { Lead } from '../data/leads';
import { fetchGeneratedDocuments, updateGeneratedDocumentStatus } from '../lib/generatedDocumentsApi';
import { fetchDocumentTemplates } from '../lib/documentTemplatesApi';
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

export function Documents() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    fetchGeneratedDocuments()
      .then(setDocuments)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить документы')))
      .finally(() => setLoading(false));
    fetchDocumentTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
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

  return (
    <>
      <PageHeader
        title="Документы"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Создать документ
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {documents.map((doc) => {
          const meta = statusMeta[doc.status];
          const Icon = meta?.icon ?? FileCheck;
          return (
            <Card key={doc.id} className="flex items-center gap-4 p-5">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta?.className ?? 'bg-surface-muted text-ink-muted'}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{doc.title}</div>
                <div className="text-sm text-ink-muted">
                  {templateName(doc.templateId)} · {leadName(doc.leadId)} · {formatDate(doc.createdAt)}
                </div>
              </div>
              <div className="w-52 shrink-0">
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

      <CreateDocumentModal
        open={open}
        onClose={() => setOpen(false)}
        templates={templates}
        leads={leads}
        onCreated={(doc) => setDocuments((prev) => [doc, ...prev])}
      />
    </>
  );
}
