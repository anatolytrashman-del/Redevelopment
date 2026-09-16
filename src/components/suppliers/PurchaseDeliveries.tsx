import { useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { FileField } from '../ui/FileField';
import type { DocumentFile } from '../../data/contractorDocuments';
import type { PurchaseOrder } from '../../data/purchaseOrders';
import type { PurchaseDocument } from '../../data/purchaseDocuments';
import {
  PURCHASE_DELIVERY_STATUSES,
  PURCHASE_DELIVERY_STATUS_LABELS,
  receivedByItem,
  type PurchaseDelivery,
  type PurchaseDeliveryStatus,
} from '../../data/purchaseDeliveries';
import type { PurchaseReceiver } from '../../data/purchaseReceivers';
import { deletePurchaseDelivery, insertPurchaseDelivery, updatePurchaseDelivery } from '../../lib/purchaseDeliveriesApi';
import {
  persistReceiverDraft,
  receiverDraftFrom,
  ReceiverPicker,
  type ReceiverDraft,
} from './PurchaseReceiverPicker';

// Поставки по заказу: список внутри карточки заказа и форма одной поставки
// (владелец, 2026-09-16: «Делай все, что предложил, и тогда уже заведу
// поставку»). Отдельный файл, а не блок в PurchaseOrdersTab.tsx, — там уже
// список заказов и карточка заказа.
//
// Форма показывается ВМЕСТО тела карточки заказа, а не второй модалкой
// поверх: у Modal одинаковый z-50 и свой обработчик Escape на каждую копию —
// вложенные модалки закрывались бы обе разом.
//
// Приёмщик и доверенность живут на ЗАКАЗЕ и наследуются новой поставкой как
// значения по умолчанию: обычно принимает один и тот же человек по одной
// доверенности, а если машину встретил другой — здесь это переопределяется.

function deliveryStatusTone(status: PurchaseDeliveryStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  // Шкала та же, что у статусов заказа (см. statusTone в PurchaseOrdersTab):
  // фирменный красный неотличим от danger, поэтому тона 'primary' здесь нет.
  if (status === 'claim') return 'danger';
  if (status === 'planned' || status === 'cancelled') return 'neutral';
  if (status === 'accepted') return 'success';
  return 'warning';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

// Количество из поля ввода: запятая как разделитель (её печатают чаще точки),
// пустая строка — «не указано», а не ноль.
function parseQuantity(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatQuantity(value: number | null): string {
  if (value == null) return '';
  return String(Math.round(value * 1000) / 1000);
}

// Список поставок внутри карточки заказа.
export function DeliveriesBlock({
  order,
  deliveries,
  documents,
  onEdit,
}: {
  order: PurchaseOrder;
  deliveries: PurchaseDelivery[];
  documents: PurchaseDocument[];
  onEdit: (delivery: PurchaseDelivery | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Поставки</span>
        <Button type="button" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => onEdit(null)}>
          Добавить
        </Button>
      </div>
      {deliveries.length === 0 && (
        <p className="text-sm text-ink-muted">
          Поставок пока нет. Одна поставка — одна машина: своя дата, свой приёмщик и своя доверенность. Из заказа товар
          может приехать частями — заводите столько поставок, сколько было привозов.
        </p>
      )}
      {deliveries.map((delivery) => {
        const lines = delivery.items.filter((l) => l.quantity != null && l.quantity > 0).length;
        const docs = documents.filter((d) => d.deliveryId === delivery.id).length;
        return (
          <button
            key={delivery.id}
            type="button"
            onClick={() => onEdit(delivery)}
            className="flex flex-col gap-1 rounded-control border border-border px-3 py-2 text-left hover:border-primary"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Truck className="h-4 w-4 shrink-0 text-ink-faint" />
              <Badge tone={deliveryStatusTone(delivery.status)}>{PURCHASE_DELIVERY_STATUS_LABELS[delivery.status]}</Badge>
              <span className="text-sm text-ink">
                {delivery.deliveredAt ? formatDate(delivery.deliveredAt) : `план ${formatDate(delivery.plannedDate)}`}
              </span>
              <span className="text-xs text-ink-muted">
                {lines} из {order.items.length} позиций
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-ink-muted">
              {delivery.receiverName && (
                <span>
                  {delivery.receiverName}
                  {delivery.receiverPhone ? ` · ${delivery.receiverPhone}` : ''}
                </span>
              )}
              {delivery.poaNumber && <span>доверенность № {delivery.poaNumber}</span>}
              {docs > 0 && <span>документов: {docs}</span>}
            </div>
            {delivery.comment && <span className="text-xs text-ink-faint">{delivery.comment}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Форма одной поставки.
export function DeliveryForm({
  order,
  delivery,
  deliveries,
  receivers,
  onReceiversChange,
  onSaved,
  onDeleted,
  onCancel,
}: {
  order: PurchaseOrder;
  delivery: PurchaseDelivery | null;
  deliveries: PurchaseDelivery[];
  receivers: PurchaseReceiver[];
  onReceiversChange: (receivers: PurchaseReceiver[]) => void;
  onSaved: (delivery: PurchaseDelivery) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
  // Остаток по позициям считается по ОСТАЛЬНЫМ поставкам: при правке уже
  // заведённой поставки её собственные количества вычитать из остатка нельзя,
  // иначе поле «сколько приехало» будет предлагать вычесть самого себя.
  const otherReceived = receivedByItem(deliveries.filter((d) => d.id !== delivery?.id));

  const [status, setStatus] = useState<PurchaseDeliveryStatus>(delivery?.status ?? 'planned');
  const [plannedDate, setPlannedDate] = useState(delivery?.plannedDate ?? order.deliveryDue ?? '');
  const [deliveredAt, setDeliveredAt] = useState(delivery?.deliveredAt ?? '');
  const [receiver, setReceiver] = useState<ReceiverDraft>(() => {
    // Новая поставка наследует ответственного с заказа; у уже заведённой
    // берём её собственного (шаблон, если он жив, иначе снимок имени).
    if (!delivery) return receiverDraftFrom(receivers.find((r) => r.id === order.receiverId));
    const template = receivers.find((r) => r.id === delivery.receiverId);
    if (template) return receiverDraftFrom(template);
    return { receiverId: null, name: delivery.receiverName, phone: delivery.receiverPhone, position: '', passport: '' };
  });
  const [poaNumber, setPoaNumber] = useState(delivery?.poaNumber ?? order.poaNumber);
  const [poaDate, setPoaDate] = useState(delivery?.poaDate ?? order.poaDate ?? '');
  const [poaFile, setPoaFile] = useState<DocumentFile | null>(delivery?.poaFile ?? order.poaFile);
  const [comment, setComment] = useState(delivery?.comment ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of order.items) {
      // Правка уже заведённой поставки показывает ровно её содержимое:
      // позиции, которой в ней не было, остаются пустыми. Подставлять сюда
      // остаток значило бы дописать в неё то, что этой машиной не приезжало.
      if (delivery) {
        const saved = delivery.items.find((l) => l.itemId === item.id);
        initial[item.id] = saved ? formatQuantity(saved.quantity) : '';
        continue;
      }
      // Новая поставка: подставляем остаток — обычно везут именно его, а
      // если приехала часть, число проще уменьшить, чем набрать с нуля.
      const rest = item.quantity == null ? null : item.quantity - (otherReceived.get(item.id) ?? 0);
      initial[item.id] = rest != null && rest > 0 ? formatQuantity(Math.round(rest * 1000) / 1000) : '';
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const persisted = await persistReceiverDraft(receiver, receivers, order.legalEntityId);
      if (persisted.receivers !== receivers) onReceiversChange(persisted.receivers);
      const input = {
        orderId: order.id,
        receiverId: persisted.receiverId,
        receiverName: receiver.name.trim(),
        receiverPhone: receiver.phone.trim(),
        status,
        plannedDate: plannedDate || null,
        deliveredAt: deliveredAt || null,
        poaNumber: poaNumber.trim(),
        poaDate: poaDate || null,
        poaFile,
        items: order.items
          .map((item) => ({ itemId: item.id, quantity: parseQuantity(quantities[item.id] ?? '') }))
          .filter((line) => line.quantity != null),
        // Документы поставки живут в общем списке документов заказа
        // (purchase_documents) — колонка files осталась от первой версии и
        // не используется.
        files: [],
        comment: comment.trim(),
      };
      onSaved(delivery ? await updatePurchaseDelivery(delivery.id, input) : await insertPurchaseDelivery(input));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить поставку'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!delivery) return;
    if (!window.confirm('Удалить поставку? Она пропадёт из списка, но останется в базе.')) return;
    setError(null);
    try {
      await deletePurchaseDelivery(delivery.id);
      onDeleted(delivery.id);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить поставку'));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Статус"
          options={PURCHASE_DELIVERY_STATUSES.map((s) => PURCHASE_DELIVERY_STATUS_LABELS[s])}
          value={PURCHASE_DELIVERY_STATUS_LABELS[status]}
          onChange={(label) => {
            const next = PURCHASE_DELIVERY_STATUSES.find((s) => PURCHASE_DELIVERY_STATUS_LABELS[s] === label);
            if (next) setStatus(next);
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Обещали к" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        <Input
          label="Фактически приняли"
          type="date"
          value={deliveredAt}
          onChange={(e) => setDeliveredAt(e.target.value)}
          helperText="Пусто, пока не приехало"
        />
      </div>

      <ReceiverPicker label="Кто принял эту машину" receivers={receivers} value={receiver} onChange={setReceiver} />

      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Доверенность</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Номер" value={poaNumber} onChange={(e) => setPoaNumber(e.target.value)} placeholder="№ 14" />
          <Input label="Дата" type="date" value={poaDate} onChange={(e) => setPoaDate(e.target.value)} />
        </div>
        <FileField label="Файл доверенности" file={poaFile} onChange={setPoaFile} />
        <p className="text-xs text-ink-faint">
          Подставлена доверенность с заказа. Если эту машину встречали по другой — замените здесь, на заказе останется
          прежняя.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Что приехало</span>
        {order.items.length === 0 && <p className="text-sm text-ink-muted">В заказе нет позиций.</p>}
        {order.items.map((item) => {
          const already = otherReceived.get(item.id) ?? 0;
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">{item.name}</div>
                <div className="text-[11px] text-ink-faint">
                  в заказе {item.quantity ?? '—'} {item.unit}
                  {already > 0 ? ` · по другим поставкам ${Math.round(already * 1000) / 1000}` : ''}
                </div>
              </div>
              <input
                value={quantities[item.id] ?? ''}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                inputMode="decimal"
                placeholder="0"
                className="w-28 rounded-control border border-transparent bg-surface-muted px-3 py-2 text-base text-ink outline-none focus:border-primary sm:text-sm"
              />
              <span className="w-10 shrink-0 text-xs text-ink-faint">{item.unit}</span>
            </div>
          );
        })}
        <p className="mt-1 text-xs text-ink-faint">
          Пустое поле — позиция этой поставкой не приехала. Количество засчитывается, когда у поставки статус «Привезли»,
          «Принята» или «Претензия».
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-muted">Комментарий</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="w-full rounded-control border border-transparent bg-surface-muted px-4 py-3 text-base text-ink outline-none placeholder:text-ink-faint focus:border-primary sm:text-sm"
          placeholder="Чем машина, кто водитель, что не так"
        />
      </label>

      <p className="text-xs text-ink-faint">
        Накладную, УПД и прочие бумаги по этой машине грузите в разделе «Документы» карточки заказа — там же выбирается,
        к какой поставке они относятся.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Сохраняем...' : 'Сохранить поставку'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Назад к заказу
        </Button>
        {delivery && (
          <Button type="button" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
            Удалить
          </Button>
        )}
      </div>
    </div>
  );
}
