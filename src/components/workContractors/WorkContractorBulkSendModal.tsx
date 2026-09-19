import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, TriangleAlert, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { fileToAttachment, type EmailAttachment } from '../../lib/legalEntityAttachment';
import { insertWorkContractorBulkSendJob, fetchQueuedWorkContractorBulkSendContractorIds } from '../../lib/workContractorBulkSendApi';
import { WORK_CONTRACTOR_PLACEHOLDER_HINT, type WorkContractorTemplate } from '../../data/workContractorTemplates';
import { workContractorTitle, type WorkContractor } from '../../data/workContractors';

const WARN_THRESHOLD = 8;

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Массовая рассылка по категории (владелец, 2026-09-19: "сделай мне
// возможность массовой отправки письма по категории, включая прикрепление
// файла") — урезанная копия BulkSendModal у поставщиков: без юрлица, страны
// и "повторить прошлую рассылку" (там это нужно из-за КП/ведомостей,
// здесь достаточно "категория → получатели → письмо"). Отправку разбирает
// Edge Function process-work-contractor-bulk-send-jobs по pg_cron, тем же
// темпом 25-35с между письмами.
export function WorkContractorBulkSendModal({
  open,
  onClose,
  contractors,
  categories,
  templates,
  onQueued,
}: {
  open: boolean;
  onClose: () => void;
  contractors: WorkContractor[];
  categories: string[];
  templates: WorkContractorTemplate[];
  onQueued: () => void;
}) {
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [attachment, setAttachment] = useState<EmailAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [loadingQueued, setLoadingQueued] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Сброс формы при каждом открытии — черновик прошлой рассылки не должен
  // переезжать к следующей.
  useEffect(() => {
    if (!open) return;
    setCategory('');
    setSubject('');
    setBody('');
    setTemplateName('');
    setAttachment(null);
    setError(null);
    setDone(null);
    setLoadingQueued(true);
    fetchQueuedWorkContractorBulkSendContractorIds()
      .then(setQueuedIds)
      .catch(() => setQueuedIds([]))
      .finally(() => setLoadingQueued(false));
  }, [open]);

  const recipients = useMemo(
    () => contractors.filter((c) => c.category === category && c.email && !queuedIds.includes(c.id)),
    [contractors, category, queuedIds],
  );
  const alreadyQueuedCount = useMemo(
    () => contractors.filter((c) => c.category === category && c.email && queuedIds.includes(c.id)).length,
    [contractors, category, queuedIds],
  );

  function handlePickTemplate(name: string) {
    const template = templates.find((t) => t.name === name);
    if (!template) return;
    if (body.trim() && !window.confirm('Заменить набранный текст письма шаблоном?')) return;
    setTemplateName(name);
    setSubject(template.subject);
    setBody(template.body);
  }

  async function handleFilePicked(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setAttaching(true);
    try {
      setAttachment(await fileToAttachment(file));
    } catch {
      setError('Не удалось прикрепить файл — попробуйте ещё раз');
    } finally {
      setAttaching(false);
    }
  }

  async function handleQueue() {
    if (sending || !category || !body.trim() || recipients.length === 0) return;
    setSending(true);
    setError(null);
    try {
      await insertWorkContractorBulkSendJob({
        category,
        subject: subject.trim(),
        body,
        attachment,
        contractorIds: recipients.map((c) => c.id),
      });
      setDone(recipients.length);
      onQueued();
    } catch (err) {
      setError(errorText(err, 'Не удалось поставить рассылку в очередь'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Массовая рассылка по категории">
      <div className="flex flex-col gap-4">
        {done !== null ? (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-ink">
              Рассылка поставлена в очередь: {done} {done === 1 ? 'получатель' : 'получателей'}. Письма уйдут фоном, с
              паузами между отправками — вкладку можно закрывать сразу.
            </div>
            <Button onClick={onClose} className="w-fit">
              Готово
            </Button>
          </div>
        ) : (
          <>
            <Select
              label="Категория"
              placeholder="Выберите категорию"
              options={categories}
              value={category}
              onChange={setCategory}
            />

            {category && (
              <div className="text-sm text-ink-muted">
                {loadingQueued ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Проверяем очередь...
                  </span>
                ) : recipients.length === 0 ? (
                  alreadyQueuedCount > 0
                    ? `Все подрядчики категории «${category}» уже в очереди на отправку.`
                    : `В категории «${category}» нет подрядчиков с email.`
                ) : (
                  <>
                    Получателей: {recipients.length}
                    {alreadyQueuedCount > 0 && ` (ещё ${alreadyQueuedCount} уже в очереди с прошлой рассылки)`}
                  </>
                )}
              </div>
            )}

            {templates.length > 0 && (
              <Select
                placeholder="Шаблон письма"
                options={templates.map((t) => t.name)}
                value={templateName}
                onChange={handlePickTemplate}
              />
            )}
            <Input placeholder="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea rows={8} placeholder="Текст письма" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="text-xs text-ink-faint">{WORK_CONTRACTOR_PLACEHOLDER_HINT}</div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                void handleFilePicked(e.target.files);
                e.target.value = '';
              }}
            />
            {attachment ? (
              <div className="flex w-fit items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm text-ink">
                <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="max-w-[260px] truncate">{attachment.fileName}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Убрать вложение"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                icon={<Paperclip className="h-4 w-4" />}
                className="w-fit"
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching}
              >
                {attaching ? 'Прикрепляем...' : 'Прикрепить файл'}
              </Button>
            )}

            {recipients.length > WARN_THRESHOLD && (
              <div className="flex items-start gap-2 rounded-control border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
                <TriangleAlert className="h-4 w-4 shrink-0 translate-y-0.5" />
                <span>
                  {recipients.length} получателей — рассылка пойдёт фоном с паузами между письмами, чтобы не выглядеть
                  массовой. Вкладку можно закрыть сразу после постановки в очередь.
                </span>
              </div>
            )}

            {error && <div className="text-sm text-danger">{error}</div>}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void handleQueue()} disabled={sending || !category || !body.trim() || recipients.length === 0}>
                {sending ? 'Ставим в очередь...' : 'Поставить в очередь'}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Отмена
              </Button>
            </div>

            {category && recipients.length > 0 && (
              <div className="text-xs text-ink-faint">
                Кому: {recipients.map((c) => workContractorTitle(c)).join(', ')}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
