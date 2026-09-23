// Общие детали торговых карточек ТЦ (TradeCenterRetailBlocks и
// TradeCenterExtraBlocks): рамка карточки, заголовок с иконкой и строка
// источников внизу. Вынесены в отдельный файл, чтобы два файла карточек не
// импортировали друг друга по кругу. Не-компоненты (иконки разделов,
// класс рамки) — в tradeCenterRetailStyle.ts, иначе ломается fast refresh.
import type { RetailSource } from '../../data/businessCenters';
import { RETAIL_SECTION_LABELS, collectRetailSources, type RetailSectionId } from '../../lib/tradeCenterRetail';
import { RETAIL_SECTION_ICONS } from './tradeCenterRetailStyle';

export function RetailCardTitle({ id, label }: { id: RetailSectionId; label?: string }) {
  const Icon = RETAIL_SECTION_ICONS[id];
  return (
    <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      {label ?? RETAIL_SECTION_LABELS[id]}
    </h2>
  );
}

/**
 * Один общий список источников карточки без дублей, мелким серым,
 * rel=nofollow: это цитирование, а не рекомендация.
 */
export function SourcesLine({ entries }: { entries: RetailSource[] }) {
  const sources = collectRetailSources(entries);
  if (!sources.length) return null;
  return (
    <p className="break-words border-t border-border pt-3 text-xs leading-relaxed text-ink-faint">
      {sources.length === 1 ? 'Источник: ' : 'Источники: '}
      {sources.map((s, i) => (
        <span key={`${s.label}-${i}`}>
          {i > 0 && ', '}
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="underline decoration-ink-faint/40 underline-offset-2 hover:text-ink-muted"
            >
              {s.label}
            </a>
          ) : (
            s.label
          )}
        </span>
      ))}
    </p>
  );
}
