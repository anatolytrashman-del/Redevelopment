import { useState } from 'react';
import { Pencil, Trash2, ImageOff, Link as LinkIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { ImageLightbox, type LightboxState } from '../objects/ImageLightbox';
import {
  POSITION_OPS_INTRO,
  POSITION_OPS_CATCHALL,
  type EstimatePosition,
  type EstimateProductRef,
  type FacadeDimension,
} from '../../data/estimates';

interface EstimatePositionCardProps {
  position: EstimatePosition;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

// BYN — основная валюта (поставщики Минска), RUB/USD — ориентир по
// поставщикам Москвы и в долларах. Каждая заполняется независимо, без
// автоконвертации по курсу — показываем только то, что реально заполнено.
function formatPrices(p: EstimateProductRef): string {
  const parts: string[] = [];
  if (p.priceByn != null) parts.push(`${Math.round(p.priceByn).toLocaleString('ru-RU')} Br`);
  if (p.priceRub != null) parts.push(`${Math.round(p.priceRub).toLocaleString('ru-RU')} ₽`);
  if (p.priceUsd != null) parts.push(`$${Math.round(p.priceUsd).toLocaleString('ru-RU')}`);
  return parts.join(' · ');
}

// Площадь под покраску без проёмов (окна/витражи) — если размеры ещё не
// заполнены, площадь 0, не мешает суммировать по всем строкам.
function netFacadeArea(d: FacadeDimension): number {
  if (d.width == null || d.height == null) return 0;
  return Math.max(0, d.width * d.height - (d.windowsArea ?? 0));
}

// Карточка структурированной позиции сметы (просмотр) — название, крупные
// кликабельные фото референсов (дверь/замок/...) с производителем/моделью/
// ценой и ссылкой, состав работ в фиксированной формулировке "Цена за
// работу включает..." + завершающая оговорка про прочие работы
// (POSITION_OPS_CATCHALL) последним пунктом списка всегда.
export function EstimatePositionCard({
  position,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: EstimatePositionCardProps) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-ink">{position.title}</div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Переместить выше"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Переместить ниже"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-muted hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {position.products.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{p.label || 'Без названия'}</span>
              <button
                type="button"
                onClick={() => p.photoUrl && setLightbox({ urls: [p.photoUrl], index: 0 })}
                disabled={!p.photoUrl}
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-control bg-surface-muted disabled:cursor-default"
              >
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt={p.label} className="h-full w-full cursor-zoom-in object-cover" />
                ) : (
                  <ImageOff className="h-6 w-6 text-ink-faint" />
                )}
              </button>
              {(p.manufacturer || p.model) && (
                <span className="truncate text-xs text-ink-muted">{[p.manufacturer, p.model].filter(Boolean).join(' — ')}</span>
              )}
              {(p.priceByn != null || p.priceRub != null || p.priceUsd != null) && (
                <span className="text-xs font-semibold text-ink">{formatPrices(p)}</span>
              )}
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

      {position.colors.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink">Варианты оттенков</span>
          <div className="flex flex-wrap gap-3">
            {position.colors.map((c) => (
              <div key={c.id} className="flex flex-col items-center gap-1">
                <span
                  className="h-10 w-10 rounded-md border border-black/10 bg-surface-muted"
                  style={c.hex ? { backgroundColor: c.hex } : undefined}
                />
                <span className="text-center text-xs font-medium text-ink">{c.code || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {position.dimensions.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          {position.dimensions.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 text-ink-muted">
              <span>{d.label || 'Без названия'}</span>
              <span>
                {d.width != null && d.height != null
                  ? `${d.width} × ${d.height} м = ${(d.width * d.height).toLocaleString('ru-RU')} м²${
                      d.windowsArea ? ` − окна ${d.windowsArea.toLocaleString('ru-RU')} м² = ${netFacadeArea(d).toLocaleString('ru-RU')} м²` : ''
                    }`
                  : '—'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-semibold text-ink">
            <span>Итого чистая площадь (предварительный расчёт)</span>
            <span>{position.dimensions.reduce((sum, d) => sum + netFacadeArea(d), 0).toLocaleString('ru-RU')} м²</span>
          </div>
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

      <ImageLightbox state={lightbox} onChange={setLightbox} />
    </div>
  );
}
