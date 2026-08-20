import { useEffect, useState } from 'react';
import {
  Plus,
  Loader2,
  Pencil,
  FileText,
  ExternalLink,
  X,
  Trash2,
  Eye,
  Download,
  Upload,
  FileSignature,
  Building2,
  HardHat,
  Scale,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { CreateDocumentModal } from '../components/documents/CreateDocumentModal';
import { DocumentPreviewModal, isPreviewable, type PreviewFile } from '../components/documents/DocumentPreviewModal';
import type { DocumentTemplate, TemplateField, TemplateFieldType } from '../data/documentTemplates';
import type { Lead } from '../data/leads';
import type { RealtyObject } from '../data/objects';
import type { Contractor } from '../data/contractors';
import type { ContractorDocument } from '../data/contractorDocuments';
import type { LegalDocument } from '../data/legalDocuments';
import type { Pledge } from '../data/pledges';
import { fetchDocumentTemplates, insertDocumentTemplate, updateDocumentTemplate } from '../lib/documentTemplatesApi';
import { fetchLeads } from '../lib/leadsApi';
import { fetchAllSignedAgreements, type SignedAgreement } from '../lib/agreementSigningApi';
import { fetchObjects, uploadObjectDocument } from '../lib/objectsApi';
import { fetchPledges, createPledgePhotoUrl } from '../lib/pledgesApi';
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

const fieldTypes: TemplateFieldType[] = ['text', 'date', 'gender'];
const fieldTypeLabels: Record<TemplateFieldType, string> = { text: 'Текст', date: 'Дата', gender: 'Пол' };

const emptyTemplateForm = { name: '', url: '', fields: [] as TemplateField[] };

function templateToForm(t: DocumentTemplate) {
  return { name: t.name, url: t.url, fields: t.fields };
}

export function Documents() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateSubmitError, setTemplateSubmitError] = useState<string | null>(null);

  // Подписанные соглашения — читаются напрямую из agreement_signatures
  // (см. agreementSigningApi.ts), а не заводятся вручную: раньше сюда
  // руками добавляли строку в generated_documents ещё до реального
  // подписания клиентом через /plan/:token, и после подписания эта ручная
  // запись оставалась висеть устаревшей (см. историю правок). Теперь
  // реально подписанные соглашения показываются сами, без ручных действий.
  const [signedAgreements, setSignedAgreements] = useState<SignedAgreement[]>([]);
  const [signedLoading, setSignedLoading] = useState(true);
  const [signedError, setSignedError] = useState<string | null>(null);

  // Объекты нужны только для objectName() в "Подписанные соглашения" —
  // раздел с самими объектами (техпаспорт/БРТИ) заменён на залоги ниже,
  // объекты в проработке ещё не имеют настоящих документов о собственности.
  const [objects, setObjects] = useState<RealtyObject[]>([]);

  // Объекты в залоге (см. страницу "Объекты" → блок "Залоги") — у каждого
  // уже есть скан свидетельства о собственности (certificatePhotoPath,
  // приватный бакет pledge-photos), просто показываем его тут же, без
  // похода на другую страницу.
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [pledgesLoading, setPledgesLoading] = useState(true);
  const [pledgesError, setPledgesError] = useState<string | null>(null);

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

  // Вкладки вместо длинной вертикальной портянки разделов — переключают
  // видимость блока, все данные при этом всё равно грузятся сразу
  // (см. useEffect ниже), просто не рендерятся, пока не открыта вкладка.
  const [activeTab, setActiveTab] = useState<'signed' | 'objects' | 'contractors' | 'legal' | 'templates'>('signed');

  useEffect(() => {
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
      .catch(() => setObjects([]));
    fetchPledges()
      .then(setPledges)
      .catch((err) => setPledgesError(errorMessage(err, 'Не удалось загрузить залоги')))
      .finally(() => setPledgesLoading(false));
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

  function objectName(objectId: string) {
    const o = objects.find((x) => x.id === objectId);
    return o ? o.name || o.address : '—';
  }

  // Свидетельство БРТИ лежит в приватном бакете pledge-photos — готового
  // URL в базе нет, ссылку подписываем на лету (тот же паттерн, что и у
  // фото лида/подрядчика), а не при каждом рендере списка.
  async function openPledgeCertificate(pledge: Pledge) {
    if (!pledge.certificatePhotoPath) return;
    const url = await createPledgePhotoUrl(pledge.certificatePhotoPath);
    if (url) setPreviewFile({ url, fileName: pledge.certificatePhotoPath });
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

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {(
          [
            ['signed', 'Подписанные соглашения', signedAgreements.length],
            ['objects', 'Объекты (БРТИ)', pledges.length],
            ['contractors', 'Подрядчики', contractorDocs.length],
            ['legal', 'Нормативка', legalDocs.length],
            ['templates', 'Шаблоны', templates.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-t-control border border-b-0 px-4 py-2.5 text-sm font-semibold transition-colors',
              activeTab === key
                ? 'border-border bg-surface text-ink'
                : 'border-transparent bg-transparent text-ink-muted hover:text-ink',
            )}
          >
            {label}
            {count > 0 && <span className="ml-1.5 text-ink-faint">{count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'signed' && (
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
      )}

      {activeTab === 'objects' && (
      <div className="flex flex-col gap-4">
        {pledges.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{p.address}</div>
                {p.certificatePhotoPath ? (
                  <div className="truncate text-sm text-ink-muted">Свидетельство БРТИ загружено</div>
                ) : (
                  <div className="text-sm text-ink-faint">Свидетельство не загружено</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              {p.certificatePhotoPath && (
                <button
                  type="button"
                  onClick={() => openPledgeCertificate(p)}
                  aria-label="Просмотреть свидетельство"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>
          </Card>
        ))}
        {pledgesLoading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем залоги...
          </Card>
        )}
        {!pledgesLoading && pledgesError && <Card className="py-10 text-center text-sm text-danger">{pledgesError}</Card>}
        {!pledgesLoading && !pledgesError && pledges.length === 0 && (
          <Card className="py-10 text-center text-sm text-ink-muted">Залогов пока нет</Card>
        )}
      </div>
      )}

      {activeTab === 'contractors' && (
      <>
      <div className="flex flex-wrap items-center justify-end gap-3">
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
      </>
      )}

      {activeTab === 'legal' && (
      <>
      <div className="flex flex-wrap items-center justify-end gap-3">
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
      </>
      )}

      {activeTab === 'templates' && (
      <>
      <div className="flex flex-wrap items-center justify-end gap-3">
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
      </>
      )}

      <CreateDocumentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        templates={templates}
        leads={leads}
        onCreated={() => {}}
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
