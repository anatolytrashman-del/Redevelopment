import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ContactValue } from '../components/ui/ContactValue';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/cn';
import { formatPhoneDisplay } from '../lib/formatPhone';
import type { Supplier } from '../data/suppliers';
import type { SupplierOffer, SupplierRequest } from '../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../data/supplierSiteSnapshots';
import type { SupplierReliability } from '../data/supplierReliability';
import { CONTACT_SOURCE_LABEL, type SupplierContact } from '../data/supplierContacts';
import {
  countryFlag,
  messengerLink,
  supplierWebsiteFullUrl,
  type SupplierMessengerContact,
} from '../data/supplierResearch';
import { RISK_LEVEL_LABEL, isReliabilityStale, riskSummary, shouldFlag } from '../data/supplierReliability';
import { fetchSupplier } from '../lib/suppliersApi';
import { fetchSupplierOffersByCompany, fetchSupplierRequests } from '../lib/supplierResearchApi';
import { fetchSupplierSiteSnapshot } from '../lib/supplierSiteSnapshotsApi';
import { fetchSupplierReliability } from '../lib/supplierReliabilityApi';
import {
  deleteSupplierContact,
  fetchSupplierContacts,
  insertSupplierContact,
  updateSupplierContact,
  type SupplierContactInput,
} from '../lib/supplierContactsApi';

// Страница компании-поставщика (шаг 3 плана docs/procurement-product-steps.md).
//
// Чем она отличается от модалки в «Закупках»: та показывает ОДНУ карточку,
// то есть участие компании в одной категории закупки. Здесь — сама компания
// (таблица suppliers, шаг 2) и всё, что про неё известно: контакты, что
// поставляет по снимку сайта, условия работы из всех её карточек, в каких
// категориях закупки она участвует, проверка по реестру и свежесть каждого
// из этих сведений.
//
// Модалка намеренно остаётся жива: из сравнения цен смотреть карточку
// удобнее, не теряя таблицу. Перевод сравнения на страницу и удаление
// модалки — шаг 4, где у страницы появятся разделы «Переписка» и «КП».

type SupplierDetailTab = 'Обзор' | 'Контакты';

const TABS: SupplierDetailTab[] = ['Обзор', 'Контакты'];

// Вкладка живёт в ?tab=, а не в стейте — как на странице «Закупки»
// (владелец, 2026-09-04: «обновляешь — и всё слетело»). Слаги, не русские
// названия: переименование вкладки не должно ломать сохранённые ссылки.
const TAB_SLUGS: Record<SupplierDetailTab, string> = { 'Обзор': 'overview', Контакты: 'contacts' };
const SLUG_TO_TAB: Record<string, SupplierDetailTab> = Object.fromEntries(
  (Object.entries(TAB_SLUGS) as [SupplierDetailTab, string][]).map(([t, slug]) => [slug, t]),
);

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// «Устарело ли» для дат, у которых нет своего порога (снимок сайта,
// контакты). Порог тот же месяц, что у проверки реестра — чтобы «свежесть»
// на странице означала одно и то же для всех трёх дат.
const STALE_AFTER_DAYS = 30;

function isStale(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

// Заполненность профиля: доля заполненных полей, по которым закупщик решает,
// можно ли с компанией работать. Это подсказка «чего не хватает», а не оценка
// поставщика, поэтому считаем прямо здесь и показываем вместе со списком
// пропусков.
interface ProfileField {
  label: string;
  filled: boolean;
}

function profileFields(supplier: Supplier, snapshot: SupplierSiteSnapshot | null, termsNotes: string[]): ProfileField[] {
  return [
    { label: 'почта', filled: supplier.email.trim().length > 0 },
    { label: 'телефон', filled: supplier.phone.trim().length > 0 },
    { label: 'сайт', filled: supplier.websiteUrl.trim().length > 0 },
    { label: 'страна', filled: supplier.country.trim().length > 0 },
    { label: 'город', filled: supplier.city.trim().length > 0 },
    { label: 'ИНН', filled: (supplier.inn ?? '').trim().length > 0 },
    { label: 'мессенджеры', filled: supplier.messengers.length > 0 },
    { label: 'что поставляет', filled: (snapshot?.categories.length ?? 0) > 0 },
    { label: 'условия работы', filled: termsNotes.length > 0 },
  ];
}

// «1 категория / 2 категории / 5 категорий» — обычное русское склонение;
// без него бейдж читался как «2 категорий закупки».
function pluralCategories(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'категория' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'категории' : 'категорий';
  return `${n} ${word} закупки`;
}

// Как назвать контакт в списке. Пустое имя — обычное дело: общий ящик
// компании человеком не является, и подписывать его выдуманным именем
// хуже, чем честно показать адрес.
function contactTitle(c: SupplierContact): string {
  if (c.name.trim()) return c.name.trim();
  if (c.email.trim()) return c.email.trim();
  if (c.phone.trim()) return formatPhoneDisplay(c.phone);
  return 'Контакт без данных';
}

const emptyContactForm: SupplierContactInput = { name: '', role: '', phone: '', email: '', messengers: [] };

function ContactFormModal({
  open,
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: SupplierContact | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: SupplierContactInput) => void;
}) {
  const [form, setForm] = useState<SupplierContactInput>(emptyContactForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? { name: initial.name, role: initial.role, phone: initial.phone, email: initial.email, messengers: initial.messengers }
        : emptyContactForm,
    );
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Контактное лицо' : 'Новое контактное лицо'}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <Input label="Имя" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Например: Сергей Иванов" />
        <Input label="Роль" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Например: менеджер по продажам" />
        <Input label="Почта" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="ivanov@example.ru" />
        <Input label="Телефон" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+7 495 123-45-67" />
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          {/* Контакт без единого способа связаться ни на что не годен —
              сохранять такую строку незачем. Имя не требуем: у общего ящика
              его и не бывает. */}
          <Button type="submit" disabled={saving || (!form.email.trim() && !form.phone.trim())}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="w-40 shrink-0 text-sm text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-ink">{children}</span>
    </div>
  );
}

function MessengerChips({ messengers }: { messengers: SupplierMessengerContact[] }) {
  return (
    <span className="flex flex-wrap gap-2">
      {messengers.map((m, i) => {
        const { href, label } = messengerLink(m);
        const content = (
          <>
            <MessageCircle className="h-3.5 w-3.5" />
            {m.type}: {label}
          </>
        );
        return href ? (
          <a
            key={`${m.type}-${i}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-primary-hover hover:underline"
          >
            {content}
          </a>
        ) : (
          <span
            key={`${m.type}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-ink-muted"
          >
            {content}
          </span>
        );
      })}
    </span>
  );
}

export function SupplierDetail() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [requests, setRequests] = useState<SupplierRequest[]>([]);
  const [snapshot, setSnapshot] = useState<SupplierSiteSnapshot | null>(null);
  const [reliability, setReliability] = useState<SupplierReliability | null>(null);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [company, companyOffers, allRequests, companyContacts] = await Promise.all([
          fetchSupplier(id),
          fetchSupplierOffersByCompany(id),
          fetchSupplierRequests(),
          fetchSupplierContacts(id),
        ]);
        if (cancelled) return;
        setSupplier(company);
        setOffers(companyOffers);
        setRequests(allRequests);
        setContacts(companyContacts);

        // Снимок сайта и проверка реестра — вторым заходом: они нужны не
        // всегда (компания без сайта, компания без ИНН) и не должны
        // задерживать показ основного.
        const host = company?.websiteHost ?? '';
        const inn = (company?.inn ?? '').trim();
        const [siteSnapshot, checks] = await Promise.all([
          host ? fetchSupplierSiteSnapshot(host) : Promise.resolve(null),
          inn ? fetchSupplierReliability() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setSnapshot(siteSnapshot);
        setReliability(checks.find((c) => c.inn === inn) ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, 'Не удалось загрузить поставщика'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Поставщик" />
        <Card className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем карточку компании...
        </Card>
      </div>
    );
  }

  if (loadError || !supplier) {
    return (
      <div className="space-y-6">
        <PageHeader title="Поставщик" />
        <Card className="space-y-3">
          <p className="text-sm text-danger">{loadError ?? 'Такой компании нет — возможно, её удалили.'}</p>
          <Link to="/admin/purchases" className="inline-flex items-center gap-1.5 text-sm text-primary-hover hover:underline">
            <ArrowLeft className="h-4 w-4" />
            К закупкам
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <SupplierDetailView
      supplier={supplier}
      offers={offers}
      requests={requests}
      snapshot={snapshot}
      reliability={reliability}
      contacts={contacts}
      onContactsChange={setContacts}
    />
  );
}

// Чистое представление: всё, что страница показывает, без единого запроса.
// Отдельно от загрузки ровно затем, чтобы карточку можно было открыть с
// подставными данными и посмотреть глазами, не имея доступа к базе (мок-тест
// по правилам CLAUDE.md), и чтобы будущие разделы шага 4 не приходилось
// тащить через сеть, когда нужно проверить только вёрстку.
export function SupplierDetailView({
  supplier,
  offers,
  requests,
  snapshot,
  reliability,
  contacts,
  onContactsChange,
}: {
  supplier: Supplier;
  offers: SupplierOffer[];
  requests: SupplierRequest[];
  snapshot: SupplierSiteSnapshot | null;
  reliability: SupplierReliability | null;
  contacts: SupplierContact[];
  // Список людей меняется прямо на странице, поэтому его держит загрузчик, а
  // представление возвращает ему новый — так же, как это делают страницы
  // «Лиды» и «Юрлица». В мок-тесте сюда передают заглушку.
  onContactsChange: (next: SupplierContact[]) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SupplierDetailTab = SLUG_TO_TAB[searchParams.get('tab') ?? ''] ?? 'Обзор';

  const requestById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);

  // Условия работы собираем со ВСЕХ карточек компании: менеджер пишет их в
  // переписке по конкретной категории, а относятся они обычно к компании
  // целиком («доставка от 50 000 ₽»). Одинаковый текст в двух категориях —
  // не два разных условия, поэтому дубли схлопываем.
  const termsNotes = useMemo(() => {
    const seen = new Set<string>();
    const result: { note: string; categoryTitle: string }[] = [];
    for (const o of offers) {
      const note = (o.termsNote ?? '').trim();
      if (!note || seen.has(note)) continue;
      seen.add(note);
      result.push({ note, categoryTitle: requestById.get(o.requestId)?.title ?? 'категория удалена' });
    }
    return result;
  }, [offers, requestById]);

  // Последний раз, когда контакты карточек трогало автообогащение. Отдельной
  // даты «когда обновляли контакты» в данных нет, и ближайшее к ней — время
  // создания карточки: обогащение пишет результат в неё же.
  const contactsFreshness = useMemo(() => {
    const dates = offers.map((o) => o.createdAt).filter(Boolean).sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [offers]);

  const fields = useMemo(
    () => (supplier ? profileFields(supplier, snapshot, termsNotes.map((t) => t.note)) : []),
    [supplier, snapshot, termsNotes],
  );
  const filledCount = fields.filter((f) => f.filled).length;
  const profilePercent = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 0;
  const missing = fields.filter((f) => !f.filled).map((f) => f.label);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  async function saveContact(input: SupplierContactInput) {
    setSavingContact(true);
    setContactError(null);
    try {
      if (editingContact) {
        const updated = await updateSupplierContact(editingContact.id, input);
        onContactsChange(contacts.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await insertSupplierContact(supplier.id, input);
        onContactsChange([...contacts, created]);
      }
      setContactModalOpen(false);
      setEditingContact(null);
    } catch (err) {
      // Самая частая причина — тот же адрес уже есть у этой компании
      // (уникальный индекс в базе). Показываем причину прямо в списке, а не
      // молча закрываем форму.
      setContactError(errorMessage(err, 'Не удалось сохранить контакт'));
    } finally {
      setSavingContact(false);
    }
  }

  async function removeContact(contact: SupplierContact) {
    if (!window.confirm(`Убрать контакт «${contactTitle(contact)}»? Строка останется в базе, из списка пропадёт.`)) return;
    setDeletingContactId(contact.id);
    setContactError(null);
    try {
      await deleteSupplierContact(contact.id);
      onContactsChange(contacts.filter((c) => c.id !== contact.id));
    } catch (err) {
      setContactError(errorMessage(err, 'Не удалось убрать контакт'));
    } finally {
      setDeletingContactId(null);
    }
  }

  function setTab(next: SupplierDetailTab) {
    const params = new URLSearchParams(searchParams);
    params.set('tab', TAB_SLUGS[next]);
    setSearchParams(params, { replace: true });
  }

  const hasRisk = shouldFlag(reliability);

  return (
    <div className="space-y-6">
      <PageHeader title={supplier.name} />

      <Link to="/admin/purchases" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        К закупкам
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        {supplier.country.trim() && (
          <span className="text-base" title={supplier.country}>
            {countryFlag(supplier.country)}
          </span>
        )}
        <Badge tone={supplier.verified ? 'success' : 'neutral'}>
          {supplier.verified ? 'Проверена человеком' : 'Не верифицирована'}
        </Badge>
        {hasRisk && reliability && (
          <Badge tone={reliability.riskLevel === 'danger' ? 'danger' : 'warning'}>
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            {riskSummary(reliability)}
          </Badge>
        )}
        <Badge tone="neutral">{pluralCategories(offers.length)}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              t === tab ? 'border-primary bg-primary-soft text-primary' : 'border-border text-ink-muted hover:text-ink',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Обзор' && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">О компании</h2>
            <Row label="Сайт">
              {supplier.websiteUrl.trim() ? (
                <a
                  href={supplierWebsiteFullUrl(supplier.websiteUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary-hover hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  {supplier.websiteHost || supplier.websiteUrl}
                </a>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Страна и город">
              {[supplier.country.trim(), supplier.city.trim()].filter(Boolean).join(', ') || '—'}
            </Row>
            <Row label="ИНН">{(supplier.inn ?? '').trim() || 'появится из первого счёта'}</Row>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Что поставляет</h2>
            {snapshot && snapshot.categories.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {snapshot.categories.map((c) => (
                  <span key={c} className="rounded-full border border-border px-2.5 py-1 text-xs text-ink-muted">
                    {c}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">
                {!supplier.websiteHost
                  ? 'Сайта нет — товарные группы брать неоткуда.'
                  : !snapshot
                    ? 'Сайт ещё не читали.'
                    : snapshot.status === 'error'
                      ? `Сайт не открылся автосбору${snapshot.error ? `: ${snapshot.error}` : ''}.`
                      : snapshot.status === 'done'
                        ? 'По сайту не удалось понять, что поставляет.'
                        : 'Сайт в очереди на чтение.'}
              </p>
            )}
            {snapshot?.categoriesNote && <p className="text-xs text-ink-faint">{snapshot.categoriesNote}</p>}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Наличие и условия</h2>
            {termsNotes.length > 0 ? (
              <ul className="space-y-2">
                {termsNotes.map((t) => (
                  <li key={t.note}>
                    <p className="text-sm text-ink">{t.note}</p>
                    <p className="text-xs text-ink-faint">из закупки «{t.categoryTitle}»</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">
                Условия не записаны. Их заполняют в карточке поставщика по тому, что менеджер написал в переписке.
              </p>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Участвует в закупках</h2>
            {offers.length > 0 ? (
              <ul className="space-y-2">
                {offers.map((o) => {
                  const request = requestById.get(o.requestId);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-ink">{request?.title ?? 'Категория удалена'}</span>
                      <Link
                        to="/admin/purchases?tab=suppliers"
                        className="inline-flex items-center gap-1.5 text-xs text-primary-hover hover:underline"
                      >
                        Открыть в закупках
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">Компания не участвует ни в одной категории закупки.</p>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Благонадёжность</h2>
            {!(supplier.inn ?? '').trim() ? (
              <p className="text-sm text-ink-faint">
                Проверим автоматически, когда поставщик пришлёт счёт — ИНН берётся из него.
              </p>
            ) : !reliability ? (
              <p className="text-sm text-ink-faint">Ещё не проверяли.</p>
            ) : reliability.error ? (
              <p className="text-sm text-warning">Не удалось проверить: {reliability.error}</p>
            ) : !reliability.found ? (
              <p className="text-sm font-medium text-danger">Организация с таким ИНН не найдена в ЕГРЮЛ/ЕГРИП</p>
            ) : (
              <div className="space-y-2">
                <p className={cn('text-sm', reliability.riskLevel === 'ok' ? 'text-success' : 'text-warning')}>
                  {RISK_LEVEL_LABEL[reliability.riskLevel]}
                </p>
                {reliability.risks.length > 0 && (
                  <ul className="space-y-1">
                    {reliability.risks.map((r, i) => (
                      <li
                        key={`${r.title}-${i}`}
                        className={cn('flex gap-1.5 text-sm', r.level === 'danger' ? 'text-danger' : 'text-warning')}
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          {r.title}
                          {r.detail && <span className="text-ink-faint"> — {r.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Насколько свежие данные</h2>
            <Row label="Контакты">
              {formatDate(contactsFreshness)}
              {isStale(contactsFreshness) && <span className="ml-2 text-xs text-warning">устарело</span>}
            </Row>
            <Row label="Чтение сайта">
              {formatDate(snapshot?.fetchedAt ?? null)}
              {isStale(snapshot?.fetchedAt ?? null) && <span className="ml-2 text-xs text-warning">устарело</span>}
            </Row>
            <Row label="Проверка по реестру">
              {formatDate(reliability?.checkedAt ?? null)}
              {/* Порог «устарело» у реестра свой — 30 дней в
                  isReliabilityStale: реестры обновляются не чаще раза в
                  сутки, а суточный лимит запросов к Checko не резиновый. */}
              {reliability && isReliabilityStale(reliability) && (
                <span className="ml-2 text-xs text-warning">устарело, стоит перепроверить</span>
              )}
            </Row>
            <div className="border-t border-border pt-3">
              <Row label="Заполненность профиля">
                <span className="tabular-nums">{profilePercent}%</span>
                {missing.length > 0 && <span className="ml-2 text-xs text-ink-faint">не хватает: {missing.join(', ')}</span>}
              </Row>
            </div>
          </Card>
        </div>
      )}

      {tab === 'Контакты' && (
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">
                Контактные лица{contacts.length > 0 ? ` (${contacts.length})` : ''}
              </h2>
              <Button
                type="button"
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditingContact(null);
                  setContactModalOpen(true);
                }}
              >
                Добавить
              </Button>
            </div>

            {contactError && <p className="text-sm text-danger">{contactError}</p>}

            {contacts.length === 0 ? (
              <p className="text-sm text-ink-faint">
                Людей пока нет. Контакт появится сам, как только с этой компании ответят на письмо, — или добавьте
                вручную.
              </p>
            ) : (
              <ul className="space-y-3">
                {contacts.map((c) => (
                  <li key={c.id} className="rounded-control border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{contactTitle(c)}</span>
                          {c.role.trim() && <span className="text-xs text-ink-muted">{c.role}</span>}
                          <Badge tone="neutral">{CONTACT_SOURCE_LABEL[c.source] ?? c.source ?? 'источник неизвестен'}</Badge>
                        </div>
                        {/* У безымянного контакта заголовком уже служит его
                            адрес (см. contactTitle) — второй раз ту же строку
                            под иконкой не показываем. */}
                        {c.email.trim() && contactTitle(c) !== c.email.trim() && (
                          <p className="flex items-center gap-1.5 text-sm text-ink">
                            <Mail className="h-4 w-4 text-ink-faint" />
                            {c.email}
                          </p>
                        )}
                        {c.phone.trim() && (
                          <p className="flex items-center gap-1.5 text-sm text-ink">
                            <Phone className="h-4 w-4 text-ink-faint" />
                            <ContactValue contact={formatPhoneDisplay(c.phone)} contactMethod="Телефон" />
                          </p>
                        )}
                        {c.messengers.length > 0 && <MessengerChips messengers={c.messengers} />}
                        <p className="text-xs text-ink-faint">
                          {c.lastReplyAt ? `Последний ответ: ${formatDate(c.lastReplyAt)}` : 'Ни разу не отвечал'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label={`Изменить контакт «${contactTitle(c)}»`}
                          className="rounded-full border border-border p-2 text-ink-muted transition-colors hover:text-ink"
                          onClick={() => {
                            setEditingContact(c);
                            setContactModalOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Убрать контакт «${contactTitle(c)}»`}
                          disabled={deletingContactId === c.id}
                          className="rounded-full border border-border p-2 text-ink-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
                          onClick={() => removeContact(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t border-border pt-3 text-xs text-ink-faint">
              Список пополняется сам: когда с нового адреса приходит ответ, человек появляется здесь с датой письма.
              Общий ящик компании — тоже строка в списке, просто без имени.
            </p>
          </Card>

          <ContactFormModal
            open={contactModalOpen}
            initial={editingContact}
            saving={savingContact}
            onClose={() => {
              setContactModalOpen(false);
              setEditingContact(null);
            }}
            onSubmit={saveContact}
          />
        </div>
      )}
    </div>
  );
}
