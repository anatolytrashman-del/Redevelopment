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
  Trash2,
  Eye,
  Download,
  Upload,
  FileSignature,
  Building2,
  HardHat,
  Scale,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { CreateDocumentModal } from '../components/documents/CreateDocumentModal';
import { DocumentPreviewModal, isPreviewable, type PreviewFile } from '../components/documents/DocumentPreviewModal';
import { documentStatuses, type DocumentStatus, type GeneratedDocument } from '../data/generatedDocuments';
import type { DocumentTemplate, TemplateField, TemplateFieldType } from '../data/documentTemplates';
import type { Lead } from '../data/leads';
import type { RealtyObject } from '../data/objects';
import type { Contractor } from '../data/contractors';
import type { ContractorDocument } from '../data/contractorDocuments';
import type { LegalDocument } from '../data/legalDocuments';
import {
  fetchGeneratedDocuments,
  updateGeneratedDocumentStatus,
  deleteGeneratedDocument,
} from '../lib/generatedDocumentsApi';
import { fetchDocumentTemplates, insertDocumentTemplate, updateDocumentTemplate } from '../lib/documentTemplatesApi';
import { fetchLeads } from '../lib/leadsApi';
import { fetchAllSignedAgreements, type SignedAgreement } from '../lib/agreementSigningApi';
import { fetchObjects, updateObject, uploadObjectDocument } from '../lib/objectsApi';
import { fetchContractors } from '../lib/contractorsApi';
import {
  fetchContractorDocuments,
  insertContractorDocument,
  deleteContractorDocument,
} from '../lib/contractorDocumentsApi';
import { fetchLegalDocuments, insertLegalDocument, deleteLegalDocument } from '../lib/legalDocumentsApi';

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
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Подписанные соглашения — читаются напрямую из agreement_signatures
  // (см. agreementSigningApi.ts), а не заводятся вручную: раньше сюда
  // руками добавляли строку в generated_documents ещё до реального
  // подписания клиентом через /plan/:token, и после подписания эта ручная
  // запись оставалась висеть устаревшей (см. историю правок). Теперь
  // реально подписанные соглашения показываются сами, без ручных действий.
  const [signedAgreements, setSignedAgreements] = useState<SignedAgreement[]>([]);
  const [signedLoading, setSignedLoading] = useState(true);
  const [signedError, setSignedError] = useState<string | null>(null);

  // Документы объектов (БРТИ/техпаспорт) — то же поле RealtyObject.documents,
  // что и на странице объекта (см. ObjectDocuments.tsx), просто сводка по
  // всем объектам сразу, без захода в каждый по отдельности.
  const [objects, setObjects] = useState<RealtyObject[]>([]);
  const [objectsLoading, setObjectsLoading] = useState(true);
  const [objectsError, setObjectsError] = useState<string | null>(null);
  const [uploadingObjectId, setUploadingObjectId] = useState<string | null>(null);
  const [objectDocError, setObjectDocError] = useState<string | null>(null);

  // Договоры с подрядчиками — отдельная таблица (contractor_documents), не
  // поле на Contractor: загрузка идёт прямо отсюда, без похода на страницу
  // "Подрядчики".
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [contractorDocs, setContractorDocs] = useState<ContractorDocument[]>([]);
  const [contractorDocsLoading, setContractorDocsLoading] = useState(true);
  const [contractorDocsError, setContractorDocsError] = useState<string | null>(null);
  const [contractorDocModalOpen, setContractorDocModalOpen] = useState(false);
  const [contractorDocForm, setContractorDocForm] = useState({ contractorId: '', file: null as File | null });
  const [contractorDocSubmitting, setContractorDocSubmitting] = useState(false);
  const [contractorDocSubmitError, setContractorDocSubmitError] = useState<string | null>(null);
  const [deletingContractorDocId, setDeletingContractorDocId] = useState<string | null>(null);

  // Документы от юристов — нормативка/разъяснения без привязки к
  // конкретному лиду/объекту/подрядчику.
  const [legalDocs, setLegalDocs] = useState<LegalDocument[]>([]);
  const [legalDocsLoading, setLegalDocsLoading] = useState(true);
  const [legalDocsError, setLegalDocsError] = useState<string | null>(null);
  const [legalDocModalOpen, setLegalDocModalOpen] = useState(false);
  const [legalDocForm, setLegalDocForm] = useState({ title: '', file: null as File | null });
  const [legalDocSubmitting, setLegalDocSubmitting] = useState(false);
  const [legalDocSubmitError, setLegalDocSubmitError] = useState<string | null>(null);
  const [deletingLegalDocId, setDeletingLegalDocId] = useState<string | null>(null);

  // Общая модалка предпросмотра (PDF/картинки/.docx) — одна на всю
  // страницу, используется всеми секциями ниже.
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  useEffect(() => {
    fetchGeneratedDocuments()
      .then(setDocuments)
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить документы')))
      .finally(() => setLoading(false));
    fetchDocumentTemplates()
      .then(setTemplates)
      .catch((err) => setTemplatesError(errorMessage(err, 'Не удалось загрузить шаблоны')))
      .finally(() => setTemplatesLoading(false));
    fetchAllSignedAgreements()
      .then(setSignedAgreements)
      .catch((err) => setSignedError(errorMessage(err, 'Не удалось загрузить подписанные соглашения')))
      .finally(() => setSignedLoading(false));
    fetchObjects()
      .then(setObjects)
      .catch((err) => setObjectsError(errorMessage(err, 'Не удалось загрузить объекты')))
      .finally(() => setObjectsLoading(false));
    fetchContractors()
      .then(setContractors)
      .catch(() => setContractors([]));
    fetchContractorDocuments()
      .then(setContractorDocs)
      .catch((err) => setContractorDocsError(errorMessage(err, 'Не удалось загрузить договоры с подрядчиками')))
      .finally(() => setContractorDocsLoading(false));
    fetchLegalDocuments()
      .then(setLegalDocs)
      .catch((err) => setLegalDocsError(errorMessage(err, 'Не удалось загрузить документы от юристов')))
      .finally(() => setLegalDocsLoading(false));
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

  async function handleDeleteDocument(doc: GeneratedDocument) {
    if (!window.confirm(`Удалить «${doc.title}» из списка?`)) return;
    setDeletingDocId(doc.id);
    setUpdateError(null);
    try {
      await deleteGeneratedDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setUpdateError(errorMessage(err, 'Не удалось удалить документ'));
    } finally {
      setDeletingDocId(null);
    }
  }

  function objectName(objectId: string) {
    const o = objects.find((x) => x.id === objectId);
    return o ? o.name || o.address : '—';
  }

  async function handleObjectDocUpload(object: RealtyObject, file: File) {
    setUploadingObjectId(object.id);
    setObjectDocError(null);
    try {
      const uploaded = await uploadObjectDocument(file);
      const nextDocuments = { ...object.documents, techPassport: { ...uploaded, uploadedAt: new Date().toISOString() } };
      const { id, shareToken, ...rest } = object;
      const updated = await updateObject(id, { ...rest, documents: nextDocuments });
      setObjects((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setObjectDocError(errorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setUploadingObjectId(null);
    }
  }

  async function handleObjectDocRemove(object: RealtyObject) {
    setObjectDocError(null);
    const nextDocuments = { ...object.documents };
    delete nextDocuments.techPassport;
    const { id, shareToken, ...rest } = object;
    try {
      const updated = await updateObject(id, { ...rest, documents: nextDocuments });
      setObjects((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setObjectDocError(errorMessage(err, 'Не удалось удалить файл'));
    }
  }

  function contractorName(contractorId: string) {
    return contractors.find((c) => c.id === contractorId)?.name ?? '—';
  }

  function openContractorDocModal() {
    setContractorDocForm({ contractorId: contractors[0]?.id ?? '', file: null });
    setContractorDocSubmitError(null);
    setContractorDocModalOpen(true);
  }

  async function handleContractorDocSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractorDocForm.contractorId || !contractorDocForm.file || contractorDocSubmitting) return;
    setContractorDocSubmitting(true);
    setContractorDocSubmitError(null);
    try {
      const uploaded = await uploadObjectDocument(contractorDocForm.file);
      const created = await insertContractorDocument({
        contractorId: contractorDocForm.contractorId,
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
      });
      setContractorDocs((prev) => [created, ...prev]);
      setContractorDocModalOpen(false);
    } catch (err) {
      setContractorDocSubmitError(errorMessage(err, 'Не удалось загрузить договор'));
    } finally {
      setContractorDocSubmitting(false);
    }
  }

  async function handleDeleteContractorDoc(doc: ContractorDocument) {
    if (!window.confirm(`Удалить «${doc.fileName}» из списка?`)) return;
    setDeletingContractorDocId(doc.id);
    setContractorDocsError(null);
    try {
      await deleteContractorDocument(doc.id);
      setContractorDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setContractorDocsError(errorMessage(err, 'Не удалось удалить'));
    } finally {
      setDeletingContractorDocId(null);
    }
  }

  function openLegalDocModal() {
    setLegalDocForm({ title: '', file: null });
    setLegalDocSubmitError(null);
    setLegalDocModalOpen(true);
  }

  async function handleLegalDocSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalDocForm.title.trim() || !legalDocForm.file || legalDocSubmitting) return;
    setLegalDocSubmitting(true);
    setLegalDocSubmitError(null);
    try {
      const uploaded = await uploadObjectDocument(legalDocForm.file);
      const created = await insertLegalDocument({
        title: legalDocForm.title.trim(),
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
      });
      setLegalDocs((prev) => [created, ...prev]);
      setLegalDocModalOpen(false);
    } catch (err) {
      setLegalDocSubmitError(errorMessage(err, 'Не удалось загрузить документ'));
    } finally {
      setLegalDocSubmitting(false);
    }
  }

  async function handleDeleteLegalDoc(doc: LegalDocument) {
    if (!window.confirm(`Удалить «${doc.title}» из списка?`)) return;
    setDeletingLegalDocId(doc.id);
    setLegalDocsError(null);
    try {
      await deleteLegalDocument(doc.id);
      setLegalDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setLegalDocsError(errorMessage(err, 'Не удалось удалить'));
    } finally {
      setDeletingLegalDocId(null);
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
                <button
                  type="button"
                  onClick={() => handleDeleteDocument(doc)}
                  disabled={deletingDocId === doc.id}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                  aria-label="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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

      <div className="mt-8 text-lg font-bold text-ink">Подписанные соглашения</div>
      <div className="flex flex-col gap-4">
        {signedAgreements.map((a) => (
          <Card key={a.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
                <FileSignature className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{a.buyerName}</div>
                <div className="truncate text-sm text-ink-muted">
                  {objectName(a.objectId)} · {a.isWorkstation ? `Рабочее место ${a.zoneLabel}` : `Кабинет ${a.zoneLabel}`} ·
                  Подписано {formatDate(a.verifiedAt)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={() => setPreviewFile({ url: a.documentUrl, fileName: `${a.buyerName}.pdf` })}
                aria-label="Просмотреть"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
              >
                <Eye className="h-4 w-4" />
              </button>
              <a
                href={a.documentUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Скачать"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
          </Card>
        ))}
        {signedLoading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем соглашения...
          </Card>
        )}
        {!signedLoading && signedError && <Card className="py-10 text-center text-sm text-danger">{signedError}</Card>}
        {!signedLoading && !signedError && signedAgreements.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Подписанных соглашений пока нет</Card>
        )}
      </div>

      <div className="mt-8 text-lg font-bold text-ink">Документы объектов — техпаспорт (БРТИ)</div>
      <div className="flex flex-col gap-4">
        {objects.map((o) => {
          const file = o.documents.techPassport;
          const uploading = uploadingObjectId === o.id;
          return (
            <Card key={o.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{o.name || o.address}</div>
                  {file ? (
                    <div className="truncate text-sm text-ink-muted">
                      {file.fileName} · {formatDate(file.uploadedAt)}
                    </div>
                  ) : (
                    <div className="text-sm text-ink-faint">Файл не загружен</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                {file && isPreviewable(file.fileName) && (
                  <button
                    type="button"
                    onClick={() => setPreviewFile(file)}
                    aria-label="Просмотреть"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                )}
                {file && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Скачать"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <input
                  type="file"
                  id={`brti-upload-${o.id}`}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) handleObjectDocUpload(o, f);
                  }}
                />
                <label
                  htmlFor={`brti-upload-${o.id}`}
                  aria-label={file ? 'Заменить файл' : 'Загрузить файл'}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </label>
                {file && (
                  <button
                    type="button"
                    onClick={() => handleObjectDocRemove(o)}
                    aria-label="Удалить файл"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>
          );
        })}
        {objectsLoading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем объекты...
          </Card>
        )}
        {!objectsLoading && objectsError && <Card className="py-10 text-center text-sm text-danger">{objectsError}</Card>}
        {!objectsLoading && !objectsError && objects.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Объектов пока нет</Card>
        )}
        {objectDocError && <p className="text-sm text-danger">{objectDocError}</p>}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-bold text-ink">Договоры с подрядчиками</div>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={openContractorDocModal}>
          Добавить договор
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {contractorDocs.map((d) => (
          <Card key={d.id} className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning">
              <HardHat className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">{contractorName(d.contractorId)}</div>
              <div className="truncate text-sm text-ink-muted">
                {d.fileName} · {formatDate(d.uploadedAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isPreviewable(d.fileName) && (
                <button
                  type="button"
                  onClick={() => setPreviewFile({ url: d.fileUrl, fileName: d.fileName })}
                  aria-label="Просмотреть"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Скачать"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => handleDeleteContractorDoc(d)}
                disabled={deletingContractorDocId === d.id}
                aria-label="Удалить"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
        {contractorDocsLoading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем договоры...
          </Card>
        )}
        {!contractorDocsLoading && contractorDocsError && (
          <Card className="py-10 text-center text-sm text-danger">{contractorDocsError}</Card>
        )}
        {!contractorDocsLoading && !contractorDocsError && contractorDocs.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Договоров пока нет</Card>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-bold text-ink">Документы от юристов</div>
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={openLegalDocModal}>
          Добавить документ
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {legalDocs.map((d) => (
          <Card key={d.id} className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info-bg text-info-text">
              <Scale className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-ink">{d.title}</div>
              <div className="truncate text-sm text-ink-muted">
                {d.fileName} · {formatDate(d.uploadedAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isPreviewable(d.fileName) && (
                <button
                  type="button"
                  onClick={() => setPreviewFile({ url: d.fileUrl, fileName: d.fileName })}
                  aria-label="Просмотреть"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
              <a
                href={d.fileUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Скачать"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => handleDeleteLegalDoc(d)}
                disabled={deletingLegalDocId === d.id}
                aria-label="Удалить"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
        {legalDocsLoading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем документы...
          </Card>
        )}
        {!legalDocsLoading && legalDocsError && <Card className="py-10 text-center text-sm text-danger">{legalDocsError}</Card>}
        {!legalDocsLoading && !legalDocsError && legalDocs.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Документов пока нет</Card>
        )}
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

      <Modal open={contractorDocModalOpen} onClose={() => setContractorDocModalOpen(false)} title="Договор с подрядчиком">
        <form onSubmit={handleContractorDocSubmit} className="flex flex-col gap-4">
          <Select
            label="Подрядчик"
            options={contractors.map((c) => c.name)}
            value={contractors.find((c) => c.id === contractorDocForm.contractorId)?.name ?? ''}
            onChange={(v) =>
              setContractorDocForm((f) => ({ ...f, contractorId: contractors.find((c) => c.name === v)?.id ?? '' }))
            }
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Файл договора</span>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
              <Upload className="h-4 w-4" />
              {contractorDocForm.file ? contractorDocForm.file.name : 'Выбрать файл'}
              <input
                type="file"
                className="hidden"
                onChange={(e) => setContractorDocForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
              />
            </label>
          </div>
          {contractorDocSubmitError && <p className="text-sm text-danger">{contractorDocSubmitError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setContractorDocModalOpen(false)}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!contractorDocForm.contractorId || !contractorDocForm.file || contractorDocSubmitting}
            >
              {contractorDocSubmitting ? 'Загружаем...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={legalDocModalOpen} onClose={() => setLegalDocModalOpen(false)} title="Документ от юристов">
        <form onSubmit={handleLegalDocSubmit} className="flex flex-col gap-4">
          <Input
            label="Название"
            placeholder="Например, Разъяснение по НДС"
            value={legalDocForm.title}
            onChange={(e) => setLegalDocForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Файл</span>
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
              <Upload className="h-4 w-4" />
              {legalDocForm.file ? legalDocForm.file.name : 'Выбрать файл'}
              <input
                type="file"
                className="hidden"
                onChange={(e) => setLegalDocForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
              />
            </label>
          </div>
          {legalDocSubmitError && <p className="text-sm text-danger">{legalDocSubmitError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setLegalDocModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!legalDocForm.title.trim() || !legalDocForm.file || legalDocSubmitting}>
              {legalDocSubmitting ? 'Загружаем...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <DocumentPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </>
  );
}
