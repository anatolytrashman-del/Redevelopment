import { useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Send, Phone } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { ToggleGroup } from '../ui/ToggleGroup';
import { ContactValue } from '../ui/ContactValue';
import { cn } from '../../lib/cn';
import { formatPhoneDisplay } from '../../lib/formatPhone';
import { currencySymbols, type Currency } from '../../data/transactions';
import type { ExchangeRate } from '../../data/exchangeRates';
import { fetchTodayRate } from '../../lib/exchangeRatesApi';
import { convertToUsd } from '../../lib/currencyConvert';
import {
  RESEARCH_CURRENCIES,
  RESEARCH_CONTACT_METHODS,
  type ResearchContactMethod,
  type ResearchRequest,
  type ResearchOffer,
} from '../../data/contractorResearch';
import {
  fetchResearchRequests,
  insertResearchRequest,
  updateResearchRequest,
  deleteResearchRequest,
  fetchResearchOffers,
  insertResearchOffer,
  updateResearchOffer,
  deleteResearchOffer,
} from '../../lib/contractorResearchApi';

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

const emptyOfferForm = {
  name: '',
  contactMethod: 'Телефон' as ResearchContactMethod,
  contact: '',
  price: '',
  currency: 'USD' as Currency,
  deadline: '',
  requirements: '',
};

// Сравнение предложений на одну задачу (владелец: "1 запрос — 1 карточка",
// пример — поиск оценки здания). Внутри карточки — предложения разных
// исполнителей, возможно в разных валютах (владелец: "просто доллары не
// подойдут") — сравнивать сырые числа напрямую нельзя (500 RUB и 500 USD не
// одно и то же), поэтому "дешевле всех" считается по курсу на сегодня
// (convertToUsd, тот же хелпер, что и в отчёте по Транзакциям) — общий
// знаменатель USD. Предложения без цены или с валютой, для которой курс не
// подтянулся (rate ещё грузится/недоступен), в сравнении не участвуют и
// идут в конец — иначе несравнимое (или 0) ложно выигрывало бы как
// "самая низкая цена".
//
// Лидеров может быть несколько (владелец: "два подрядчика с одинаковой
// ценой... надо подсвечивать, что тут не 1 лидер, а два одинаковых") —
// cheapestIds поэтому набор, а не одно id: помечаем ВСЕ предложения с
// минимальной ценой, не только первое по сортировке. Округление до цента
// перед сравнением — иначе конвертация через курс (умножение/деление)
// может дать 549.999999 вместо 550 и ложно не засчитать равенство.
function rankOffers(
  offers: ResearchOffer[],
  rate: ExchangeRate | undefined,
): { sorted: ResearchOffer[]; cheapestIds: Set<string> } {
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
  request: ResearchRequest;
  offers: ResearchOffer[];
  rate: ExchangeRate | undefined;
  onEditRequest: (r: ResearchRequest) => void;
  onDeleteRequest: (r: ResearchRequest) => void;
  onAddOffer: (requestId: string) => void;
  onEditOffer: (o: ResearchOffer) => void;
  onDeleteOffer: (o: ResearchOffer) => void;
  deletingOfferId: string | null;
}) {
  const { sorted, cheapestIds } = rankOffers(offers, rate);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-bold text-ink">{request.title}</div>
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
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-3 text-left">Название</th>
                <th className="py-2 px-2 text-left">Контакт</th>
                <th className="py-2 px-2 text-right">Стоимость</th>
                <th className="py-2 px-2 text-left">Срок</th>
                <th className="py-2 px-2 text-left">Требования</th>
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
                    <td className={cn('py-2.5 px-2 text-right tabular-nums font-semibold', isCheapest ? 'text-success' : 'text-ink')}>
                      {o.price > 0 ? formatPrice(o.price, o.currency) : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">{o.deadline || '—'}</td>
                    <td className="max-w-[220px] py-2.5 px-2 text-ink-muted">
                      <span className="line-clamp-2">{o.requirements || '—'}</span>
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

export function ContractorsResearch() {
  const [requests, setRequests] = useState<ResearchRequest[]>([]);
  const [offers, setOffers] = useState<ResearchOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Курс на сегодня — только для сравнения "дешевле всех" между валютами
  // (см. rankOffers). Не получилось подтянуть — не блокируем страницу,
  // просто предложения в других валютах, кроме USD, выпадут из сравнения
  // (см. convertToUsd: без курса возвращает null).
  const [rate, setRate] = useState<ExchangeRate | undefined>(undefined);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ResearchRequest | null>(null);
  const [requestTitle, setRequestTitle] = useState('');
  const [savingRequest, setSavingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerRequestId, setOfferRequestId] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<ResearchOffer | null>(null);
  const [offerForm, setOfferForm] = useState(emptyOfferForm);
  const [savingOffer, setSavingOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchResearchRequests(), fetchResearchOffers()])
      .then(([r, o]) => {
        setRequests(r);
        setOffers(o);
      })
      .catch((err) => setLoadError(errorMessage(err, 'Не удалось загрузить ресерч')))
      .finally(() => setLoading(false));
    fetchTodayRate()
      .then(setRate)
      .catch(() => setRate(undefined));
  }, []);

  function openAddRequest() {
    setEditingRequest(null);
    setRequestTitle('');
    setRequestError(null);
    setRequestModalOpen(true);
  }

  function openEditRequest(r: ResearchRequest) {
    setEditingRequest(r);
    setRequestTitle(r.title);
    setRequestError(null);
    setRequestModalOpen(true);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestTitle.trim() || savingRequest) return;
    setSavingRequest(true);
    setRequestError(null);
    try {
      if (editingRequest) {
        const updated = await updateResearchRequest(editingRequest.id, requestTitle.trim());
        setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      } else {
        const created = await insertResearchRequest(requestTitle.trim());
        setRequests((prev) => [created, ...prev]);
      }
      setRequestModalOpen(false);
    } catch (err) {
      setRequestError(errorMessage(err, 'Не удалось сохранить запрос'));
    } finally {
      setSavingRequest(false);
    }
  }

  async function handleDeleteRequest(r: ResearchRequest) {
    if (!window.confirm(`Удалить запрос «${r.title}» вместе со всеми предложениями?`)) return;
    try {
      await deleteResearchRequest(r.id);
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

  function openEditOffer(o: ResearchOffer) {
    setOfferRequestId(o.requestId);
    setEditingOffer(o);
    setOfferForm({
      name: o.name,
      contactMethod: o.contactMethod,
      contact: o.contact,
      price: o.price ? String(o.price) : '',
      currency: o.currency,
      deadline: o.deadline,
      requirements: o.requirements,
    });
    setOfferError(null);
    setOfferModalOpen(true);
  }

  // Владелец, 2026-09-04: "нужна возможность вносить подрядчиков без
  // указания стоимости" — раньше цена > 0 была обязательна (и HTML
  // required на самом инпуте, независимо от этой проверки), из-за чего
  // приходилось вписывать фиктивную цену вроде "$1", лишь бы форма
  // сохранилась. Строка без цены сама по себе не считается "дешевле всех"
  // (см. rankOffers выше — o.price > 0 отсекает такие из сравнения) и в
  // таблице просто показывает "—" вместо суммы.
  const canSubmitOffer = !!offerForm.name.trim();

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitOffer || savingOffer || !offerRequestId) return;
    setSavingOffer(true);
    setOfferError(null);
    const payload = {
      requestId: offerRequestId,
      name: offerForm.name.trim(),
      contactMethod: offerForm.contactMethod,
      contact: offerForm.contact.trim(),
      price: Number(offerForm.price),
      currency: offerForm.currency,
      deadline: offerForm.deadline.trim(),
      requirements: offerForm.requirements.trim(),
    };
    try {
      if (editingOffer) {
        const updated = await updateResearchOffer(editingOffer.id, payload);
        setOffers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      } else {
        const created = await insertResearchOffer(payload);
        setOffers((prev) => [...prev, created]);
      }
      setOfferModalOpen(false);
    } catch (err) {
      setOfferError(errorMessage(err, 'Не удалось сохранить предложение'));
    } finally {
      setSavingOffer(false);
    }
  }

  async function handleDeleteOffer(o: ResearchOffer) {
    if (!window.confirm(`Удалить предложение «${o.name}»?`)) return;
    setDeletingOfferId(o.id);
    try {
      await deleteResearchOffer(o.id);
      setOffers((prev) => prev.filter((x) => x.id !== o.id));
    } catch (err) {
      setLoadError(errorMessage(err, 'Не удалось удалить предложение'));
    } finally {
      setDeletingOfferId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button icon={<Plus className="h-4 w-4" />} onClick={openAddRequest}>
          Новый запрос
        </Button>
      </div>

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем ресерч...
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

      <Modal open={requestModalOpen} onClose={() => setRequestModalOpen(false)} title={editingRequest ? 'Переименовать запрос' : 'Новый запрос'}>
        <form onSubmit={submitRequest} className="flex flex-col gap-4">
          <Input
            label="Название запроса"
            placeholder="Например, Поиск оценки здания"
            value={requestTitle}
            onChange={(e) => setRequestTitle(e.target.value)}
            required
            autoFocus
          />
          {requestError && <p className="text-sm text-danger">{requestError}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setRequestModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={!requestTitle.trim() || savingRequest}>
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
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Стоимость</span>
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
    </div>
  );
}
