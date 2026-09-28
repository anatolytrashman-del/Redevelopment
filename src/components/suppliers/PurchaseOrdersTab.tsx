import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, FileDown, Loader2, Package, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { formatMoney } from './priceComparisonModel';
import { purchaseItemTotal } from '../../data/purchases';
import {
  PURCHASE_ORDER_STATUS_LABELS,
  purchaseOrderItemsTotal,
  type PurchaseOrder,
  type PurchaseOrderEvent,
  type PurchaseOrderStatus,
} from '../../data/purchaseOrders';
import {
  deletePurchaseOrder,
  fetchPurchaseOrderEvents,
  fetchPurchaseOrders,
  fetchPurchaseOrdersBySupplier,
  updatePurchaseOrder,
  updatePurchaseOrderItems,
  updatePurchaseOrderStatus,
} from '../../lib/purchaseOrdersApi';
import {
  deliveryProgress,
  PURCHASE_DELIVERY_STATUS_LABELS,
  RECEIVED_STATUSES,
  receivedByItem,
  type PurchaseDelivery,
} from '../../data/purchaseDeliveries';
import { uploadObjectDocument } from '../../lib/objectsApi';
import { fetchPurchaseDeliveriesByOrders } from '../../lib/purchaseDeliveriesApi';
import { fetchPurchaseReceivers } from '../../lib/purchaseReceiversApi';
import type { PurchaseReceiver } from '../../data/purchaseReceivers';
import type { DocumentFile } from '../../data/contractorDocuments';
import { DeliveryForm } from './PurchaseDeliveries';
import { DeliveryAddressField } from './DeliveryAddressField';
import {
  persistReceiverDraft,
  receiverDraftFrom,
  ReceiverPicker,
  EMPTY_RECEIVER_DRAFT,
  type ReceiverDraft,
} from './PurchaseReceiverPicker';
import type { PurchaseDocument } from '../../data/purchaseDocuments';
import { fetchApprovalDocumentsByOrders } from '../../lib/purchaseDocumentsApi';
import type { PurchaseDeliveryAddress } from '../../data/purchaseDeliveryAddresses';
import { fetchPurchaseDeliveryAddresses } from '../../lib/purchaseDeliveryAddressesApi';
import { deliveryAddressFromInfo } from '../../data/legalEntities';
import { fetchLegalEntities } from '../../lib/legalEntitiesApi';

// Заказы поставщикам как раздел интерфейса (шаг 11b плана
// docs/procurement-product-steps.md). Сами заказы рождаются на вкладке
// «Сравнение цен» кнопкой «Сформировать заказы» — здесь их видно все сразу,
// вне контекста конкретной категории закупки.
//
// Почему отдельный файл, а не блок в Suppliers.tsx: страница и так 3600
// строк, а вкладка самодостаточна — ей нужны только заказы, которые она
// грузит сама. Заодно тот же список переиспользует страница компании
// (SupplierOrdersSection ниже).
//
// Статусы здесь переводит только человек. Письмо-заказ, сверка счёта и
// плановый платёж — шаг 12, там перевод в «Заказано» будет делать отправка.

const ALL = 'Все';

// Цвет бейджа статуса. Тон 'primary' здесь сознательно не используется:
// фирменный красный (#e4152b) практически неотличим от danger (#d21e34), и
// «Заказано» выглядело бы такой же тревогой, как «Отменён». Поэтому шкала
// простая: серое — денег и движения нет, жёлтое — заказ в работе, зелёное —
// довели до конца, красное — есть проблема, с которой надо что-то делать.
function statusTone(status: PurchaseOrderStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'claim') return 'danger';
  if (status === 'draft' || status === 'cancelled') return 'neutral';
  if (status === 'accepted' || status === 'closed') return 'success';
  return 'warning';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Дата поставки в <input type="date"> — только YYYY-MM-DD. В базе колонка
// date, но PostgREST может вернуть её со временем, если когда-нибудь тип
// поменяется; режем на всякий случай здесь, а не молча показываем пустое поле.
function dateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

// ===========================================================================
// Список заказов
// ===========================================================================

function OrderRow({
  order,
  categoryTitle,
  deliveries,
  onOpen,
  showSupplier,
  actions,
}: {
  order: PurchaseOrder;
  categoryTitle: string | null;
  deliveries: PurchaseDelivery[];
  onOpen: () => void;
  showSupplier: boolean;
  // Кнопки этапа («Скачать PDF», «Согласовано») — рядом со строкой, а не
  // внутри неё: строка сама кнопка, вложенные кнопки HTML не допускает.
  actions?: ReactNode;
}) {
  // Значок «получено N из M» показываем только когда поставки вообще
  // заведены: у свежего заказа «получено 0 из 3» выглядело бы как проблема,
  // хотя везти ещё никто ничего не обещал.
  const progress = deliveryProgress(order.items, deliveries);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border first:border-t-0">
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-1 basis-80 flex-wrap items-center gap-x-3 gap-y-1 px-1 py-3 text-left text-sm hover:bg-surface-muted/60"
    >
      <span className="font-semibold tabular-nums text-ink">{order.number}</span>
      {showSupplier && <span className="min-w-0 truncate text-ink">{order.supplierName || 'Поставщик не назван'}</span>}
      {categoryTitle && <span className="min-w-0 truncate text-xs text-ink-muted">{categoryTitle}</span>}
      <span className="text-xs text-ink-muted">
        {order.items.length} поз.
        {order.delivery != null ? ` + доставка ${formatMoney(order.delivery, order.currency)}` : ''}
      </span>
      <span className="ml-auto font-semibold tabular-nums text-ink">{formatMoney(order.total, order.currency)}</span>
      {order.invoiceAmount != null && (
        <span className="text-xs text-ink-muted">по счёту {formatMoney(order.invoiceAmount, order.currency)}</span>
      )}
      <Badge tone={statusTone(order.status)}>{PURCHASE_ORDER_STATUS_LABELS[order.status]}</Badge>
      {deliveries.length > 0 && progress.total > 0 && (
        <Badge tone={progress.done === progress.total ? 'success' : progress.partial ? 'warning' : 'neutral'}>
          получено {progress.done}/{progress.total}
        </Badge>
      )}
      <span className="w-full text-[11px] text-ink-faint">
        {formatDate(order.createdAt)}
        {order.createdBy ? ` · ${order.createdBy}` : ''}
        {order.deliveryDue ? ` · поставка до ${formatDate(order.deliveryDue)}` : ''}
      </span>
    </button>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pb-3 sm:pb-0">{actions}</div>}
    </div>
  );
}

// ===========================================================================
// Карточка заказа
// ===========================================================================

function PurchaseOrderModal({
  order,
  categoryTitle,
  deliveries,
  onDeliveriesChange,
  onClose,
  onChanged,
  onDeleted,
}: {
  order: PurchaseOrder;
  categoryTitle: string | null;
  deliveries: PurchaseDelivery[];
  onDeliveriesChange: (next: PurchaseDelivery[]) => void;
  onClose: () => void;
  onChanged: (next: PurchaseOrder) => void;
  onDeleted: (id: string) => void;
}) {
  const [events, setEvents] = useState<PurchaseOrderEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress);
  const [deliveryDue, setDeliveryDue] = useState(dateInputValue(order.deliveryDue));
  const [invoiceNumber, setInvoiceNumber] = useState(order.invoiceNumber);
  const [invoiceDate, setInvoiceDate] = useState(dateInputValue(order.invoiceDate));
  const [invoiceAmount, setInvoiceAmount] = useState(order.invoiceAmount == null ? '' : String(order.invoiceAmount));
  const [paymentNumber, setPaymentNumber] = useState(order.paymentNumber);
  const [paymentDate, setPaymentDate] = useState(dateInputValue(order.paymentDate));
  const [paymentAmount, setPaymentAmount] = useState(order.paymentAmount == null ? '' : String(order.paymentAmount));
  const [poaNumber, setPoaNumber] = useState(order.poaNumber);
  const [poaDate, setPoaDate] = useState(dateInputValue(order.poaDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Журнал перечитывается после смены статуса: событие пишет триггер в базе,
  // фронт его не знает и выдумывать не должен.
  const [journalTick, setJournalTick] = useState(0);
  // Принимающие лица, адреса-шаблоны и документы: списки короткие, грузятся
  // один раз на открытие карточки.
  const [receivers, setReceivers] = useState<PurchaseReceiver[]>([]);
  const [receiver, setReceiver] = useState<ReceiverDraft>(EMPTY_RECEIVER_DRAFT);
  // Правка лица не отслеживается сравнением с шаблоном: список приезжает
  // асинхронно, и до его приезда любое сравнение показывало бы «изменено».
  const [receiverTouched, setReceiverTouched] = useState(false);
  const [addresses, setAddresses] = useState<PurchaseDeliveryAddress[]>([]);
  // Адрес объекта из «Информации по доставке» юрлица заказа — тот самый
  // текст, который уходит поставщику вложением.
  const [entityAddress, setEntityAddress] = useState('');
  // null — карточка заказа, объект — открыта форма поставки ВМЕСТО неё
  // (delivery: null — новая поставка).
  const [editing, setEditing] = useState<{ delivery: PurchaseDelivery | null } | null>(null);
  // Какое из полей доставки сейчас открыто на правку.
  const [editField, setEditField] = useState<'address' | 'due' | 'receiver' | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPurchaseOrderEvents(order.id)
      .then((list) => {
        if (alive) {
          setEvents(list);
          setEventsError(null);
        }
      })
      .catch((e) => alive && setEventsError(errorMessage(e, 'Не удалось загрузить журнал заказа')));
    return () => {
      alive = false;
    };
  }, [order.id, journalTick]);

  useEffect(() => {
    let alive = true;
    fetchPurchaseReceivers()
      .then((list) => {
        if (!alive) return;
        setReceivers(list);
        setReceiver(receiverDraftFrom(list.find((r) => r.id === order.receiverId)));
      })
      .catch(() => {
        // Без справочника форма всё равно работает: лицо вводится руками и
        // сохранится как новый шаблон.
      });
    fetchPurchaseDeliveryAddresses()
      .then((list) => alive && setAddresses(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [order.receiverId]);

  // Адрес доставки из карточки юрлица: подставляем в пустое поле, чтобы его
  // не набирали руками по памяти (в живом заказе так появилось «Зеленый»
  // вместо полного адреса объекта). Непустой адрес не трогаем — человек мог
  // указать другую точку выгрузки.
  useEffect(() => {
    let alive = true;
    if (!order.legalEntityId) return;
    fetchLegalEntities()
      .then((list) => {
        if (!alive) return;
        const entity = list.find((e) => e.id === order.legalEntityId);
        const address = entity ? deliveryAddressFromInfo(entity.deliveryInfo) : '';
        setEntityAddress(address);
        if (address && !order.deliveryAddress.trim()) setDeliveryAddress(address);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [order.legalEntityId, order.deliveryAddress]);

  // Сохранение по кускам: каждая плашка и каждое поле доставки сохраняются
  // своей кнопкой «Готово», общей кнопки «Сохранить» больше нет (владелец,
  // 2026-09-28: карточка была узкой и с лишними полями).
  async function savePatch(patch: Parameters<typeof updatePurchaseOrder>[1]): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      onChanged(await updatePurchaseOrder(order.id, patch));
      return true;
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сохранить заказ'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveReceiver(): Promise<boolean> {
    try {
      // Лицо сохраняется шаблоном до заказа: заказу нужен его id.
      const persisted = await persistReceiverDraft(receiver, receivers, order.legalEntityId);
      if (persisted.receivers !== receivers) setReceivers(persisted.receivers);
      const ok = await savePatch({ receiverId: persisted.receiverId });
      if (ok) {
        setReceiver((prev) => ({ ...prev, receiverId: persisted.receiverId }));
        setReceiverTouched(false);
      }
      return ok;
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сохранить ответственного'));
      return false;
    }
  }

  // Нечисловую сумму не пишем: колонка numeric, и строка «оплачено» уедет
  // ошибкой уже на сервере.
  function amountOrNull(value: string): number | null {
    const v = value.replace(/\s/g, '').replace(',', '.');
    return v && Number.isFinite(Number(v)) ? Number(v) : null;
  }

  // Файлы сохраняются сразу при загрузке: человек бросил документ на плашку
  // и ушёл дальше, а файл уже должен быть на заказе.
  async function saveFile(field: 'invoiceFile' | 'paymentFile' | 'poaFile', file: DocumentFile | null) {
    setError(null);
    try {
      let next = await updatePurchaseOrder(order.id, { [field]: file });
      // Приложили платёжку к заказу, который ещё ждёт оплаты, — значит,
      // оплачен (владелец, 2026-09-28: этапы «К оплате» → «Едут»).
      if (field === 'paymentFile' && file && (next.status === 'draft' || next.status === 'ordered' || next.status === 'invoiced')) {
        next = await updatePurchaseOrderStatus(order.id, 'paid');
        setJournalTick((v) => v + 1);
      }
      onChanged(next);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сохранить файл'));
    }
  }

  async function changeStatus(status: PurchaseOrderStatus) {
    if (status === order.status) return;
    setError(null);
    setSaving(true);
    try {
      const next = await updatePurchaseOrderStatus(order.id, status);
      onChanged(next);
      setJournalTick((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сменить статус заказа'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    // Подтверждение не формальность: заказ мог быть уже оплачен, а удаление
    // мягкое — строка останется в базе, но из интерфейса исчезнет.
    if (!window.confirm(`Удалить заказ ${order.number}? Он пропадёт из списка, но останется в базе.`)) return;
    setError(null);
    try {
      await deletePurchaseOrder(order.id);
      onDeleted(order.id);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось удалить заказ'));
    }
  }

  // Удаление одной позиции из заказа — когда часть отобранного у поставщика
  // по факту стала неактуальной (заказали в другом месте), а весь заказ
  // из-за этого не отменяют. total пересчитывается сразу (updatePurchaseOrderItems).
  async function removeItem(itemId: string) {
    const item = order.items.find((it) => it.id === itemId);
    if (!item) return;
    if (!window.confirm(`Убрать позицию «${item.name}» из заказа?`)) return;
    setError(null);
    try {
      const next = await updatePurchaseOrderItems(
        order.id,
        order.items.filter((it) => it.id !== itemId),
        order.delivery,
      );
      onChanged(next);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось убрать позицию'));
    }
  }

  const itemsTotal = purchaseOrderItemsTotal(order.items);
  const received = receivedByItem(deliveries);
  const amounts = deliveryAmounts(order.items, received);

  if (editing) {
    return (
      <Modal open onClose={onClose} title={<span className="min-w-0 break-words">Поставка · {order.number}</span>}>
        <DeliveryForm
          order={order}
          delivery={editing.delivery}
          deliveries={deliveries}
          receivers={receivers}
          onReceiversChange={setReceivers}
          onSaved={(saved) => {
            const exists = deliveries.some((d) => d.id === saved.id);
            onDeliveriesChange(exists ? deliveries.map((d) => (d.id === saved.id ? saved : d)) : [...deliveries, saved]);
            setEditing(null);
          }}
          onDeleted={(id) => {
            onDeliveriesChange(deliveries.filter((d) => d.id !== id));
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      </Modal>
    );
  }

  // Этап заказа — те же четыре шага, что группы на вкладке «Заказы».
  const stage = stageStatus(order);
  const cancelled = stage === 'cancelled';
  const approved = stage !== 'draft' && !cancelled;
  const paid = ['paid', 'shipped', 'claim', 'delivered', 'accepted', 'closed'].includes(stage);
  const delivered = ['delivered', 'accepted', 'closed'].includes(stage);
  const current = !approved ? 0 : !paid ? 1 : !delivered ? 2 : 4;
  const steps = [
    approved ? 'Согласован' : 'Согласовать',
    paid ? `Оплачен${order.paymentDate ? ` ${shortDate(order.paymentDate)}` : ''}` : 'Оплатить',
    current === 2 && amounts.label ? `Едет · ${amounts.label}` : 'Едет',
    'Доставлен',
  ];

  const invoiceDiff = order.invoiceAmount != null ? order.invoiceAmount - order.total : 0;
  const receiverName = receiver.name.trim();

  const sortedDeliveries = [...deliveries].sort((a, b) =>
    (a.deliveredAt ?? a.plannedDate ?? a.createdAt ?? '').localeCompare(b.deliveredAt ?? b.plannedDate ?? b.createdAt ?? ''),
  );
  const shownEvents = showAllEvents ? [...events].reverse() : [...events].reverse().slice(0, 2);

  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <span className="min-w-0 break-words">{order.supplierName || 'Поставщик не назван'}</span>
          <span className="text-base font-semibold tabular-nums text-ink-faint">{order.number}</span>
        </span>
      }
    >
      <div className="-mt-3 flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {[categoryTitle, `создан ${formatDate(order.createdAt)}`, order.createdBy].filter(Boolean).join(' · ')}
        </p>

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {cancelled ? (
            <Badge tone="neutral">Отменён</Badge>
          ) : (
            <div className="-mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
            {steps.map((label, i) => (
              // На телефоне виден только текущий шаг: четыре не помещаются в строку.
              <div key={i} className={cn('items-center gap-1.5', i === current ? 'flex' : 'hidden sm:flex')}>
                {i > 0 && <span className="hidden h-0.5 w-4 bg-border sm:block" />}
                <span
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold',
                    i < current && 'bg-success/10 text-success',
                    i === current && 'bg-ink text-white',
                    i > current && 'bg-surface-muted text-ink-faint',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                      i < current && 'bg-success text-white',
                      i === current && 'bg-white text-ink',
                      i > current && 'border border-border bg-white',
                    )}
                  >
                    {i < current ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  {label}
                </span>
              </div>
            ))}
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!cancelled && !delivered && (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  if (window.confirm(`Отменить заказ ${order.number}?`)) void changeStatus('cancelled');
                }}
              >
                Отменить
              </Button>
            )}
            <button
              type="button"
              onClick={() => void remove()}
              aria-label="Удалить заказ"
              title="Удалить заказ"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-faint hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {current === 0 && !cancelled && (
              <Button type="button" icon={<Check className="h-4 w-4" />} disabled={saving} onClick={() => void changeStatus('ordered')}>
                Согласовано
              </Button>
            )}
            {current === 1 && <span className="text-sm text-ink-muted">Приложите платёжку — заказ уйдёт в «Едут»</span>}
            {current === 2 && (
              <Button type="button" icon={<Check className="h-4 w-4" />} disabled={saving} onClick={() => void changeStatus('delivered')}>
                Доставлено
              </Button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className={sectionClass}>
              <div className={captionClass}>
                <span>Позиции · {order.items.length}</span>
              </div>
              {order.items.length === 0 ? (
                <p className="text-sm text-ink-muted">Позиций нет.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11.5px] text-ink-faint">
                      <th className="pb-2 text-left font-semibold">Позиция</th>
                      <th className="hidden pb-2 text-right font-semibold sm:table-cell">Объём × цена</th>
                      <th className="pb-2 text-right font-semibold">Сумма</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => {
                      const got = received.get(item.id) ?? 0;
                      const full = item.quantity != null && got + 0.01 >= item.quantity;
                      return (
                        <tr key={item.id} className="group border-b border-border align-top">
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-ink">{item.name}</div>
                            {item.note && <div className="mt-0.5 text-xs text-ink-muted">{item.note}</div>}
                            <div className="mt-0.5 text-xs text-ink-muted sm:hidden">
                              {item.quantity ?? '—'} {item.unit} × {item.price != null ? formatMoney(item.price, order.currency) : '—'}
                            </div>
                            {got > 0 && item.quantity != null && (
                              <div className={cn('mt-0.5 text-xs', full ? 'text-success' : 'text-warning')}>
                                привезли {roundQty(got)} из {item.quantity} {item.unit}
                              </div>
                            )}
                          </td>
                          <td className="hidden whitespace-nowrap py-3 text-right tabular-nums text-ink-muted sm:table-cell">
                            {item.quantity ?? '—'} {item.unit} × {item.price != null ? formatMoney(item.price, order.currency) : '—'}
                          </td>
                          <td className="whitespace-nowrap py-3 pl-4 text-right font-semibold tabular-nums text-ink">
                            {formatMoney(purchaseItemTotal(item), order.currency)}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void removeItem(item.id)}
                              aria-label="Убрать позицию из заказа"
                              title="Убрать позицию из заказа"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-faint opacity-60 hover:text-danger group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
                <dt className="text-ink-muted">Позиции</dt>
                <dd className="text-right text-ink">{formatMoney(itemsTotal, order.currency)}</dd>
                {order.delivery != null && (
                  <>
                    <dt className="text-ink-muted">Доставка</dt>
                    <dd className="text-right text-ink">{formatMoney(order.delivery, order.currency)}</dd>
                  </>
                )}
                <dt className="text-lg font-extrabold text-ink">Итого</dt>
                <dd className="text-right text-lg font-extrabold text-ink">{formatMoney(order.total, order.currency)}</dd>
                {order.invoiceAmount != null && (
                  <>
                    <dt className="text-ink-muted">По счёту</dt>
                    <dd className={cn('text-right', Math.abs(invoiceDiff) >= 1 ? 'font-semibold text-warning' : 'text-ink')}>
                      {formatMoney(order.invoiceAmount, order.currency)}
                      {Math.abs(invoiceDiff) >= 1 && ` · ${invoiceDiff > 0 ? '+' : '−'}${formatMoney(Math.abs(invoiceDiff), order.currency)}`}
                    </dd>
                  </>
                )}
              </dl>
              {order.comment && <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink-muted">{order.comment}</p>}
            </section>

            {/* Доставка: куда, когда, кто принимает — и машины. Ответственный и
                доверенность лежат на ЗАКАЗЕ и наследуются поставками — обычно
                принимает один и тот же человек по одной доверенности. */}
            <section className={sectionClass}>
              <div className={captionClass}>
                <span>Доставка</span>
                {amounts.label && (
                  <span className={cn('normal-case tracking-normal', amounts.done ? 'text-success' : 'text-warning')}>
                    привезли {amounts.label}
                  </span>
                )}
              </div>
              {amounts.share != null && (
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full bg-success" style={{ width: `${Math.round(amounts.share * 100)}%` }} />
                </div>
              )}

              <div className="flex flex-col divide-y divide-border text-sm">
                <InlineField
                  label="Куда"
                  value={order.deliveryAddress}
                  placeholder="Укажите адрес"
                  open={editField === 'address'}
                  saving={saving}
                  onOpen={() => setEditField('address')}
                  onCancel={() => {
                    setDeliveryAddress(order.deliveryAddress);
                    setEditField(null);
                  }}
                  onDone={async () => (await savePatch({ deliveryAddress })) && setEditField(null)}
                >
                  <DeliveryAddressField
                    value={deliveryAddress}
                    onChange={setDeliveryAddress}
                    addresses={addresses}
                    onAddressesChange={setAddresses}
                    legalEntityId={order.legalEntityId}
                    entityAddress={entityAddress}
                  />
                </InlineField>
                <InlineField
                  label="Когда"
                  value={order.deliveryDue ? `до ${formatDate(order.deliveryDue)}` : ''}
                  placeholder="Укажите срок"
                  open={editField === 'due'}
                  saving={saving}
                  onOpen={() => setEditField('due')}
                  onCancel={() => {
                    setDeliveryDue(dateInputValue(order.deliveryDue));
                    setEditField(null);
                  }}
                  onDone={async () => (await savePatch({ deliveryDue: deliveryDue || null })) && setEditField(null)}
                >
                  <Input label="Поставка до" type="date" value={deliveryDue} onChange={(e) => setDeliveryDue(e.target.value)} />
                </InlineField>
                <InlineField
                  label="Принимает"
                  value={receiverName ? `${receiverName}${receiver.phone ? ` · ${receiver.phone}` : ''}` : ''}
                  placeholder="Укажите, кто встречает"
                  open={editField === 'receiver'}
                  saving={saving}
                  onOpen={() => setEditField('receiver')}
                  onCancel={() => {
                    setReceiver(receiverDraftFrom(receivers.find((r) => r.id === order.receiverId)));
                    setReceiverTouched(false);
                    setEditField(null);
                  }}
                  onDone={async () => (!receiverTouched || (await saveReceiver())) && setEditField(null)}
                >
                  <ReceiverPicker
                    receivers={receivers}
                    value={receiver}
                    onChange={(next) => {
                      setReceiver(next);
                      setReceiverTouched(true);
                    }}
                  />
                </InlineField>
              </div>

              <div className="mt-3 flex flex-col gap-2.5 border-t border-border pt-3">
                {sortedDeliveries.map((delivery, i) => {
                  const arrived = RECEIVED_STATUSES.includes(delivery.status);
                  const qty = deliveryQuantityLabel(order.items, delivery);
                  return (
                    <button
                      key={delivery.id}
                      type="button"
                      onClick={() => setEditing({ delivery })}
                      className="flex items-start gap-2.5 rounded-xl px-1 py-1 text-left text-sm hover:bg-surface-muted"
                    >
                      <span className={cn('mt-0.5 w-4 shrink-0 text-center', arrived ? 'text-success' : 'text-ink-faint')}>
                        {arrived ? <Check className="h-4 w-4" /> : '○'}
                      </span>
                      <span className="min-w-0">
                        <span className={cn('block font-semibold', arrived ? 'text-ink' : 'text-ink-muted')}>
                          Машина {i + 1} ·{' '}
                          {delivery.deliveredAt
                            ? shortDate(delivery.deliveredAt)
                            : delivery.plannedDate
                              ? `ждём ${shortDate(delivery.plannedDate)}`
                              : PURCHASE_DELIVERY_STATUS_LABELS[delivery.status].toLowerCase()}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {[qty, delivery.receiverName && `принял ${delivery.receiverName}`, delivery.comment]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {amounts.restLabel && sortedDeliveries.length > 0 && (
                  <div className="flex items-start gap-2.5 px-1 text-sm">
                    <span className="mt-0.5 w-4 shrink-0 text-center text-ink-faint">○</span>
                    <span>
                      <span className="block font-semibold text-ink-muted">Остаток · {amounts.restLabel}</span>
                      <span className="block text-xs text-ink-muted">ещё не приехало</span>
                    </span>
                  </div>
                )}
                <div>
                  <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ delivery: null })}>
                    Приехала машина
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <DocPlaque
              caption="Счёт"
              file={order.invoiceFile}
              emptyLabel="Перетащите счёт или нажмите"
              summary={docSummary('Счёт', order.invoiceNumber, order.invoiceDate, order.invoiceAmount != null ? formatMoney(order.invoiceAmount, order.currency) : '')}
              onFile={(f) => saveFile('invoiceFile', f)}
              saving={saving}
              onReset={() => {
                setInvoiceNumber(order.invoiceNumber);
                setInvoiceDate(dateInputValue(order.invoiceDate));
                setInvoiceAmount(order.invoiceAmount == null ? '' : String(order.invoiceAmount));
              }}
              onSave={() =>
                savePatch({ invoiceNumber, invoiceDate: invoiceDate || null, invoiceAmount: amountOrNull(invoiceAmount) })
              }
            >
              <Input label="Номер" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="1806" />
              <Input label="Дата" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              <Input label="Сумма" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} inputMode="decimal" placeholder={String(order.total)} />
            </DocPlaque>

            <DocPlaque
              caption="Оплата"
              badge={paid ? 'оплачено' : undefined}
              file={order.paymentFile}
              emptyLabel="Перетащите платёжку или нажмите"
              summary={docSummary('Платёжка', order.paymentNumber, order.paymentDate, order.paymentAmount != null ? formatMoney(order.paymentAmount, order.currency) : '')}
              onFile={(f) => saveFile('paymentFile', f)}
              saving={saving}
              onReset={() => {
                setPaymentNumber(order.paymentNumber);
                setPaymentDate(dateInputValue(order.paymentDate));
                setPaymentAmount(order.paymentAmount == null ? '' : String(order.paymentAmount));
              }}
              onSave={() =>
                savePatch({ paymentNumber, paymentDate: paymentDate || null, paymentAmount: amountOrNull(paymentAmount) })
              }
            >
              <Input label="Номер" value={paymentNumber} onChange={(e) => setPaymentNumber(e.target.value)} placeholder="422" />
              <Input label="Дата" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <Input label="Сумма" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} inputMode="decimal" placeholder={String(order.total)} />
            </DocPlaque>

            <DocPlaque
              caption="Доверенность"
              file={order.poaFile}
              emptyLabel="Перетащите доверенность или нажмите"
              summary={docSummary('Доверенность', order.poaNumber, order.poaDate, receiverName ? `на ${receiverName}` : '')}
              onFile={(f) => saveFile('poaFile', f)}
              saving={saving}
              onReset={() => {
                setPoaNumber(order.poaNumber);
                setPoaDate(dateInputValue(order.poaDate));
              }}
              onSave={() => savePatch({ poaNumber, poaDate: poaDate || null })}
            >
              <Input label="Номер" value={poaNumber} onChange={(e) => setPoaNumber(e.target.value)} placeholder="14" />
              <Input label="Дата" type="date" value={poaDate} onChange={(e) => setPoaDate(e.target.value)} />
            </DocPlaque>

            <section className={sectionClass}>
              <div className={captionClass}>
                <span>История</span>
                {events.length > 2 && (
                  <button type="button" onClick={() => setShowAllEvents((v) => !v)} className="flex items-center gap-1 normal-case tracking-normal text-ink-muted hover:text-ink">
                    {showAllEvents ? 'свернуть' : `все ${events.length}`}
                    <ChevronDown className={cn('h-3.5 w-3.5', showAllEvents && 'rotate-180')} />
                  </button>
                )}
              </div>
              {eventsError && <p className="text-xs text-danger">{eventsError}</p>}
              {!eventsError && events.length === 0 && <p className="text-xs text-ink-muted">Событий пока нет.</p>}
              <div className="flex flex-col gap-1.5">
                {shownEvents.map((event) => (
                  <div key={event.id} className="text-[12.5px] text-ink-muted">
                    <span className="font-semibold text-ink">{formatDateTime(event.createdAt)}</span> ·{' '}
                    {event.toStatus ? PURCHASE_ORDER_STATUS_LABELS[event.toStatus] : event.note || event.kind}
                    {event.actor ? ` · ${event.actor}` : ''}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const sectionClass = 'rounded-2xl border border-border bg-white p-3.5 sm:p-5';
const captionClass =
  'mb-2.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint';

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// «Счёт № 1806 от 17.09 · 98 925 ₽» — из того, что заполнено.
function docSummary(title: string, number: string, date: string | null, extra: string): { title: string; meta: string } {
  const head = [title, number && `№ ${number}`, date && `от ${shortDate(date)}`].filter(Boolean).join(' ');
  return { title: head === title ? '' : head, meta: extra };
}

// Сколько привезли — в штуках, если у всех позиций одна единица (обычно
// так: «15 из 25 банок»), иначе в позициях.
function deliveryAmounts(items: PurchaseOrder['items'], received: Map<string, number>) {
  const measured = items.filter((it) => it.quantity != null && Number.isFinite(it.quantity) && it.quantity > 0);
  if (measured.length === 0) return { label: '', restLabel: '', share: null as number | null, done: false };
  const units = new Set(measured.map((it) => it.unit.trim()));
  if (units.size === 1) {
    const unit = [...units][0];
    const total = measured.reduce((s, it) => s + (it.quantity ?? 0), 0);
    const got = measured.reduce((s, it) => s + Math.min(received.get(it.id) ?? 0, it.quantity ?? 0), 0);
    const done = got + 0.01 >= total;
    return {
      label: got > 0 ? `${roundQty(got)} из ${roundQty(total)} ${unit}` : '',
      restLabel: done ? '' : `${roundQty(total - got)} ${unit}`,
      share: got > 0 ? got / total : null,
      done,
    };
  }
  const doneCount = measured.filter((it) => (received.get(it.id) ?? 0) + 0.01 >= (it.quantity ?? 0)).length;
  const started = measured.some((it) => (received.get(it.id) ?? 0) > 0);
  const done = doneCount === measured.length;
  return {
    label: started ? `${doneCount} из ${measured.length} позиций` : '',
    restLabel: done ? '' : `${measured.length - doneCount} поз.`,
    share: started ? doneCount / measured.length : null,
    done,
  };
}

function deliveryQuantityLabel(items: PurchaseOrder['items'], delivery: PurchaseDelivery): string {
  const lines = delivery.items.filter((l) => l.quantity != null && l.quantity > 0);
  if (lines.length === 0) return '';
  const units = new Set(lines.map((l) => items.find((it) => it.id === l.itemId)?.unit.trim() ?? ''));
  if (units.size === 1) {
    const sum = lines.reduce((s, l) => s + (l.quantity ?? 0), 0);
    return `${roundQty(sum)} ${[...units][0]}`.trim();
  }
  return `${lines.length} поз.`;
}

// Строка «Куда / Когда / Принимает»: значение текстом, по клику — поле и «Готово».
function InlineField({
  label,
  value,
  placeholder,
  open,
  saving,
  onOpen,
  onCancel,
  onDone,
  children,
}: {
  label: string;
  value: string;
  placeholder: string;
  open: boolean;
  saving: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onDone: () => void | Promise<unknown>;
  children: ReactNode;
}) {
  if (open) {
    return (
      <div className="flex flex-col gap-3 py-3">
        {children}
        <div className="flex gap-2">
          <Button type="button" disabled={saving} onClick={() => void onDone()}>
            {saving ? 'Сохраняем...' : 'Готово'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="group flex items-baseline gap-4 py-2.5 text-left">
      <span className="w-24 shrink-0 text-ink-muted">{label}</span>
      <span
        className={cn(
          'ml-auto min-w-0 border-b border-dashed border-ink-faint/60 text-right group-hover:border-ink',
          value ? 'font-semibold text-ink' : 'text-ink-faint',
        )}
      >
        {value || placeholder}
      </span>
    </button>
  );
}

// Плашка документа (счёт, платёжка, доверенность): файл одной строкой, а
// номер, дата и сумма — по кнопке «изменить». Файла нет — зона, куда его
// можно перетащить или выбрать.
function DocPlaque({
  caption,
  badge,
  file,
  emptyLabel,
  summary,
  onFile,
  saving,
  onReset,
  onSave,
  children,
}: {
  caption: string;
  badge?: string;
  file: DocumentFile | null;
  emptyLabel: string;
  summary: { title: string; meta: string };
  onFile: (file: DocumentFile | null) => Promise<void>;
  saving: boolean;
  onReset: () => void;
  onSave: () => Promise<boolean>;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(selected: File | null | undefined) {
    if (!selected) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onFile(await uploadObjectDocument(selected));
    } catch (e) {
      setUploadError(errorMessage(e, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
      // Сброс значения — иначе повторный выбор ТОГО ЖЕ файла не даёт события change.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <section className={sectionClass}>
      <div className={captionClass}>
        <span>{caption}</span>
        <span className="flex items-center gap-3 normal-case tracking-normal">
          {badge && <span className="text-success">{badge}</span>}
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="font-medium text-ink-muted hover:text-ink">
              изменить
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          {children}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (await onSave()) setEditing(false);
              }}
            >
              {saving ? 'Сохраняем...' : 'Готово'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onReset();
                setEditing(false);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : file ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted p-3">
          <a href={file.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-[10px] font-extrabold uppercase text-primary">
              {fileExt(file.fileName)}
            </span>
            <span className="min-w-0">
              <span className="block break-words text-[13.5px] font-semibold text-ink">{summary.title || file.fileName}</span>
              <span className="block truncate text-xs text-ink-muted">{summary.meta || (summary.title ? file.fileName : '')}</span>
            </span>
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label="Заменить файл"
            title="Заменить файл"
            className="shrink-0 text-ink-faint hover:text-ink"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void onFile(null)}
            aria-label="Убрать файл"
            title="Убрать файл"
            className="shrink-0 text-ink-faint hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          {(summary.title || summary.meta) && (
            <p className="mb-2 text-sm text-ink">
              {[summary.title, summary.meta].filter(Boolean).join(' · ')}
            </p>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void upload(e.dataTransfer.files?.[0]);
            }}
            disabled={uploading}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-4 py-4 text-sm text-ink-muted',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-ink-faint',
            )}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Загружаем...' : emptyLabel}
          </button>
        </>
      )}
      {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
    </section>
  );
}

function fileExt(name: string): string {
  const m = /\.([a-z0-9]{2,4})$/i.exec(name);
  return m ? m[1] : 'файл';
}

// списке, а не только в карточке, и дёргать базу по разу на строку ради него
// незачем. Ошибку глотаем молча — заказы важнее значка, и падать из-за него
// весь список не должен.
function useDeliveriesByOrder(orders: PurchaseOrder[]) {
  const [byOrder, setByOrder] = useState<Map<string, PurchaseDelivery[]>>(new Map());

  const ids = orders.map((o) => o.id).join(',');
  useEffect(() => {
    let alive = true;
    if (!ids) {
      setByOrder(new Map());
      return;
    }
    fetchPurchaseDeliveriesByOrders(ids.split(','))
      .then((list) => {
        if (!alive) return;
        const next = new Map<string, PurchaseDelivery[]>();
        for (const delivery of list) {
          const bucket = next.get(delivery.orderId);
          if (bucket) bucket.push(delivery);
          else next.set(delivery.orderId, [delivery]);
        }
        setByOrder(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ids]);

  function replace(orderId: string, next: PurchaseDelivery[]) {
    setByOrder((prev) => new Map(prev).set(orderId, next));
  }

  return { byOrder, replace };
}

const NO_DELIVERIES: PurchaseDelivery[] = [];

// Платёжка уже на заказе, а статус остался прежним (приложили до правила
// «платёжка → Оплачено», 2026-09-28) — по смыслу заказ оплачен и едет.
function stageStatus(order: PurchaseOrder): PurchaseOrderStatus {
  const unpaid = order.status === 'draft' || order.status === 'ordered' || order.status === 'invoiced';
  return unpaid && (order.paymentFile || order.paymentDate) ? 'paid' : order.status;
}

// Этапы вкладки «Заказы» (владелец, 2026-09-28): на согласовании → к оплате →
// едут → архив. Статусы в базе прежние, этап — просто их группа.
const ORDER_STAGES: { key: string; title: string; hint: string; empty: string; statuses: PurchaseOrderStatus[] }[] = [
  { key: 'approval', title: 'На согласовании', hint: 'ждут вашего «Согласовано»', empty: 'Пусто. Заказы попадают сюда из «Сравнения цен» кнопкой «Отправить на согласование».', statuses: ['draft'] },
  { key: 'pay', title: 'К оплате', hint: 'приложите платёжку — заказ уйдёт в «Едут»', empty: 'Нет заказов, ждущих оплаты.', statuses: ['ordered', 'invoiced'] },
  { key: 'transit', title: 'Едут', hint: 'оплачены, ждём поставку', empty: 'Ничего не едет.', statuses: ['paid', 'shipped', 'claim'] },
  { key: 'archive', title: 'Архив', hint: 'доставленные, закрытые и отменённые', empty: '', statuses: ['delivered', 'accepted', 'closed', 'cancelled'] },
];

// ===========================================================================
// Вкладка «Заказы» на странице «Закупки»
// ===========================================================================

export function PurchaseOrdersTab({ categoryTitleById }: { categoryTitleById: Map<string, string> }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const { byOrder, replace } = useDeliveriesByOrder(orders);

  useEffect(() => {
    let alive = true;
    fetchPurchaseOrders()
      .then((list) => {
        if (!alive) return;
        setOrders(list);
        setLoadError(null);
      })
      .catch((e) => alive && setLoadError(errorMessage(e, 'Не удалось загрузить заказы')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const supplierNames = useMemo(
    () => [...new Set(orders.map((o) => o.supplierName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [orders],
  );

  const visible = useMemo(() => orders.filter((o) => supplierFilter === ALL || o.supplierName === supplierFilter), [orders, supplierFilter]);

  // Листы согласования (PDF из «Отправить на согласование») — по заказам.
  const [approvalByOrder, setApprovalByOrder] = useState<Map<string, PurchaseDocument>>(new Map());
  const draftIds = useMemo(() => orders.filter((o) => o.status === 'draft').map((o) => o.id).join(','), [orders]);
  useEffect(() => {
    if (!draftIds) return;
    let alive = true;
    fetchApprovalDocumentsByOrders(draftIds.split(','))
      .then((docs) => {
        if (!alive) return;
        const map = new Map<string, PurchaseDocument>();
        for (const d of docs) if (!map.has(d.orderId)) map.set(d.orderId, d);
        setApprovalByOrder(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [draftIds]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function setStatus(order: PurchaseOrder, status: PurchaseOrderStatus) {
    setBusyId(order.id);
    setActionError(null);
    try {
      const next = await updatePurchaseOrderStatus(order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)));
    } catch (e) {
      setActionError(errorMessage(e, 'Не удалось сменить статус заказа'));
    } finally {
      setBusyId(null);
    }
  }

  const [archiveOpen, setArchiveOpen] = useState(false);

  const open = openId ? orders.find((o) => o.id === openId) ?? null : null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {loading && (
        <Card className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем заказы...
        </Card>
      )}
      {!loading && loadError && <Card className="py-10 text-center text-sm text-danger">{loadError}</Card>}

      {!loading && !loadError && orders.length === 0 && (
        <Card className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-muted">
          <Package className="h-5 w-5 text-ink-faint" />
          <span>
            Заказы появляются из «Сравнения цен» кнопкой «Отправить на согласование».
          </span>
        </Card>
      )}

      {!loading && !loadError && orders.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select options={[ALL, ...supplierNames]} value={supplierFilter} onChange={setSupplierFilter} pill triggerClassName="py-1.5 text-xs" />
          </div>
          {actionError && <p className="text-sm text-danger">{actionError}</p>}
          {ORDER_STAGES.map((stage) => {
            const list = visible.filter((o) => stage.statuses.includes(stageStatus(o)));
            const isArchive = stage.key === 'archive';
            if (list.length === 0 && isArchive) return null;
            const expanded = !isArchive || archiveOpen;
            return (
              <Card key={stage.key} className="flex flex-col p-4">
                <button
                  type="button"
                  disabled={!isArchive}
                  onClick={() => setArchiveOpen((v) => !v)}
                  className="flex items-baseline justify-between gap-2 text-left"
                >
                  <span className="text-sm font-bold text-ink">
                    {stage.title} · {list.length}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink-faint">
                    {stage.hint}
                    {isArchive && <ChevronDown className={cn('h-4 w-4 transition-transform', archiveOpen && 'rotate-180')} />}
                  </span>
                </button>
                {expanded && list.length === 0 && <p className="pt-3 text-sm text-ink-faint">{stage.empty}</p>}
                {expanded && list.length > 0 && (
                  <div className="mt-2 flex flex-col">
                    {list.map((order) => {
                      const approval = approvalByOrder.get(order.id);
                      const busy = busyId === order.id;
                      return (
                        <OrderRow
                          key={order.id}
                          order={order}
                          categoryTitle={order.requestId ? categoryTitleById.get(order.requestId) ?? null : null}
                          deliveries={byOrder.get(order.id) ?? NO_DELIVERIES}
                          onOpen={() => setOpenId(order.id)}
                          showSupplier
                          actions={
                            order.status === 'draft' ? (
                              <>
                                {approval && (
                                  <a
                                    href={approval.file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    download={approval.file.fileName}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink"
                                  >
                                    <FileDown className="h-3.5 w-3.5" />
                                    Скачать PDF
                                  </a>
                                )}
                                <Button type="button" icon={<Check className="h-4 w-4" />} disabled={busy} onClick={() => void setStatus(order, 'ordered')}>
                                  Согласовано
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`Отменить заказ ${order.number}?`)) void setStatus(order, 'cancelled');
                                  }}
                                >
                                  Отменить
                                </Button>
                              </>
                            ) : stageStatus(order) === 'ordered' || stageStatus(order) === 'invoiced' ? (
                              <Button type="button" variant="secondary" onClick={() => setOpenId(order.id)}>
                                Приложить платёжку
                              </Button>
                            ) : stageStatus(order) === 'paid' || order.status === 'shipped' ? (
                              <Button type="button" variant="secondary" icon={<Check className="h-4 w-4" />} disabled={busy} onClick={() => void setStatus(order, 'delivered')}>
                                Доставлено
                              </Button>
                            ) : undefined
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}

      {open && (
        <PurchaseOrderModal
          order={open}
          categoryTitle={open.requestId ? categoryTitleById.get(open.requestId) ?? null : null}
          deliveries={byOrder.get(open.id) ?? NO_DELIVERIES}
          onDeliveriesChange={(next) => replace(open.id, next)}
          onClose={() => setOpenId(null)}
          onChanged={(next) => setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)))}
          onDeleted={(id) => {
            setOrders((prev) => prev.filter((o) => o.id !== id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Раздел «Заказы и поставки» на странице компании
// ===========================================================================

export function SupplierOrdersSection({ supplierId }: { supplierId: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { byOrder, replace } = useDeliveriesByOrder(orders);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPurchaseOrdersBySupplier(supplierId)
      .then((list) => {
        if (!alive) return;
        setOrders(list);
        setLoadError(null);
      })
      .catch((e) => alive && setLoadError(errorMessage(e, 'Не удалось загрузить заказы компании')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [supplierId]);

  const open = openId ? orders.find((o) => o.id === openId) ?? null : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">Заказы и поставки</span>
        <span className="text-xs text-ink-faint">Заказы этой компании из утверждённых отборов</span>
      </div>
      {loading && (
        <div className="flex items-center gap-2 py-4 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем заказы...
        </div>
      )}
      {!loading && loadError && <p className="py-4 text-sm text-danger">{loadError}</p>}
      {!loading && !loadError && orders.length === 0 && (
        // У карточек, заведённых до шага 2 плана, supplier_id пуст — их
        // заказы видно только на «Закупках». Поэтому формулировка не
        // «заказов нет», а «здесь их нет».
        <p className="py-4 text-sm text-ink-muted">
          Заказов у этой компании пока нет. Они появляются из утверждённого листа на вкладке «Сравнение цен».
        </p>
      )}
      {!loading &&
        !loadError &&
        orders.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            categoryTitle={null}
            deliveries={byOrder.get(order.id) ?? NO_DELIVERIES}
            onOpen={() => setOpenId(order.id)}
            showSupplier={false}
          />
        ))}
      {open && (
        <PurchaseOrderModal
          order={open}
          categoryTitle={null}
          deliveries={byOrder.get(open.id) ?? NO_DELIVERIES}
          onDeliveriesChange={(next) => replace(open.id, next)}
          onClose={() => setOpenId(null)}
          onChanged={(next) => setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)))}
          onDeleted={(id) => {
            setOrders((prev) => prev.filter((o) => o.id !== id));
            setOpenId(null);
          }}
        />
      )}
    </Card>
  );
}
