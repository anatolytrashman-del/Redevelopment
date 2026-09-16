import { useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Select } from '../ui/Select';
import { FileField } from '../ui/FileField';
import {
  PURCHASE_DOCUMENT_KINDS,
  PURCHASE_DOCUMENT_KIND_LABELS,
  type PurchaseDocument,
  type PurchaseDocumentKind,
} from '../../data/purchaseDocuments';
import { PURCHASE_DELIVERY_STATUS_LABELS, type PurchaseDelivery } from '../../data/purchaseDeliveries';
import { deletePurchaseDocument, insertPurchaseDocument } from '../../lib/purchaseDocumentsApi';

// Документы заказа с историей загрузок (владелец, 2026-09-16: «появляются
// доп. документы по поставке, надо интерфейс для их загрузки и истории»).
//
// Историей служит сам список: он отсортирован от свежих к старым и у каждой
// строки написано, кто и когда её принёс. Отдельного журнала под документы
// нет — он показывал бы ровно то же самое во второй раз.
//
// Удаление мягкое: строка исчезает из списка, но остаётся в базе. Историю
// загрузок нельзя переписывать задним числом — «документ был и пропал» это
// тоже факт, который может понадобиться.

const ORDER_WIDE = 'По заказу целиком';

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

// Как называть поставку в выпадающем списке: «25 сент. · Запланирована».
// Номера у поставок нет — их различают по дате и статусу.
function deliveryLabel(delivery: PurchaseDelivery): string {
  const date = delivery.deliveredAt || delivery.plannedDate;
  const shown = date ? new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'без даты';
  return `${shown} · ${PURCHASE_DELIVERY_STATUS_LABELS[delivery.status]}`;
}

export function PurchaseDocumentsBlock({
  orderId,
  documents,
  deliveries,
  onChange,
}: {
  orderId: string;
  documents: PurchaseDocument[];
  deliveries: PurchaseDelivery[];
  onChange: (next: PurchaseDocument[]) => void;
}) {
  const [kind, setKind] = useState<PurchaseDocumentKind>('waybill');
  const [deliveryId, setDeliveryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deliveryOptions = [ORDER_WIDE, ...deliveries.map(deliveryLabel)];
  const currentDelivery = deliveries.find((d) => d.id === deliveryId) ?? null;

  async function add(file: { url: string; fileName: string } | null) {
    if (!file) return;
    setError(null);
    try {
      const created = await insertPurchaseDocument({
        orderId,
        deliveryId,
        kind,
        // Название по умолчанию — имя файла: своё придумывать незачем, а
        // пустая строка в списке выглядела бы потерянным документом.
        title: file.fileName,
        file,
      });
      onChange([created, ...documents]);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить документ'));
    }
  }

  async function remove(document: PurchaseDocument) {
    if (!window.confirm(`Убрать «${document.title}» из списка? Файл останется в базе.`)) return;
    setError(null);
    try {
      await deletePurchaseDocument(document.id);
      onChange(documents.filter((d) => d.id !== document.id));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось убрать документ'));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Документы</span>
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-1">
        {documents.length === 0 && (
          <p className="text-sm text-ink-muted">
            Документов пока нет. Сюда кладутся накладные, УПД, акты, сертификаты и всё остальное, что приходит по этому
            заказу — видно, кто и когда загрузил.
          </p>
        )}
        {documents.map((document) => {
          const delivery = deliveries.find((d) => d.id === document.deliveryId) ?? null;
          return (
            <div key={document.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border py-2 first:border-t-0">
              <FileText className="h-4 w-4 shrink-0 text-ink-faint" />
              <a
                href={document.file.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-ink hover:text-primary"
              >
                {document.title || document.file.fileName}
              </a>
              <span className="whitespace-nowrap text-xs text-ink-muted">
                {PURCHASE_DOCUMENT_KIND_LABELS[document.kind]}
              </span>
              <button type="button" onClick={() => void remove(document)} className="text-ink-faint hover:text-danger">
                <X className="h-4 w-4" />
              </button>
              <span className="w-full text-[11px] text-ink-faint">
                {formatDateTime(document.createdAt)}
                {document.uploadedBy ? ` · ${document.uploadedBy}` : ''}
                {delivery ? ` · поставка ${deliveryLabel(delivery)}` : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-control border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Тип документа"
            options={PURCHASE_DOCUMENT_KINDS.map((k) => PURCHASE_DOCUMENT_KIND_LABELS[k])}
            value={PURCHASE_DOCUMENT_KIND_LABELS[kind]}
            onChange={(picked) => {
              const next = PURCHASE_DOCUMENT_KINDS.find((k) => PURCHASE_DOCUMENT_KIND_LABELS[k] === picked);
              if (next) setKind(next);
            }}
          />
          {deliveries.length > 0 && (
            <Select
              label="К какой поставке"
              options={deliveryOptions}
              value={currentDelivery ? deliveryLabel(currentDelivery) : ORDER_WIDE}
              onChange={(picked) => {
                if (picked === ORDER_WIDE) {
                  setDeliveryId(null);
                  return;
                }
                setDeliveryId(deliveries.find((d) => deliveryLabel(d) === picked)?.id ?? null);
              }}
            />
          )}
        </div>
        <FileField label="" file={null} onChange={(file) => void add(file)} addLabel="Загрузить документ" />
      </div>
    </div>
  );
}
