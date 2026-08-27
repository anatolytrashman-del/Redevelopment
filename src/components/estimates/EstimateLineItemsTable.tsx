import { Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  lineItemMaterialTotal,
  lineItemTotal,
  lineItemWorkTotal,
  sectionLineItemsTotals,
  type EstimateLineItem,
  type EstimateSection,
} from '../../data/estimates';

function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function formatQty(item: EstimateLineItem): string {
  if (item.quantity == null) return '—';
  return `${item.quantity.toLocaleString('ru-RU')}${item.unit ? ` ${item.unit}` : ''}`;
}

interface EstimateLineItemsTableProps {
  section: EstimateSection;
  onAdd: () => void;
  onEdit: (item: EstimateLineItem) => void;
  onDelete: (item: EstimateLineItem) => void;
}

// Построчная (количественная) смета внутри раздела — таблица вида работ с
// объёмом и ценой работ/материалов, отдельно от positions/body выше (см.
// комментарий у EstimateLineItem в data/estimates.ts). Горизонтальный скролл
// вместо переверстки в карточки на мобильном — это внутренняя админ-
// страница, не публичная, а таблица с числами плохо читается карточками.
export function EstimateLineItemsTable({ section, onAdd, onEdit, onDelete }: EstimateLineItemsTableProps) {
  const totals = sectionLineItemsTotals(section);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">Построчная смета</span>
        {section.lineItems.length > 0 && (
          <span className="text-sm font-semibold text-ink">
            {formatMoney(totals.total)} Br
            <span className="ml-1.5 font-normal text-ink-faint">
              (работы {formatMoney(totals.work)} + материалы {formatMoney(totals.material)})
            </span>
          </span>
        )}
      </div>

      {section.lineItems.length > 0 && (
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2">Зона</th>
                <th className="px-3 py-2">Вид работ</th>
                <th className="px-3 py-2 text-right">Кол-во</th>
                <th className="px-3 py-2 text-right">Работы</th>
                <th className="px-3 py-2 text-right">Материалы</th>
                <th className="px-3 py-2 text-right">Итого</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {section.lineItems.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-ink-muted">{item.zone || '—'}</td>
                  <td className="px-3 py-2 text-ink">
                    {item.workType}
                    {item.note && <div className="text-xs text-ink-faint">{item.note}</div>}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-muted">{formatQty(item)}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">{formatMoney(lineItemWorkTotal(item))}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">{formatMoney(lineItemMaterialTotal(item))}</td>
                  <td className="px-3 py-2 text-right font-semibold text-ink">{formatMoney(lineItemTotal(item))}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        aria-label="Редактировать строку"
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        aria-label="Удалить строку"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={onAdd}>
        Добавить строку
      </Button>
    </div>
  );
}
