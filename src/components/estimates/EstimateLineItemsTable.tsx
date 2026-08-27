import { Pencil, Trash2, Plus, MessageSquare } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  lineItemMaterialTotal,
  lineItemTotal,
  lineItemWorkTotal,
  sectionLineItemsTotals,
  type EstimateLineItem,
  type EstimateSection,
} from '../../data/estimates';
import type { ExchangeRate } from '../../data/exchangeRates';

function formatMoney(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

// Все суммы построчной сметы уже в BYN (см. EstimateLineItem.workUnitPrice/
// materialUnitPrice) — переводить в USD в одну сторону через usdByn, без
// convertToUsd (тот рассчитан на суммы в разных валютах, у нас всегда BYN).
// Экспортирован — тем же способом считает общий итог по смете EstimateDetail.tsx.
export function formatUsd(valueByn: number, rate: ExchangeRate | null): string | null {
  if (!rate || !rate.usdByn) return null;
  return `$${Math.round(valueByn / rate.usdByn).toLocaleString('ru-RU')}`;
}

function formatQty(item: EstimateLineItem): string {
  if (item.quantity == null) return '—';
  return `${item.quantity.toLocaleString('ru-RU')}${item.unit ? ` ${item.unit}` : ''}`;
}

interface EstimateLineItemsTableProps {
  section: EstimateSection;
  rate: ExchangeRate | null;
  onAdd: () => void;
  onEdit: (item: EstimateLineItem) => void;
  onDelete: (item: EstimateLineItem) => void;
  onOpenComments: (item: EstimateLineItem) => void;
}

// Построчная (количественная) смета внутри раздела — таблица вида работ с
// объёмом и ценой работ/материалов, отдельно от positions/body выше (см.
// комментарий у EstimateLineItem в data/estimates.ts). Горизонтальный скролл
// вместо переверстки в карточки на мобильном — это внутренняя админ-
// страница, не публичная, а таблица с числами плохо читается карточками.
// Итог — под таблицей, не над ней (владелец: удобнее читать после строк,
// а не гадать, к чему цифра сверху относится, ещё не увидев ни одной строки).
export function EstimateLineItemsTable({ section, rate, onAdd, onEdit, onDelete, onOpenComments }: EstimateLineItemsTableProps) {
  const totals = sectionLineItemsTotals(section);
  const totalUsd = formatUsd(totals.total, rate);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">Построчная смета</span>

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
                    <button
                      type="button"
                      onClick={() => onOpenComments(item)}
                      aria-label="Комментарии к строке"
                      className="relative flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                    >
                      <MessageSquare className="h-3 w-3" />
                      {item.comments.length > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-white">
                          {item.comments.length}
                        </span>
                      )}
                    </button>
                  </td>
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

      {section.lineItems.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm font-semibold text-ink">
            {formatMoney(totals.total)} Br{totalUsd && <span className="text-ink-muted"> · {totalUsd}</span>}
            <span className="ml-1.5 font-normal text-ink-faint">
              (работы {formatMoney(totals.work)} + материалы {formatMoney(totals.material)})
            </span>
          </span>
        </div>
      )}

      <Button type="button" variant="secondary" icon={<Plus className="h-4 w-4" />} className="w-fit" onClick={onAdd}>
        Добавить строку
      </Button>
    </div>
  );
}
