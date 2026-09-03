import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Send, Phone, Globe, Paperclip, Upload, X, ImageOff, Mail, ShoppingCart, Search, Check, MailPlus, PackagePlus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AddableSelect } from '../components/ui/AddableSelect';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { Select } from '../components/ui/Select';
import { SearchInput } from '../components/ui/SearchInput';
import { ContactValue } from '../components/ui/ContactValue';
import { ContractorAvatar } from '../components/contractors/ContractorAvatar';
import { ContractorCard } from '../components/contractors/ContractorCard';
import { ContractorDetailModal } from '../components/contractors/ContractorDetailModal';
import { ContractorsResearch } from '../components/contractors/ContractorsResearch';
import { cn } from '../lib/cn';
import { formatPhoneDisplay } from '../lib/formatPhone';
import { currencySymbols, type Currency } from '../data/transactions';
import type { DocumentFile } from '../data/contractorDocuments';
import type { ExchangeRate } from '../data/exchangeRates';
import { fetchTodayRate } from '../lib/exchangeRatesApi';
import { convertToUsd } from '../lib/currencyConvert';
import { contractorContactMethods, type Contractor } from '../data/contractors';
import {
  fetchContractors,
  insertContractor,
  updateContractor,
  deleteContractor,
  uploadContractorPhoto,
  deleteContractorPhoto,
} from '../lib/contractorsApi';
import {
  RESEARCH_CURRENCIES,
  RESEARCH_CONTACT_METHODS,
  type ResearchContactMethod,
  type SupplierRequest,
  type SupplierOffer,
  formatRequestItemsText,
} from '../data/supplierResearch';
import type { SupplierOfferEmail } from '../data/supplierOfferEmails';
import { fetchAllSupplierOfferEmails, markSupplierOfferEmailsRead } from '../lib/supplierOfferEmailsApi';
import { EmailThread, SupplierCorrespondenceTab, countUnreadSupplierEmails } from '../components/suppliers/SupplierCorrespondenceTab';
import { BulkEmailModal } from '../components/suppliers/BulkEmailModal';
import type { EmailTemplate } from '../data/emailTemplates';
import { fetchEmailTemplates } from '../lib/emailTemplatesApi';
import {
  fetchSupplierRequests,
  insertSupplierRequest,
  updateSupplierRequest,
  deleteSupplierRequest,
  fetchSupplierOffers,
  insertSupplierOffer,
  updateSupplierOffer,
  deleteSupplierOffer,
  uploadSupplierFile,
  type SupplierRequestInput,
} from '../lib/supplierResearchApi';
import { searchSuppliersOnline, type SupplierSearchResult } from '../lib/supplierWebSearchApi';
import { purchaseItemTotal, type PurchaseItem } from '../data/purchases';
import type { Estimate, EstimateMaterial } from '../data/estimates';
import { fetchEstimates } from '../lib/estimatesApi';
import type { RealtyObject } from '../data/objects';
import { fetchObjects } from '../lib/objectsApi';
import { Purchases, type PurchaseDraft } from './Purchases';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatPrice(price: number, currency: Currency): string {
  const formatted = price.toLocaleString('ru-RU');
  const symbol = currencySymbols[currency];
  return currency === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

// Короткий вид ссылки в таблице — просто домен, без протокола/пути, чтобы
// колонка не растягивалась длинными урлами. Если строка не парсится как URL
// (ввели без https://), показываем как есть — свободный ввод, не хотим
// блокировать сохранение из-за формата.
function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// "Закупки" — третья вкладка этой же страницы (владелец, 2026-08-29:
// "всё остальное — это страница Закупки в стройке"). Содержимое — тот же
// компонент Purchases, встроенный сюда как embedded (свой PageHeader
// скрыт, кнопка "Добавить закупку" рендерится внутри вкладки).
// "Email" (была "Переписка", переименована владельцем 2026-09-03) —
// четвёртая, EMAIL_CORRESPONDENCE_PLAN.md этап 2: вся email-переписка по
// предложениям Ресерча в одном месте, группировка Запрос → Поставщик.
// Подпись вкладки остаётся статичной строкой (не "Email (N)") —
// ToggleGroup сравнивает value===option буквально, динамический счётчик в
// самой подписи сломал бы подсветку активной вкладки при любом изменении
// числа непрочитанных; счётчик — бейджем поверх самого пункта через проп
// badges (см. рендер ниже).
const SUPPLIER_TABS = ['Каталог', 'Ресерч', 'Закупки', 'Email'] as const;
type SupplierTab = (typeof SUPPLIER_TABS)[number];

// Каталог поставщиков — те же карточки-компании, что раньше жили на странице
// "Подрядчики" под заголовком "Прочие подрядчики" (владелец: "И вот это всё
// Поставщики, а не подрядчики"). Данные технически по-прежнему лежат в
// таблице contractors (переиспользуем Contractor/ContractorCard/
// ContractorDetailModal/contractorsApi как есть — поля один в один подходят:
// фото, название, категория, контакт, телефон, email), просто здесь
// показываются строки БЕЗ teamTier (см. supplierContractors ниже) — те же,
// что Contractors.tsx раньше рисовал в "Прочие подрядчики" (эта секция там
// удалена, переехала сюда целиком, без миграции данных).
const emptyCatalogForm = {
  name: '',
  specialty: '',
  contact: '',
  contactMethod: '',
  phone: '',
  email: '',
  notes: '',
  responsibilityZone: '',
  photoPath: '',
};

function catalogToForm(c: Contractor) {
  return {
    name: c.name,
    specialty: c.specialty,
    contact: c.contact,
    contactMethod: c.contactMethod,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    responsibilityZone: c.responsibilityZone,
    photoPath: c.photoPath,
  };
}

const emptyRequestForm = {
  title: '',
  estimateId: '' as string,
  sectionId: '' as string,
  sectionTitle: '',
  items: [] as PurchaseItem[],
};

function requestToForm(r: SupplierRequest) {
  return {
    title: r.title,
    estimateId: r.estimateId ?? '',
    sectionId: r.sectionId ?? '',
    sectionTitle: r.sectionTitle,
    items: r.items,
  };
}

const emptyOfferForm = {
  name: '',
  contactMethod: 'Телефон' as ResearchContactMethod,
  contact: '',
  email: '',
  websiteUrl: '',
  catalogModelName: '',
  catalogModelPhoto: null as DocumentFile | null,
  communicationStatus: '',
  price: '',
  currency: 'USD' as Currency,
  deadline: '',
  requirements: '',
  items: [] as PurchaseItem[],
  existingFiles: [] as DocumentFile[],
  newFiles: [] as File[],
};

// Та же логика, что и rankOffers в ContractorsResearch.tsx (см. подробный
// комментарий там) — предложения без цены/с неизвестным курсом в сравнение
// не попадают, лидеров может быть несколько при равной цене.
function rankOffers(
  offers: SupplierOffer[],
  rate: ExchangeRate | undefined,
): { sorted: SupplierOffer[]; cheapestIds: Set<string> } {
  const withUsd = offers.map((o) => ({
    offer: o,
    usd: o.price > 0 ? convertToUsd(o.price, o.currency, rate) : null,
  }));
  const priced = withUsd.filter((x) => x.usd != null).sort((a, b) => a.usd! - b.usd!);
  const unpriced = withUsd.filter((x) => x.usd == null);
  const minUsd = priced[0] ? Math.round(priced[0].usd! * 100) : null;
  const cheapestIds = new Set(
    minUsd == null ? [] : priced.filter((x) => Math.round(x.usd! * 100) === minUsd).map((x) => x.offer.id),
  );
  return { sorted: [...priced, ...unpriced].map((x) => x.offer), cheapestIds };
}

function RequestCard({
  request,
  offers,
  rate,
  onEditRequest,
  onDeleteRequest,
  onAddOffer,
  onOpenDetail,
  onWebSearch,
  searching,
  canBulkEmail,
  onBulkEmail,
}: {
  request: SupplierRequest;
  offers: SupplierOffer[];
  rate: ExchangeRate | undefined;
  onEditRequest: (r: SupplierRequest) => void;
  onDeleteRequest: (r: SupplierRequest) => void;
  onAddOffer: (requestId: string) => void;
  onOpenDetail: (o: SupplierOffer) => void;
  onWebSearch: (r: SupplierRequest) => void;
  searching: boolean;
  canBulkEmail: boolean;
  onBulkEmail: (r: SupplierRequest) => void;
}) {
  const { sorted, cheapestIds } = rankOffers(offers, rate);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-ink">{request.title}</div>
          {request.items.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {request.items.map((item) => (
                <span
                  key={item.id}
                  className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs text-ink-muted"
                >
                  {item.name}
                  {item.quantity ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={searching}
            icon={searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            onClick={() => onWebSearch(request)}
          >
            {searching ? 'Ищем в сети...' : 'Найти в сети'}
          </Button>
          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onAddOffer(request.id)}>
            Добавить предложение
          </Button>
          {canBulkEmail && (
            <Button type="button" variant="secondary" icon={<MailPlus className="h-4 w-4" />} onClick={() => onBulkEmail(request)}>
              Написать всем
            </Button>
          )}
          <button
            type="button"
            onClick={() => onEditRequest(request)}
            aria-label="Переименовать запрос"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteRequest(request)}
            aria-label="Удалить запрос"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ink-muted hover:border-danger hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-ink-faint">Пока нет предложений — нажмите «Добавить предложение».</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((o) => {
            const isCheapest = cheapestIds.has(o.id);
            return (
              <div
                key={o.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-4 py-3',
                  isCheapest && 'border-success/40 bg-success-bg',
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-ink">{o.name}</span>
                  {isCheapest && (
                    <span className="shrink-0 rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold text-white">
                      лучшая цена
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="max-w-[200px] truncate text-sm text-ink-muted">{o.communicationStatus || '—'}</span>
                  <span className={cn('tabular-nums font-semibold', isCheapest ? 'text-success' : 'text-ink')}>
                    {o.price > 0 ? formatPrice(o.price, o.currency) : '—'}
                  </span>
                  <Button type="button" variant="secondary" onClick={() => onOpenDetail(o)}>
                    Подробнее
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Модалка результатов "Найти в сети" — владелец, 2026-08-31: "веб-поиск
// поставщиков делай через клод, модель sonnet5". Результат ни во что не
// сохраняется сам по себе (нет отдельной таблицы под "предложенных
// веб-поиском") — каждый найденный вариант сразу добавляется предложением
// (тот же insertSupplierOffer, что и у обычной формы, просто с дефолтной
// ценой/валютой — владелец правит/уточняет цену уже в самом предложении
// через обычный карандаш редактирования, отдельного пути правки здесь нет).
//
// Владелец, 2026-09-03: "оно нашло штук 5, я выбрал 1, открылась карточка
// первого магазина, а когда я сохранил, все остальные пропали. Мне нужна
// возможность добавлять массово" — старая версия открывала форму
// добавления ПОВЕРХ этой модалки и закрывала саму модалку сразу по клику
// (ещё до сохранения), теряя весь оставшийся список. Переделано: никакого
// промежуточного окна редактирования — клик по "Добавить" (в строке или
// массово через чекбоксы) сразу создаёт предложение и помечает строку
// добавленной (галочка), модалка результатов при этом никогда не
// закрывается сама — только явным "Закрыть"/крестиком.
function SupplierWebSearchModal({
  requestTitle,
  results,
  error,
  selected,
  added,
  addingIndices,
  bulkAdding,
  addError,
  onClose,
  onToggleSelect,
  onToggleSelectAll,
  onAddOne,
  onAddSelected,
}: {
  requestTitle: string;
  results: SupplierSearchResult[];
  error: string | null;
  selected: Set<number>;
  added: Set<number>;
  addingIndices: Set<number>;
  bulkAdding: boolean;
  addError: string | null;
  onClose: () => void;
  onToggleSelect: (index: number) => void;
  onToggleSelectAll: () => void;
  onAddOne: (index: number) => void;
  onAddSelected: () => void;
}) {
  const selectableCount = results.filter((_, i) => !added.has(i)).length;
  const allSelected = selectableCount > 0 && selected.size === selectableCount;

  return (
    <Modal open onClose={onClose} title={`Найдено в сети: ${requestTitle}`}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && results.length === 0 && (
          <p className="text-sm text-ink-faint">Ничего подходящего не нашлось — попробуйте уточнить список материалов в запросе.</p>
        )}

        {results.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <button
              type="button"
              onClick={onToggleSelectAll}
              disabled={selectableCount === 0}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {allSelected ? 'Снять выбор' : `Выбрать все (${selectableCount})`}
            </button>
            <Button
              type="button"
              icon={bulkAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              disabled={selected.size === 0 || bulkAdding}
              onClick={onAddSelected}
            >
              {bulkAdding ? 'Добавляем...' : `Добавить выбранные (${selected.size})`}
            </Button>
          </div>
        )}

        {addError && <p className="text-sm text-danger">{addError}</p>}

        {results.map((r, i) => {
          const isAdded = added.has(i);
          const isAdding = addingIndices.has(i);
          return (
            <div key={i} className={cn('flex flex-col gap-2 rounded-control border px-4 py-3', isAdded ? 'border-success/30 bg-success-bg' : 'border-border')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex min-w-0 items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    disabled={isAdded}
                    onChange={() => onToggleSelect(i)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary disabled:opacity-50"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{r.name}</span>
                    {r.note && <span className="block text-sm text-ink-muted">{r.note}</span>}
                  </span>
                </label>
                {isAdded ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white">
                    <Check className="h-3.5 w-3.5" />
                    Добавлено
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    icon={isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    disabled={isAdding || bulkAdding}
                    onClick={() => onAddOne(i)}
                  >
                    Добавить
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-sm text-ink-muted">
                {r.website && (
                  <a
                    href={/^https?:\/\//.test(r.website) ? r.website : `https://${r.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    {siteLabel(r.website)}
                  </a>
                )}
                {r.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {r.phone}
                  </span>
                )}
                {r.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {r.email}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function OfferDetailModal({
  offer,
  isCheapest,
  onClose,
  onEmail,
  onEdit,
  onDelete,
  onCreatePurchase,
  deleting,
}: {
  offer: SupplierOffer;
  isCheapest: boolean;
  onClose: () => void;
  onEmail: (o: SupplierOffer) => void;
  onEdit: (o: SupplierOffer) => void;
  onDelete: (o: SupplierOffer) => void;
  onCreatePurchase: (o: SupplierOffer) => void;
  deleting: boolean;
}) {
  return (
    <Modal open onClose={onClose} title={offer.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn('tabular-nums text-lg font-semibold', isCheapest ? 'text-success' : 'text-ink')}>
            {offer.price > 0 ? formatPrice(offer.price, offer.currency) : 'Цена не указана'}
          </span>
          {isCheapest && (
            <span className="rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold text-white">лучшая цена</span>
          )}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint">Статус</span>
          <span className="text-ink">{offer.communicationStatus || '—'}</span>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint">Контакт</span>
          {offer.contact ? (
            <span className="flex items-center gap-1.5 text-ink">
              {offer.contactMethod === 'Telegram' ? (
                <Send className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Phone className="h-3.5 w-3.5 shrink-0" />
              )}
              <ContactValue
                contact={offer.contactMethod === 'Телефон' ? formatPhoneDisplay(offer.contact) : offer.contact}
                contactMethod={offer.contactMethod}
              />
            </span>
          ) : (
            <span className="text-ink">—</span>
          )}
        </div>

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint">Сайт</span>
          {offer.websiteUrl ? (
            <a
              href={/^https?:\/\//.test(offer.websiteUrl) ? offer.websiteUrl : `https://${offer.websiteUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1.5 text-primary hover:underline"
            >
              <Globe className="h-3.5 w-3.5 shrink-0" />
              {siteLabel(offer.websiteUrl)}
            </a>
          ) : (
            <span className="text-ink">—</span>
          )}
        </div>

        {(offer.catalogModelName || offer.catalogModelPhoto) && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-ink-faint">Модель в каталоге</span>
            <div className="flex items-center gap-2">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
                {offer.catalogModelPhoto ? (
                  <img src={offer.catalogModelPhoto.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-5 w-5 text-ink-faint" />
                )}
              </span>
              <span className="text-ink">{offer.catalogModelName || '—'}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint">Срок</span>
          <span className="text-ink">{offer.deadline || '—'}</span>
        </div>

        {offer.items.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-faint">Позиции КП</span>
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                    <th className="px-3 py-2">Название</th>
                    <th className="px-3 py-2 text-right">Кол-во</th>
                    <th className="px-3 py-2 text-right">Цена</th>
                    <th className="px-3 py-2 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {offer.items.map((item) => (
                    <tr key={item.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-ink">
                        {item.name}
                        {item.unit && <span className="text-ink-faint"> ({item.unit})</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-ink">{item.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-ink">
                        {item.price != null ? `${item.price.toLocaleString('ru-RU')} ${currencySymbols[offer.currency]}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-ink">
                        {purchaseItemTotal(item).toLocaleString('ru-RU')} {currencySymbols[offer.currency]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 text-sm">
          <span className="text-ink-faint">Требования</span>
          <span className="whitespace-pre-wrap text-ink">{offer.requirements || '—'}</span>
        </div>

        {offer.files.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-faint">Файлы</span>
            {offer.files.map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-sm text-primary hover:underline"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
              </a>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4" />} disabled={deleting} onClick={() => onDelete(offer)} className="mr-auto">
            Удалить
          </Button>
          <Button type="button" variant="secondary" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => onCreatePurchase(offer)}>
            Создать закупку
          </Button>
          <Button type="button" variant="secondary" icon={<Mail className="h-4 w-4" />} onClick={() => onEmail(offer)}>
            Написать
          </Button>
          <Button type="button" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(offer)}>
            Редактировать
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Владелец, 2026-08-29: "это страница Закупки в стройке" — Каталог
// поставщиков/Ресерч/Закупки вместе на одной странице (компонент и файл
// по историческим причинам называется Suppliers — не переименовывал,
// чтобы не гонять лишний диф ради имени; название страницы для
// пользователя задаётся через PageHeader/data/pages.ts).
export function Suppliers() {
  const [tab, setTab] = useState<SupplierTab>('Каталог');

  // Каталог — те же карточки-компании, что раньше были "Прочие подрядчики"
  // на странице Contractors.tsx (см. комментарий у emptyCatalogForm выше).
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [catalogDetailId, setCatalogDetailId] = useState<string | null>(null);
  const [catalogEditingId, setCatalogEditingId] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [catalogSubmitting, setCatalogSubmitting] = useState(false);
  const [catalogSubmitError, setCatalogSubmitError] = useState<string | null>(null);
  const [catalogDeletingId, setCatalogDeletingId] = useState<string | null>(null);
  const [catalogPhotoUploading, setCatalogPhotoUploading] = useState(false);

  const [requests, setRequests] = useState<SupplierRequest[]>([]);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rate, setRate] = useState<ExchangeRate | undefined>(undefined);

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [objects, setObjects] = useState<RealtyObject[]>([]);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<SupplierRequest | null>(null);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [manualItemName, setManualItemName] = useState('');
  const [savingRequest, setSavingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerRequestId, setOfferRequestId] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<SupplierOffer | null>(null);
  const [offerForm, setOfferForm] = useState(emptyOfferForm);
  const [savingOffer, setSavingOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Позиции КП внутри формы предложения — тот же паттерн, что у
  // manualItemName выше (позиции запроса), только для offerForm.items.
  const [manualOfferItemName, setManualOfferItemName] = useState('');
  const [emailOfferId, setEmailOfferId] = useState<string | null>(null);
  // Вся переписка по всем предложениям Ресерча разом — единственный
  // источник правды для OfferEmailModal и вкладки "Email" (см.
  // EMAIL_CORRESPONDENCE_PLAN.md, этап 2), обновляется локально при
  // отправке/прочтении, без повторного fetch на каждое действие.
  const [supplierEmails, setSupplierEmails] = useState<SupplierOfferEmail[]>([]);
  // Шаблоны писем поставщикам (EMAIL_CORRESPONDENCE_PLAN.md, этап 3) — тот
  // же принцип "один источник правды на странице", что и у supplierEmails.
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  // Владелец, 2026-08-29: "слишком много инфы на превью, все вразнобой.
  // Давай выводить название + цену + статус + кнопка Подробнее" — остальные
  // поля (контакт/сайт/модель/срок/требования/файлы) и действия
  // (написать/редактировать/удалить/создать закупку) переехали сюда,
  // в отдельную карточку по клику.
  const [detailOfferId, setDetailOfferId] = useState<string | null>(null);
  // "Написать всем" (EMAIL_CORRESPONDENCE_PLAN.md, этап 4) — id запроса, для
  // которого открыта модалка массовой рассылки первого письма.
  const [bulkEmailRequestId, setBulkEmailRequestId] = useState<string | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft | null>(null);

  // "Найти в сети" (владелец, 2026-08-31) — веб-поиск поставщиков через
  // claude-haiku-4-5 (api/supplier-web-search.js; изначально был
  // claude-sonnet-5, переведено тем же днём из-за цены — см. подробный
  // комментарий в самой функции). Владелец сразу же пожаловался, что клик
  // сразу запускает поиск без возможности что-то уточнить — поэтому
  // кнопка открывает не сам поиск, а сначала
  // webQueryModal: список материалов (редактируемый, вдруг что-то не то
  // подтянулось из раздела сметы) + свободное поле "Дополнительные
  // пожелания" (бренд/бюджет/регион и т.п.), и только по кнопке "Искать"
  // уходит запрос. webSearchingId — id запроса, для которого сейчас идёт
  // поиск (дизейблит кнопку именно этой карточки, не все разом);
  // webSearchModal — какой запрос показывать в модалке результатов и сами
  // результаты/ошибка.
  const [webQueryModal, setWebQueryModal] = useState<SupplierRequest | null>(null);
  const [webQueryForm, setWebQueryForm] = useState({ itemsText: '', extra: '' });
  const [webSearchingId, setWebSearchingId] = useState<string | null>(null);
  const [webSearchModal, setWebSearchModal] = useState<{
    request: SupplierRequest;
    results: SupplierSearchResult[];
    error: string | null;
  } | null>(null);
  // Выбор/статус строк модалки результатов — индексы в webSearchModal.results.
  // Сбрасываются при каждом новом поиске (см. submitWebQuery). added — уже
  // созданные предложения (не снимается кликом, чтобы случайно не добавить
  // дубль), addingIndices — идёт создание конкретной строки (свой спиннер,
  // не блокирует остальные), bulkAdding — идёт массовое добавление.
  const [webSearchSelected, setWebSearchSelected] = useState<Set<number>>(new Set());
  const [webSearchAdded, setWebSearchAdded] = useState<Set<number>>(new Set());
  const [webSearchAddingIndices, setWebSearchAddingIndices] = useState<Set<number>>(new Set());
  const [webSearchBulkAdding, setWebSearchBulkAdding] = useState(false);
  const [webSearchAddError, setWebSearchAddError] = useState<string | null>(null);

  // "Создать закупку" из выигравшего предложения (владелец, 2026-08-29:
  // "у победителя жмёте «Создать закупку» — открывается форма Закупки, уже
  // с этим поставщиком и материалами из этого же раздела сметы"). Материалы
  // берём из запроса (SupplierRequest.items — общий список для всех
  // предложений этого запроса), поставщика пытаемся сматчить по email с
  // уже существующим в каталоге (supplierContractors) — если такого нет,
  // оставляем поле пустым, сотрудник выберет/добавит сам.
  function handleCreatePurchase(offer: SupplierOffer) {
    const request = requests.find((r) => r.id === offer.requestId);
    const matchedContractor = offer.email
      ? supplierContractors.find((c) => c.email && c.email.toLowerCase() === offer.email.toLowerCase())
      : undefined;
    setPurchaseDraft({
      title: request?.title || offer.name,
      contractorId: matchedContractor?.id ?? null,
      estimateId: request?.estimateId ?? null,
      sectionId: request?.sectionId ?? null,
      sectionTitle: request?.sectionTitle ?? '',
      items: (request?.items ?? []).map((i) => ({ ...i, id: crypto.randomUUID() })),
      currency: offer.currency,
    });
    setTab('Закупки');
    setDetailOfferId(null);
  }

  useEffect(() => {
    Promise.all([fetchSupplierRequests(), fetchSupplierOffers()])
      .then(([r, o]) => {
        setRequests(r);
        setOffers(o);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить поставщиков')))
      .finally(() => setLoading(false));
    fetchTodayRate()
      .then(setRate)
      .catch(() => setRate(undefined));
    fetchContractors()
      .then(setContractors)
      .catch((err) => setCatalogLoadError(errorMessage(err, 'Не удалось загрузить поставщиков')))
      .finally(() => setCatalogLoading(false));
    fetchEstimates().then(setEstimates).catch(() => setEstimates([]));
    fetchObjects().then(setObjects).catch(() => setObjects([]));
    fetchAllSupplierOfferEmails().then(setSupplierEmails).catch(() => setSupplierEmails([]));
    fetchEmailTemplates().then(setEmailTemplates).catch(() => setEmailTemplates([]));
  }, []);

  // Владелец, 2026-09-03: "нужно, чтобы новые письма подгружались и были
  // уведомления даже когда страница открыта... сейчас страницу нужно
  // обновлять вручную". Фоновый вотчер (supplierEmailWatcher.ts) и так
  // опрашивает раз в 60с ради уведомлений в колокольчик, но НЕ обновляет
  // supplierEmails на этой странице — новый ответ был виден только после
  // ручного F5. Отдельный лёгкий поллинг здесь (раз в 20с, пока страница
  // открыта) держит саму ленту переписки свежей без перезагрузки. Полная
  // замена (не merge) — supplierEmails и так приходит целиком с сервера,
  // объединять нечего; единственный побочный эффект — оптимистичная отметка
  // "прочитано" (см. handleMarkSupplierEmailsRead) может на секунду
  // откатиться, если опрос попал между локальной отметкой и ответом
  // сервера, и тут же поправится следующим тиком — не критично.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllSupplierOfferEmails()
        .then(setSupplierEmails)
        .catch(() => {});
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Оптимистично помечает входящие письма этого предложения прочитанными в
  // локальном состоянии сразу (счётчик гаснет мгновенно), запрос на сервер —
  // фоном; сбой запроса намеренно не откатывает локальную отметку и не
  // показывает ошибку — это не критичная операция, при следующей загрузке
  // страницы всё равно синхронизируется с базой.
  function handleMarkSupplierEmailsRead(offerId: string) {
    setSupplierEmails((prev) =>
      prev.map((e) => (e.offerId === offerId && e.direction === 'in' && !e.readAt ? { ...e, readAt: new Date().toISOString() } : e)),
    );
    markSupplierOfferEmailsRead(offerId).catch(() => {});
  }

  function handleSupplierEmailSent(email: SupplierOfferEmail) {
    setSupplierEmails((prev) => [...prev, email]);
  }

  // Владелец, 2026-09-03 — распознавание счёта/КП из вложения: подтверждение
  // (ручное или автоматическое) пишет в карточку предложения и отмечает
  // письмо разобранным — обе правки приходят снизу из EmailThread через
  // SupplierCorrespondenceTab/OfferEmailModal, здесь единственное место,
  // где реально живут offers/supplierEmails на всю страницу.
  function handleSupplierOfferUpdated(updated: SupplierOffer) {
    setOffers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  function handleSupplierEmailUpdated(updated: SupplierOfferEmail) {
    setSupplierEmails((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleEmailTemplateSaved(template: EmailTemplate) {
    setEmailTemplates((prev) => (prev.some((t) => t.id === template.id) ? prev.map((t) => (t.id === template.id ? template : t)) : [...prev, template]));
  }

  function objectLabel(objectId: string): string {
    const o = objects.find((x) => x.id === objectId);
    return o ? o.name || o.address : 'Объект без названия';
  }

  const estimateOptions = useMemo(
    () => estimates.map((e) => ({ id: e.id, label: `Смета — ${objectLabel(e.objectId)}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estimates, objects],
  );

  const selectedRequestEstimate = estimates.find((e) => e.id === requestForm.estimateId) ?? null;
  const selectedRequestSection = selectedRequestEstimate?.sections.find((s) => s.id === requestForm.sectionId) ?? null;

  function addMaterialToRequestItems(m: EstimateMaterial) {
    if (requestForm.items.some((i) => i.sourceMaterialId === m.id)) return;
    const item: PurchaseItem = {
      id: crypto.randomUUID(),
      sourceMaterialId: m.id,
      name: m.name,
      unit: m.unit,
      quantity: m.quantity,
      price: null,
      note: m.note,
    };
    setRequestForm((f) => ({ ...f, items: [...f.items, item] }));
  }

  function addManualRequestItem() {
    if (!manualItemName.trim()) return;
    const item: PurchaseItem = {
      id: crypto.randomUUID(),
      sourceMaterialId: null,
      name: manualItemName.trim(),
      unit: '',
      quantity: null,
      price: null,
      note: '',
    };
    setRequestForm((f) => ({ ...f, items: [...f.items, item] }));
    setManualItemName('');
  }

  function updateRequestItem(id: string, patch: Partial<PurchaseItem>) {
    setRequestForm((f) => ({ ...f, items: f.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }

  function removeRequestItem(id: string) {
    setRequestForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) }));
  }

  // Ровно то же условие, что раньше отбирало "Прочие подрядчики" в
  // Contractors.tsx — контакты без занятости (teamTier).
  const supplierContractors = useMemo(() => contractors.filter((c) => !c.teamTier), [contractors]);

  const knownCatalogSpecialties = useMemo(() => {
    const set = new Set<string>();
    supplierContractors.forEach((c) => c.specialty && set.add(c.specialty));
    return [...set];
  }, [supplierContractors]);

  const knownCatalogContactMethods = useMemo(() => {
    const set = new Set<string>(contractorContactMethods);
    supplierContractors.forEach((c) => c.contactMethod && set.add(c.contactMethod));
    return [...set];
  }, [supplierContractors]);

  const catalogGroups = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    const filtered = q
      ? supplierContractors.filter((c) => c.name.toLowerCase().includes(q) || c.specialty.toLowerCase().includes(q))
      : supplierContractors;
    const sorted = [...filtered].sort(
      (a, b) => a.specialty.localeCompare(b.specialty, 'ru') || a.name.localeCompare(b.name, 'ru'),
    );
    const groups: { specialty: string; items: Contractor[] }[] = [];
    for (const c of sorted) {
      const specialty = c.specialty || 'Без категории';
      const last = groups[groups.length - 1];
      if (last && last.specialty === specialty) last.items.push(c);
      else groups.push({ specialty, items: [c] });
    }
    return groups;
  }, [supplierContractors, catalogSearch]);

  const catalogDetail = catalogDetailId ? (contractors.find((c) => c.id === catalogDetailId) ?? null) : null;
  const catalogEditing = catalogEditingId ? (contractors.find((c) => c.id === catalogEditingId) ?? null) : null;

  function openAddCatalog() {
    setCatalogEditingId(null);
    setCatalogForm(emptyCatalogForm);
    setCatalogSubmitError(null);
    setCatalogModalOpen(true);
  }

  function openEditCatalog(c: Contractor) {
    setCatalogEditingId(c.id);
    setCatalogForm(catalogToForm(c));
    setCatalogSubmitError(null);
    setCatalogDetailId(null);
    setCatalogModalOpen(true);
  }

  async function handleCatalogPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || catalogPhotoUploading) return;
    setCatalogPhotoUploading(true);
    setCatalogSubmitError(null);
    const previous = catalogForm.photoPath;
    try {
      const path = await uploadContractorPhoto(file);
      setCatalogForm((f) => ({ ...f, photoPath: path }));
      if (previous) await deleteContractorPhoto(previous);
    } catch (err) {
      setCatalogSubmitError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setCatalogPhotoUploading(false);
    }
  }

  async function handleCatalogPhotoRemove() {
    const path = catalogForm.photoPath;
    setCatalogForm((f) => ({ ...f, photoPath: '' }));
    await deleteContractorPhoto(path);
  }

  const canSubmitCatalog = catalogForm.name && catalogForm.specialty && catalogForm.contact;

  async function handleCatalogSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitCatalog || catalogSubmitting) return;
    setCatalogSubmitting(true);
    setCatalogSubmitError(null);
    const payload = {
      name: catalogForm.name,
      specialty: catalogForm.specialty,
      contact: catalogForm.contact,
      contactMethod: catalogForm.contactMethod,
      phone: catalogForm.phone,
      email: catalogForm.email,
      notes: catalogForm.notes,
      paymentTerms: '',
      teamTier: '',
      responsibilityZone: catalogForm.responsibilityZone,
      photoPath: catalogForm.photoPath,
      birthday: '',
      resumePath: '',
      resumeFileName: '',
    };
    try {
      if (catalogEditingId) {
        const updated = await updateContractor(catalogEditingId, payload);
        setContractors((prev) => prev.map((c) => (c.id === catalogEditingId ? updated : c)));
      } else {
        const created = await insertContractor(payload);
        setContractors((prev) => [...prev, created]);
      }
      setCatalogForm(emptyCatalogForm);
      setCatalogEditingId(null);
      setCatalogModalOpen(false);
    } catch (err) {
      setCatalogSubmitError(errorMessage(err, 'Не удалось сохранить поставщика'));
    } finally {
      setCatalogSubmitting(false);
    }
  }

  async function handleCatalogDelete(c: Contractor) {
    if (catalogDeletingId) return;
    if (!window.confirm(`Удалить поставщика «${c.name}»?`)) return;
    setCatalogDeletingId(c.id);
    setCatalogSubmitError(null);
    try {
      await deleteContractor(c.id);
      setContractors((prev) => prev.filter((x) => x.id !== c.id));
      setCatalogDetailId(null);
      setCatalogModalOpen(false);
    } catch (err) {
      setCatalogSubmitError(errorMessage(err, 'Не удалось удалить поставщика'));
    } finally {
      setCatalogDeletingId(null);
    }
  }

  function openAddRequest() {
    setEditingRequest(null);
    setRequestForm(emptyRequestForm);
    setManualItemName('');
    setRequestError(null);
    setRequestModalOpen(true);
  }

  function openEditRequest(r: SupplierRequest) {
    setEditingRequest(r);
    setRequestForm(requestToForm(r));
    setManualItemName('');
    setRequestError(null);
    setRequestModalOpen(true);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestForm.title.trim() || savingRequest) return;
    setSavingRequest(true);
    setRequestError(null);
    const input: SupplierRequestInput = {
      title: requestForm.title.trim(),
      estimateId: requestForm.estimateId || null,
      sectionId: requestForm.sectionId || null,
      sectionTitle: requestForm.sectionTitle,
      items: requestForm.items,
    };
    try {
      if (editingRequest) {
        const updated = await updateSupplierRequest(editingRequest.id, input);
        setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await insertSupplierRequest(input);
        setRequests((prev) => [created, ...prev]);
      }
      setRequestModalOpen(false);
    } catch (err) {
      setRequestError(errorMessage(err, 'Не удалось сохранить запрос'));
    } finally {
      setSavingRequest(false);
    }
  }

  async function handleDeleteRequest(r: SupplierRequest) {
    if (!window.confirm(`Удалить запрос «${r.title}» вместе со всеми предложениями?`)) return;
    try {
      await deleteSupplierRequest(r.id);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
      setOffers((prev) => prev.filter((o) => o.requestId !== r.id));
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось удалить запрос'));
    }
  }

  function openAddOffer(requestId: string) {
    setOfferRequestId(requestId);
    setEditingOffer(null);
    setOfferForm(emptyOfferForm);
    setOfferError(null);
    setOfferModalOpen(true);
  }

  function openWebQueryModal(request: SupplierRequest) {
    setWebQueryForm({ itemsText: formatRequestItemsText(request.items, request.title), extra: '' });
    setWebQueryModal(request);
  }

  async function submitWebQuery(e: React.FormEvent) {
    e.preventDefault();
    const request = webQueryModal;
    if (!request || !webQueryForm.itemsText.trim()) return;
    setWebQueryModal(null);
    setWebSearchingId(request.id);
    // Новый поиск — новые результаты, сбрасываем статус выбора/добавления
    // от предыдущего (если это повторный поиск по тому же запросу).
    setWebSearchSelected(new Set());
    setWebSearchAdded(new Set());
    setWebSearchAddingIndices(new Set());
    setWebSearchAddError(null);
    try {
      const results = await searchSuppliersOnline(webQueryForm.itemsText.trim(), request.sectionTitle || request.title, webQueryForm.extra.trim());
      setWebSearchModal({ request, results, error: null });
    } catch (err) {
      setWebSearchModal({ request, results: [], error: errorMessage(err, 'Не удалось выполнить веб-поиск') });
    } finally {
      setWebSearchingId(null);
    }
  }

  function toggleWebSearchSelect(index: number) {
    setWebSearchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleWebSearchSelectAll() {
    if (!webSearchModal) return;
    const selectable = webSearchModal.results.map((_, i) => i).filter((i) => !webSearchAdded.has(i));
    setWebSearchSelected((prev) => (prev.size === selectable.length ? new Set() : new Set(selectable)));
  }

  // Создаёт предложения напрямую (без промежуточной формы, см. комментарий
  // у SupplierWebSearchModal) — с дефолтной ценой/валютой, владелец
  // уточняет их потом через обычный карандаш редактирования у уже
  // созданного предложения, как и любое другое.
  async function addWebSearchResults(requestId: string, items: { index: number; r: SupplierSearchResult }[]) {
    if (items.length === 0) return;
    setWebSearchAddError(null);
    const indices = items.map((x) => x.index);
    if (items.length === 1) {
      setWebSearchAddingIndices((prev) => new Set(prev).add(items[0].index));
    } else {
      setWebSearchBulkAdding(true);
    }
    try {
      const created = await Promise.all(
        items.map(({ r }) =>
          insertSupplierOffer({
            requestId,
            name: r.name,
            contactMethod: 'Телефон',
            contact: r.phone,
            email: r.email,
            websiteUrl: r.website,
            catalogModelName: '',
            catalogModelPhoto: null,
            communicationStatus: '',
            price: 0,
            currency: 'USD',
            deadline: '',
            requirements: r.note ? `Найдено веб-поиском: ${r.note}` : '',
            items: [],
            files: [],
          }),
        ),
      );
      setOffers((prev) => [...prev, ...created]);
      setWebSearchAdded((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.add(i));
        return next;
      });
      setWebSearchSelected((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });
    } catch (err) {
      setWebSearchAddError(errorMessage(err, 'Не удалось добавить предложение'));
    } finally {
      setWebSearchAddingIndices((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });
      setWebSearchBulkAdding(false);
    }
  }

  function openEditOffer(o: SupplierOffer) {
    setOfferRequestId(o.requestId);
    setEditingOffer(o);
    setOfferForm({
      name: o.name,
      contactMethod: o.contactMethod,
      contact: o.contact,
      email: o.email,
      websiteUrl: o.websiteUrl,
      catalogModelName: o.catalogModelName,
      catalogModelPhoto: o.catalogModelPhoto,
      communicationStatus: o.communicationStatus,
      price: o.price ? String(o.price) : '',
      currency: o.currency,
      deadline: o.deadline,
      requirements: o.requirements,
      items: o.items,
      existingFiles: o.files,
      newFiles: [],
    });
    setOfferError(null);
    setOfferModalOpen(true);
    setDetailOfferId(null);
  }

  // Позиции КП внутри формы предложения — тот же паттерн (id/updateItem/
  // removeItem), что и у позиций закупки в Purchases.tsx, просто без
  // подстановки из сметы (тут это отдельный товар, не список работ по
  // разделу) — только ручное добавление, плюс автозаполнение из
  // распознавания счёта (applyExtractionToOffer в SupplierCorrespondenceTab.tsx).
  function addManualOfferItem() {
    if (!manualOfferItemName.trim()) return;
    const item: PurchaseItem = {
      id: crypto.randomUUID(),
      sourceMaterialId: null,
      name: manualOfferItemName.trim(),
      unit: '',
      quantity: null,
      price: null,
      note: '',
    };
    setOfferForm((f) => ({ ...f, items: [...f.items, item] }));
    setManualOfferItemName('');
  }

  function updateOfferItem(id: string, patch: Partial<PurchaseItem>) {
    setOfferForm((f) => ({ ...f, items: f.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }

  function removeOfferItem(id: string) {
    setOfferForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) }));
  }

  async function handleCatalogPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPhoto(true);
    setOfferError(null);
    try {
      const uploaded = await uploadSupplierFile(file);
      setOfferForm((f) => ({ ...f, catalogModelPhoto: uploaded }));
    } catch (err) {
      setOfferError(errorMessage(err, 'Не удалось загрузить фото'));
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Владелец, 2026-09-03: сначала "пусть только заголовок будет обязательным
  // полем, остальное опционально" — но у поля "Адрес сайта" остался
  // HTML required (не заметил в первый заход, браузер блокировал сабмит
  // нативной подсказкой независимо от canSubmitOffer), убрано отдельно. Тем
  // же сообщением уточнил: "Название + 1 любое поле, и этого должно
  // хватить" — совсем пустая карточка (только имя, никакого способа связаться
  // или хоть что-то ещё) толку не несёт, поэтому помимо названия нужно
  // заполнить хотя бы одно из остальных полей (любое, не обязательно сайт
  // или контакт конкретно).
  const canSubmitOffer =
    offerForm.name.trim().length > 0 &&
    (offerForm.contact.trim().length > 0 ||
      offerForm.email.trim().length > 0 ||
      offerForm.websiteUrl.trim().length > 0 ||
      offerForm.catalogModelName.trim().length > 0 ||
      offerForm.communicationStatus.trim().length > 0 ||
      offerForm.price.trim().length > 0 ||
      offerForm.deadline.trim().length > 0 ||
      offerForm.requirements.trim().length > 0 ||
      offerForm.items.length > 0 ||
      offerForm.existingFiles.length > 0 ||
      offerForm.newFiles.length > 0);

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitOffer || savingOffer || !offerRequestId) return;
    setSavingOffer(true);
    setOfferError(null);
    try {
      const uploadedNewFiles = await Promise.all(offerForm.newFiles.map(uploadSupplierFile));
      const payload = {
        requestId: offerRequestId,
        name: offerForm.name.trim(),
        contactMethod: offerForm.contactMethod,
        contact: offerForm.contact.trim(),
        email: offerForm.email.trim(),
        websiteUrl: offerForm.websiteUrl.trim(),
        catalogModelName: offerForm.catalogModelName.trim(),
        catalogModelPhoto: offerForm.catalogModelPhoto,
        communicationStatus: offerForm.communicationStatus.trim(),
        price: Number(offerForm.price),
        currency: offerForm.currency,
        deadline: offerForm.deadline.trim(),
        requirements: offerForm.requirements.trim(),
        items: offerForm.items,
        files: [...offerForm.existingFiles, ...uploadedNewFiles],
      };
      if (editingOffer) {
        const updated = await updateSupplierOffer(editingOffer.id, payload);
        setOffers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      } else {
        const created = await insertSupplierOffer(payload);
        setOffers((prev) => [...prev, created]);
      }
      setOfferModalOpen(false);
    } catch (err) {
      setOfferError(errorMessage(err, 'Не удалось сохранить предложение'));
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleDeleteOffer(o: SupplierOffer) {
    if (!window.confirm(`Удалить предложение «${o.name}»?`)) return;
    setDeletingOfferId(o.id);
    try {
      await deleteSupplierOffer(o.id);
      setOffers((prev) => prev.filter((x) => x.id !== o.id));
      setDetailOfferId((id) => (id === o.id ? null : id));
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось удалить предложение'));
    } finally {
      setDeletingOfferId(null);
    }
  }

  // На вкладке "Закупки" своей кнопки в шапке нет — Purchases сам рендерит
  // "Добавить закупку" внутри себя (embedded), как и положено чужому
  // компоненту со своим состоянием модалки.
  const supplierAddButton =
    tab === 'Каталог' ? (
      <Button icon={<Plus className="h-4 w-4" />} onClick={openAddCatalog}>
        Добавить поставщика
      </Button>
    ) : tab === 'Ресерч' ? (
      <Button icon={<Plus className="h-4 w-4" />} onClick={openAddRequest}>
        Новый запрос
      </Button>
    ) : undefined;

  const unreadSupplierEmailsCount = countUnreadSupplierEmails(supplierEmails);

  return (
    <>
      <PageHeader title="Закупки" action={supplierAddButton} />

      <ToggleGroup
        options={[...SUPPLIER_TABS]}
        value={tab}
        onChange={(v) => setTab(v as SupplierTab)}
        badges={{ Email: unreadSupplierEmailsCount }}
      />

      {tab === 'Каталог' && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <SearchInput
              placeholder="Название или категория..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full sm:w-64"
            />
          </div>

          {catalogLoading && (
            <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем поставщиков...
            </Card>
          )}
          {!catalogLoading && catalogLoadError && (
            <Card className="py-10 text-center text-sm text-danger">{catalogLoadError}</Card>
          )}
          {!catalogLoading && !catalogLoadError && catalogGroups.length === 0 && (
            <Card className="py-10 text-center text-sm text-ink-muted">
              {catalogSearch ? 'Ничего не найдено' : 'Поставщиков пока нет — нажмите «Добавить поставщика»'}
            </Card>
          )}
          {!catalogLoading && !catalogLoadError && catalogGroups.length > 0 && (
            <div className="flex flex-col gap-5">
              {catalogGroups.map((group) => (
                <div key={group.specialty} className="flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{group.specialty}</div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                    {group.items.map((c) => (
                      <ContractorCard key={c.id} contractor={c} onOpen={(c) => setCatalogDetailId(c.id)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Ресерч' && (
      <div className="mt-6 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <div className="text-lg font-bold text-ink">Материалы</div>

          {loading && (
            <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем поставщиков...
            </Card>
          )}
          {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}
          {!loading && !loadError && requests.length === 0 && (
            <Card className="py-10 text-center text-sm text-ink-muted">Пока нет запросов — нажмите «Новый запрос»</Card>
          )}

          {!loading &&
            !loadError &&
            requests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                offers={offers.filter((o) => o.requestId === r.id)}
                rate={rate}
                onEditRequest={openEditRequest}
                onDeleteRequest={handleDeleteRequest}
                onAddOffer={openAddOffer}
                onOpenDetail={(o) => setDetailOfferId(o.id)}
                onWebSearch={openWebQueryModal}
                searching={webSearchingId === r.id}
                canBulkEmail={offers.some(
                  (o) =>
                    o.requestId === r.id &&
                    o.email.trim() &&
                    !supplierEmails.some((e) => e.offerId === o.id && e.direction === 'out'),
                )}
                onBulkEmail={(req) => setBulkEmailRequestId(req.id)}
              />
            ))}

          <Button
            type="button"
            variant="secondary"
            icon={<Plus className="h-4 w-4" />}
            className="w-fit"
            onClick={openAddRequest}
          >
            Новый запрос
          </Button>
        </div>

        {/* Сравнение предложений подрядчиков на услуги (оценка здания, вывоз
            мусора и т.п.) — перенесено сюда со страницы "Команда" (владелец,
            2026-09-02: "перенеси вот это в подрядчиков, это не команда"),
            в "Закупки" → "Ресерч" рядом с ресерчем материалов. Полностью
            самостоятельный компонент (свои запросы/предложения/модалки, не
            завязан на Contractor/contractors), поэтому просто вставлен как
            есть отдельной секцией, без общих данных с блоком "Материалы" выше. */}
        <div className="flex flex-col gap-6 border-t border-border pt-8">
          <div className="text-lg font-bold text-ink">Подрядчики</div>
          <ContractorsResearch />
        </div>
      </div>
      )}

      {tab === 'Закупки' && (
        <div className="mt-6">
          <Purchases embedded initialDraft={purchaseDraft} onDraftConsumed={() => setPurchaseDraft(null)} />
        </div>
      )}

      {tab === 'Email' && (
        <div className="mt-6">
          <SupplierCorrespondenceTab
            requests={requests}
            offers={offers}
            emails={supplierEmails}
            templates={emailTemplates}
            onEmailSent={handleSupplierEmailSent}
            onMarkRead={handleMarkSupplierEmailsRead}
            onTemplatesChange={setEmailTemplates}
            onOfferUpdated={handleSupplierOfferUpdated}
            onEmailUpdated={handleSupplierEmailUpdated}
          />
        </div>
      )}

      <Modal open={requestModalOpen} onClose={() => setRequestModalOpen(false)} title={editingRequest ? 'Редактировать запрос' : 'Новый запрос'}>
        <form onSubmit={submitRequest} className="flex flex-col gap-4">
          <Input
            label="Название запроса"
            placeholder="Например, Поиск ЦСП-плит"
            value={requestForm.title}
            onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))}
            required
            autoFocus
          />

          <Select
            label="Смета"
            placeholder="Не выбрана"
            options={estimateOptions.map((o) => o.label)}
            value={estimateOptions.find((o) => o.id === requestForm.estimateId)?.label ?? ''}
            onChange={(label) => {
              const o = estimateOptions.find((x) => x.label === label);
              setRequestForm((f) => ({ ...f, estimateId: o?.id ?? '', sectionId: '', sectionTitle: '' }));
            }}
          />

          {selectedRequestEstimate && (
            <Select
              label="Раздел сметы"
              placeholder="Не выбран"
              options={selectedRequestEstimate.sections.map((s) => s.title)}
              value={selectedRequestSection?.title ?? ''}
              onChange={(title) => {
                const s = selectedRequestEstimate.sections.find((x) => x.title === title);
                setRequestForm((f) => ({ ...f, sectionId: s?.id ?? '', sectionTitle: s?.title ?? '' }));
              }}
            />
          )}

          {selectedRequestSection && selectedRequestSection.materials.length > 0 && (
            <div className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Материалы раздела «{selectedRequestSection.title}»
              </span>
              <div className="flex flex-col gap-1.5">
                {selectedRequestSection.materials.map((m) => {
                  const added = requestForm.items.some((i) => i.sourceMaterialId === m.id);
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">
                        {m.name}
                        {m.unit && (
                          <span className="text-ink-faint">
                            {' '}
                            · {m.quantity ?? '—'} {m.unit}
                          </span>
                        )}
                      </span>
                      <Button type="button" variant="secondary" disabled={added} onClick={() => addMaterialToRequestItems(m)}>
                        {added ? 'Добавлено' : 'Добавить'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-muted">Что просим оценить у поставщиков</span>
            {requestForm.items.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {requestForm.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm">
                    <span className="flex-1 text-ink">{item.name}</span>
                    <input
                      type="number"
                      placeholder="Кол-во"
                      value={item.quantity ?? ''}
                      onChange={(e) =>
                        updateRequestItem(item.id, { quantity: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      className="w-20 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                    />
                    {item.unit && <span className="w-12 text-ink-faint">{item.unit}</span>}
                    <button
                      type="button"
                      onClick={() => removeRequestItem(item.id)}
                      aria-label="Удалить позицию"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Добавить позицию вручную"
                value={manualItemName}
                onChange={(e) => setManualItemName(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={addManualRequestItem} disabled={!manualItemName.trim()}>
                Добавить
              </Button>
            </div>
          </div>

          {requestError && <p className="text-sm text-danger">{requestError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setRequestModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!requestForm.title.trim() || savingRequest}>
              {savingRequest ? 'Сохраняем...' : editingRequest ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={offerModalOpen} onClose={() => setOfferModalOpen(false)} title={editingOffer ? 'Редактировать предложение' : 'Новое предложение'}>
        <form onSubmit={submitOffer} className="flex flex-col gap-4">
          <Input
            label="Название"
            placeholder="Имя или название компании"
            value={offerForm.name}
            onChange={(e) => setOfferForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Контакт</span>
            <div className="flex gap-2">
              <ToggleGroup
                options={[...RESEARCH_CONTACT_METHODS]}
                value={offerForm.contactMethod}
                onChange={(v) => setOfferForm((f) => ({ ...f, contactMethod: v as ResearchContactMethod }))}
              />
              <Input
                placeholder={offerForm.contactMethod === 'Telegram' ? '@username' : '+375 29 ...'}
                type={offerForm.contactMethod === 'Telegram' ? 'text' : 'tel'}
                value={offerForm.contact}
                onChange={(e) => setOfferForm((f) => ({ ...f, contact: e.target.value }))}
                className="flex-1"
              />
            </div>
          </div>

          <Input
            label="Email"
            placeholder="mail@example.com"
            type="email"
            value={offerForm.email}
            onChange={(e) => setOfferForm((f) => ({ ...f, email: e.target.value }))}
          />

          <Input
            label="Адрес сайта"
            placeholder="https://..."
            value={offerForm.websiteUrl}
            onChange={(e) => setOfferForm((f) => ({ ...f, websiteUrl: e.target.value }))}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Модель в каталоге</span>
            <Input
              placeholder="Название модели"
              value={offerForm.catalogModelName}
              onChange={(e) => setOfferForm((f) => ({ ...f, catalogModelName: e.target.value }))}
            />
            <div className="flex items-center gap-3">
              {offerForm.catalogModelPhoto ? (
                <div className="flex items-center gap-2">
                  <img
                    src={offerForm.catalogModelPhoto.url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-control object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setOfferForm((f) => ({ ...f, catalogModelPhoto: null }))}
                    className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                    Убрать фото
                  </button>
                </div>
              ) : (
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-control border border-dashed border-border px-4 py-2.5 text-sm text-ink-muted hover:border-border-strong">
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadingPhoto ? 'Загружаем...' : 'Загрузить фото'}
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={handleCatalogPhotoSelect} />
                </label>
              )}
            </div>
          </div>

          <Input
            label="Статус коммуникации"
            placeholder="Например, ждём ответ по КП"
            value={offerForm.communicationStatus}
            onChange={(e) => setOfferForm((f) => ({ ...f, communicationStatus: e.target.value }))}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Итоговая цена</span>
            <div className="flex gap-2">
              <Input
                placeholder="0"
                type="number"
                min="0"
                value={offerForm.price}
                onChange={(e) => setOfferForm((f) => ({ ...f, price: e.target.value }))}
                className="flex-1"
              />
              <ToggleGroup
                options={RESEARCH_CURRENCIES}
                value={offerForm.currency}
                onChange={(v) => setOfferForm((f) => ({ ...f, currency: v as Currency }))}
              />
            </div>
          </div>

          <Input
            label="Срок"
            placeholder="Например, 5 дней"
            value={offerForm.deadline}
            onChange={(e) => setOfferForm((f) => ({ ...f, deadline: e.target.value }))}
          />

          <div className="flex flex-col gap-2">
            <span className="text-sm text-ink-muted">Позиции КП</span>
            {offerForm.items.length > 0 && (
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                      <th className="px-3 py-2">Название</th>
                      <th className="px-3 py-2 text-right">Кол-во</th>
                      <th className="px-3 py-2 text-right">Ед.</th>
                      <th className="px-3 py-2 text-right">Цена</th>
                      <th className="px-3 py-2 text-right">Сумма</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {offerForm.items.map((item) => (
                      <tr key={item.id} className="border-t border-border align-top">
                        <td className="px-3 py-2 text-ink">
                          <input
                            value={item.name}
                            onChange={(e) => updateOfferItem(item.id, { name: e.target.value })}
                            className="w-full min-w-[140px] rounded-control border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.quantity ?? ''}
                            onChange={(e) => updateOfferItem(item.id, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                            className="w-20 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            value={item.unit}
                            onChange={(e) => updateOfferItem(item.id, { unit: e.target.value })}
                            className="w-16 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.price ?? ''}
                            onChange={(e) => updateOfferItem(item.id, { price: e.target.value === '' ? null : Number(e.target.value) })}
                            className="w-24 rounded-control border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-ink">
                          {purchaseItemTotal(item).toLocaleString('ru-RU')} {currencySymbols[offerForm.currency]}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeOfferItem(item.id)}
                            aria-label="Удалить позицию"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Название позиции"
                value={manualOfferItemName}
                onChange={(e) => setManualOfferItemName(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="secondary" icon={<PackagePlus className="h-4 w-4" />} onClick={addManualOfferItem}>
                Добавить
              </Button>
            </div>
          </div>

          <Textarea
            label="Требования"
            placeholder="Предоплата, документы, условия..."
            rows={3}
            value={offerForm.requirements}
            onChange={(e) => setOfferForm((f) => ({ ...f, requirements: e.target.value }))}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Файлы (счета, спецификации...)</span>
            {offerForm.existingFiles.map((file, i) => (
              <div
                key={`existing-${i}`}
                className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-ink"
              >
                <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                <button
                  type="button"
                  onClick={() =>
                    setOfferForm((f) => ({ ...f, existingFiles: f.existingFiles.filter((_, idx) => idx !== i) }))
                  }
                  aria-label="Убрать файл"
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-faint hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {offerForm.newFiles.map((file, i) => (
              <div
                key={`new-${i}`}
                className="flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-ink"
              >
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setOfferForm((f) => ({ ...f, newFiles: f.newFiles.filter((_, idx) => idx !== i) }))}
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
                  if (picked.length) setOfferForm((f) => ({ ...f, newFiles: [...f.newFiles, ...picked] }));
                }}
              />
            </label>
          </div>

          {offerError && <p className="text-sm text-danger">{offerError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOfferModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmitOffer || savingOffer}>
              {savingOffer ? 'Сохраняем...' : editingOffer ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        title={catalogEditingId ? 'Редактировать поставщика' : 'Новый поставщик'}
      >
        <form onSubmit={handleCatalogSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <ContractorAvatar name={catalogForm.name || '?'} photoPath={catalogForm.photoPath} size="lg" />
            <div className="flex flex-col items-start gap-1.5">
              <label
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink hover:border-border-strong',
                  catalogPhotoUploading && 'pointer-events-none opacity-50',
                )}
              >
                {catalogPhotoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {catalogPhotoUploading ? 'Загружаем...' : catalogForm.photoPath ? 'Заменить лого' : 'Загрузить лого'}
                <input type="file" accept="image/*" className="hidden" onChange={handleCatalogPhotoChange} />
              </label>
              {catalogForm.photoPath && !catalogPhotoUploading && (
                <button
                  type="button"
                  onClick={handleCatalogPhotoRemove}
                  className="inline-flex items-center gap-1 text-xs text-ink-muted underline underline-offset-2 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                  Удалить лого
                </button>
              )}
            </div>
          </div>

          <Input
            label="Название"
            placeholder="Компания или имя"
            value={catalogForm.name}
            onChange={(e) => setCatalogForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <AddableSelect
            label="Категория"
            placeholder="Не выбрано"
            options={knownCatalogSpecialties}
            value={catalogForm.specialty}
            onChange={(v) => setCatalogForm((f) => ({ ...f, specialty: v }))}
            addLabel="+ Добавить категорию"
            newPlaceholder="Название категории"
          />

          <Input
            label="Что предлагают"
            placeholder="Например: умные замки"
            value={catalogForm.responsibilityZone}
            onChange={(e) => setCatalogForm((f) => ({ ...f, responsibilityZone: e.target.value }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Телефон"
              placeholder="+375 29 ..."
              type="tel"
              value={catalogForm.phone}
              onChange={(e) => setCatalogForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="Email"
              placeholder="mail@example.com"
              type="email"
              value={catalogForm.email}
              onChange={(e) => setCatalogForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Контакт"
              placeholder="@username, номер телефона..."
              value={catalogForm.contact}
              onChange={(e) => setCatalogForm((f) => ({ ...f, contact: e.target.value }))}
              required
            />
            <AddableSelect
              label="Способ связи"
              placeholder="Не выбрано"
              options={knownCatalogContactMethods}
              value={catalogForm.contactMethod}
              onChange={(v) => setCatalogForm((f) => ({ ...f, contactMethod: v }))}
              addLabel="+ Добавить способ"
              newPlaceholder="Название способа связи"
            />
          </div>

          <Textarea
            label="Заметки"
            placeholder="Условия, скидки, качество..."
            rows={3}
            value={catalogForm.notes}
            onChange={(e) => setCatalogForm((f) => ({ ...f, notes: e.target.value }))}
          />

          {catalogSubmitError && <p className="text-sm text-danger">{catalogSubmitError}</p>}

          <div className="mt-2 flex items-center justify-end gap-3">
            {catalogEditing && (
              <Button
                type="button"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={catalogDeletingId === catalogEditing.id}
                onClick={() => handleCatalogDelete(catalogEditing)}
                className="mr-auto"
              >
                Удалить
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setCatalogModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmitCatalog || catalogSubmitting}>
              {catalogSubmitting ? 'Сохраняем...' : catalogEditingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      <ContractorDetailModal contractor={catalogDetail} onClose={() => setCatalogDetailId(null)} onEdit={openEditCatalog} />

      {emailOfferId &&
        (() => {
          const offer = offers.find((o) => o.id === emailOfferId);
          const request = offer ? requests.find((r) => r.id === offer.requestId) : undefined;
          if (!offer || !request) return null;
          return (
            <OfferEmailModal
              offer={offer}
              request={request}
              requests={requests}
              emails={supplierEmails.filter((e) => e.offerId === offer.id)}
              templates={emailTemplates}
              onEmailSent={handleSupplierEmailSent}
              onMarkRead={handleMarkSupplierEmailsRead}
              onTemplateSaved={handleEmailTemplateSaved}
              onOfferUpdated={handleSupplierOfferUpdated}
              onEmailUpdated={handleSupplierEmailUpdated}
              onClose={() => setEmailOfferId(null)}
            />
          );
        })()}

      {bulkEmailRequestId &&
        (() => {
          const request = requests.find((r) => r.id === bulkEmailRequestId);
          if (!request) return null;
          return (
            <BulkEmailModal
              request={request}
              offers={offers.filter((o) => o.requestId === request.id)}
              emails={supplierEmails}
              templates={emailTemplates}
              onEmailSent={handleSupplierEmailSent}
              onClose={() => setBulkEmailRequestId(null)}
            />
          );
        })()}

      {detailOfferId &&
        (() => {
          const offer = offers.find((o) => o.id === detailOfferId);
          if (!offer) return null;
          const siblingOffers = offers.filter((o) => o.requestId === offer.requestId);
          const { cheapestIds } = rankOffers(siblingOffers, rate);
          return (
            <OfferDetailModal
              offer={offer}
              isCheapest={cheapestIds.has(offer.id)}
              onClose={() => setDetailOfferId(null)}
              onEmail={(o) => {
                setEmailOfferId(o.id);
                setDetailOfferId(null);
              }}
              onEdit={openEditOffer}
              onDelete={handleDeleteOffer}
              onCreatePurchase={handleCreatePurchase}
              deleting={deletingOfferId === offer.id}
            />
          );
        })()}

      <Modal open={!!webQueryModal} onClose={() => setWebQueryModal(null)} title={`Найти в сети: ${webQueryModal?.title ?? ''}`}>
        <form onSubmit={submitWebQuery} className="flex flex-col gap-4">
          <Textarea
            label="Что ищем"
            rows={3}
            value={webQueryForm.itemsText}
            onChange={(e) => setWebQueryForm((f) => ({ ...f, itemsText: e.target.value }))}
          />
          <Textarea
            label="Дополнительные пожелания (необязательно)"
            rows={3}
            placeholder="Например: бренд Ceresit, бюджет до $500, готовы смотреть не только Минск"
            value={webQueryForm.extra}
            onChange={(e) => setWebQueryForm((f) => ({ ...f, extra: e.target.value }))}
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setWebQueryModal(null)}>
              Отмена
            </Button>
            <Button type="submit" icon={<Search className="h-4 w-4" />} disabled={!webQueryForm.itemsText.trim()}>
              Искать
            </Button>
          </div>
        </form>
      </Modal>

      {webSearchModal && (
        <SupplierWebSearchModal
          requestTitle={webSearchModal.request.title}
          results={webSearchModal.results}
          error={webSearchModal.error}
          selected={webSearchSelected}
          added={webSearchAdded}
          addingIndices={webSearchAddingIndices}
          bulkAdding={webSearchBulkAdding}
          addError={webSearchAddError}
          onClose={() => setWebSearchModal(null)}
          onToggleSelect={toggleWebSearchSelect}
          onToggleSelectAll={toggleWebSearchSelectAll}
          onAddOne={(i) => addWebSearchResults(webSearchModal.request.id, [{ index: i, r: webSearchModal.results[i] }])}
          onAddSelected={() =>
            addWebSearchResults(
              webSearchModal.request.id,
              [...webSearchSelected].map((i) => ({ index: i, r: webSearchModal.results[i] })),
            )
          }
        />
      )}
    </>
  );
}

// Тонкая обёртка над общим EmailThread (см. components/suppliers/
// SupplierCorrespondenceTab.tsx) — письма и их отправка/отметка
// прочитанным идут через тот же supplierEmails на уровне страницы, что и
// у вкладки "Email", отдельного fetch здесь больше нет.
function OfferEmailModal({
  offer,
  request,
  requests,
  emails,
  templates,
  onEmailSent,
  onMarkRead,
  onTemplateSaved,
  onOfferUpdated,
  onEmailUpdated,
  onClose,
}: {
  offer: SupplierOffer;
  request: SupplierRequest;
  requests: SupplierRequest[];
  emails: SupplierOfferEmail[];
  templates: EmailTemplate[];
  onEmailSent: (email: SupplierOfferEmail) => void;
  onMarkRead: (offerId: string) => void;
  onTemplateSaved: (template: EmailTemplate) => void;
  onOfferUpdated: (offer: SupplierOffer) => void;
  onEmailUpdated: (email: SupplierOfferEmail) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    onMarkRead(offer.id);
    // onMarkRead — стабильная ссылка из родителя (не зависит от рендера),
    // намеренно не в зависимостях, чтобы не звать повторно на каждый чужой
    // ре-рендер — только при реальной смене предложения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  return (
    <Modal open onClose={onClose} title={offer.name}>
      <EmailThread
        offer={offer}
        request={request}
        requests={requests}
        emails={emails}
        templates={templates}
        onEmailSent={onEmailSent}
        onTemplateSaved={onTemplateSaved}
        onOfferUpdated={onOfferUpdated}
        onEmailUpdated={onEmailUpdated}
      />
    </Modal>
  );
}
