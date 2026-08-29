import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Send, Phone, Globe, Paperclip, Upload, X, ImageOff } from 'lucide-react';
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
} from '../data/supplierResearch';
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
import type { PurchaseItem } from '../data/purchases';
import type { Estimate, EstimateMaterial } from '../data/estimates';
import { fetchEstimates } from '../lib/estimatesApi';
import type { RealtyObject } from '../data/objects';
import { fetchObjects } from '../lib/objectsApi';

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

const SUPPLIER_TABS = ['Каталог', 'Ресерч'] as const;
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
  onEditOffer,
  onDeleteOffer,
  deletingOfferId,
}: {
  request: SupplierRequest;
  offers: SupplierOffer[];
  rate: ExchangeRate | undefined;
  onEditRequest: (r: SupplierRequest) => void;
  onDeleteRequest: (r: SupplierRequest) => void;
  onAddOffer: (requestId: string) => void;
  onEditOffer: (o: SupplierOffer) => void;
  onDeleteOffer: (o: SupplierOffer) => void;
  deletingOfferId: string | null;
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
          <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onAddOffer(request.id)}>
            Добавить предложение
          </Button>
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-3 text-left">Название</th>
                <th className="py-2 px-2 text-left">Контакт</th>
                <th className="py-2 px-2 text-left">Сайт</th>
                <th className="py-2 px-2 text-left">Модель в каталоге</th>
                <th className="py-2 px-2 text-left">Статус</th>
                <th className="py-2 px-2 text-right">Итоговая цена</th>
                <th className="py-2 px-2 text-left">Срок</th>
                <th className="py-2 px-2 text-left">Требования</th>
                <th className="py-2 px-2 text-left">Файлы</th>
                <th className="py-2 pl-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((o) => {
                const isCheapest = cheapestIds.has(o.id);
                return (
                  <tr key={o.id} className={isCheapest ? 'bg-success-bg' : undefined}>
                    <td className="py-2.5 pr-3 font-medium text-ink">
                      {o.name}
                      {isCheapest && (
                        <span className="ml-2 rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold text-white">
                          лучшая цена
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">
                      {o.contact ? (
                        <span className="flex items-center gap-1.5">
                          {o.contactMethod === 'Telegram' ? (
                            <Send className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <ContactValue
                            contact={o.contactMethod === 'Телефон' ? formatPhoneDisplay(o.contact) : o.contact}
                            contactMethod={o.contactMethod}
                          />
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">
                      {o.websiteUrl ? (
                        <a
                          href={/^https?:\/\//.test(o.websiteUrl) ? o.websiteUrl : `https://${o.websiteUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-primary hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[140px] truncate">{siteLabel(o.websiteUrl)}</span>
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">
                      {o.catalogModelName || o.catalogModelPhoto ? (
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
                            {o.catalogModelPhoto ? (
                              <img src={o.catalogModelPhoto.url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageOff className="h-4 w-4 text-ink-faint" />
                            )}
                          </span>
                          <span className="max-w-[140px] truncate text-ink">{o.catalogModelName || '—'}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-[160px] py-2.5 px-2 text-ink-muted">
                      <span className="line-clamp-2">{o.communicationStatus || '—'}</span>
                    </td>
                    <td className={cn('py-2.5 px-2 text-right tabular-nums font-semibold', isCheapest ? 'text-success' : 'text-ink')}>
                      {o.price > 0 ? formatPrice(o.price, o.currency) : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">{o.deadline || '—'}</td>
                    <td className="max-w-[200px] py-2.5 px-2 text-ink-muted">
                      <span className="line-clamp-2">{o.requirements || '—'}</span>
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">
                      {o.files.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {o.files.map((f, i) => (
                            <a
                              key={i}
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span className="max-w-[100px] truncate">{f.fileName}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 pl-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditOffer(o)}
                          aria-label="Редактировать предложение"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteOffer(o)}
                          disabled={deletingOfferId === o.id}
                          aria-label="Удалить предложение"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

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
  }, []);

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
      existingFiles: o.files,
      newFiles: [],
    });
    setOfferError(null);
    setOfferModalOpen(true);
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

  // Владелец: чаще всего в моменте есть только название и ссылка на
  // поставщика, остальное (цена, контакт, срок, требования) заполняется
  // позже по ходу переговоров — раньше форма требовала ещё и итоговую цену,
  // из-за чего быстро закинуть найденного поставщика было нельзя.
  const canSubmitOffer = offerForm.name.trim().length > 0 && offerForm.websiteUrl.trim().length > 0;

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
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось удалить предложение'));
    } finally {
      setDeletingOfferId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Поставщики"
        action={
          tab === 'Каталог' ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openAddCatalog}>
              Добавить поставщика
            </Button>
          ) : (
            <Button icon={<Plus className="h-4 w-4" />} onClick={openAddRequest}>
              Новый запрос
            </Button>
          )
        }
      />

      <ToggleGroup options={[...SUPPLIER_TABS]} value={tab} onChange={(v) => setTab(v as SupplierTab)} />

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
      <div className="mt-6 flex flex-col gap-6">
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
              onEditOffer={openEditOffer}
              onDeleteOffer={handleDeleteOffer}
              deletingOfferId={deletingOfferId}
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
            required
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
    </>
  );
}
