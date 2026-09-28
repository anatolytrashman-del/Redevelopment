import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Factory,
  MoreHorizontal,
  Loader2,
  Mail,
  MessageCircle,
  Ban,
  Pencil,
  Phone,
  Plus,
  Merge,
  RefreshCw,
  SlidersHorizontal,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { SUPPLIER_KIND_LABELS } from '../data/suppliers';
import { SearchInput } from '../components/ui/SearchInput';
import { Select } from '../components/ui/Select';
import { fetchPurchaseOrderCountBySupplier } from '../lib/purchaseOrdersApi';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ContactValue } from '../components/ui/ContactValue';
import { Button, buttonClasses } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/cn';
import { formatPhoneDisplay } from '../lib/formatPhone';
import type { Supplier, SupplierSiteProfile } from '../data/suppliers';
import type { SupplierOffer, SupplierRequest } from '../data/supplierResearch';
import type { SupplierSiteSnapshot } from '../data/supplierSiteSnapshots';
import type { SupplierReliability } from '../data/supplierReliability';
import { CONTACT_SOURCE_LABEL, type SupplierContact } from '../data/supplierContacts';
import type { SupplierOfferEmail } from '../data/supplierOfferEmails';
import type { QuoteTerms, SupplierQuote } from '../data/supplierQuotes';
import type { SupplierReliabilityCheck } from '../data/supplierReliability';
import { currencySymbols } from '../data/transactions';
import { purchaseItemTotal } from '../data/purchases';
import { messengerLink, supplierWebsiteFullUrl, type SupplierMessengerContact } from '../data/supplierResearch';
import { RISK_LEVEL_LABEL, isReliabilityStale, riskSummary, shouldFlag } from '../data/supplierReliability';
import { fetchSupplier, fetchSupplierMergeCandidates, mergeSuppliers, setSupplierBlocked } from '../lib/suppliersApi';
import { fetchSupplierOffersByCompany, fetchSupplierRequests } from '../lib/supplierResearchApi';
import { fetchSupplierSiteSnapshot, requestSiteSnapshotRefresh } from '../lib/supplierSiteSnapshotsApi';
import {
  checkSupplierReliability,
  fetchSupplierReliability,
  fetchSupplierReliabilityChecks,
} from '../lib/supplierReliabilityApi';
import { SupplierOrdersSection } from '../components/suppliers/PurchaseOrdersTab';
import { fetchSupplierOfferEmailsByOffers } from '../lib/supplierOfferEmailsApi';
import { fetchSupplierQuotesByOffers, updateSupplierQuoteTerms } from '../lib/supplierQuotesApi';
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

type SupplierDetailTab = 'Обзор' | 'Каталог' | 'Переписка' | 'КП и цены' | 'Заказы' | 'Проверка' | 'Активность';

const TABS: SupplierDetailTab[] = ['Обзор', 'Каталог', 'Переписка', 'КП и цены', 'Заказы', 'Проверка', 'Активность'];

// Вкладка живёт в ?tab=, а не в стейте — как на странице «Закупки»
// (владелец, 2026-09-04: «обновляешь — и всё слетело»). Слаги, не русские
// названия: переименование вкладки не должно ломать сохранённые ссылки.
const TAB_SLUGS: Record<SupplierDetailTab, string> = {
  Обзор: 'overview',
  Каталог: 'catalog',
  Переписка: 'emails',
  'КП и цены': 'quotes',
  Заказы: 'orders',
  Проверка: 'reliability',
  Активность: 'activity',
};
const SLUG_TO_TAB: Record<string, SupplierDetailTab> = {
  ...Object.fromEntries((Object.entries(TAB_SLUGS) as [SupplierDetailTab, string][]).map(([t, slug]) => [slug, t])),
  contacts: 'Обзор',
};

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

function profileFields(
  supplier: Supplier,
  snapshot: SupplierSiteSnapshot | null,
  termsNotes: string[],
): ProfileField[] {
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
        ? {
            name: initial.name,
            role: initial.role,
            phone: initial.phone,
            email: initial.email,
            messengers: initial.messengers,
          }
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
        <Input
          label="Имя"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Например: Сергей Иванов"
        />
        <Input
          label="Роль"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          placeholder="Например: менеджер по продажам"
        />
        <Input
          label="Почта"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="ivanov@example.ru"
        />
        <Input
          label="Телефон"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+7 495 123-45-67"
        />
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

// Ссылка в «Закупки», на конкретный тред переписки. Адрес такой же, какой
// ставит себе сама вкладка «Письма» (см. SupplierCorrespondenceTab), поэтому
// открывается ровно нужная ветка, а не общий список.
function threadLink(requestId: string, offerId: string, orderId: string | null): string {
  const params = new URLSearchParams({ tab: 'letters', category: requestId, offer: offerId });
  if (orderId) params.set('order', orderId);
  return `/admin/purchases?${params.toString()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value: number, currency: string): string {
  return `${value.toLocaleString('ru-RU')} ${currencySymbols[currency as keyof typeof currencySymbols] ?? currency}`;
}

// Лента «Активности» — одно событие. Своей таблицы у неё нет и не будет:
// activity_log в этой базе хранит только «кто и что сделал» без ссылки на
// сущность (колонки profile_id/profile_name/action/created_at), поэтому
// отфильтровать его по конкретному поставщику невозможно. Лента собирается
// из того, что действительно привязано к компании: письма, КП, проверки.
interface ActivityEvent {
  at: string;
  title: string;
  detail: string;
  href?: string;
}

// Условия поставки человеческим языком — для показа в списке КП.
function termsSummary(terms: QuoteTerms | null): string[] {
  if (!terms) return [];
  const out: string[] = [];
  if (terms.leadTimeDays != null) out.push(`срок ${terms.leadTimeDays} дн.`);
  if (terms.availability === 'in_stock') out.push('в наличии');
  if (terms.availability === 'on_order') out.push('под заказ');
  if (terms.prepaymentPercent != null) {
    out.push(terms.prepaymentPercent === 0 ? 'оплата по факту' : `предоплата ${terms.prepaymentPercent}%`);
  }
  if (typeof terms.deliveryCost === 'number') {
    out.push(
      terms.deliveryCost === 0 ? 'доставка бесплатно' : `доставка ${terms.deliveryCost.toLocaleString('ru-RU')}`,
    );
  }
  if (terms.deliveryTerms) out.push(terms.deliveryTerms);
  if (terms.vatIncluded === false) out.push('цены без НДС');
  if (terms.vatIncluded === true && terms.vatRate != null) out.push(`НДС ${terms.vatRate}%`);
  if (terms.minOrder) out.push(`мин. заказ: ${terms.minOrder}`);
  if (terms.validUntil) out.push(`цена до ${terms.validUntil}`);
  return out;
}

// Правка условий КП руками (шаг 6b плана закупок). Распознавание вытаскивает
// их из счёта и письма, но менеджер мог назвать срок по телефону, а модель —
// ошибиться в цифре: без формы исправить это было нечем.
function TermsFormModal({
  quote,
  saving,
  onClose,
  onSubmit,
}: {
  quote: SupplierQuote | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (terms: QuoteTerms | null) => void;
}) {
  const [form, setForm] = useState<{
    leadTimeDays: string;
    prepaymentPercent: string;
    deliveryCost: string;
    deliveryTerms: string;
    availability: '' | 'in_stock' | 'on_order';
    minOrder: string;
    validUntil: string;
    vat: '' | 'included' | 'excluded';
    vatRate: string;
  }>({
    leadTimeDays: '',
    prepaymentPercent: '',
    deliveryCost: '',
    deliveryTerms: '',
    availability: '',
    minOrder: '',
    validUntil: '',
    vat: '',
    vatRate: '',
  });

  useEffect(() => {
    if (!quote) return;
    const t = quote.terms;
    setForm({
      leadTimeDays: t?.leadTimeDays != null ? String(t.leadTimeDays) : '',
      prepaymentPercent: t?.prepaymentPercent != null ? String(t.prepaymentPercent) : '',
      deliveryCost: typeof t?.deliveryCost === 'number' ? String(t.deliveryCost) : '',
      deliveryTerms: t?.deliveryTerms ?? '',
      availability: t?.availability ?? '',
      minOrder: t?.minOrder ?? '',
      validUntil: t?.validUntil ?? '',
      vat: t?.vatIncluded === true ? 'included' : t?.vatIncluded === false ? 'excluded' : '',
      vatRate: t?.vatRate != null ? String(t.vatRate) : '',
    });
  }, [quote]);

  function submit() {
    const num = (v: string) => {
      const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''));
      return v.trim() && Number.isFinite(n) ? n : null;
    };
    const next: QuoteTerms = {
      leadTimeDays: num(form.leadTimeDays),
      prepaymentPercent: num(form.prepaymentPercent),
      deliveryCost: num(form.deliveryCost),
      deliveryTerms: form.deliveryTerms.trim(),
      availability: form.availability || null,
      minOrder: form.minOrder.trim(),
      validUntil: form.validUntil.trim(),
      vatIncluded: form.vat === 'included' ? true : form.vat === 'excluded' ? false : null,
      vatRate: num(form.vatRate),
    };
    // Все поля пустые — это «условий нет», и хранить {} вместо null не надо:
    // null читается однозначно и в базе, и в сравнении цен.
    const hasAny = Object.values(next).some((v) => v !== null && v !== '');
    onSubmit(hasAny ? next : null);
  }

  return (
    <Modal open={quote !== null} onClose={onClose} title="Условия поставки">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Эти значения видны в сравнении цен рядом с ценой. Пустое поле — «не указано», а не ноль.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Срок поставки, дней"
            value={form.leadTimeDays}
            onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: e.target.value }))}
            placeholder="7"
          />
          <Input
            label="Предоплата, %"
            value={form.prepaymentPercent}
            onChange={(e) => setForm((f) => ({ ...f, prepaymentPercent: e.target.value }))}
            placeholder="100"
          />
          <Input
            label="Доставка, сумма"
            value={form.deliveryCost}
            onChange={(e) => setForm((f) => ({ ...f, deliveryCost: e.target.value }))}
            placeholder="0 — если бесплатно"
          />
          <Input
            label="Условие доставки"
            value={form.deliveryTerms}
            onChange={(e) => setForm((f) => ({ ...f, deliveryTerms: e.target.value }))}
            placeholder="бесплатно от 300 000"
          />
          <Input
            label="Минимальный заказ"
            value={form.minOrder}
            onChange={(e) => setForm((f) => ({ ...f, minOrder: e.target.value }))}
            placeholder="паллета"
          />
          <Input
            label="Цена действует до"
            value={form.validUntil}
            onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
            placeholder="20.09.2026"
          />
          <Input
            label="Ставка НДС, %"
            value={form.vatRate}
            onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))}
            placeholder="20"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['', 'наличие не указано'],
              ['in_stock', 'в наличии'],
              ['on_order', 'под заказ'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setForm((f) => ({ ...f, availability: value }))}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                form.availability === value
                  ? 'border-border-strong bg-surface-muted text-ink'
                  : 'border-border text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['', 'про НДС не сказано'],
              ['included', 'цены с НДС'],
              ['excluded', 'цены без НДС'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setForm((f) => ({ ...f, vat: value }))}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                form.vat === value
                  ? 'border-border-strong bg-surface-muted text-ink'
                  : 'border-border text-ink-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      </div>
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

type DisplayMessenger = SupplierMessengerContact | { type: 'Viber'; number: string };

function MessengerChips({ messengers }: { messengers: DisplayMessenger[] }) {
  return (
    <span className="flex flex-wrap gap-2">
      {messengers.map((m, i) => {
        const { href, label } =
          m.type === 'Viber'
            ? {
                href: /^\+?[\d\s()-]+$/.test(m.number)
                  ? `viber://chat?number=${encodeURIComponent(m.number.replace(/[^+\d]/g, ''))}`
                  : null,
                label: m.number,
              }
            : messengerLink(m);
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
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-info-text hover:underline"
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

const ADDRESS_LABELS: Record<string, string> = {
  office: 'Офис',
  production: 'Производство',
  warehouse: 'Склад',
  showroom: 'Шоурум',
  store: 'Магазин',
  legal: 'Юридический',
};
const SITE_TERM_LABELS = [
  ['wholesale', 'Опт'],
  ['min_order', 'Минимальный заказ'],
  ['delivery', 'Доставка'],
  ['payment', 'Оплата'],
  ['dealer_program', 'Дилерам'],
] as const;

function CopyLine({
  value,
  display = value,
  label,
  preferred,
}: {
  value: string;
  display?: string;
  label?: string | null;
  preferred?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0 select-text break-words font-medium">
        {display}
        {preferred && <span className="ml-1 text-xs text-success">пишем сюда</span>}
        {label && <p className="text-xs font-normal text-ink-faint">{label}</p>}
      </div>
      <button
        type="button"
        aria-label={`Копировать ${value}`}
        className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-ink-muted"
        onClick={async () => {
          try {
            await navigator.clipboard?.writeText(value);
          } catch {
            /* Текст остаётся доступен для ручного копирования. */
          }
        }}
      >
        Копировать
      </button>
    </div>
  );
}

function ProfileChips({
  title,
  values,
  limit = values.length,
  products,
}: {
  title: string;
  values: string[];
  limit?: number;
  products?: NonNullable<SupplierSiteProfile['products']>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!values.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {values.slice(0, expanded ? undefined : limit).map((value, index) => (
          <span
            key={`${value}-${index}`}
            className={cn(
              'rounded-lg px-2.5 py-1 text-sm',
              products ? 'border border-border-strong bg-surface font-semibold' : 'bg-surface-muted',
            )}
          >
            {value}
            {products && (
              <span className="ml-1 font-normal tabular-nums text-ink-faint">
                {
                  products.filter((product) => product.brand?.trim().toLowerCase() === value.trim().toLowerCase())
                    .length
                }
              </span>
            )}
          </span>
        ))}
        {!expanded && values.length > limit && (
          <button type="button" className="px-2 text-sm font-semibold text-ink-muted" onClick={() => setExpanded(true)}>
            ещё {values.length - limit}
          </button>
        )}
      </div>
    </div>
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
  const [emails, setEmails] = useState<SupplierOfferEmail[]>([]);
  const [quotes, setQuotes] = useState<SupplierQuote[]>([]);
  const [checks, setChecks] = useState<SupplierReliabilityCheck[]>([]);
  const [orderCount, setOrderCount] = useState<number | null>(null);
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
        // Переписка, КП и история проверок — вторым заходом, вместе со
        // снимком сайта: первый экран (кто это и чем занимается) не должен
        // ждать писем.
        const offerIds = companyOffers.map((o) => o.id);
        const [siteSnapshot, allChecks, companyEmails, companyQuotes, history, companyOrderCount] = await Promise.all([
          host ? fetchSupplierSiteSnapshot(host) : Promise.resolve(null),
          inn ? fetchSupplierReliability() : Promise.resolve([]),
          fetchSupplierOfferEmailsByOffers(offerIds),
          fetchSupplierQuotesByOffers(offerIds),
          fetchSupplierReliabilityChecks(id),
          fetchPurchaseOrderCountBySupplier(id).catch(() => null),
        ]);
        if (cancelled) return;
        setSnapshot(siteSnapshot);
        setReliability(allChecks.find((c) => c.inn === inn) ?? null);
        setEmails(companyEmails);
        setQuotes(companyQuotes);
        setChecks(history);
        setOrderCount(companyOrderCount);
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
          <Link
            to="/admin/purchases?tab=suppliers"
            className="inline-flex items-center gap-1.5 text-sm text-info-text hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />К закупкам
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
      onSupplierChange={setSupplier}
      contacts={contacts}
      onContactsChange={setContacts}
      emails={emails}
      quotes={quotes}
      checks={checks}
      orderCount={orderCount}
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
  onSupplierChange,
  offers,
  requests,
  snapshot,
  reliability,
  contacts,
  onContactsChange,
  emails,
  quotes,
  checks,
  orderCount,
}: {
  supplier: Supplier;
  // Стоп-лист и перепроверка меняют саму компанию, поэтому представление
  // возвращает обновлённую загрузчику — тот же приём, что с контактами.
  onSupplierChange: (next: Supplier) => void;
  offers: SupplierOffer[];
  requests: SupplierRequest[];
  snapshot: SupplierSiteSnapshot | null;
  reliability: SupplierReliability | null;
  contacts: SupplierContact[];
  // Список людей меняется прямо на странице, поэтому его держит загрузчик, а
  // представление возвращает ему новый — так же, как это делают страницы
  // «Лиды» и «Юрлица». В мок-тесте сюда передают заглушку.
  onContactsChange: (next: SupplierContact[]) => void;
  emails: SupplierOfferEmail[];
  quotes: SupplierQuote[];
  checks: SupplierReliabilityCheck[];
  orderCount: number | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SupplierDetailTab = SLUG_TO_TAB[searchParams.get('tab') ?? ''] ?? 'Обзор';

  const requestById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);

  const offerById = useMemo(() => new Map(offers.map((o) => [o.id, o])), [offers]);

  // Категория закупки, к которой относится письмо или КП: они висят на
  // карточке, а карточка — на категории.
  function categoryOf(offerId: string): { requestId: string; title: string } {
    const offer = offerById.get(offerId);
    const request = offer ? requestById.get(offer.requestId) : undefined;
    return { requestId: offer?.requestId ?? '', title: request?.title ?? 'категория удалена' };
  }

  const activity: ActivityEvent[] = useMemo(() => {
    const events: ActivityEvent[] = [];
    for (const e of emails) {
      const cat = categoryOf(e.offerId);
      events.push({
        at: e.createdAt,
        title: e.direction === 'in' ? 'Ответ от поставщика' : 'Мы написали',
        detail: `${e.subject || 'без темы'} · ${cat.title}`,
        href: cat.requestId ? threadLink(cat.requestId, e.offerId, e.orderId ?? null) : undefined,
      });
    }
    for (const q of quotes) {
      const cat = categoryOf(q.offerId);
      events.push({
        at: q.createdAt,
        title: 'Получено КП',
        detail: `${q.title}${q.price > 0 ? ` · ${formatMoney(q.price, q.currency)}` : ''} · ${cat.title}`,
      });
    }
    for (const c of checks) {
      events.push({
        at: c.checkedAt,
        title: 'Проверка по реестру',
        detail: c.error
          ? `не удалось: ${c.error}`
          : c.found
            ? RISK_LEVEL_LABEL[c.riskLevel]
            : 'юрлицо не найдено в ЕГРЮЛ/ЕГРИП',
      });
    }
    return events.sort((a, b) => b.at.localeCompare(a.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails, quotes, checks, offerById, requestById]);

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
    const dates = offers
      .map((o) => o.createdAt)
      .filter(Boolean)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [offers]);

  const fields = useMemo(
    () =>
      supplier
        ? profileFields(
            supplier,
            snapshot,
            termsNotes.map((t) => t.note),
          )
        : [],
    [supplier, snapshot, termsNotes],
  );
  const filledCount = fields.filter((f) => f.filled).length;
  const profilePercent = fields.length > 0 ? Math.round((filledCount / fields.length) * 100) : 0;
  const missing = fields.filter((f) => !f.filled).map((f) => f.label);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'reliability' | 'snapshot' | 'block' | null>(null);

  // Первая карточка компании — с неё начинается переписка, если человек жмёт
  // «Написать». Карточек может быть несколько (по одной на категорию
  // закупки), и выбрать за человека правильную нельзя; берём самую свежую —
  // по ней и переписка обычно самая живая.
  const primaryOffer = offers.length > 0 ? offers[offers.length - 1] : null;

  async function recheckReliability() {
    const inn = (supplier.inn ?? '').trim();
    if (!inn) return;
    setBusyAction('reliability');
    setActionError(null);
    setActionNote(null);
    try {
      const result = await checkSupplierReliability(inn);
      setActionNote(
        result.error
          ? `Проверка не удалась: ${result.error}`
          : result.found
            ? `Проверено: ${RISK_LEVEL_LABEL[result.riskLevel].toLowerCase()}`
            : 'Юрлицо с таким ИНН не найдено в реестрах',
      );
      // Строку истории пишет триггер в базе, поэтому перечитываем страницу
      // целиком только по требованию человека — здесь достаточно сообщения.
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось проверить по реестру'));
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshSnapshot() {
    if (!supplier.websiteHost) return;
    setBusyAction('snapshot');
    setActionError(null);
    setActionNote(null);
    try {
      await requestSiteSnapshotRefresh(supplier.websiteHost, supplier.websiteUrl);
      setActionNote('Сайт поставлен в очередь на перечитывание — разбирается в течение минуты.');
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось поставить сайт в очередь'));
    } finally {
      setBusyAction(null);
    }
  }

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<Supplier[] | null>(null);
  const [merging, setMerging] = useState(false);

  async function openMerge() {
    setMergeOpen(true);
    setMergeCandidates(null);
    setActionError(null);
    setActionNote(null);
    try {
      setMergeCandidates(await fetchSupplierMergeCandidates(supplier.id));
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось найти кандидатов на объединение'));
      setMergeOpen(false);
    }
  }

  async function doMerge(source: Supplier) {
    if (
      !window.confirm(
        `Объединить «${source.name}» в «${supplier.name}»?\n\nВсе карточки, контакты и проверки дубля переедут сюда, ` +
          'пустые поля этой компании дополнятся его данными. Сам дубль скроется из каталога, но останется в базе.',
      )
    )
      return;
    setMerging(true);
    setActionError(null);
    try {
      await mergeSuppliers(supplier.id, source.id);
      const updated = await fetchSupplier(supplier.id);
      if (updated) onSupplierChange(updated);
      setMergeOpen(false);
      setActionNote(
        `«${source.name}» объединён в эту компанию. Обновите страницу, чтобы увидеть переехавшие карточки.`,
      );
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось объединить компании'));
    } finally {
      setMerging(false);
    }
  }

  async function toggleBlocked() {
    setActionError(null);
    setActionNote(null);
    if (supplier.blockedReason) {
      if (!window.confirm(`Вернуть «${supplier.name}» в работу? Компания снова будет попадать в рассылки.`)) return;
      setBusyAction('block');
      try {
        onSupplierChange(await setSupplierBlocked(supplier.id, null));
        setActionNote('Компания вернулась в работу.');
      } catch (err) {
        setActionError(errorMessage(err, 'Не удалось снять стоп-лист'));
      } finally {
        setBusyAction(null);
      }
      return;
    }
    const reason = window.prompt(
      `Почему больше не работаем с «${supplier.name}»?\n\nПричина видна на карточке. Компания и вся её переписка останутся, но письма ей уходить перестанут — в том числе уже поставленные в очередь рассылки.`,
      '',
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setActionError('Без причины в стоп-лист не отправляем: через месяц никто не вспомнит, за что.');
      return;
    }
    setBusyAction('block');
    try {
      onSupplierChange(await setSupplierBlocked(supplier.id, reason));
      setActionNote('Компания в стоп-листе, письма ей больше не уйдут.');
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось отправить в стоп-лист'));
    } finally {
      setBusyAction(null);
    }
  }

  const [termsQuote, setTermsQuote] = useState<SupplierQuote | null>(null);
  const [savingTerms, setSavingTerms] = useState(false);
  // Список КП приходит пропсом от загрузчика, но правка условий меняет его
  // прямо здесь — держим локальную копию поверх пропса, как со списком людей.
  const [quotesState, setQuotesState] = useState<SupplierQuote[] | null>(null);
  const shownQuotes = quotesState ?? quotes;

  async function saveTerms(next: QuoteTerms | null) {
    if (!termsQuote) return;
    setSavingTerms(true);
    setActionError(null);
    try {
      await updateSupplierQuoteTerms(termsQuote.id, next);
      setQuotesState(shownQuotes.map((q) => (q.id === termsQuote.id ? { ...q, terms: next } : q)));
      setTermsQuote(null);
    } catch (err) {
      setActionError(errorMessage(err, 'Не удалось сохранить условия'));
    } finally {
      setSavingTerms(false);
    }
  }

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
    if (!window.confirm(`Убрать контакт «${contactTitle(contact)}»? Строка останется в базе, из списка пропадёт.`))
      return;
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

  const profile = supplier.siteProfile;
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogBrand, setCatalogBrand] = useState('Все марки');
  const catalogBrands = [...new Set((profile?.products ?? []).flatMap((p) => (p.brand ? [p.brand] : [])))].sort(
    (a, b) => a.localeCompare(b, 'ru'),
  );
  const filteredProducts = (profile?.products ?? []).filter(
    (product) =>
      (catalogBrand === 'Все марки' || product.brand === catalogBrand) &&
      `${product.name ?? ''} ${product.article ?? ''}`.toLowerCase().includes(catalogSearch.trim().toLowerCase()),
  );
  const lastQuoteAt = quotes
    .map((q) => q.createdAt)
    .sort()
    .at(-1);
  const tabCounts: Partial<Record<SupplierDetailTab, number>> = {
    Каталог: profile?.products?.length ?? 0,
    Переписка: emails.length,
    'КП и цены': quotes.length,
    ...(orderCount != null ? { Заказы: orderCount } : {}),
  };
  const companyContacts: { key: string; value: string; label?: string | null; preferred?: boolean; phone?: boolean }[] =
    [];
  const seenContacts = new Set<string>();
  const addContact = (value: string | null | undefined, label?: string | null, phone = false, preferred = false) => {
    if (!value?.trim()) return;
    const key = phone
      ? `phone:${value.replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7')}`
      : `email:${value.trim().toLowerCase()}`;
    if (seenContacts.has(key)) return;
    seenContacts.add(key);
    companyContacts.push({ key, value: value.trim(), label, phone, preferred });
  };
  addContact(
    supplier.email,
    profile?.contacts?.emails?.find((e) => e.email?.trim().toLowerCase() === supplier.email.trim().toLowerCase())
      ?.label,
    false,
    true,
  );
  for (const email of profile?.contacts?.emails ?? []) addContact(email.email, email.label);
  for (const phone of profile?.contacts?.phones ?? []) addContact(phone.number, phone.label, true);
  addContact(supplier.phone, null, true);
  const companyMessengers: DisplayMessenger[] = [...supplier.messengers];
  for (const messenger of profile?.contacts?.messengers ?? []) {
    const type = ({ telegram: 'Telegram', whatsapp: 'WhatsApp', max: 'Max', viber: 'Viber' } as const)[
      messenger.type?.toLowerCase() as 'telegram' | 'whatsapp' | 'max' | 'viber'
    ];
    if (type && messenger.value && !companyMessengers.some((m) => m.type === type && m.number === messenger.value))
      companyMessengers.push({ type, number: messenger.value });
  }
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  const hasRisk = shouldFlag(reliability);

  return (
    <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
      <Link
        to="/admin/purchases?tab=suppliers"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />К закупкам
      </Link>
      <Card className="relative z-30 !p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-72">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-bold text-ink">{supplier.name}</h1>
              {supplier.supplierKind && (
                <Badge tone={supplier.supplierKind === 'manufacturer' ? 'success' : 'neutral'}>
                  <Factory className="mr-1 inline h-4 w-4" />
                  {SUPPLIER_KIND_LABELS[supplier.supplierKind]}
                </Badge>
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
              {supplier.blockedReason && <Badge tone="danger">в стоп-листе</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              {supplier.websiteUrl && (
                <a
                  href={supplierWebsiteFullUrl(supplier.websiteUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-info-text hover:underline"
                >
                  {supplier.websiteHost || supplier.websiteUrl} ↗
                </a>
              )}
              {(profile?.addresses?.[0]?.city || supplier.city) && (
                <span>{profile?.addresses?.[0]?.city || supplier.city}</span>
              )}
              {profile?.founded_year != null && <span>Работает с {profile.founded_year} года</span>}
              {!!profile?.regions?.length && <span>Возит: {profile.regions.slice(0, 3).join(', ')}</span>}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {primaryOffer && (
              <Link to={threadLink(primaryOffer.requestId, primaryOffer.id, null)} className={buttonClasses('primary')}>
                <Mail className="h-4 w-4" />
                Написать
              </Link>
            )}
            <div className="relative" ref={menuRef}>
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Действия с поставщиком"
                aria-expanded={menuOpen}
                aria-controls="supplier-actions"
                onClick={() => setMenuOpen((open) => !open)}
                className="rounded-full border border-border p-2.5 text-ink-muted"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div
                  id="supplier-actions"
                  className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-3rem)] space-y-1 rounded-control border border-border bg-surface p-2 shadow-lg"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-start border-0"
                    disabled={busyAction !== null || !(supplier.inn ?? '').trim()}
                    icon={
                      busyAction === 'reliability' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )
                    }
                    onClick={() => {
                      setMenuOpen(false);
                      void recheckReliability();
                    }}
                    title={
                      (supplier.inn ?? '').trim()
                        ? undefined
                        : 'ИНН появится из первого счёта — до этого проверять нечего'
                    }
                  >
                    Перепроверить реестр
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-start border-0"
                    disabled={busyAction !== null || !supplier.websiteHost}
                    icon={
                      busyAction === 'snapshot' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )
                    }
                    onClick={() => {
                      setMenuOpen(false);
                      void refreshSnapshot();
                    }}
                    title={supplier.websiteHost ? undefined : 'Сайта нет — перечитывать нечего'}
                  >
                    Обновить сайт
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-start border-0"
                    disabled={busyAction !== null}
                    icon={<Merge className="h-4 w-4" />}
                    onClick={() => {
                      setMenuOpen(false);
                      void openMerge();
                    }}
                  >
                    Объединить с дублем
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-start border-0"
                    disabled={busyAction !== null}
                    icon={
                      busyAction === 'block' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )
                    }
                    onClick={() => {
                      setMenuOpen(false);
                      void toggleBlocked();
                    }}
                  >
                    {supplier.blockedReason ? 'Вернуть в работу' : 'В стоп-лист'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {[
            [profile ? (profile.own_brands?.length ?? 0) : '—', 'своих марок'],
            [profile ? (profile.product_kinds?.length ?? 0) : '—', 'видов товара'],
            [profile ? (profile.products?.length ?? 0) : '—', 'позиций в каталоге'],
            [quotes.length, `КП${lastQuoteAt ? ` · последнее ${formatDate(lastQuoteAt)}` : ''}`],
          ].map(([value, label], index) => (
            <div
              key={index}
              className={cn(
                'min-w-0 px-5 py-4 sm:px-6',
                index % 2 === 0 && 'border-r border-border',
                index < 2 && 'border-b border-border sm:border-b-0',
                index === 1 && 'sm:border-r',
              )}
            >
              <p className="text-xl font-bold tabular-nums">{value}</p>
              <p className="text-xs text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {supplier.blockedReason && (
        <Card className="space-y-1 border-danger/40">
          <p className="flex items-center gap-2 text-sm font-medium text-danger">
            <Ban className="h-4 w-4" />
            Компания в стоп-листе
          </p>
          <p className="text-sm text-ink">{supplier.blockedReason}</p>
          <p className="text-xs text-ink-faint">
            {/* formatDate уже заканчивается на «г.» — своя точка сверху дала бы
                «2026 г.. Письма». */}
            С {formatDate(supplier.blockedAt)} письма ей не уходят, в рассылку не попадает.
          </p>
        </Card>
      )}

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Объединить с дублем">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            База предлагает компании, похожие на эту по ИНН, почте, домену или названию. Решает человек: одинаковое
            название ещё не значит одну фирму — «ТЕХНОстрой» из Беларуси и «ТехноСтрой» из России разные компании.
          </p>
          {mergeCandidates === null ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Ищем похожие компании...
            </p>
          ) : mergeCandidates.length === 0 ? (
            <p className="text-sm text-ink-faint">Похожих компаний не нашлось.</p>
          ) : (
            <ul className="space-y-2">
              {mergeCandidates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-ink-faint">
                      {[c.websiteHost || 'без сайта', c.email || 'без почты', c.country].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" disabled={merging} onClick={() => doMerge(c)}>
                    {merging ? 'Объединяем...' : 'Объединить сюда'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {actionError && <p className="text-sm text-danger">{actionError}</p>}
      {actionNote && <p className="text-sm text-ink-muted">{actionNote}</p>}

      <div className="max-w-full overflow-x-auto">
        <div className="flex w-max min-w-0 gap-1 rounded-full bg-surface-muted p-1" aria-label="Разделы поставщика">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => setTab(t)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold',
                t === tab ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {t}
              {tabCounts[t] != null && <span className="ml-1.5 font-normal text-ink-faint">{tabCounts[t]}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Обзор' && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            {profile ? (
              <Card className="space-y-4">
                <h2 className="text-base font-semibold text-ink">
                  {supplier.supplierKind === 'manufacturer' || supplier.supplierKind === 'brand_owner'
                    ? 'Что производит сам'
                    : 'Что продаёт'}
                </h2>
                <ProfileChips
                  title="Свои марки"
                  values={profile.own_brands ?? []}
                  limit={14}
                  products={profile.products ?? []}
                />
                <ProfileChips title="Виды товара" values={profile.product_kinds ?? []} limit={12} />
                {(supplier.supplierKind === 'dealer' || supplier.supplierKind === 'retail') && (
                  <ProfileChips title="Чужие марки" values={profile.resold_brands ?? []} />
                )}
                {profile.about && <p className="text-sm text-ink-muted">{profile.about}</p>}
              </Card>
            ) : (
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
            )}
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
                          className="inline-flex items-center gap-1.5 text-xs text-info-text hover:underline"
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
              <h2 className="text-base font-semibold text-ink">Наша история</h2>
              {activity.length === 0 && (
                <p className="text-sm text-ink-faint">С этой компанией пока ничего не происходило.</p>
              )}
              <ul className="divide-y divide-border">
                {activity.slice(0, 5).map((event, index) => (
                  <li key={`${event.at}-${index}`} className="flex flex-wrap items-baseline gap-3 py-3">
                    <span className="text-xs text-ink-faint">{formatDate(event.at)}</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-ink-muted">{event.detail}</p>
                    </div>
                    {event.href && (
                      <Link to={event.href} className="text-xs text-info-text hover:underline">
                        Открыть
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <Link to="?tab=activity" className="text-sm text-info-text hover:underline">
                Вся активность
              </Link>
            </Card>
          </div>
          <aside className="min-w-0 space-y-4 [&>div]:p-5">
            <Card className="space-y-4">
              <h2 className="text-base font-semibold text-ink">Контакты</h2>
              {companyContacts.map((contact) => (
                <CopyLine
                  key={contact.key}
                  value={contact.value}
                  display={contact.phone ? formatPhoneDisplay(contact.value) : contact.value}
                  label={contact.label}
                  preferred={contact.preferred}
                />
              ))}
              {companyMessengers.length > 0 && <MessengerChips messengers={companyMessengers} />}
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
                            <Badge tone="neutral">
                              {CONTACT_SOURCE_LABEL[c.source] ?? c.source ?? 'источник неизвестен'}
                            </Badge>
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
            <Card className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Адреса</h2>
              {(profile?.addresses ?? []).map((address, index) => (
                <div key={index} className="rounded-control bg-surface-muted p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-ink-faint">
                    {ADDRESS_LABELS[address.type ?? ''] ?? address.type ?? 'Адрес'}
                  </p>
                  <p>{[address.city, address.address].filter(Boolean).join(', ') || 'Адрес не указан'}</p>
                  {address.hours && <p className="mt-1 text-xs text-ink-faint">{address.hours}</p>}
                </div>
              ))}
              {supplier.supplierKind === 'manufacturer' &&
                !profile?.addresses?.some((a) => a.type === 'production' && a.address) && (
                  <p className="rounded-control border border-dashed border-border-strong p-3 text-sm text-ink-faint">
                    Производство: адрес на сайте не указан
                  </p>
                )}
              {!profile?.addresses?.length && supplier.city && (
                <p className="text-sm text-ink-muted">{supplier.city}</p>
              )}
            </Card>
            <Card className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Условия</h2>
              <dl className="space-y-3">
                {SITE_TERM_LABELS.map(([key, label]) =>
                  profile?.terms?.[key] ? (
                    <div key={key}>
                      <dt className="text-xs text-ink-faint">{label}</dt>
                      <dd className="mt-1 text-sm">{profile.terms[key]}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
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
                  Условия из КП не записаны. Их заполняют в карточке поставщика по тому, что менеджер написал в
                  переписке.
                </p>
              )}
            </Card>
            <Card className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Реквизиты</h2>
              {(profile?.legal_entities ?? []).map((entity, index) => (
                <div key={index} className="space-y-2 border-b border-border pb-3 last:border-0 last:pb-0">
                  {entity.name && <p className="text-sm font-semibold">{entity.name}</p>}
                  {entity.inn && <CopyLine value={entity.inn} label="ИНН" />}
                  {entity.ogrn && <CopyLine value={entity.ogrn} label="ОГРН" />}
                </div>
              ))}
              {!profile &&
                (supplier.inn ? (
                  <CopyLine value={supplier.inn} label="ИНН" />
                ) : (
                  <p className="text-sm text-ink-faint">ИНН появится из первого счёта</p>
                ))}
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
                  {missing.length > 0 && (
                    <span className="ml-2 text-xs text-ink-faint">не хватает: {missing.join(', ')}</span>
                  )}
                </Row>
              </div>
            </Card>
          </aside>
        </div>
      )}

      {tab === 'Каталог' && (
        <Card className="min-w-0 space-y-4">
          <h2 className="text-base font-semibold">Каталог</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              aria-label="Поиск по названию или артикулу"
              placeholder="Название или артикул"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              wrapperClassName="min-w-0 flex-1"
            />
            <Select
              placeholder="Все марки"
              options={['Все марки', ...catalogBrands]}
              value={catalogBrand}
              onChange={setCatalogBrand}
            />
          </div>
          <p className="text-xs text-ink-faint">
            Товары с сайта {supplier.websiteHost || 'поставщика'} на {formatDate(supplier.profiledAt)}. Цены с сайта не
            показываем — они быстро устаревают.
          </p>
          {!profile?.products?.length ? (
            <p className="text-sm text-ink-faint">Каталог с сайта ещё не собран</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-sm text-ink-faint">По вашему запросу ничего не найдено</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-ink-faint">
                  <tr>
                    {['Товар', 'Марка', 'Артикул', 'Ед.'].map((label) => (
                      <th key={label} className="px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product, index) => (
                    <tr key={index} className="border-b border-border last:border-0">
                      <td className="min-w-48 px-3 py-3">{product.name || '—'}</td>
                      <td className="px-3 py-3">{product.brand || '—'}</td>
                      <td className="px-3 py-3">{product.article || '—'}</td>
                      <td className="px-3 py-3">{product.unit || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'Переписка' && (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Переписка{emails.length > 0 ? ` (${emails.length})` : ''}</h2>
          {emails.length === 0 ? (
            <p className="text-sm text-ink-faint">Писем с этой компанией ещё не было.</p>
          ) : (
            <ul className="space-y-2">
              {emails.slice(0, 30).map((e) => {
                const cat = categoryOf(e.offerId);
                return (
                  <li key={e.id} className="rounded-control border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={e.direction === 'in' ? 'success' : 'neutral'}>
                        {e.direction === 'in' ? 'ответ' : 'наше письмо'}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{e.subject || 'без темы'}</span>
                      <span className="text-xs text-ink-faint">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                      <span>{cat.title}</span>
                      <span>·</span>
                      <span>{e.direction === 'in' ? e.fromAddress : e.toAddress}</span>
                      {cat.requestId && (
                        <Link
                          to={threadLink(cat.requestId, e.offerId, e.orderId ?? null)}
                          className="inline-flex items-center gap-1 text-info-text hover:underline"
                        >
                          Открыть переписку
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-border pt-3 text-xs text-ink-faint">
            {emails.length > 30 ? 'Показаны последние 30 писем. ' : ''}
            Отвечать и прикладывать ведомость по-прежнему во вкладке «Письма» в закупках: там тред целиком, композер и
            распознавание счетов.
          </p>
        </Card>
      )}

      {tab === 'КП и цены' && (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">
            Коммерческие предложения{shownQuotes.length > 0 ? ` (${shownQuotes.length})` : ''}
          </h2>
          {shownQuotes.length === 0 ? (
            <p className="text-sm text-ink-faint">
              КП ещё не получали. Они появляются сами, когда поставщик присылает счёт и распознавание его разбирает.
            </p>
          ) : (
            <ul className="space-y-3">
              {shownQuotes.map((q) => {
                const cat = categoryOf(q.offerId);
                return (
                  <li key={q.id} className="rounded-control border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 font-medium text-ink">{q.title}</span>
                      <span className="tabular-nums text-sm text-ink">
                        {q.price > 0 ? formatMoney(q.price, q.currency) : 'цена не распознана'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                      <span>{cat.title}</span>
                      <span>·</span>
                      <span>{formatDate(q.createdAt)}</span>
                      {q.isAlternative && (
                        <Badge tone="warning">аналог{q.alternativeNote ? `: ${q.alternativeNote}` : ''}</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {termsSummary(q.terms).map((t) => (
                        <span key={t} className="rounded-full bg-surface-muted px-2 py-px text-[11px] text-ink-muted">
                          {t}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTermsQuote(q)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2 py-px text-[11px] text-ink-muted hover:text-ink"
                      >
                        <SlidersHorizontal className="h-3 w-3" />
                        {q.terms ? 'Изменить условия' : 'Указать условия'}
                      </button>
                    </div>
                    {q.items.length > 0 && (
                      <div className="mt-2 overflow-x-auto rounded-control border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-surface-muted text-xs text-ink-faint">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-normal">Позиция</th>
                              <th className="px-3 py-1.5 text-right font-normal">Кол-во</th>
                              <th className="px-3 py-1.5 text-right font-normal">Цена</th>
                              <th className="px-3 py-1.5 text-right font-normal">Сумма</th>
                            </tr>
                          </thead>
                          <tbody>
                            {q.items.map((item, i) => (
                              <tr key={`${q.id}-${i}`} className="border-t border-border">
                                <td className="px-3 py-1.5 text-ink">
                                  {item.name}
                                  {item.unit && <span className="text-ink-faint"> ({item.unit})</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-ink">{item.quantity ?? '—'}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                                  {item.price != null ? formatMoney(item.price, q.currency) : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                                  {formatMoney(purchaseItemTotal(item), q.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <TermsFormModal
            quote={termsQuote}
            saving={savingTerms}
            onClose={() => setTermsQuote(null)}
            onSubmit={saveTerms}
          />
        </Card>
      )}

      {/* Заказы и поставки (шаг 11b плана закупок). Раздел грузит заказы
          компании сам — их единицы, общий список «Закупок» ради этого тянуть
          не надо. */}
      {tab === 'Заказы' && <SupplierOrdersSection supplierId={supplier.id} />}

      {tab === 'Проверка' && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Последняя проверка</h2>
            {!(supplier.inn ?? '').trim() ? (
              <p className="text-sm text-ink-faint">
                ИНН неизвестен — проверять нечего. Он подставится из первого же счёта поставщика.
              </p>
            ) : !reliability ? (
              <p className="text-sm text-ink-faint">Ещё не проверяли. Проверку запускают из карточки в закупках.</p>
            ) : (
              <>
                <Row label="ИНН">{reliability.inn}</Row>
                <Row label="Результат">
                  {reliability.error ? (
                    <span className="text-warning">не удалось проверить: {reliability.error}</span>
                  ) : !reliability.found ? (
                    <span className="font-medium text-danger">юрлица с таким ИНН нет в ЕГРЮЛ/ЕГРИП</span>
                  ) : (
                    <span className={reliability.riskLevel === 'ok' ? 'text-success' : 'text-warning'}>
                      {RISK_LEVEL_LABEL[reliability.riskLevel]}
                    </span>
                  )}
                </Row>
                <Row label="Когда">
                  {formatDate(reliability.checkedAt)}
                  {isReliabilityStale(reliability) && <span className="ml-2 text-xs text-warning">устарело</span>}
                </Row>
                {reliability.risks.length > 0 && (
                  <ul className="space-y-1 border-t border-border pt-3">
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
              </>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">История проверок</h2>
            {checks.length === 0 ? (
              <p className="text-sm text-ink-faint">Проверок ещё не было.</p>
            ) : (
              <ul className="space-y-2">
                {checks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="w-40 shrink-0 text-ink-faint">{formatDate(c.checkedAt)}</span>
                    <span className="min-w-0 flex-1 text-ink">
                      {c.error ? (
                        <span className="text-warning">не удалось проверить: {c.error}</span>
                      ) : !c.found ? (
                        <span className="text-danger">юрлицо не найдено</span>
                      ) : (
                        <>
                          {RISK_LEVEL_LABEL[c.riskLevel]}
                          {c.risks.length > 0 && <span className="text-ink-faint"> · рисков: {c.risks.length}</span>}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-border pt-3 text-xs text-ink-faint">
              История пишется сама при каждой проверке, включая неудачные попытки: «не смогли проверить» — это не то же
              самое, что «не проверяли».
            </p>
          </Card>
        </div>
      )}

      {tab === 'Активность' && (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Что происходило</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-ink-faint">С этой компанией пока ничего не происходило.</p>
          ) : (
            <ul className="space-y-2">
              {activity.slice(0, 50).map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-44 shrink-0 text-xs text-ink-faint">{formatDateTime(e.at)}</span>
                  <span className="min-w-0 flex-1 text-sm text-ink">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-ink-faint"> — {e.detail}</span>
                  </span>
                  {e.href && (
                    <Link to={e.href} className="text-xs text-info-text hover:underline">
                      открыть
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border pt-3 text-xs text-ink-faint">
            Лента собрана из писем, полученных КП и проверок по реестру. Действий сотрудников в ней нет: общий журнал
            действий в этой базе хранит только «кто и что сделал», без ссылки на поставщика, и отфильтровать его по
            конкретной компании нечем.
          </p>
        </Card>
      )}

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
  );
}
