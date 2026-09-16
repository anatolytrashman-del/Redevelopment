import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookUser,
  Clock,
  Loader2,
  Mail as MailIcon,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { cn } from '../lib/cn';
import { fileToAttachment } from '../lib/legalEntityAttachment';
import { fetchMailboxEmails, markMailboxEmailsRead, sendMailboxEmail } from '../lib/mailboxApi';
import {
  deleteMailboxContact,
  fetchMailboxContacts,
  insertMailboxContact,
  updateMailboxContact,
} from '../lib/mailboxContactsApi';
import {
  SHARED_MAILBOX_ADDRESS,
  counterpartyTitle,
  mailboxContactCategories,
  mailboxCounterparty,
  parseEmailAddress,
  parseEmailDisplayName,
  type MailboxContact,
  type MailboxEmail,
} from '../data/mailbox';
import { emailSendStatusLabel } from '../data/emailSendStatus';

// Страница "Почта" — общий ящик компании a@redevelopment.pro плюс записная
// книжка адресов (владелец, 2026-09-16: "мне нужен общий блок с
// email-ящиком в интерфейсе, ставь после блока Команда... И внутри сделай
// записную книжку с названием, категорией, именем человека и самим
// email-адресом"). Пункт меню стоит сразу за "Командой", как и просили.
//
// Почему не переиспользованы существующие ленты переписки (поставщики,
// подрядчики): там письмо всегда привязано к карточке и уходит с
// plus-адреса, который и находит ветку для ответа. Здесь карточки нет —
// это обычный ящик с произвольными собеседниками, и единственный ключ
// группировки — адрес собеседника. Общее с ними только серверная часть:
// api/purchase-send-email.js (флаг mailbox:true) и ветка общего ящика в
// api/purchase-email-webhook.js.

type EmailAttachment = { fileName: string; contentType: string; contentBase64: string };

const TABS = ['Письма', 'Записная книжка'];
const ALL_CATEGORIES = 'Все категории';

const emptyContactForm = { title: '', category: '', personName: '', email: '' };

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Тред = переписка с одним адресом. Свежие треды сверху.
interface MailThread {
  address: string;
  name: string;
  emails: MailboxEmail[];
  unread: number;
  lastAt: string;
}

function buildThreads(emails: MailboxEmail[]): MailThread[] {
  const map = new Map<string, MailThread>();
  for (const email of emails) {
    const address = mailboxCounterparty(email);
    if (!address) continue;
    const existing = map.get(address);
    const thread = existing ?? { address, name: '', emails: [], unread: 0, lastAt: email.createdAt };
    thread.emails.push(email);
    if (email.direction === 'in') {
      if (!email.readAt) thread.unread += 1;
      // Имя из заголовка входящего письма — запасной вариант подписи треда,
      // когда адреса ещё нет в записной книжке.
      if (!thread.name) thread.name = parseEmailDisplayName(email.fromAddress);
    }
    if (email.createdAt > thread.lastAt) thread.lastAt = email.createdAt;
    if (!existing) map.set(address, thread);
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function Mail() {
  const [tab, setTab] = useState(TABS[0]);
  const [emails, setEmails] = useState<MailboxEmail[]>([]);
  const [contacts, setContacts] = useState<MailboxContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  // Композер нового письма (кнопка "Написать") — отдельно от ответа внутри
  // треда: там получатель уже известен, здесь его ещё нужно выбрать.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');

  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<MailboxContact | null>(null);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);

  useEffect(() => {
    Promise.all([fetchMailboxEmails(), fetchMailboxContacts()])
      .then(([loadedEmails, loadedContacts]) => {
        setEmails(loadedEmails);
        setContacts(loadedContacts);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorText(err, 'Не удалось загрузить почту')))
      .finally(() => setLoading(false));
  }, []);

  const threads = useMemo(() => buildThreads(emails), [emails]);
  const selected = threads.find((t) => t.address === selectedAddress) ?? null;
  const unreadTotal = threads.reduce((sum, t) => sum + t.unread, 0);

  // Открыли тред — гасим его непрочитанные. Локальный стейт правим сразу,
  // не дожидаясь ответа: бейдж не должен висеть до перезагрузки страницы.
  useEffect(() => {
    if (!selectedAddress) return;
    const hasUnread = emails.some(
      (e) => e.direction === 'in' && !e.readAt && mailboxCounterparty(e) === selectedAddress,
    );
    if (!hasUnread) return;
    const readAt = new Date().toISOString();
    setEmails((prev) =>
      prev.map((e) =>
        e.direction === 'in' && !e.readAt && mailboxCounterparty(e) === selectedAddress ? { ...e, readAt } : e,
      ),
    );
    markMailboxEmailsRead(selectedAddress).catch(() => {
      // Тихо: письма уже показаны прочитанными, следующая загрузка вернёт
      // их как есть — не повод показывать ошибку поверх переписки.
    });
  }, [selectedAddress, emails]);

  // Категории для фильтра и формы: пресет + то, что реально встречается в
  // записной книжке (обычный паттерн растущих полей, см. CLAUDE.md).
  const categories = useMemo(() => {
    const used = contacts.map((c) => c.category).filter(Boolean);
    return [...new Set([...mailboxContactCategories, ...used])];
  }, [contacts]);

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (category !== ALL_CATEGORIES && c.category !== category) return false;
      if (!query) return true;
      return [c.title, c.category, c.personName, c.email].some((field) => field.toLowerCase().includes(query));
    });
  }, [contacts, search, category]);

  function openContactAdd(prefill?: Partial<typeof emptyContactForm>) {
    setEditingContact(null);
    setContactForm({ ...emptyContactForm, ...prefill });
    setContactError(null);
    setContactFormOpen(true);
  }

  function openContactEdit(contact: MailboxContact) {
    setEditingContact(contact);
    setContactForm({
      title: contact.title,
      category: contact.category,
      personName: contact.personName,
      email: contact.email,
    });
    setContactError(null);
    setContactFormOpen(true);
  }

  async function handleContactSave() {
    if (contactSaving) return;
    const payload = {
      title: contactForm.title.trim(),
      category: contactForm.category.trim(),
      personName: contactForm.personName.trim(),
      email: contactForm.email.trim(),
    };
    if (!payload.email) {
      setContactError('Укажите email — без него запись в книжке бесполезна');
      return;
    }
    if (!payload.title && !payload.personName) {
      setContactError('Заполните название или имя человека');
      return;
    }
    setContactSaving(true);
    setContactError(null);
    try {
      if (editingContact) {
        const updated = await updateMailboxContact(editingContact.id, payload);
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await insertMailboxContact(payload);
        setContacts((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
      }
      setContactFormOpen(false);
    } catch (err) {
      setContactError(errorText(err, 'Не удалось сохранить запись'));
    } finally {
      setContactSaving(false);
    }
  }

  async function handleContactDelete(contact: MailboxContact) {
    const label = contact.title || contact.personName || contact.email;
    if (!window.confirm(`Удалить «${label}» из записной книжки? Переписка с этим адресом останется.`)) return;
    try {
      await deleteMailboxContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    } catch (err) {
      setLoadError(errorText(err, 'Не удалось удалить запись'));
    }
  }

  function handleWriteTo(address: string) {
    setComposeTo(address);
    setComposeOpen(true);
  }

  function handleSent(email: MailboxEmail) {
    setEmails((prev) => [...prev, email]);
    setSelectedAddress(parseEmailAddress(email.toAddress));
    setTab(TABS[0]);
  }

  return (
    <>
      <PageHeader
        title="Почта"
        action={
          tab === TABS[0] ? (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setComposeTo('');
                setComposeOpen(true);
              }}
            >
              Написать письмо
            </Button>
          ) : (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openContactAdd()}>
              Добавить запись
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup options={TABS} value={tab} onChange={setTab} badges={{ [TABS[0]]: unreadTotal }} />
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <MailIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            Общий ящик компании: <span className="font-semibold text-ink">{SHARED_MAILBOX_ADDRESS}</span>
          </div>
        </div>

        {loading && (
          <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем почту...
          </Card>
        )}
        {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

        {!loading && !loadError && tab === TABS[0] && (
          <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
            {/* min-w-0 на колонке и на строке с именем — иначе длинное имя
                собеседника не обрезается (truncate работает только когда у
                flex/grid-элемента разрешено сжиматься), и на телефоне список
                вылезает за край экрана. */}
            <div className="flex min-w-0 flex-col gap-3">
              {threads.length === 0 && (
                <Card className="py-10 text-center text-sm text-ink-muted">
                  Писем пока нет. Всё, что придёт на {SHARED_MAILBOX_ADDRESS}, появится здесь само.
                </Card>
              )}
              {threads.map((thread) => (
                <button
                  key={thread.address}
                  type="button"
                  onClick={() => setSelectedAddress(thread.address)}
                  className={cn(
                    'flex min-w-0 flex-col gap-1 rounded-control border p-3 text-left transition-colors',
                    thread.address === selectedAddress
                      ? 'border-primary bg-primary-soft/40'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">
                      {counterpartyTitle(thread.address, contacts, thread.name)}
                    </span>
                    {thread.unread > 0 && <Badge tone="success">{thread.unread}</Badge>}
                  </div>
                  <span className="truncate text-xs text-ink-muted">{thread.address}</span>
                  <span className="text-xs text-ink-faint">
                    {new Date(thread.lastAt).toLocaleString('ru-RU')}
                  </span>
                </button>
              ))}
            </div>

            {selected ? (
              <ThreadPanel
                key={selected.address}
                thread={selected}
                contacts={contacts}
                onSent={handleSent}
                onAddContact={() =>
                  openContactAdd({ email: selected.address, personName: selected.name })
                }
              />
            ) : (
              <Card className="flex items-center justify-center py-10 text-sm text-ink-muted">
                Выберите переписку слева — или напишите новое письмо.
              </Card>
            )}
          </div>
        )}

        {!loading && !loadError && tab === TABS[1] && (
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                placeholder="Поиск по названию, имени или адресу"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                wrapperClassName="min-w-[260px] flex-1"
              />
              <Select
                pill
                options={[ALL_CATEGORIES, ...categories]}
                value={category}
                onChange={setCategory}
                triggerClassName="min-w-[200px]"
              />
            </div>

            {visibleContacts.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-muted">
                {contacts.length === 0
                  ? 'Записная книжка пустая. Добавьте первую запись — название, категорию, имя человека и адрес.'
                  : 'Ничего не нашлось по этому запросу.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 font-semibold">Название</th>
                      <th className="py-2 pr-3 font-semibold">Категория</th>
                      <th className="py-2 pr-3 font-semibold">Имя</th>
                      <th className="py-2 pr-3 font-semibold">Email</th>
                      <th className="py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleContacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-3 font-semibold text-ink">{contact.title || '—'}</td>
                        <td className="py-2.5 pr-3">
                          {contact.category ? <Badge>{contact.category}</Badge> : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-ink">{contact.personName || '—'}</td>
                        <td className="py-2.5 pr-3">
                          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                            {contact.email}
                          </a>
                        </td>
                        <td className="py-2.5">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              title="Написать письмо"
                              aria-label={`Написать на ${contact.email}`}
                              onClick={() => handleWriteTo(contact.email)}
                              className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-primary"
                            >
                              <MailIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Изменить"
                              aria-label={`Изменить запись ${contact.email}`}
                              onClick={() => openContactEdit(contact)}
                              className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-ink"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Удалить"
                              aria-label={`Удалить запись ${contact.email}`}
                              onClick={() => void handleContactDelete(contact)}
                              className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        initialTo={composeTo}
        contacts={contacts}
        onClose={() => setComposeOpen(false)}
        onSent={(email) => {
          handleSent(email);
          setComposeOpen(false);
        }}
      />

      <Modal
        open={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
        title={editingContact ? 'Запись в книжке' : 'Новая запись'}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            placeholder="Например, ОАО «Белгазпромбанк»"
            value={contactForm.title}
            onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))}
          />
          <AddableSelect
            label="Категория"
            options={categories}
            value={contactForm.category}
            onChange={(value) => setContactForm((f) => ({ ...f, category: value }))}
            placeholder="Выберите категорию"
            newPlaceholder="Название новой категории"
          />
          <Input
            label="Имя человека"
            placeholder="Например, Ирина Петрова"
            value={contactForm.personName}
            onChange={(e) => setContactForm((f) => ({ ...f, personName: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            placeholder="mail@example.com"
            value={contactForm.email}
            onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
          />
          {contactError && <div className="text-sm text-danger">{contactError}</div>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleContactSave()} disabled={contactSaving}>
              {contactSaving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
            <Button variant="secondary" onClick={() => setContactFormOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// Лента переписки с одним адресом + ответ. key={thread.address} на вызове —
// черновик ответа не должен переезжать к следующему собеседнику.
function ThreadPanel({
  thread,
  contacts,
  onSent,
  onAddContact,
}: {
  thread: MailThread;
  contacts: MailboxContact[];
  onSent: (email: MailboxEmail) => void;
  onAddContact: () => void;
}) {
  const known = contacts.some((c) => parseEmailAddress(c.email) === thread.address);
  const lastSubject = [...thread.emails].reverse().find((e) => e.subject)?.subject ?? '';
  const replySubject = lastSubject && !/^re:/i.test(lastSubject) ? `Re: ${lastSubject}` : lastSubject;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-lg font-bold text-ink">{counterpartyTitle(thread.address, contacts, thread.name)}</div>
          <span className="text-sm text-ink-muted">{thread.address}</span>
        </div>
        {!known && (
          <Button variant="secondary" icon={<BookUser className="h-4 w-4" />} onClick={onAddContact}>
            В записную книжку
          </Button>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <Composer toAddress={thread.address} initialSubject={replySubject} onSent={onSent} submitLabel="Ответить" />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="text-sm font-semibold text-ink">Переписка</div>
        {[...thread.emails].reverse().map((e) => (
          <EmailBubble key={e.id} email={e} />
        ))}
      </div>
    </Card>
  );
}

function EmailBubble({ email }: { email: MailboxEmail }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-control p-3 text-sm',
        email.direction === 'out' ? 'ml-6 border border-border bg-surface' : 'mr-6 bg-surface-muted',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
        <span
          className={cn(
            'flex items-center gap-1',
            email.direction === 'out' && email.sendStatus === 'failed' && 'text-danger',
          )}
        >
          {email.direction !== 'out' || email.sendStatus === 'sent' ? (
            <MailIcon className="h-3 w-3" />
          ) : email.sendStatus === 'queued' ? (
            <Clock className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {email.direction === 'out'
            ? `${emailSendStatusLabel[email.sendStatus]}${email.sentByName ? ` · ${email.sentByName}` : ''}`
            : 'Получено'}
        </span>
        <span>{new Date(email.createdAt).toLocaleString('ru-RU')}</span>
      </div>
      {email.direction === 'out' && email.sendStatus === 'queued' && (
        <div className="text-xs text-ink-faint">
          Почта временно недоступна — письмо уйдёт само, как только отправка заработает.
          {email.sendError ? ` Причина: ${email.sendError}` : ''}
        </div>
      )}
      {email.direction === 'out' && email.sendStatus === 'failed' && (
        <div className="text-xs text-danger">
          Письмо не отправлено{email.sendError ? `: ${email.sendError}` : ''}. Текст сохранён — можно скопировать и
          отправить заново.
        </div>
      )}
      {email.subject && <div className="font-semibold text-ink">{email.subject}</div>}
      {email.files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {email.files.map((f, i) => (
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
      <div className="whitespace-pre-wrap text-ink">{email.body}</div>
    </div>
  );
}

// Новое письмо произвольному адресату: получателя можно выбрать из записной
// книжки или вписать руками.
function ComposeModal({
  open,
  initialTo,
  contacts,
  onClose,
  onSent,
}: {
  open: boolean;
  initialTo: string;
  contacts: MailboxContact[];
  onClose: () => void;
  onSent: (email: MailboxEmail) => void;
}) {
  const [to, setTo] = useState(initialTo);

  useEffect(() => {
    if (open) setTo(initialTo);
  }, [open, initialTo]);

  const bookOptions = useMemo(
    () =>
      contacts.map((c) => {
        const who = [c.title, c.personName].filter(Boolean).join(' — ');
        return who ? `${who} <${c.email}>` : c.email;
      }),
    [contacts],
  );

  return (
    <Modal open={open} onClose={onClose} title="Новое письмо">
      <div className="flex flex-col gap-4">
        {bookOptions.length > 0 && (
          <Select
            label="Из записной книжки"
            placeholder="Выбрать адресата"
            options={bookOptions}
            onChange={(value) => setTo(parseEmailAddress(value))}
          />
        )}
        <Input
          label="Кому"
          type="email"
          placeholder="mail@example.com"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Composer
          key={open ? 'open' : 'closed'}
          toAddress={parseEmailAddress(to)}
          initialSubject=""
          onSent={onSent}
          submitLabel="Отправить"
          onCancel={onClose}
        />
      </div>
    </Modal>
  );
}

// Тема + текст + вложения + кнопка отправки. Общий кусок для ответа в ленте
// и для нового письма — различаются только заголовком кнопки и тем, откуда
// берётся адрес.
function Composer({
  toAddress,
  initialSubject,
  onSent,
  submitLabel,
  onCancel,
}: {
  toAddress: string;
  initialSubject: string;
  onSent: (email: MailboxEmail) => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!toAddress || !body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const email = await sendMailboxEmail({
        toAddress,
        subject,
        body,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      onSent(email);
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
    <div className="flex flex-col gap-2">
      <Input placeholder="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Textarea rows={6} placeholder="Текст письма" value={body} onChange={(e) => setBody(e.target.value)} />

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
        <Button onClick={() => void handleSend()} disabled={sending || !toAddress || !body.trim()}>
          {sending ? 'Отправляем...' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </div>
  );
}
