// Компактные плитки по макету — владелец, 2026-09-25.
import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { glassCardShadow } from '../../lib/glass';
import type { RetailInfo } from '../../data/businessCenters';
import { awardsRankingTitle } from '../../lib/tradeCenterRetail';
import {
  awardCategory, awardPill, rankingBadge, rankingSource, shortAwardTitle,
  shortRankingTitle, sortAwardTiles, sortRankingTiles,
} from '../../lib/tradeCenterAwards';
import { retailCardClass } from './tradeCenterRetailStyle';

const goldClass = 'bg-[#f6efdc] text-[#b88a1e]';
const tileClass = 'min-w-0 rounded-2xl border border-border bg-white/65 p-3 sm:p-4';

function PartTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</h3>;
}

export function TradeCenterAwardsBlock({
  info,
  legacyAwardLines = [],
  renderLine = (line) => line,
}: {
  info: RetailInfo | null;
  legacyAwardLines?: string[];
  renderLine?: (line: string) => ReactNode;
}) {
  const awards = sortAwardTiles(info?.awards ?? []);
  const legacy = awards.length ? [] : legacyAwardLines;
  const ranking = sortRankingTiles(info?.ranking ?? []);
  const hasAwards = awards.length > 0 || legacy.length > 0;
  const hasRanking = ranking.length > 0;
  if (!hasAwards && !hasRanking) return null;

  return (
    <div id="awards-ranking" className={retailCardClass} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Trophy className="h-5 w-5 shrink-0 text-icon" />
        {awardsRankingTitle(hasAwards, hasRanking)}
      </h2>
      {hasRanking && (
        <section className="flex flex-col gap-2.5">
          <PartTitle>Места в рейтингах</PartTitle>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {ranking.map((entry, i) => {
              const badge = rankingBadge(entry);
              const meta = [rankingSource(entry), entry.year].filter((part) => part != null && part !== '').join(' · ');
              return (
                <li key={`${entry.criterion}-${i}`} className={`${tileClass} flex items-center gap-3.5`}>
                  <span className={`flex size-[58px] shrink-0 flex-col items-center justify-center rounded-2xl text-center ${entry.place === 1 ? goldClass : 'bg-ink text-white'}`}>
                    <span className="text-2xl font-extrabold leading-none tabular-nums">{badge.main}</span>
                    {badge.sub && <span className="mt-1 text-[10px] leading-none opacity-70">{badge.sub}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink">{shortRankingTitle(entry)}</span>
                    {meta && <span className="mt-1 block text-xs text-ink-muted">{meta}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {hasAwards && (
        <section className="flex flex-col gap-2.5">
          <PartTitle>Награды</PartTitle>
          <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {awards.map((award, i) => {
              const category = awardCategory(award);
              const neutral = award.result === 'finalist' || award.result === 'nominee';
              return (
                <li key={`${award.title}-${i}`} className={`${tileClass} flex flex-col gap-2`}>
                  {award.year && <span className="text-[26px] font-extrabold leading-none tabular-nums text-ink">{award.year}</span>}
                  <span className={`self-start rounded-full px-2.5 py-1 text-[11px] font-bold ${neutral ? 'bg-icon-bg text-icon' : goldClass}`}>{awardPill(award)}</span>
                  <span className="line-clamp-2 break-words text-sm font-semibold leading-snug text-ink">{shortAwardTitle(award)}</span>
                  {category && <span className="line-clamp-2 break-words text-xs leading-snug text-ink-muted">{category}</span>}
                </li>
              );
            })}
            {legacy.map((line, i) => (
              <li key={i} className={tileClass}>
                <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{renderLine(line)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
