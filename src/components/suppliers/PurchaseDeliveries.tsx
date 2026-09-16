import { useRef, useState } from 'react';
import { Loader2, Paperclip, Plus, Trash2, Truck, X } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { uploadObjectDocument } from '../../lib/objectsApi';
import type { DocumentFile } from '../../data/contractorDocuments';
import type { PurchaseOrder } from '../../data/purchaseOrders';
import {
  PURCHASE_DELIVERY_STATUSES,
  PURCHASE_DELIVERY_STATUS_LABELS,
  receivedByItem,
  type PurchaseDelivery,
  type PurchaseDeliveryStatus,
} from '../../data/purchaseDeliveries';
import { receiverLabel, type PurchaseReceiver } from '../../data/purchaseReceivers';
import {
  deletePurchaseDelivery,
  insertPurchaseDelivery,
  updatePurchaseDelivery,
} from '../../lib/purchaseDeliveriesApi';
import { insertPurchaseReceiver, updatePurchaseReceiver } from '../../lib/purchaseReceiversApi';

// Поставки по заказу: список внутри карточки заказа и форма одной поставки
// (владелец, 2026-09-16: «Делай все, что предложил, и тогда уже заведу
// поставку»). Отдельный файл, а не блок в PurchaseOrdersTab.tsx, — там уже
// список заказов и карточка заказа, форма поставки с приёмщиком,
// доверенностью и построчными количествами добавила бы к ним ещё столько же.
//
// Форма показывается ВМЕСТО тела карточки заказа, а не второй модалкой
// поверх: у Modal одинаковый z-50 и свой обработчик Escape на каждую копию —
// вложенные модалки закрывались бы обе разом.

const NEW_RECEIVER = 'Новое лицо…';

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

// Один файл: загрузить, посмотреть, заменить, убрать. Доверенность и
// платёжку владелец грузит готовыми документами — генерации из шаблона нет.
export function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: DocumentFile | null;
  onChange: (file: DocumentFile | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(selected: File | null) {
    if (!selected) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadObjectDocument(selected));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
      // Сброс значения — иначе повторный выбор ТОГО ЖЕ файла не даёт события
      // change и загрузка молча не стартует.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <div className="flex flex-wrap items-center gap-2">
        {file && (
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-ink hover:border-primary"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{file.fileName}</span>
          </a>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        >
          {uploading ? 'Загружаем...' : file ? 'Заменить' : 'Загрузить'}
        </Button>
        {file && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)} icon={<X className="h-4 w-4" />}>
            Убрать
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

// Несколько файлов одной кучей — документы поставки (накладная, УПД, акт).
function FilesField({ files, onChange }: { files: DocumentFile[]; onChange: (files: DocumentFile[]) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-muted">Документы поставки</span>
      {files.map((f, i) => (
        <div key={`${f.url}-${i}`} className="flex items-center gap-2">
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-ink hover:text-primary"
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{f.fileName}</span>
          </a>
          <button
            type="button"
            onClick={() => onChange(files.filter((_, idx) => idx !== i))}
            className="text-ink-faint hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <FileField label="" file={null} onChange={(f) => f && onChange([...files, f])} />
    </div>
  );
}

// Список поставок внутри карточки заказа.
export function DeliveriesBlock({
  order,
  deliveries,
  onEdit,
}: {
  order: PurchaseOrder;
  deliveries: PurchaseDelivery[];
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
              {delivery.files.length > 0 && <span>документов: {delivery.files.length}</span>}
            </div>
            {delivery.comment && <span className="text-xs text-ink-faint">{delivery.comment}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Форма одной поставки. Приёмщик выбирается из шаблонов (они повторяются) и
// тут же правится; новое лицо заводится прямо отсюда, отдельной страницы под
// справочник нет — заводить человека где-то ещё, чтобы потом выбрать его
// здесь, значит делать лишний шаг ради одного поля.
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
  const [receiverId, setReceiverId] = useState<string | null>(delivery?.receiverId ?? null);
  const [receiverName, setReceiverName] = useState(delivery?.receiverName ?? '');
  const [receiverPhone, setReceiverPhone] = useState(delivery?.receiverPhone ?? '');
  const [receiverPosition, setReceiverPosition] = useState('');
  const [receiverPassport, setReceiverPassport] = useState('');
  const [poaNumber, setPoaNumber] = useState(delivery?.poaNumber ?? '');
  const [poaDate, setPoaDate] = useState(delivery?.poaDate ?? '');
  const [poaFile, setPoaFile] = useState<DocumentFile | null>(delivery?.poaFile ?? null);
  const [files, setFiles] = useState<DocumentFile[]>(delivery?.files ?? []);
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

  const template = receivers.find((r) => r.id === receiverId) ?? null;
  // Должность и паспорт не хранятся в самой поставке (они нужны для
  // доверенности, а она уже файлом) — показываем то, что лежит в шаблоне,
  // пока человек не начал править.
  const positionValue = receiverPosition || template?.position || '';
  const passportValue = receiverPassport || template?.passport || '';

  function pickReceiver(label: string) {
    if (label === NEW_RECEIVER) {
      setReceiverId(null);
      setReceiverName('');
      setReceiverPhone('');
      setReceiverPosition('');
      setReceiverPassport('');
      return;
    }
    const found = receivers.find((r) => receiverLabel(r) === label);
    if (!found) return;
    setReceiverId(found.id);
    setReceiverName(found.name);
    setReceiverPhone(found.phone);
    setReceiverPosition(found.position);
    setReceiverPassport(found.passport);
  }

  // Приёмщик: сохраняем шаблон, если это новое лицо, и обновляем, если у
  // существующего поправили данные. Возвращает id, который ляжет в поставку.
  async function persistReceiver(): Promise<string | null> {
    const name = receiverName.trim();
    if (!name) return null;
    const payload = {
      legalEntityId: order.legalEntityId,
      name,
      phone: receiverPhone.trim(),
      position: positionValue.trim(),
      passport: passportValue.trim(),
      note: template?.note ?? '',
    };
    if (!template) {
      const created = await insertPurchaseReceiver(payload);
      onReceiversChange([...receivers, created]);
      return created.id;
    }
    const changed =
      template.name !== payload.name ||
      template.phone !== payload.phone ||
      template.position !== payload.position ||
      template.passport !== payload.passport;
    if (!changed) return template.id;
    const updated = await updatePurchaseReceiver(template.id, payload);
    onReceiversChange(receivers.map((r) => (r.id === updated.id ? updated : r)));
    return updated.id;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const savedReceiverId = await persistReceiver();
      const input = {
        orderId: order.id,
        receiverId: savedReceiverId,
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        status,
        plannedDate: plannedDate || null,
        deliveredAt: deliveredAt || null,
        poaNumber: poaNumber.trim(),
        poaDate: poaDate || null,
        poaFile,
        items: order.items
          .map((item) => ({ itemId: item.id, quantity: parseQuantity(quantities[item.id] ?? '') }))
          .filter((line) => line.quantity != null),
        files,
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

      <div className="flex flex-col gap-3">
        <Select
          label="Принимающее лицо"
          options={[...receivers.map(receiverLabel), NEW_RECEIVER]}
          value={template ? receiverLabel(template) : receiverName ? receiverName : ''}
          onChange={pickReceiver}
          placeholder="Выберите или заведите нового"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="ФИО" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Кто принимает" />
          <Input
            label="Телефон"
            value={receiverPhone}
            onChange={(e) => setReceiverPhone(e.target.value)}
            placeholder="+375 29 ..."
            helperText="По нему поставщик звонит при доставке"
          />
          <Input label="Должность" value={positionValue} onChange={(e) => setReceiverPosition(e.target.value)} />
          <Input
            label="Паспорт"
            value={passportValue}
            onChange={(e) => setReceiverPassport(e.target.value)}
            placeholder="MP1234567, выдан ..."
            helperText="Нужен для доверенности"
          />
        </div>
        <p className="text-xs text-ink-faint">
          Лицо сохраняется как шаблон: в следующей поставке его достаточно выбрать из списка.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Доверенность</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Номер" value={poaNumber} onChange={(e) => setPoaNumber(e.target.value)} placeholder="№ 14" />
          <Input label="Дата" type="date" value={poaDate} onChange={(e) => setPoaDate(e.target.value)} />
        </div>
        <FileField label="Файл доверенности" file={poaFile} onChange={setPoaFile} />
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

      <FilesField files={files} onChange={setFiles} />

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
