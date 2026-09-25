// «Награды и рейтинги» торгового центра (2026-09-24). Владелец про прежний
// вид, где места в рейтингах стояли жёлтыми плашками в «Что на каком
// этаже»: «смешал две сущности — что на каком этаже и награды… награды
// можно проработать прям сознательно и получше, сделай отдельным блоком».
//
// Две части в одной карточке:
// - «Награды» — retail_info.awards: плитка на награду, иконка по результату
//   (кубок — награда получена, медаль — финал, звезда — номинация), бейдж
//   результата (жёлтый — победа, зелёный — диплом/лауреат, серый — финал и
//   номинация: красный в палитре читается как авария, см. CLAUDE.md).
//   Пока структурных наград у ТЦ нет, а строки с иконкой 'award' в
//   highlights есть — показываем их списком здесь же, чтобы не было двух
//   блоков про одно и то же.
// - «Место в рейтингах» — retail_info.ranking: крупная цифра места «из N»,
//   справа формулировка и «значение · год».
//
import type { ReactNode } from 'react';
import { Award, Medal, Star, Trophy, type LucideIcon } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { glassCardShadow } from '../../lib/glass';
import type { RetailAwardEntry, RetailAwardResult, RetailInfo } from '../../data/businessCenters';
import {
  awardDetails,
  awardMeta,
  awardResultLabel,
  awardsRankingTitle,
  rankingMeta,
  rankingView,
  sortAwards,
  sortRanking,
} from '../../lib/tradeCenterRetail';
import { retailCardClass } from './tradeCenterRetailStyle';

const RESULT_ICONS: Record<RetailAwardResult, LucideIcon> = {
  winner: Trophy,
  diploma: Trophy,
  laureate: Trophy,
  finalist: Medal,
  nominee: Star,
  other: Award,
};

const RESULT_TONES: Record<RetailAwardResult, 'warning' | 'success' | 'neutral'> = {
  winner: 'warning',
  diploma: 'success',
  laureate: 'success',
  finalist: 'neutral',
  nominee: 'neutral',
  other: 'neutral',
};

const upperFirst = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function PartTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</h3>;
}

function AwardTile({ award }: { award: RetailAwardEntry }) {
  const Icon = RESULT_ICONS[award.result];
  const result = awardResultLabel(award);
  const meta = awardMeta(award);
  const details = awardDetails(award);
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-white/65 p-3 sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-icon-bg text-icon">
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="break-words text-base font-semibold leading-snug text-ink">{award.title}</span>
        {result && (
          <Badge tone={RESULT_TONES[award.result]} className="self-start px-2.5 py-0.5">
            {upperFirst(result)}
          </Badge>
        )}
        {meta && <span className="break-words text-sm leading-snug text-ink-muted">{meta}</span>}
        {details && <span className="break-words text-xs leading-snug text-ink-muted">{details}</span>}
        {award.text && <p className="break-words text-sm leading-relaxed text-ink-muted">{award.text}</p>}
      </div>
    </li>
  );
}

export function TradeCenterAwardsBlock({
  info,
  legacyAwardLines = [],
  renderLine = (line) => line,
}: {
  info: RetailInfo | null;
  /** Строки наград из highlights — запасной вариант, пока нет retail_info.awards. */
  legacyAwardLines?: string[];
  renderLine?: (line: string) => ReactNode;
}) {
  const awards = sortAwards(info?.awards ?? []);
  const legacy = awards.length ? [] : legacyAwardLines;
  const ranking = sortRanking(info?.ranking ?? []);
  const hasAwards = awards.length > 0 || legacy.length > 0;
  const hasRanking = ranking.length > 0;
  if (!hasAwards && !hasRanking) return null;
  const both = hasAwards && hasRanking;

  return (
    <div id="awards-ranking" className={retailCardClass} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Trophy className="h-5 w-5 shrink-0 text-icon" />
        {awardsRankingTitle(hasAwards, hasRanking)}
      </h2>

      {hasAwards && (
        <section className="flex flex-col gap-2">
          {both && <PartTitle>Награды</PartTitle>}
          {awards.length > 0 ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {awards.map((award, i) => (
                <AwardTile key={`${award.title}-${i}`} award={award} />
              ))}
            </ul>
          ) : (
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-muted marker:text-ink-muted">
              {legacy.map((line, i) => (
                <li key={i}>{renderLine(line)}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {hasRanking && (
        <section className="flex flex-col gap-2">
          {both && <PartTitle>Место в рейтингах</PartTitle>}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ranking.map((entry, i) => {
              const view = rankingView(entry);
              const meta = rankingMeta({ ...view, source: null });
              return (
                <li
                  key={`${entry.criterion}-${i}`}
                  className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-white/65 p-3 sm:gap-4 sm:p-4"
                >
                  <span className="flex w-12 shrink-0 flex-col items-center pt-0.5 text-center">
                    <span className="text-3xl font-bold leading-none tabular-nums text-primary">{view.place}</span>
                    <span className="mt-1 text-xs leading-tight text-ink-muted">
                      {view.total != null ? `из ${view.total}` : 'место'}
                    </span>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words text-sm font-semibold leading-snug text-ink">{view.headline}</span>
                    {view.scope && (
                      <span className="break-words text-sm leading-snug text-ink-muted">
                        {upperFirst(view.scope)}
                      </span>
                    )}
                    {meta && <span className="break-words text-xs leading-snug text-ink-muted">{meta}</span>}
                    {view.note && <span className="break-words text-xs leading-snug text-ink-faint">{view.note}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
