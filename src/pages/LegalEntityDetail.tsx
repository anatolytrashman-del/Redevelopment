import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { DocumentPreviewModal, isPreviewable, type PreviewFile } from '../components/documents/DocumentPreviewModal';
import type { LegalEntity } from '../data/legalEntities';
import { QUARTERS, taxDeclarationTitle, type TaxDeclaration, type Quarter } from '../data/taxDeclarations';
import { fetchLegalEntities } from '../lib/legalEntitiesApi';
import { fetchTaxDeclarations, insertTaxDeclaration, deleteTaxDeclaration } from '../lib/taxDeclarationsApi';
import { uploadObjectDocument } from '../lib/objectsApi';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function pluralFiles(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'файл';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'файла';
  return 'файлов';
}

const currentYear = new Date().getFullYear();
// Разумный диапазон лет для выбора — с запасом в обе стороны, не пытаемся
// угадывать точнее (например, когда юрлицо реально зарегистрировано).
const YEARS = Array.from({ length: 8 }, (_, i) => currentYear + 1 - i);

const emptyDeclarationForm = { quarter: 1 as Quarter, year: currentYear, files: [] as File[] };

export function LegalEntityDetail() {
  const { id } = useParams();
  const [entity, setEntity] = useState<LegalEntity | null>(null);
  const [entityLoading, setEntityLoading] = useState(true);
  const [entityError, setEntityError] = useState<string | null>(null);

  const [declarations, setDeclarations] = useState<TaxDeclaration[]>([]);
  const [declarationsLoading, setDeclarationsLoading] = useState(true);
  const [declarationsError, setDeclarationsError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyDeclarationForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  useEffect(() => {
    fetchLegalEntities()
      .then((all) => setEntity(all.find((e) => e.id === id) ?? null))
      .catch((err) => setEntityError(errorMessage(err, 'Не удалось загрузить юрлицо')))
      .finally(() => setEntityLoading(false));
    fetchTaxDeclarations()
      .then(setDeclarations)
      .catch((err) => setDeclarationsError(errorMessage(err, 'Не удалось загрузить декларации')))
      .finally(() => setDeclarationsLoading(false));
  }, [id]);

  const entityDeclarations = useMemo(
    () => declarations.filter((d) => d.legalEntityId === id),
    [declarations, id],
  );

  function openModal() {
    setForm(emptyDeclarationForm);
    setSubmitError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || form.files.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const uploaded = await Promise.all(form.files.map(uploadObjectDocument));
      const created = await insertTaxDeclaration({
        legalEntityId: id,
        quarter: form.quarter,
        year: form.year,
        files: uploaded,
      });
      setDeclarations((prev) => [created, ...prev]);
      setModalOpen(false);
    } catch (err) {
      setSubmitError(errorMessage(err, 'Не удалось загрузить декларацию'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(d: TaxDeclaration) {
    if (!window.confirm(`Удалить «${taxDeclarationTitle(d)}»?`)) return;
    setDeletingId(d.id);
    setDeclarationsError(null);
    try {
      await deleteTaxDeclaration(d.id);
      setDeclarations((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      setDeclarationsError(errorMessage(err, 'Не удалось удалить'));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PageHeader title={entity?.name ?? 'Юрлицо'} />

      <Link
        to="/admin/documents"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-ink hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Документы
      </Link>

      {entityLoading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка...
        </Card>
      )}
      {!entityLoading && entityError && <Card className="py-10 text-center text-sm text-danger">{entityError}</Card>}
      {!entityLoading && !entityError && !entity && (
        <Card className="py-10 text-center text-sm text-ink-muted">Юрлицо не найдено</Card>
      )}

      {entity && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Налоговые декларации</h2>
            <Button icon={<Plus className="h-4 w-4" />} onClick={openModal}>
              Добавить декларацию
            </Button>
          </div>

          {declarationsError && <p className="text-sm text-danger">{declarationsError}</p>}

          <div className="flex flex-col gap-4">
            {entityDeclarations.map((d) => (
              <Card key={d.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-info-bg text-info-text">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink">{taxDeclarationTitle(d)}</div>
                    <div className="truncate text-sm text-ink-muted">
                      {d.files.length} {pluralFiles(d.files.length)} · {formatDate(d.uploadedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    disabled={deletingId === d.id}
                    aria-label="Удалить декларацию"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 pl-15">
                  {d.files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-control bg-surface-muted px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.fileName}</span>
                      {isPreviewable(f.fileName) && (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(f)}
                          aria-label="Просмотреть"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-primary"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Скачать"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-primary"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {declarationsLoading && (
              <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загружаем декларации...
              </Card>
            )}
            {!declarationsLoading && entityDeclarations.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">Деклараций пока нет</Card>
            )}
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новая налоговая декларация">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Квартал"
              options={QUARTERS.map((q) => String(q))}
              value={String(form.quarter)}
              onChange={(v) => setForm((f) => ({ ...f, quarter: Number(v) as Quarter }))}
            />
            <Select
              label="Год"
              options={YEARS.map((y) => String(y))}
              value={String(form.year)}
              onChange={(v) => setForm((f) => ({ ...f, year: Number(v) }))}
            />
          </div>
          <p className="-mt-2 text-xs text-ink-faint">
            Заголовок: «{taxDeclarationTitle({ quarter: form.quarter, year: form.year })}»
          </p>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Файлы — декларация может быть пакетом из нескольких файлов</span>
            {form.files.map((file, i) => (
              <div key={i} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-ink">
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, files: f.files.filter((_, idx) => idx !== i) }))}
                  aria-label="Убрать файл"
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
              <Upload className="h-4 w-4" />
              Добавить файлы
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (picked.length) setForm((f) => ({ ...f, files: [...f.files, ...picked] }));
                }}
              />
            </label>
          </div>

          {submitError && <p className="text-sm text-danger">{submitError}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={form.files.length === 0 || submitting}>
              {submitting ? 'Загружаем...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <DocumentPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </>
  );
}
