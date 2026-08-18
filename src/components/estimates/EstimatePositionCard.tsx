import { Pencil, Trash2, ImageOff, Link as LinkIcon } from 'lucide-react';
import { POSITION_OPS_INTRO, POSITION_OPS_CATCHALL, type EstimatePosition } from '../../data/estimates';

interface EstimatePositionCardProps {
  position: EstimatePosition;
  onEdit: () => void;
  onDelete: () => void;
}

// Карточка структурированной позиции сметы (просмотр) — название, фото
// референсов (дверь/замок/...) со ссылками, состав работ в фиксированной
// формулировке "Цена за работу включает..." + завершающая оговорка про
// прочие работы (POSITION_OPS_CATCHALL) последним пунктом списка всегда.
export function EstimatePositionCard({ position, onEdit, onDelete }: EstimatePositionCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-control border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-ink">{position.title}</div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Редактировать позицию"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Удалить позицию"
            className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:text-danger"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {position.products.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {position.products.map((p) => (
            <div key={p.id} className="flex w-28 shrink-0 flex-col gap-1">
              <div className="flex aspect-square w-28 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt={p.label} className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-5 w-5 text-ink-faint" />
                )}
              </div>
              <span className="truncate text-xs font-medium text-ink">{p.label || 'Без названия'}</span>
              {p.link && (
                <a
                  href={p.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <LinkIcon className="h-3 w-3 shrink-0" />
                  Ссылка
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {position.ops.length > 0 && (
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">{POSITION_OPS_INTRO}</span>
          <ul className="flex flex-col gap-1 pl-5 text-ink-muted [&>li]:list-disc">
            {position.ops.map((op, i) => (
              <li key={i}>{op}</li>
            ))}
            <li>{POSITION_OPS_CATCHALL}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
