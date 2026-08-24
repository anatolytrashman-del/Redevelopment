import { useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Phone } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';
import { formatPhoneDisplay } from '../../lib/formatPhone';
import type { ResearchRequest, ResearchOffer } from '../../data/contractorResearch';
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

function formatPrice(price: number): string {
  return `$${price.toLocaleString('ru-RU')}`;
}

const emptyOfferForm = { name: '', phone: '', price: '', deadline: '', requirements: '' };

// Сравнение предложений на одну задачу (владелец: "1 запрос — 1 карточка",
// пример — поиск оценки здания). Внутри карточки — предложения разных
// исполнителей; дешевле всех — наверх и зелёным (владелец выбирает чаще
// всего по цене). Предложения без цены (ещё не заполнена) идут в конце,
// участвовать в сравнении "дешевле всех" не могут — # 0 не должен ложно
// побеждать как "самая низкая цена".
function sortOffersByPrice(offers: ResearchOffer[]): ResearchOffer[] {
  const priced = offers.filter((o) => o.price > 0).sort((a, b) => a.price - b.price);
  const unpriced = offers.filter((o) => !(o.price > 0));
  return [...priced, ...unpriced];
}

function RequestCard({
  request,
  offers,
  onEditRequest,
  onDeleteRequest,
  onAddOffer,
  onEditOffer,
  onDeleteOffer,
  deletingOfferId,
}: {
  request: ResearchRequest;
  offers: ResearchOffer[];
  onEditRequest: (r: ResearchRequest) => void;
  onDeleteRequest: (r: ResearchRequest) => void;
  onAddOffer: (requestId: string) => void;
  onEditOffer: (o: ResearchOffer) => void;
  onDeleteOffer: (o: ResearchOffer) => void;
  deletingOfferId: string | null;
}) {
  const sorted = sortOffersByPrice(offers);
  const cheapestId = sorted.find((o) => o.price > 0)?.id;

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
                <th className="py-2 px-2 text-left">Телефон</th>
                <th className="py-2 px-2 text-right">Стоимость</th>
                <th className="py-2 px-2 text-left">Срок</th>
                <th className="py-2 px-2 text-left">Требования</th>
                <th className="py-2 pl-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((o) => {
                const isCheapest = o.id === cheapestId;
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
                      {o.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {formatPhoneDisplay(o.phone)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cn('py-2.5 px-2 text-right tabular-nums font-semibold', isCheapest ? 'text-success' : 'text-ink')}>
                      {o.price > 0 ? formatPrice(o.price) : '—'}
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
      phone: o.phone,
      price: o.price ? String(o.price) : '',
      deadline: o.deadline,
      requirements: o.requirements,
    });
    setOfferError(null);
    setOfferModalOpen(true);
  }

  const canSubmitOffer = offerForm.name.trim() && Number(offerForm.price) > 0;

  async function submitOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitOffer || savingOffer || !offerRequestId) return;
    setSavingOffer(true);
    setOfferError(null);
    const payload = {
      requestId: offerRequestId,
      name: offerForm.name.trim(),
      phone: offerForm.phone.trim(),
      price: Number(offerForm.price),
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
          <Input
            label="Контактный телефон"
            placeholder="+375 29 ..."
            type="tel"
            value={offerForm.phone}
            onChange={(e) => setOfferForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Стоимость, $"
              placeholder="0"
              type="number"
              min="0"
              value={offerForm.price}
              onChange={(e) => setOfferForm((f) => ({ ...f, price: e.target.value }))}
              required
            />
            <Input
              label="Срок"
              placeholder="Например, 5 дней"
              value={offerForm.deadline}
              onChange={(e) => setOfferForm((f) => ({ ...f, deadline: e.target.value }))}
            />
          </div>
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
