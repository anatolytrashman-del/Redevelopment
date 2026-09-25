// Два блока карточки ТЦ, на которые 2026-09-24 разделили старую карточку
// «Первые в Беларуси и якоря» (бриф tc-catalog/codex/briefs/anchors-timeline.md):
//
// - «Якорные арендаторы» (id `anchors`) — retail_info.anchors, стоит прямо
//   перед каталогом арендаторов (TenantDirectory): выжимка «ради кого едут»,
//   а каталог под ней — полный список.
// - «Чем ТЦ вошёл в историю ритейла» (id `retail-history`) — retail_info.timeline,
//   вертикальная лента по возрастанию даты. Владелец: не хроника с уходами
//   («она будет печальная»), а только достижения — первые в стране бренды и
//   форматы, рекорды, знаковые события. Уходы и закрытия не рисуются нигде.
//
// У ТЦ без новой схемы обе карточки собираются из старых `firsts`
// (normalizeRetailInfo в lib/tradeCenterRetail).
import { useState } from 'react';
import {
  Baby,
  Clapperboard,
  Dumbbell,
  HeartPulse,
  ShoppingCart,
  Shirt,
  Sofa,
  Sparkles,
  Store,
  Tv,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type { RetailAnchorCategory, RetailAnchorEntry, RetailTimelineEntry, RetailTimelineKind } from '../../data/businessCenters';
import {
  TIMELINE_COLLAPSED,
  TIMELINE_KIND_LABELS,
  anchorCategoryLabel,
  anchorMetaParts,
  timelineMonth,
  timelineYear,
} from '../../lib/tradeCenterRetail';
import { Badge } from '../ui/Badge';
import { RetailCardTitle as CardTitle } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';

const ANCHOR_ICONS: Record<RetailAnchorCategory, LucideIcon> = {
  гипермаркет: ShoppingCart,
  кинотеатр: Clapperboard,
  fashion: Shirt,
  электроника: Tv,
  'детские товары': Baby,
  спорт: Dumbbell,
  'дом и интерьер': Sofa,
  развлечения: Sparkles,
  фудкорт: UtensilsCrossed,
  фитнес: HeartPulse,
  другое: Store,
};

// Шкала статусов проекта (CLAUDE.md): жёлтое — «первые», зелёное — рекорд,
// серое — просто событие. Красный не берём: рядом с фирменным он читается
// как авария.
const KIND_TONES: Record<RetailTimelineKind, 'warning' | 'success' | 'neutral'> = {
  first: 'warning',
  first_format: 'warning',
  record: 'success',
  milestone: 'neutral',
};

function AnchorTile({ anchor }: { anchor: RetailAnchorEntry }) {
  const Icon = ANCHOR_ICONS[anchor.category ?? 'другое'];
  const category = anchorCategoryLabel(anchor);
  const meta = anchorMetaParts(anchor);
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-white/65 p-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        title={category ?? undefined}
        aria-hidden="true"
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {anchor.yandexUrl ? (
          <a
            href={anchor.yandexUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="break-words text-sm font-bold leading-snug text-ink underline decoration-ink-faint/40 underline-offset-2 hover:text-primary-hover"
          >
            {anchor.name}
          </a>
        ) : (
          <span className="break-words text-sm font-bold leading-snug text-ink">{anchor.name}</span>
        )}
        {category && <span className="text-xs font-semibold text-ink-muted">{category}</span>}
        {meta.length > 0 && <span className="text-xs text-ink-muted">{meta.join(' · ')}</span>}
        {anchor.text && <span className="mt-1 break-words text-xs leading-relaxed text-ink-muted">{anchor.text}</span>}
      </span>
    </li>
  );
}

export function TradeCenterAnchorsCard({ anchors }: { anchors: RetailAnchorEntry[] }) {
  if (!anchors.length) return null;
  return (
    <div id="anchors" className={cardClass} style={glassCardShadow}>
      <CardTitle id="anchors" />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {anchors.map((anchor, i) => (
          <AnchorTile key={`${anchor.name}-${i}`} anchor={anchor} />
        ))}
      </ul>
    </div>
  );
}

export function TradeCenterHistoryCard({ timeline, title }: { timeline: RetailTimelineEntry[]; title: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!timeline.length) return null;
  const collapsible = timeline.length > TIMELINE_COLLAPSED;
  const visibleCount = collapsible && !expanded ? TIMELINE_COLLAPSED : timeline.length;
  return (
    <div id="retail-history" className={cardClass} style={glassCardShadow}>
      <CardTitle id="retail-history" label={title} />
      <ol className="flex flex-col">
        {timeline.map((entry, i) => {
          const month = timelineMonth(entry);
          const first = i === 0;
          const last = i === visibleCount - 1;
          return (
            // Скрытые строки остаются в разметке (`hidden`), а не вырезаются:
            // пререндер и поисковики видят ленту целиком.
            <li
              key={`${entry.date}-${entry.name}-${i}`}
              className={cn(
                'grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-x-2 sm:grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] sm:gap-x-3',
                i >= visibleCount && 'hidden',
              )}
            >
              <div className="pt-0.5 text-right">
                <span className="block text-lg font-extrabold leading-tight tabular-nums text-ink sm:text-xl">
                  {timelineYear(entry)}
                </span>
                {month && <span className="block text-xs text-ink-muted">{month}</span>}
              </div>
              <div className="relative flex justify-center" aria-hidden="true">
                <span
                  className={cn(
                    'absolute w-px bg-ink-faint/30',
                    first ? 'top-3' : 'top-0',
                    last ? 'h-3' : 'bottom-0',
                  )}
                />
                <span className="relative mt-2 h-3 w-3 rounded-full border-2 border-primary bg-white" />
              </div>
              <div className={cn('flex min-w-0 flex-col gap-1', last ? 'pb-0' : 'pb-5')}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-words text-sm font-bold text-ink sm:text-base">{entry.name}</span>
                  <Badge tone={KIND_TONES[entry.kind]} className="px-2.5 py-0.5">
                    {TIMELINE_KIND_LABELS[entry.kind]}
                  </Badge>
                </div>
                {entry.text && <p className="break-words text-sm leading-relaxed text-ink-muted">{entry.text}</p>}
                {entry.note && <p className="break-words text-xs leading-relaxed text-ink-faint">{entry.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-fit text-sm font-semibold text-primary-hover hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Свернуть' : `Показать всё (${timeline.length})`}
        </button>
      )}
    </div>
  );
}
