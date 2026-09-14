import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, ExternalLink, Loader2, Mail, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/cn';
import { fileToAttachment } from '../lib/legalEntityAttachment';
import {
  deleteWorkContractor,
  fetchWorkContractors,
  insertWorkContractor,
  updateWorkContractor,
} from '../lib/workContractorsApi';
import {
  fetchAllWorkContractorEmails,
  markWorkContractorEmailsRead,
  sendWorkContractorEmail,
} from '../lib/workContractorEmailsApi';
import { workContractorEmailAddress, workContractorTitle, type WorkContractor } from '../data/workContractors';
import type { WorkContractorEmail } from '../data/workContractorEmails';
import { emailSendStatusLabel } from '../data/emailSendStatus';

// Страница "Подрядчики" — отдельный пункт меню в группе "Стройка", сразу
// под "Закупками" (владелец, 2026-09-14: "вынеси Подрядчики в отдельный
// пункт меню, тоже в стройку, прямо под закупками. Мы будем работать над
// ним позже").
//
// Заведена в тот же день как ВКЛАДКА внутри "Закупок" и успела уехать в
// прод в таком виде (шестой релиз дня); владелец сразу после этого решил,
// что тема самостоятельная. Отсюда и разделение данных, которого больше
// нет: пока это была вкладка, письма грузила страница-родитель ради
// бейджика непрочитанных на переключателе вкладок (содержимое неактивной
// вкладки не смонтировано). Своей странице родитель не нужен — она грузит
// и подрядчиков, и письма сама.
//
// Что просили на старте: "мне на старте нужно всего два поля — ссылка на
// страницу на Авито и email подрядчика. С подрядчиками должна быть
// возможность общаться по email. Пока делаем только индивидуальные
// рассылки. Никаких автоматических файлов к письму не прикрепляется, я
// буду вручную писать текст и прикреплять все".
//
// Намеренно НЕ переиспользует EmailThread из SupplierCorrespondenceTab:
// тот завязан на предложения Ресерча целиком (КП, ведомости материалов,
// распознавание счетов, карточка организации к первому письму, заявки на
// поставку) — здесь всё это как раз не нужно, а выключать его по десятку
// флагов вышло бы запутаннее, чем своя простая лента на сотню строк.
// Общего у них по делу только тип вложения и серверный эндпоинт отправки.
//
// Три сущности со словом "подрядчик" — не перепутать: страница "Команда"
// (data/contractors.ts, свои люди), секция "Работы" внутри "Закупок"
// (contractor_research_*, сравнение цен на услуги) и вот эта. Общих данных
// между ними нет.

type EmailAttachment = { fileName: string; contentType: string; contentBase64: string };

const emptyForm = { avitoUrl: '', email: '' };

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// "1 письмо" / "2 письма" / "5 писем" — обычные три формы русского счётного
// падежа; простое "письмо/писем" по !==1 давало "2 писем" в списке.
function lettersLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} письмо`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} письма`;
  return `${count} писем`;
}

export function WorkContractors() {
  const [contractors, setContractors] = useState<WorkContractor[]>([]);
  const [emails, setEmails] = useState<WorkContractorEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  // null — форма добавления, иначе редактируем этого подрядчика.
  const [editing, setEditing] = useState<WorkContractor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkContractors()
      .then((list) => {
        setContractors(list);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorText(err, 'Не удалось загрузить подрядчиков')))
      .finally(() => setLoading(false));
    // Письма — отдельным запросом и без своего индикатора: список
    // подрядчиков показывается сразу, переписка подтягивается следом.
    // Сбой здесь не должен прятать сам список — молча остаёмся с пустой
    // лентой, как и на других страницах проекта.
    fetchAllWorkContractorEmails().then(setEmails).catch(() => setEmails([]));
  }, []);

  const selected = contractors.find((c) => c.id === selectedId) ?? null;

  // Открыли переписку — гасим непрочитанные этого подрядчика. Локальный
  // стейт правим сразу, не дожидаясь ответа: бейджик вкладки не должен
  // висеть до следующей загрузки страницы.
  useEffect(() => {
    if (!selectedId) return;
    const hasUnread = emails.some((e) => e.contractorId === selectedId && e.direction === 'in' && !e.readAt);
    if (!hasUnread) return;
    const readAt = new Date().toISOString();
    setEmails((prev) =>
      prev.map((e) => (e.contractorId === selectedId && e.direction === 'in' && !e.readAt ? { ...e, readAt } : e)),
    );
    markWorkContractorEmailsRead(selectedId).catch(() => {
      // Тихо: письма уже показаны прочитанными, следующая загрузка страницы
      // вернёт их как есть — не повод показывать ошибку поверх переписки.
    });
  }, [selectedId, emails]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setSaveError(null);
    setFormOpen(true);
  }

  function openEdit(c: WorkContractor) {
    setEditing(c);
    setForm({ avitoUrl: c.avitoUrl, email: c.email });
    setSaveError(null);
    setFormOpen(true);
  }

  async function handleSave() {
    if (saving) return;
    const payload = { avitoUrl: form.avitoUrl.trim(), email: form.email.trim() };
    if (!payload.avitoUrl && !payload.email) {
      setSaveError('Заполните хотя бы одно поле — ссылку на Авито или email');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        const updated = await updateWorkContractor(editing.id, payload);
        setContractors((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await insertWorkContractor(payload);
        setContractors((prev) => [created, ...prev]);
        setSelectedId(created.id);
      }
      setFormOpen(false);
    } catch (err) {
      setSaveError(errorText(err, 'Не удалось сохранить подрядчика'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: WorkContractor) {
    if (!window.confirm(`Удалить подрядчика «${workContractorTitle(c)}»? Переписка с ним тоже удалится.`)) return;
    try {
      await deleteWorkContractor(c.id);
      setContractors((prev) => prev.filter((x) => x.id !== c.id));
      setEmails((prev) => prev.filter((e) => e.contractorId !== c.id));
      if (selectedId === c.id) setSelectedId(null);
    } catch (err) {
      setLoadError(errorText(err, 'Не удалось удалить подрядчика'));
    }
  }

  return (
    <>
      {/* Кнопка добавления — в шапке страницы, как у остальных разделов
          админки (PageHeader action), а не отдельной строкой над списком:
          вкладкой она жила рядом с описанием, странице так не положено. */}
      <PageHeader
        title="Подрядчики"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
            Добавить подрядчика
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="text-sm text-ink-muted">
          Подрядчики, найденные на Авито. Письмо уходит с адреса переписки — ответ подрядчика прилетает сюда же, в его
          карточку.
        </div>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем подрядчиков...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
      {!loading && !loadError && contractors.length === 0 && (
        <Card className="py-10 text-center text-sm text-ink-muted">
          Пока никого нет. Добавьте первого подрядчика — ссылку на его страницу на Авито и email.
        </Card>
      )}

      {!loading && contractors.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
          <div className="flex flex-col gap-3">
            {contractors.map((c) => {
              const own = emails.filter((e) => e.contractorId === c.id);
              const unread = own.filter((e) => e.direction === 'in' && !e.readAt).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'flex flex-col gap-1 rounded-control border p-3 text-left transition-colors',
                    c.id === selectedId ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{workContractorTitle(c)}</span>
                    {unread > 0 && <Badge tone="success">{unread}</Badge>}
                  </div>
                  <span className="truncate text-xs text-ink-muted">{c.email || 'Email не указан'}</span>
                  {own.length > 0 && <span className="text-xs text-ink-faint">{lettersLabel(own.length)}</span>}
                </button>
              );
            })}
          </div>

          {selected ? (
            <ContractorPanel
              key={selected.id}
              contractor={selected}
              emails={emails.filter((e) => e.contractorId === selected.id)}
              onEdit={() => openEdit(selected)}
              onDelete={() => void handleDelete(selected)}
              onEmailSent={(email) => setEmails((prev) => [...prev, email])}
            />
          ) : (
            <Card className="flex items-center justify-center py-10 text-sm text-ink-muted">
              Выберите подрядчика слева, чтобы посмотреть переписку и написать письмо.
            </Card>
          )}
        </div>
      )}

        <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Подрядчик' : 'Новый подрядчик'}>
        <div className="flex flex-col gap-4">
          <Input
            label="Ссылка на страницу на Авито"
            placeholder="https://www.avito.ru/..."
            value={form.avitoUrl}
            onChange={(e) => setForm((f) => ({ ...f, avitoUrl: e.target.value }))}
          />
          <Input
            label="Email подрядчика"
            type="email"
            placeholder="mail@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          {saveError && <div className="text-sm text-danger">{saveError}</div>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
        </Modal>
      </div>
    </>
  );
}

// Карточка выбранного подрядчика: реквизиты, лента переписки и композер.
// key={contractor.id} на вызове — при переключении подрядчика черновик
// письма не должен переезжать к следующему.
function ContractorPanel({
  contractor,
  emails,
  onEdit,
  onDelete,
  onEmailSent,
}: {
  contractor: WorkContractor;
  emails: WorkContractorEmail[];
  onEdit: () => void;
  onDelete: () => void;
  onEmailSent: (email: WorkContractorEmail) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Владелец: "никаких автоматических файлов к письму не прикрепляется, я
  // буду вручную писать текст и прикреплять все" — поэтому здесь только то,
  // что выбрали в проводнике; ни карточки организации, ни ведомости, в
  // отличие от переписки с поставщиками (SupplierCorrespondenceTab).
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Свежие сверху — та же раскладка, что у переписки с поставщиками.
  const ordered = useMemo(() => [...emails].reverse(), [emails]);

  async function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttaching(true);
    try {
      const attached = await Promise.all(Array.from(files).map((f) => fileToAttachment(f)));
      setAttachments((prev) => [...prev, ...attached]);
    } catch {
      setSendError('Не удалось прикрепить файл — попробуйте ещё раз');
    } finally {
      setAttaching(false);
    }
  }

  async function handleSend() {
    if (!contractor.email || !body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const email = await sendWorkContractorEmail({
        contractorId: contractor.id,
        toAddress: contractor.email,
        subject,
        body,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      onEmailSent(email);
      setSubject('');
      setBody('');
      setAttachments([]);
    } catch (err) {
      setSendError(errorText(err, 'Не удалось отправить письмо'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-lg font-bold text-ink">{workContractorTitle(contractor)}</div>
          {contractor.avitoUrl ? (
            <a
              href={contractor.avitoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Страница на Авито
            </a>
          ) : (
            <span className="text-sm text-ink-faint">Ссылка на Авито не указана</span>
          )}
          <span className="text-sm text-ink-muted">{contractor.email || 'Email не указан'}</span>
          {/* Адрес переписки — на виду, как и у поставщиков: по нему видно,
              куда прилетит ответ, и его можно дать подрядчику напрямую. */}
          <span className="text-xs text-ink-faint">Адрес переписки: {workContractorEmailAddress(contractor.shortCode)}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
            Изменить
          </Button>
          <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>
            Удалить
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="text-sm font-semibold text-ink">Написать письмо</div>
        {!contractor.email && (
          <div className="text-sm text-ink-muted">
            Чтобы написать подрядчику, добавьте его email в карточке («Изменить»).
          </div>
        )}
        <Input placeholder="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          rows={6}
          placeholder="Текст письма"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFilesPicked(e.target.files);
            e.target.value = '';
          }}
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div
                key={`${att.fileName}-${i}`}
                className="flex w-fit items-center gap-2 rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm text-ink"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="max-w-[220px] truncate">{att.fileName}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Убрать вложение ${att.fileName}`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {sendError && <div className="text-sm text-danger">{sendError}</div>}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            icon={<Paperclip className="h-4 w-4" />}
            className="w-fit"
            onClick={() => fileInputRef.current?.click()}
            disabled={attaching}
          >
            {attaching ? 'Прикрепляем...' : 'Прикрепить файл'}
          </Button>
          <Button onClick={() => void handleSend()} disabled={sending || !contractor.email || !body.trim()}>
            {sending ? 'Отправляем...' : 'Отправить'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="text-sm font-semibold text-ink">Переписка</div>
        {ordered.length === 0 ? (
          <div className="text-sm text-ink-muted">Писем пока нет.</div>
        ) : (
          ordered.map((e) => (
            <div
              key={e.id}
              className={cn(
                'flex flex-col gap-1 rounded-control p-3 text-sm',
                e.direction === 'out' ? 'ml-6 border border-border bg-surface' : 'mr-6 bg-surface-muted',
              )}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
                <span
                  className={cn('flex items-center gap-1', e.direction === 'out' && e.sendStatus === 'failed' && 'text-danger')}
                >
                  {e.direction !== 'out' || e.sendStatus === 'sent' ? (
                    <Mail className="h-3 w-3" />
                  ) : e.sendStatus === 'queued' ? (
                    <Clock className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {e.direction === 'out' ? emailSendStatusLabel[e.sendStatus] : 'Получено'}
                </span>
                <span>{new Date(e.createdAt).toLocaleString('ru-RU')}</span>
              </div>
              {e.direction === 'out' && e.sendStatus === 'queued' && (
                <div className="text-xs text-ink-faint">
                  Почта временно недоступна — письмо уйдёт само, как только отправка заработает.
                  {e.sendError ? ` Причина: ${e.sendError}` : ''}
                </div>
              )}
              {e.direction === 'out' && e.sendStatus === 'failed' && (
                <div className="text-xs text-danger">
                  Письмо не отправлено{e.sendError ? `: ${e.sendError}` : ''}. Текст сохранён — можно скопировать и
                  отправить заново.
                </div>
              )}
              {e.subject && <div className="font-semibold text-ink">{e.subject}</div>}
              {e.files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {e.files.map((f, i) => (
                    <a
                      key={`${f.url}-${i}`}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-control border border-border bg-surface px-2 py-1 text-xs text-ink hover:border-border-strong"
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-ink-faint" />
                      <span className="max-w-[200px] truncate">{f.fileName}</span>
                    </a>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap text-ink">{e.body}</div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
