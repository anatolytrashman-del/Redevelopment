import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ContractorsResearch } from '../components/contractors/ContractorsResearch';
import { WorkContractorBulkSendModal } from '../components/workContractors/WorkContractorBulkSendModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { ToggleGroup } from '../components/ui/ToggleGroup';
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
import { notifyWorkContractorsRead } from '../lib/workContractorsSeen';
import {
  deleteWorkContractorTemplate,
  fetchWorkContractorTemplates,
  insertWorkContractorTemplate,
  updateWorkContractorTemplate,
} from '../lib/workContractorTemplatesApi';
import {
  workContractorCategories,
  workContractorEmailAddress,
  workContractorTitle,
  type WorkContractor,
} from '../data/workContractors';
import type { WorkContractorEmail } from '../data/workContractorEmails';
import {
  renderWorkContractorTemplate,
  WORK_CONTRACTOR_PLACEHOLDER_HINT,
  type WorkContractorTemplate,
} from '../data/workContractorTemplates';
import { emailSendStatusLabel } from '../data/emailSendStatus';

// Страница "Подрядчики" — отдельный пункт меню в группе "Стройка", сразу
// под "Закупками" (владелец, 2026-09-14: "вынеси Подрядчики в отдельный
// пункт меню, тоже в стройку, прямо под закупками. Мы будем работать над
// ним позже").
//
// 2026-09-19: карточка выросла с двух полей до полноценной (владелец
// прислал таблицу подрядчиков по аренде строительных лесов и попросил
// завести все её колонки), появились категории (растущий тег —
// workContractorCategories в data/workContractors.ts), шаблоны писем
// (вкладка "Шаблоны", один в один паттерн вкладки "Почта" →
// mailbox_email_templates) и массовая рассылка по категории с вложением
// (WorkContractorBulkSendModal, отдельная очередь work_contractor_bulk_send_jobs
// + Edge Function process-work-contractor-bulk-send-jobs — своя, не
// переиспользует bulk_send_jobs поставщиков, у той offer_id NOT NULL).
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

const TAB_CONTRACTORS = 'Подрядчики';
const TAB_TEMPLATES = 'Шаблоны';
const TABS = [TAB_CONTRACTORS, TAB_TEMPLATES];
const ALL_CATEGORIES = 'Все категории';

const emptyForm = {
  avitoUrl: '',
  email: '',
  companyName: '',
  website: '',
  phone: '',
  services: '',
  address: '',
  note: '',
  category: '',
  extraEmailsText: '',
};
const emptyTemplateForm = { name: '', subject: '', body: '' };

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Кнопка "Ответить" на письме — тот же паттерн, что в переписке с
// поставщиками (см. buildQuotedReply в SupplierCorrespondenceTab.tsx):
// подставляет тему с "Re:" (если её там ещё нет) и цитату письма, на
// которое отвечаем, отдельным свёрнутым блоком под текстом ответа, чтобы
// подрядчик видел, на что именно ему отвечают.
function buildQuotedReply(e: WorkContractorEmail): { subject: string; quoted: string } {
  const subject = /^re:/i.test(e.subject.trim()) ? e.subject : `Re: ${e.subject}`;
  const preamble = `${new Date(e.createdAt).toLocaleString('ru-RU')}, ${e.fromAddress} писал(а):`;
  const quotedLines = e.body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return { subject, quoted: `${preamble}\n${quotedLines}` };
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

// Доп. email'ы вводятся одной строкой через запятую/точку с запятой —
// проще, чем городить список полей ради того, что почти всегда пусто.
function parseExtraEmails(raw: string): string[] {
  return [...new Set(raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean))];
}

export function WorkContractors() {
  const [tab, setTab] = useState(TAB_CONTRACTORS);
  const [contractors, setContractors] = useState<WorkContractor[]>([]);
  const [emails, setEmails] = useState<WorkContractorEmail[]>([]);
  const [templates, setTemplates] = useState<WorkContractorTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);

  const [formOpen, setFormOpen] = useState(false);
  // null — форма добавления, иначе редактируем этого подрядчика.
  const [editing, setEditing] = useState<WorkContractor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [bulkSendOpen, setBulkSendOpen] = useState(false);

  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkContractorTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

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
    fetchWorkContractorTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const selected = contractors.find((c) => c.id === selectedId) ?? null;

  // Категории для фильтра/формы/рассылки: пресет + то, что реально
  // встречается у подрядчиков (обычный паттерн растущих полей, см. CLAUDE.md).
  const categories = useMemo(() => {
    const used = contractors.map((c) => c.category).filter(Boolean);
    return [...new Set([...workContractorCategories, ...used])];
  }, [contractors]);

  const visibleContractors = useMemo(() => {
    if (categoryFilter === ALL_CATEGORIES) return contractors;
    return contractors.filter((c) => c.category === categoryFilter);
  }, [contractors, categoryFilter]);

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
    markWorkContractorEmailsRead(selectedId)
      // Бейдж в боковом меню считает по базе, поэтому зовём его пересчитаться
      // только после ответа — на оптимистичном стейте он бы перезапросил
      // старое число и мигнул бы им обратно (тот же приём, что у "Почты").
      .then(notifyWorkContractorsRead)
      .catch(() => {
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
    setForm({
      avitoUrl: c.avitoUrl,
      email: c.email,
      companyName: c.companyName,
      website: c.website,
      phone: c.phone,
      services: c.services,
      address: c.address,
      note: c.note,
      category: c.category,
      extraEmailsText: c.extraEmails.join(', '),
    });
    setSaveError(null);
    setFormOpen(true);
  }

  async function handleSave() {
    if (saving) return;
    const payload = {
      avitoUrl: form.avitoUrl.trim(),
      email: form.email.trim(),
      companyName: form.companyName.trim(),
      website: form.website.trim(),
      phone: form.phone.trim(),
      services: form.services.trim(),
      address: form.address.trim(),
      note: form.note.trim(),
      category: form.category.trim(),
      extraEmails: parseExtraEmails(form.extraEmailsText),
    };
    if (!payload.avitoUrl && !payload.email && !payload.companyName) {
      setSaveError('Заполните хотя бы одно поле — компанию, ссылку на Авито или email');
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

  function openTemplateAdd() {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateError(null);
    setTemplateFormOpen(true);
  }

  function openTemplateEdit(template: WorkContractorTemplate) {
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
        const updated = await updateWorkContractorTemplate(editingTemplate.id, payload);
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await insertWorkContractorTemplate(payload);
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setTemplateFormOpen(false);
    } catch (err) {
      setTemplateError(errorText(err, 'Не удалось сохранить шаблон'));
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleTemplateDelete(template: WorkContractorTemplate) {
    if (!window.confirm(`Удалить шаблон «${template.name}»? Уже отправленные письма это не изменит.`)) return;
    try {
      await deleteWorkContractorTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch (err) {
      setLoadError(errorText(err, 'Не удалось удалить шаблон'));
    }
  }

  return (
    <>
      <PageHeader
        title="Подрядчики"
        action={
          tab === TAB_CONTRACTORS ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Send className="h-4 w-4" />} onClick={() => setBulkSendOpen(true)}>
                Массовая рассылка
              </Button>
              <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                Добавить подрядчика
              </Button>
            </div>
          ) : (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openTemplateAdd}>
              Добавить шаблон
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        <ToggleGroup options={TABS} value={tab} onChange={setTab} />

        {tab === TAB_CONTRACTORS && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-ink-muted">
                Подрядчики, найденные на Авито, и контакты по категориям (аренда лесов и т.п.). Письмо уходит с адреса
                переписки — ответ подрядчика прилетает сюда же, в его карточку.
              </div>
              <Select
                pill
                options={[ALL_CATEGORIES, ...categories]}
                value={categoryFilter}
                onChange={setCategoryFilter}
                triggerClassName="min-w-[200px]"
              />
            </div>

            {loading && (
              <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загружаем подрядчиков...
              </Card>
            )}
            {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
            {!loading && !loadError && visibleContractors.length === 0 && (
              <Card className="py-10 text-center text-sm text-ink-muted">
                {contractors.length === 0
                  ? 'Пока никого нет. Добавьте первого подрядчика.'
                  : 'В этой категории пока никого нет.'}
              </Card>
            )}

            {!loading && !loadError && visibleContractors.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
                <div className="flex flex-col gap-3">
                  {visibleContractors.map((c) => {
                    const own = emails.filter((e) => e.contractorId === c.id);
                    const unread = own.filter((e) => e.direction === 'in' && !e.readAt).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          'flex flex-col gap-1 rounded-control border p-3 text-left transition-colors',
                          c.id === selectedId
                            ? 'border-primary bg-primary-soft/40'
                            : 'border-border bg-surface hover:border-border-strong',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-ink">{workContractorTitle(c)}</span>
                          {unread > 0 && <Badge tone="success">{unread}</Badge>}
                        </div>
                        <span className="truncate text-xs text-ink-muted">{c.email || 'Email не указан'}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {c.category && <Badge>{c.category}</Badge>}
                          {own.length > 0 && <span className="text-xs text-ink-faint">{lettersLabel(own.length)}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selected ? (
                  <ContractorPanel
                    key={selected.id}
                    contractor={selected}
                    emails={emails.filter((e) => e.contractorId === selected.id)}
                    templates={templates}
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
          </>
        )}

        {tab === TAB_TEMPLATES && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-ink-muted">
              Шаблон подставляет тему и текст в письмо — дальше это обычный черновик, его можно править.{' '}
              {WORK_CONTRACTOR_PLACEHOLDER_HINT} — подставляются из карточки подрядчика (или получателя рассылки).
            </div>
            {templates.length === 0 ? (
              <Card className="py-10 text-center text-sm text-ink-muted">
                Шаблонов пока нет. Добавьте первый — например, запрос цены на аренду лесов.
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
                  <div className="whitespace-pre-wrap border-t border-border pt-2 text-sm text-ink">{template.body}</div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Владелец, 2026-09-15: "все таблицы с работами переносим на страницу
            Подрядчики, пока просто перенеси, потом поправим внешний вид той
            страницы" — блок "Работы" (ContractorsResearch, свои таблицы
            contractor_research_*) переехал сюда со страницы "Закупки" как есть,
            без правок вёрстки. С подрядчиками с Авито выше у него общих данных
            нет — это два независимых механизма, сведённые пока просто на одну
            страницу; внешний вид владелец просил поправить отдельно. Виден на
            обеих вкладках намеренно не был — но раз он не про почту и не про
            шаблоны, держим его вне табов, как и раньше. */}
        {tab === TAB_CONTRACTORS && (
          <div className="flex flex-col gap-6 border-t border-border pt-8">
            <div className="text-lg font-bold text-ink">Работы</div>
            <ContractorsResearch />
          </div>
        )}

        <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Подрядчик' : 'Новый подрядчик'}>
          <div className="flex flex-col gap-4">
            <Input
              label="Компания"
              placeholder="Название компании"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
            <AddableSelect
              label="Категория"
              options={categories}
              value={form.category}
              onChange={(value) => setForm((f) => ({ ...f, category: value }))}
              placeholder="Выберите категорию"
              newPlaceholder="Название новой категории"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Email"
                type="email"
                placeholder="mail@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="Доп. email (через запятую)"
                placeholder="second@example.com, third@example.com"
                value={form.extraEmailsText}
                onChange={(e) => setForm((f) => ({ ...f, extraEmailsText: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Сайт"
                placeholder="https://example.com"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              />
              <Input
                label="Телефон"
                placeholder="+7 (495) 000-00-00"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <Input
              label="Ссылка на страницу на Авито"
              placeholder="https://www.avito.ru/..."
              value={form.avitoUrl}
              onChange={(e) => setForm((f) => ({ ...f, avitoUrl: e.target.value }))}
            />
            <Input
              label="Типы лесов / услуги"
              placeholder="Рамные, клиновые, хомутовые, монтаж"
              value={form.services}
              onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
            />
            <Input
              label="Адрес / склад"
              placeholder="Москва, ..."
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <Textarea
              label="Примечание"
              rows={2}
              placeholder="Что учесть перед письмом"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
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

        <Modal
          open={templateFormOpen}
          onClose={() => setTemplateFormOpen(false)}
          title={editingTemplate ? 'Шаблон письма' : 'Новый шаблон'}
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Название шаблона"
              placeholder="Например, «Запрос цены на аренду лесов»"
              value={templateForm.name}
              onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Тема письма"
              placeholder="Например, «Запрос цены на аренду строительных лесов»"
              value={templateForm.subject}
              onChange={(e) => setTemplateForm((f) => ({ ...f, subject: e.target.value }))}
            />
            <Textarea
              label="Текст письма"
              rows={10}
              placeholder={`Здравствуйте!\n\n...`}
              value={templateForm.body}
              onChange={(e) => setTemplateForm((f) => ({ ...f, body: e.target.value }))}
            />
            <div className="text-xs text-ink-faint">{WORK_CONTRACTOR_PLACEHOLDER_HINT}</div>
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
      </div>

      <WorkContractorBulkSendModal
        open={bulkSendOpen}
        onClose={() => setBulkSendOpen(false)}
        contractors={contractors}
        categories={categories}
        templates={templates}
        onQueued={() => {}}
      />
    </>
  );
}

// Карточка выбранного подрядчика: реквизиты, лента переписки и композер.
// key={contractor.id} на вызове — при переключении подрядчика черновик
// письма не должен переезжать к следующему.
function ContractorPanel({
  contractor,
  emails,
  templates,
  onEdit,
  onDelete,
  onEmailSent,
}: {
  contractor: WorkContractor;
  emails: WorkContractorEmail[];
  templates: WorkContractorTemplate[];
  onEdit: () => void;
  onDelete: () => void;
  onEmailSent: (email: WorkContractorEmail) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState('');
  // Владелец, 2026-09-14: "никаких автоматических файлов к письму не
  // прикрепляется, я буду вручную писать текст и прикреплять все" — поэтому
  // здесь только то, что выбрали в проводнике; ни карточки организации, ни
  // ведомости, в отличие от переписки с поставщиками (SupplierCorrespondenceTab).
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Цитата письма, на которое отвечаем ("Ответить" на конкретном письме
  // ленты) — отдельно от body, подклеивается к тексту только при отправке
  // (см. handleSend), чтобы повторный клик "Ответить" не задваивал цитату
  // внутри уже напечатанного текста.
  const [quotedReplyText, setQuotedReplyText] = useState<string | null>(null);
  const [quotedReplyExpanded, setQuotedReplyExpanded] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  // Свежие сверху — та же раскладка, что у переписки с поставщиками.
  const ordered = useMemo(() => [...emails].reverse(), [emails]);

  function handleReplyTo(e: WorkContractorEmail) {
    const quoted = buildQuotedReply(e);
    setSubject(quoted.subject);
    setQuotedReplyText(quoted.quoted);
    setQuotedReplyExpanded(false);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handlePickTemplate(name: string) {
    const template = templates.find((t) => t.name === name);
    if (!template) return;
    if (body.trim() && !window.confirm('Заменить набранный текст письма шаблоном?')) return;
    const rendered = renderWorkContractorTemplate(template, { contractor });
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
    if (!contractor.email || !body.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const fullBody = quotedReplyText ? `${body}\n\n${quotedReplyText}` : body;
      const email = await sendWorkContractorEmail({
        contractorId: contractor.id,
        toAddress: contractor.email,
        subject,
        body: fullBody,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      onEmailSent(email);
      setSubject('');
      setBody('');
      setTemplateName('');
      setAttachments([]);
      setQuotedReplyText(null);
      setQuotedReplyExpanded(false);
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-bold text-ink">{workContractorTitle(contractor)}</div>
            {contractor.category && <Badge>{contractor.category}</Badge>}
          </div>
          {contractor.website && (
            <a
              href={contractor.website.startsWith('http') ? contractor.website : `https://${contractor.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {contractor.website}
            </a>
          )}
          {contractor.avitoUrl && (
            <a
              href={contractor.avitoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Страница на Авито
            </a>
          )}
          <span className="text-sm text-ink-muted">{contractor.email || 'Email не указан'}</span>
          {contractor.extraEmails.length > 0 && (
            <span className="text-xs text-ink-faint">Доп. email: {contractor.extraEmails.join(', ')}</span>
          )}
          {contractor.phone && <span className="text-sm text-ink-muted">{contractor.phone}</span>}
          {contractor.services && <span className="text-sm text-ink-muted">{contractor.services}</span>}
          {contractor.address && <span className="text-sm text-ink-muted">{contractor.address}</span>}
          {contractor.note && <span className="text-sm text-ink-faint">{contractor.note}</span>}
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

      <div ref={composerRef} className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="text-sm font-semibold text-ink">{quotedReplyText ? 'Ответить' : 'Написать письмо'}</div>
        {!contractor.email && (
          <div className="text-sm text-ink-muted">
            Чтобы написать подрядчику, добавьте его email в карточке («Изменить»).
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
        <Textarea
          rows={6}
          placeholder="Текст письма"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {quotedReplyText && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuotedReplyExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink"
              >
                {quotedReplyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {quotedReplyExpanded ? 'Скрыть цитируемое письмо' : 'Показать цитируемое письмо'}
              </button>
              <button
                type="button"
                onClick={() => setQuotedReplyText(null)}
                className="text-xs text-ink-faint hover:text-danger"
              >
                Убрать цитату
              </button>
            </div>
            {quotedReplyExpanded && (
              <div className="whitespace-pre-wrap border-l-2 border-border pl-2 text-xs text-ink-faint">
                {quotedReplyText}
              </div>
            )}
          </div>
        )}

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
          ordered.map((e, i) => (
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
              {i === 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Reply className="h-4 w-4" />}
                  onClick={() => handleReplyTo(e)}
                  className="mt-1 w-fit"
                >
                  Ответить
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
