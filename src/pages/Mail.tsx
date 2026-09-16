import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookUser,
  Check,
  Clock,
  Eye,
  Loader2,
  ExternalLink,
  Mail as MailIcon,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Users,
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
import { notifyMailboxRead } from '../lib/mailboxSeen';
import {
  deleteMailboxContact,
  fetchMailboxContacts,
  insertMailboxContact,
  updateMailboxContact,
} from '../lib/mailboxContactsApi';
import {
  deleteMailboxTemplate,
  fetchMailboxTemplates,
  insertMailboxTemplate,
  updateMailboxTemplate,
} from '../lib/mailboxTemplatesApi';
import {
  MAILBOX_PLACEHOLDER_HINT,
  renderMailboxTemplate,
  type MailboxTemplate,
} from '../data/mailboxTemplates';
import {
  SHARED_MAILBOX_ADDRESS,
  contactLabel,
  contactStatusTone,
  counterpartyTitle,
  formatAudience,
  mailboxContactCategories,
  mailboxContactStatuses,
  mailboxCounterparty,
  parseEmailAddress,
  parseEmailDisplayName,
  type MailboxContact,
  type MailboxEmail,
} from '../data/mailbox';
import { emailSendStatusLabel } from '../data/emailSendStatus';

// Страница "Почта" — общий ящик компании a@redevelopment.pro плюс вкладка
// "Контакты" (владелец, 2026-09-16: "мне нужен общий блок с email-ящиком в
// интерфейсе, ставь после блока Команда... И внутри сделай записную книжку с
// названием, категорией, именем человека и самим email-адресом"). Пункт меню
// стоит сразу за "Командой", как и просили.
//
// В тот же день книжка стала единственным списком внешних контактов: раздел
// "Коллаборации" делал ровно ту же работу другим экраном (там вели блогеров,
// здесь — журналистов, часть людей попадала в оба списка), поэтому он
// удалён, а его поля — telegram, ссылка на канал, подписчики, статус
// общения, договорённости — переехали сюда, в карточку контакта.
//
// Почему не переиспользованы существующие ленты переписки (поставщики,
// подрядчики): там письмо всегда привязано к карточке и уходит с
// plus-адреса, который и находит ветку для ответа. Здесь карточки нет —
// это обычный ящик с произвольными собеседниками, и единственный ключ
// группировки — адрес собеседника. Общее с ними только серверная часть:
// api/purchase-send-email.js (флаг mailbox:true) и ветка общего ящика в
// api/purchase-email-webhook.js.

type EmailAttachment = { fileName: string; contentType: string; contentBase64: string };

const TABS = ['Письма', 'Контакты', 'Шаблоны'];
const ALL_CATEGORIES = 'Все категории';
const ALL_STATUSES = 'Любой статус';

const emptyContactForm = {
  title: '',
  category: '',
  personName: '',
  email: '',
  telegram: '',
  link: '',
  audienceSize: '',
  status: '',
  agreement: '',
  note: '',
};

// Подписчиков вводят как придётся — «32 000», «32000»: оставляем цифры.
// Пусто (или ничего не осталось) — данных нет, это null, а не ноль.
function parseAudience(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// Ник в Telegram → ссылка на диалог (как buildDialogLink в Leads.tsx, только
// здесь поле всегда телеграмное). Пустая строка — значит ссылку не строим.
function telegramLink(raw: string): string {
  const handle = raw.trim().replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle) ? `https://t.me/${handle}` : '';
}
const emptyTemplateForm = { name: '', subject: '', body: '' };

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
  const [templates, setTemplates] = useState<MailboxTemplate[]>([]);
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
  const [status, setStatus] = useState(ALL_STATUSES);

  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MailboxTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMailboxEmails(), fetchMailboxContacts(), fetchMailboxTemplates()])
      .then(([loadedEmails, loadedContacts, loadedTemplates]) => {
        setEmails(loadedEmails);
        setContacts(loadedContacts);
        setTemplates(loadedTemplates);
        setLoadError(null);
      })
      .catch((err) => setLoadError(errorText(err, 'Не удалось загрузить почту')))
      .finally(() => setLoading(false));
  }, []);

  const threads = useMemo(() => buildThreads(emails), [emails]);
  const selected = threads.find((t) => t.address === selectedAddress) ?? null;
  const unreadTotal = threads.reduce((sum, t) => sum + t.unread, 0);

  // Пришло письмо — открываем его сразу, не заставляя искать нужную карточку
  // в списке (владелец, 2026-09-16: «мне пришло письмо, но я не могу открыть
  // его в интерфейсе»). Открывается самая свежая переписка с непрочитанным,
  // один раз за визит на страницу: ref, а не стейт, чтобы возврат к списку
  // (или чтение второго треда) не перекидывал обратно.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || loading || selectedAddress) return;
    const unread = threads.find((t) => t.unread > 0);
    if (!unread) return;
    autoOpened.current = true;
    setSelectedAddress(unread.address);
  }, [loading, selectedAddress, threads]);

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
    markMailboxEmailsRead(selectedAddress)
      // Бейдж в боковом меню считает по базе, поэтому зовём его пересчитаться
      // только после ответа — на оптимистичном стейте он бы перезапросил
      // старое число и мигнул бы им обратно.
      .then(notifyMailboxRead)
      .catch(() => {
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

  const statuses = useMemo(() => {
    const used = contacts.map((c) => c.status).filter(Boolean);
    return [...new Set([...mailboxContactStatuses, ...used])];
  }, [contacts]);

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (category !== ALL_CATEGORIES && c.category !== category) return false;
      if (status !== ALL_STATUSES && c.status !== status) return false;
      if (!query) return true;
      return [c.title, c.category, c.personName, c.email, c.telegram, c.link, c.agreement, c.note].some((field) =>
        field.toLowerCase().includes(query),
      );
    });
  }, [contacts, search, category, status]);

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
      telegram: contact.telegram,
      link: contact.link,
      audienceSize: contact.audienceSize === null ? '' : String(contact.audienceSize),
      status: contact.status,
      agreement: contact.agreement,
      note: contact.note,
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
      telegram: contactForm.telegram.trim(),
      link: contactForm.link.trim(),
      audienceSize: parseAudience(contactForm.audienceSize),
      status: contactForm.status.trim(),
      agreement: contactForm.agreement.trim(),
      note: contactForm.note.trim(),
    };
    // Раньше email был обязателен, теперь книжка — единый список всех
    // контактов, и у блогера связь может быть только в Telegram. Обязателен
    // хоть какой-то способ связи, иначе запись ни на что не годится.
    if (!payload.email && !payload.telegram) {
      setContactError('Укажите email или Telegram — без способа связи запись бесполезна');
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
    const label = contactLabel(contact);
    if (!window.confirm(`Удалить «${label}» из контактов? Переписка с этим адресом останется.`)) return;
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

  function openTemplateAdd() {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateError(null);
    setTemplateFormOpen(true);
  }

  function openTemplateEdit(template: MailboxTemplate) {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, subject: template.subject, body: template.body });
    setTemplateError(null);
    setTemplateFormOpen(true);
  }

  async function handleTemplateSave() {
    if (templateSaving) return;
    const payload = {
      name: templateForm.name.trim(),
      subject: templateForm.subject.trim(),
      body: templateForm.body,
    };
    if (!payload.name) {
      setTemplateError('Дайте шаблону название — по нему его выбирать в письме');
      return;
    }
    if (!payload.body.trim()) {
      setTemplateError('Шаблон без текста письма ничего не подставит');
      return;
    }
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      if (editingTemplate) {
        const updated = await updateMailboxTemplate(editingTemplate.id, payload);
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await insertMailboxTemplate(payload);
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setTemplateFormOpen(false);
    } catch (err) {
      setTemplateError(errorText(err, 'Не удалось сохранить шаблон'));
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleTemplateDelete(template: MailboxTemplate) {
    if (!window.confirm(`Удалить шаблон «${template.name}»? Уже отправленные письма это не изменит.`)) return;
    try {
      await deleteMailboxTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch (err) {
      setLoadError(errorText(err, 'Не удалось удалить шаблон'));
    }
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
          ) : tab === TABS[1] ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openContactAdd()}>
              Добавить контакт
            </Button>
          ) : (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openTemplateAdd}>
              Добавить шаблон
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
                    'block w-full overflow-hidden rounded-control border p-3 text-left transition-colors',
                    thread.address === selectedAddress
                      ? 'border-primary bg-primary-soft/40'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  {/* Разметка внутри кнопки — span'ы, а не div'ы, и флекс-контейнер
                      здесь внутренний, а не сам <button>. Причина не в
                      педантизме: у button по спецификации внутри только
                      phrasing content, и WebKit (Safari) на такой вёрстке не
                      даёт флекс-элементам внутри кнопки сжиматься — truncate
                      молча перестаёт работать, длинное имя собеседника
                      вылезает за карточку, а бейдж непрочитанных уезжает
                      вправо под соседнюю панель, и о новом письме ничто не
                      сообщает (владелец, 2026-09-16: «мне пришло письмо, но я
                      не могу открыть его в интерфейсе»). Плюс overflow-hidden
                      на самой кнопке — страховка на случай, если текст всё же
                      не сожмётся: он обрежется по карточке, а не ляжет на
                      переписку справа. */}
                  <span className="flex w-full min-w-0 flex-col gap-1">
                    <span className="flex w-full min-w-0 items-center gap-2">
                      {/* Бейдж слева от имени, а не справа: справа он первым
                          страдает от любой неудачной ширины, а это главный (и
                          единственный) признак непрочитанного письма в списке. */}
                      {thread.unread > 0 && (
                        <Badge tone="danger" className="shrink-0 px-2">
                          {thread.unread}
                        </Badge>
                      )}
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                        {counterpartyTitle(thread.address, contacts, thread.name)}
                      </span>
                    </span>
                    <span className="block w-full truncate text-xs text-ink-muted">{thread.address}</span>
                    <span className="block text-xs text-ink-faint">
                      {new Date(thread.lastAt).toLocaleString('ru-RU')}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {selected ? (
              <ThreadPanel
                key={selected.address}
                thread={selected}
                contacts={contacts}
                templates={templates}
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
                placeholder="Поиск по названию, имени, адресу или телеграму"
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
              <Select
                pill
                options={[ALL_STATUSES, ...statuses]}
                value={status}
                onChange={setStatus}
                triggerClassName="min-w-[180px]"
              />
            </div>

            {visibleContacts.length === 0 ? (
              <div className="py-10 text-center text-sm text-ink-muted">
                {contacts.length === 0
                  ? 'Контактов пока нет. Добавьте первый — название, категорию, способ связи.'
                  : 'Ничего не нашлось по этому запросу.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="py-2 pr-3 font-semibold">Название</th>
                      <th className="py-2 pr-3 font-semibold">Категория</th>
                      <th className="py-2 pr-3 font-semibold">Статус</th>
                      <th className="py-2 pr-3 font-semibold">Имя</th>
                      <th className="py-2 pr-3 font-semibold">Связь</th>
                      <th className="py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleContacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{contact.title || '—'}</span>
                            {contact.audienceSize !== null && (
                              <span className="flex items-center gap-1 text-xs text-ink-muted">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                {formatAudience(contact.audienceSize)}
                              </span>
                            )}
                          </div>
                          {contact.link && (
                            <a
                              href={contact.link}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 flex max-w-[420px] items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              <span className="truncate">{contact.link}</span>
                            </a>
                          )}
                          {/* Заметка — второй строкой под названием, а не своей
                              колонкой: она длинная и разная по длине, отдельный
                              столбец растянул бы таблицу и оставил пустоту у
                              тех, у кого заметки нет. Договорённости туда же:
                              они читаются как продолжение описания. */}
                          {contact.note && (
                            <div className="mt-0.5 max-w-[420px] text-xs leading-snug text-ink-muted">{contact.note}</div>
                          )}
                          {contact.agreement && (
                            <div className="mt-0.5 max-w-[420px] text-xs leading-snug text-ink-muted">
                              <span className="text-ink-faint">Договорённости: </span>
                              {contact.agreement}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {contact.category ? <Badge>{contact.category}</Badge> : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          {contact.status ? (
                            <Badge tone={contactStatusTone(contact.status)}>{contact.status}</Badge>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-ink">{contact.personName || '—'}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-col gap-0.5">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                                {contact.email}
                              </a>
                            )}
                            {contact.telegram &&
                              (telegramLink(contact.telegram) ? (
                                <a
                                  href={telegramLink(contact.telegram)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {contact.telegram}
                                </a>
                              ) : (
                                <span className="text-ink">{contact.telegram}</span>
                              ))}
                            {!contact.email && !contact.telegram && <span className="text-ink-faint">—</span>}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="flex justify-end gap-1">
                            {/* Без адреса писать некуда — у блогеров связь
                                бывает только в Telegram, кнопку им не рисуем. */}
                            {contact.email && (
                              <button
                                type="button"
                                title="Написать письмо"
                                aria-label={`Написать на ${contact.email}`}
                                onClick={() => handleWriteTo(contact.email)}
                                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-primary"
                              >
                                <MailIcon className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Изменить"
                              aria-label={`Изменить контакт ${contactLabel(contact)}`}
                              onClick={() => openContactEdit(contact)}
                              className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-ink"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Удалить"
                              aria-label={`Удалить контакт ${contactLabel(contact)}`}
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
        {!loading && !loadError && tab === TABS[2] && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-ink-muted">
              Шаблон подставляет тему и текст в письмо — дальше это обычный черновик, его можно править.{' '}
              {MAILBOX_PLACEHOLDER_HINT} — подставляются из контактов по адресу получателя.
            </div>
            {templates.length === 0 ? (
              <Card className="py-10 text-center text-sm text-ink-muted">
                Шаблонов пока нет. Добавьте первый — например, питч журналисту или ответ на запрос комментария.
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="font-semibold text-ink">{template.name}</div>
                      <div className="text-sm text-ink-muted">{template.subject || 'Без темы'}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        title="Изменить"
                        aria-label={`Изменить шаблон ${template.name}`}
                        onClick={() => openTemplateEdit(template)}
                        className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Удалить"
                        aria-label={`Удалить шаблон ${template.name}`}
                        onClick={() => void handleTemplateDelete(template)}
                        className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-surface-muted hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* Текст целиком, не обрезкой в три строки: шаблон читают,
                      чтобы решить, годится ли он сейчас, и обрезанный на
                      середине абзац этот вопрос не закрывает. */}
                  <div className="whitespace-pre-wrap border-t border-border pt-2 text-sm text-ink">{template.body}</div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        initialTo={composeTo}
        contacts={contacts}
        templates={templates}
        onClose={() => setComposeOpen(false)}
        onSent={(email) => {
          handleSent(email);
          setComposeOpen(false);
        }}
      />

      <Modal
        open={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
        title={editingContact ? 'Контакт' : 'Новый контакт'}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              placeholder="mail@example.com"
              value={contactForm.email}
              onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Telegram"
              placeholder="@nickname"
              value={contactForm.telegram}
              onChange={(e) => setContactForm((f) => ({ ...f, telegram: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Ссылка на канал / сайт"
              placeholder="https://..."
              value={contactForm.link}
              onChange={(e) => setContactForm((f) => ({ ...f, link: e.target.value }))}
            />
            <Input
              label="Подписчики"
              inputMode="numeric"
              placeholder="32 000"
              value={contactForm.audienceSize}
              onChange={(e) => setContactForm((f) => ({ ...f, audienceSize: e.target.value }))}
            />
          </div>
          <AddableSelect
            label="Статус общения"
            options={statuses}
            value={contactForm.status}
            onChange={(value) => setContactForm((f) => ({ ...f, status: value }))}
            placeholder="Выберите статус"
            newPlaceholder="Название нового статуса"
          />
          <Textarea
            label="Заметка"
            rows={3}
            placeholder="Что за канал/издание, телефон, что учесть перед письмом"
            value={contactForm.note}
            onChange={(e) => setContactForm((f) => ({ ...f, note: e.target.value }))}
          />
          <Textarea
            label="О чём договариваемся"
            rows={2}
            placeholder="Условия, детали сотрудничества..."
            value={contactForm.agreement}
            onChange={(e) => setContactForm((f) => ({ ...f, agreement: e.target.value }))}
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

      <Modal
        open={templateFormOpen}
        onClose={() => setTemplateFormOpen(false)}
        title={editingTemplate ? 'Шаблон письма' : 'Новый шаблон'}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название шаблона"
            placeholder="Например, «Питч журналисту»"
            value={templateForm.name}
            onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Тема письма"
            placeholder="Например, «Редевелопмент в Минске: цифры и фактура для материала»"
            value={templateForm.subject}
            onChange={(e) => setTemplateForm((f) => ({ ...f, subject: e.target.value }))}
          />
          <Textarea
            label="Текст письма"
            rows={10}
            placeholder={`Здравствуйте, {имя}!\n\n...`}
            value={templateForm.body}
            onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
          />
          <div className="text-xs text-ink-faint">{MAILBOX_PLACEHOLDER_HINT}</div>
          {templateError && <div className="text-sm text-danger">{templateError}</div>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleTemplateSave()} disabled={templateSaving}>
              {templateSaving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
            <Button variant="secondary" onClick={() => setTemplateFormOpen(false)}>
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
  templates,
  onSent,
  onAddContact,
}: {
  thread: MailThread;
  contacts: MailboxContact[];
  templates: MailboxTemplate[];
  onSent: (email: MailboxEmail) => void;
  onAddContact: () => void;
}) {
  const contact = contacts.find((c) => c.email && parseEmailAddress(c.email) === thread.address) ?? null;
  const known = contact !== null;
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
            В контакты
          </Button>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <Composer
          toAddress={thread.address}
          initialSubject={replySubject}
          templates={templates}
          contact={contact}
          onSent={onSent}
          submitLabel="Ответить"
        />
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-faint">
        {/* Слева — «кто и чем это письмо является» (отправлено/в очереди/не
            отправлено/вернулось плюс отметка почтового сервера), справа —
            время. Обе левые подписи держим в одной группе, иначе отметка
            «прочитано» уезжает на середину строки и читается как отдельная
            колонка. */}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
            ? `${email.bouncedAt ? 'Вернулось' : emailSendStatusLabel[email.sendStatus]}${
                email.sentByName ? ` · ${email.sentByName}` : ''
              }`
            : 'Получено'}
        </span>
        {/* Судьба письма по данным почтового сервера (события Resend, см.
            api/_emailEvents.js) — тот же вид, что в переписке с поставщиками.
            Показываем самое позднее из известного: прочитано важнее
            доставлено. Отсутствие отметки НЕ значит «не дошло»: открытие
            видно только если почтовый клиент получателя подгрузил картинку-
            пиксель (Gmail — почти всегда, корпоративная почта с блокировкой
            картинок — никогда), а у писем до 16.09.2026 открытий нет вовсе,
            потому что open tracking на домене был выключен. */}
        {email.direction === 'out' && !email.bouncedAt && (email.openedAt || email.deliveredAt) && (
          <span
            className="flex items-center gap-1 text-ink-faint"
            title={`${email.deliveredAt ? `Доставлено ${new Date(email.deliveredAt).toLocaleString('ru-RU')}` : ''}${
              email.openedAt
                ? `${email.deliveredAt ? ', ' : ''}открыто ${new Date(email.openedAt).toLocaleString('ru-RU')}`
                : ''
            }`}
          >
            {email.openedAt ? <Eye className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            {email.openedAt ? 'прочитано' : 'доставлено'}
          </span>
        )}
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
  templates,
  onClose,
  onSent,
}: {
  open: boolean;
  initialTo: string;
  contacts: MailboxContact[];
  templates: MailboxTemplate[];
  onClose: () => void;
  onSent: (email: MailboxEmail) => void;
}) {
  const [to, setTo] = useState(initialTo);

  useEffect(() => {
    if (open) setTo(initialTo);
  }, [open, initialTo]);

  const address = parseEmailAddress(to);

  // В контактах теперь живут и те, у кого связь только в Telegram (блогеры,
  // переехавшие из «Коллабораций»), — в выпадашке получателей им не место,
  // письмо им отправить некуда.
  const mailable = useMemo(() => contacts.filter((c) => c.email), [contacts]);
  const contact = mailable.find((c) => parseEmailAddress(c.email) === address) ?? null;

  const bookOptions = useMemo(
    () =>
      mailable.map((c) => {
        const who = [c.title, c.personName].filter(Boolean).join(' — ');
        return who ? `${who} <${c.email}>` : c.email;
      }),
    [mailable],
  );

  // Выпадашка книжки показывает именно того, кому пишем (владелец,
  // 2026-09-16: "когда я нажимаю «Написать письмо» возле контакта, по
  // умолчанию в следующем окне должен выбираться этот контакт"). Считается
  // из адреса, а не хранится отдельным стейтом: адрес можно поправить руками
  // в поле "Кому", и тогда выбор в книжке обязан сняться сам, иначе он
  // показывал бы не того человека.
  const selectedBookOption = contact
    ? (bookOptions[mailable.indexOf(contact)] ?? '')
    : '';

  return (
    <Modal open={open} onClose={onClose} title="Новое письмо">
      <div className="flex flex-col gap-4">
        {bookOptions.length > 0 && (
          <Select
            label="Из контактов"
            placeholder="Выбрать адресата"
            options={bookOptions}
            value={selectedBookOption}
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
          toAddress={address}
          initialSubject=""
          templates={templates}
          contact={contact}
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
  templates,
  contact,
  onSent,
  submitLabel,
  onCancel,
}: {
  toAddress: string;
  initialSubject: string;
  templates: MailboxTemplate[];
  // Запись из книжки, если адресат в ней есть — из неё шаблон берёт имя,
  // название и категорию для плейсхолдеров.
  contact: MailboxContact | null;
  onSent: (email: MailboxEmail) => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Шаблон подставляет тему и текст и на этом заканчивается: дальше это
  // обычный черновик. Поэтому выбор шаблона ПЕРЕЗАПИСЫВАЕТ уже набранное —
  // спрашивать подтверждение не стали, но и не подставляем молча поверх
  // непустого текста: сначала предупреждаем.
  function handlePickTemplate(name: string) {
    const template = templates.find((t) => t.name === name);
    if (!template) return;
    if (body.trim() && !window.confirm('Заменить набранный текст письма шаблоном?')) return;
    const rendered = renderMailboxTemplate(template, { contact, address: toAddress });
    setTemplateName(name);
    setSubject(rendered.subject || subject);
    setBody(rendered.body);
  }

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
      setTemplateName('');
      setAttachments([]);
    } catch (err) {
      setSendError(errorText(err, 'Не удалось отправить письмо'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {templates.length > 0 && (
        <Select
          placeholder="Шаблон письма"
          options={templates.map((t) => t.name)}
          value={templateName}
          onChange={handlePickTemplate}
        />
      )}
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
