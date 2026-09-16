import { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Trash2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { formatMoney } from './priceComparisonModel';
import { purchaseItemTotal } from '../../data/purchases';
import {
  PURCHASE_ORDER_STATUSES,
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
  updatePurchaseOrderStatus,
} from '../../lib/purchaseOrdersApi';

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
  onOpen,
  showSupplier,
}: {
  order: PurchaseOrder;
  categoryTitle: string | null;
  onOpen: () => void;
  showSupplier: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-1 py-3 text-left text-sm first:border-t-0 hover:bg-surface-muted/60"
    >
      <span className="font-semibold tabular-nums text-ink">{order.number}</span>
      {showSupplier && <span className="min-w-0 truncate text-ink">{order.supplierName || 'Поставщик не назван'}</span>}
      {categoryTitle && <span className="min-w-0 truncate text-xs text-ink-muted">{categoryTitle}</span>}
      <span className="text-xs text-ink-muted">
        {order.items.length} поз.
        {order.delivery != null ? ` + доставка ${formatMoney(order.delivery, order.currency)}` : ''}
      </span>
      <span className="ml-auto font-semibold tabular-nums text-ink">{formatMoney(order.total, order.currency)}</span>
      <Badge tone={statusTone(order.status)}>{PURCHASE_ORDER_STATUS_LABELS[order.status]}</Badge>
      <span className="w-full text-[11px] text-ink-faint">
        {formatDate(order.createdAt)}
        {order.createdBy ? ` · ${order.createdBy}` : ''}
        {order.deliveryDue ? ` · поставка до ${formatDate(order.deliveryDue)}` : ''}
      </span>
    </button>
  );
}

// ===========================================================================
// Карточка заказа
// ===========================================================================

function PurchaseOrderModal({
  order,
  categoryTitle,
  onClose,
  onChanged,
  onDeleted,
}: {
  order: PurchaseOrder;
  categoryTitle: string | null;
  onClose: () => void;
  onChanged: (next: PurchaseOrder) => void;
  onDeleted: (id: string) => void;
}) {
  const [events, setEvents] = useState<PurchaseOrderEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress);
  const [deliveryDue, setDeliveryDue] = useState(dateInputValue(order.deliveryDue));
  const [comment, setComment] = useState(order.comment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Журнал перечитывается после смены статуса: событие пишет триггер в базе,
  // фронт его не знает и выдумывать не должен.
  const [journalTick, setJournalTick] = useState(0);

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

  const dirty =
    deliveryAddress !== order.deliveryAddress ||
    deliveryDue !== dateInputValue(order.deliveryDue) ||
    comment !== order.comment;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await updatePurchaseOrder(order.id, {
        deliveryAddress,
        deliveryDue: deliveryDue || null,
        comment,
      });
      onChanged(next);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сохранить заказ'));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: PurchaseOrderStatus) {
    if (status === order.status) return;
    setError(null);
    try {
      const next = await updatePurchaseOrderStatus(order.id, status);
      onChanged(next);
      setJournalTick((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e, 'Не удалось сменить статус заказа'));
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

  const itemsTotal = purchaseOrderItemsTotal(order.items);

  return (
    <Modal open onClose={onClose} title={<span className="min-w-0 break-words">{order.number} · {order.supplierName || 'Поставщик не назван'}</span>}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            options={PURCHASE_ORDER_STATUSES.map((st) => PURCHASE_ORDER_STATUS_LABELS[st])}
            value={PURCHASE_ORDER_STATUS_LABELS[order.status]}
            onChange={(label) => {
              const next = PURCHASE_ORDER_STATUSES.find((st) => PURCHASE_ORDER_STATUS_LABELS[st] === label);
              if (next) void changeStatus(next);
            }}
            pill
            triggerClassName="py-1.5 text-xs"
          />
          <span className="text-xs text-ink-faint">
            {formatDate(order.createdAt)}
            {order.createdBy ? ` · ${order.createdBy}` : ''}
          </span>
          {categoryTitle && <span className="min-w-0 truncate text-xs text-ink-muted">{categoryTitle}</span>}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Позиции</span>
          {order.items.length === 0 && <p className="text-sm text-ink-muted">Позиций нет.</p>}
          {order.items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-border py-2 text-sm first:border-t-0">
              <span className="min-w-0 flex-1 text-ink">{item.name}</span>
              <span className="whitespace-nowrap text-xs text-ink-muted">
                {item.quantity ?? '—'} {item.unit} × {item.price != null ? formatMoney(item.price, order.currency) : '—'}
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums text-ink">
                {formatMoney(purchaseItemTotal(item), order.currency)}
              </span>
              {item.note && <span className="w-full text-[11px] text-ink-faint">{item.note}</span>}
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2 text-sm">
            <span className="text-ink-muted">Позиции</span>
            <span className="tabular-nums text-ink">{formatMoney(itemsTotal, order.currency)}</span>
          </div>
          {order.delivery != null && (
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-ink-muted">Доставка</span>
              <span className="tabular-nums text-ink">{formatMoney(order.delivery, order.currency)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-2 text-base font-semibold">
            <span className="text-ink">Итого</span>
            <span className="tabular-nums text-ink">{formatMoney(order.total, order.currency)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Input label="Адрес доставки" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Куда везти" />
          <Input label="Поставка до" type="date" value={deliveryDue} onChange={(e) => setDeliveryDue(e.target.value)} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-muted">Комментарий</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-control border border-transparent bg-surface-muted px-4 py-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-primary sm:text-sm"
              placeholder="Что важно помнить по этому заказу"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
            <Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              Удалить
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Журнал</span>
          {eventsError && <p className="text-xs text-danger">{eventsError}</p>}
          {!eventsError && events.length === 0 && <p className="text-xs text-ink-muted">Событий пока нет.</p>}
          {events.map((event) => (
            <div key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
              <span className="text-ink">
                {event.fromStatus ? PURCHASE_ORDER_STATUS_LABELS[event.fromStatus] : '—'} →{' '}
                {event.toStatus ? PURCHASE_ORDER_STATUS_LABELS[event.toStatus] : '—'}
              </span>
              {event.actor && <span>{event.actor}</span>}
              <span className="ml-auto text-ink-faint">{formatDateTime(event.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ===========================================================================
// Вкладка «Заказы» на странице «Закупки»
// ===========================================================================

export function PurchaseOrdersTab({ categoryTitleById }: { categoryTitleById: Map<string, string> }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [supplierFilter, setSupplierFilter] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Статусов в фильтре показываем только те, что реально встречаются, плюс
  // выбранный: список из десяти пунктов, где девять ничего не найдут, — это
  // не фильтр, а угадайка.
  const statusOptions = useMemo(() => {
    const used = new Set(orders.map((o) => PURCHASE_ORDER_STATUS_LABELS[o.status]));
    return [ALL, ...PURCHASE_ORDER_STATUSES.map((st) => PURCHASE_ORDER_STATUS_LABELS[st]).filter((l) => used.has(l))];
  }, [orders]);

  const visible = useMemo(
    () =>
      orders.filter(
        (o) =>
          (statusFilter === ALL || PURCHASE_ORDER_STATUS_LABELS[o.status] === statusFilter) &&
          (supplierFilter === ALL || o.supplierName === supplierFilter),
      ),
    [orders, statusFilter, supplierFilter],
  );

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
            Заказы появляются из утверждённого листа на вкладке «Сравнение цен» — кнопка «Сформировать заказы».
          </span>
        </Card>
      )}

      {!loading && !loadError && orders.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select options={statusOptions} value={statusFilter} onChange={setStatusFilter} pill triggerClassName="py-1.5 text-xs" />
            <Select options={[ALL, ...supplierNames]} value={supplierFilter} onChange={setSupplierFilter} pill triggerClassName="py-1.5 text-xs" />
            <span className="text-xs text-ink-faint">
              {visible.length} из {orders.length}
            </span>
          </div>
          <Card className="flex flex-col p-4">
            {visible.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Под фильтр ничего не подходит.</p>}
            {visible.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                categoryTitle={order.requestId ? categoryTitleById.get(order.requestId) ?? null : null}
                onOpen={() => setOpenId(order.id)}
                showSupplier
              />
            ))}
          </Card>
        </>
      )}

      {open && (
        <PurchaseOrderModal
          order={open}
          categoryTitle={open.requestId ? categoryTitleById.get(open.requestId) ?? null : null}
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
          <OrderRow key={order.id} order={order} categoryTitle={null} onOpen={() => setOpenId(order.id)} showSupplier={false} />
        ))}
      {open && (
        <PurchaseOrderModal
          order={open}
          categoryTitle={null}
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
