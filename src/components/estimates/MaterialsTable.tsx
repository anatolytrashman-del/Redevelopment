import { Pencil, Trash2, MessageSquare } from 'lucide-react';
import type { EstimateMaterial } from '../../data/estimates';

function formatQty(m: EstimateMaterial): string {
  if (m.quantity == null) return '—';
  return `${m.quantity.toLocaleString('ru-RU')}${m.unit ? ` ${m.unit}` : ''}`;
}

// Группировка списка материалов по EstimateMaterial.group (см. комментарий
// там же) — общий список (group === '') отдельно от именованных групп,
// каждая своей таблицей, в порядке первого появления в списке, а не
// алфавитном (владелец добавляет позиции по ходу работы, порядок появления
// обычно и есть смысловой). Вынесено отдельно от EstimateMaterialsPanel,
// чтобы той же логикой и той же таблицей мог пользоваться и
// EstimateMaterialsLedgerModal (владелец, 2026-09-01: "нужна одна единая
// ведомость материалов... разбитая на разделы, как сейчас, но в одной
// таблице").
export function groupMaterials(materials: EstimateMaterial[]): {
  ungrouped: EstimateMaterial[];
  groups: { name: string; materials: EstimateMaterial[] }[];
} {
  const ungrouped: EstimateMaterial[] = [];
  const groupOrder: string[] = [];
  const byGroup = new Map<string, EstimateMaterial[]>();
  for (const m of materials) {
    if (!m.group) {
      ungrouped.push(m);
      continue;
    }
    if (!byGroup.has(m.group)) {
      byGroup.set(m.group, []);
      groupOrder.push(m.group);
    }
    byGroup.get(m.group)!.push(m);
  }
  return { ungrouped, groups: groupOrder.map((name) => ({ name, materials: byGroup.get(name)! })) };
}

// Одна и та же таблица переиспользуется и для общего списка (group === ''),
// и для каждой отдельной группы — владелец, 2026-08-31: "сделаем
// строительные леса отдельным блоком, по ним будут запрашиваться цены
// отдельно... прям внутри этой таблицы, но сгруппированно и отдельно".
export function MaterialsTable({
  materials,
  onEdit,
  onDelete,
  onOpenComments,
}: {
  materials: EstimateMaterial[];
  onEdit: (material: EstimateMaterial) => void;
  onDelete: (material: EstimateMaterial) => void;
  onOpenComments: (material: EstimateMaterial) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
            <th className="px-3 py-2">Название</th>
            <th className="px-3 py-2 text-right">Кол-во</th>
            <th className="px-3 py-2">Заметка</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id} className="border-t border-border align-top">
              <td className="px-3 py-2 text-ink">{m.name}</td>
              <td className="px-3 py-2 text-right text-ink-muted">{formatQty(m)}</td>
              <td className="max-w-[240px] px-3 py-2 text-ink-muted">
                <span className="line-clamp-2">{m.note || '—'}</span>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenComments(m)}
                    aria-label="Комментарии к материалу"
                    className="relative flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <MessageSquare className="h-3 w-3" />
                    {m.comments.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-white">
                        {m.comments.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(m)}
                    aria-label="Редактировать материал"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(m)}
                    aria-label="Удалить материал"
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
  );
}
