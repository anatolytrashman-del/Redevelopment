import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Trophy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { PURCHASE_ITEM_MATCH_KIND_LABELS } from '../../data/purchases';
import type { EstimateMaterial } from '../../data/estimates';
import type { ExchangeRate } from '../../data/exchangeRates';
import { formatMoney, formatUnit, type Column } from './priceComparisonModel';
import { buildRanking, rankingWinner, type RiskLookup, type SupplierScore } from './singleSupplierRanking';

// «Заказать всё в одном месте» — экранная часть расчёта из
// singleSupplierRanking.ts (там же, в шапке, почему эталон собирается по
// «ровно», а не по самой дешёвой цене вообще). Блок стоит НАД таблицей:
// владелец, 2026-09-17, «вручную сравнить столько цен стало сложно» — к
// моменту, когда глаз доходит до сетки 5 × 11, решение уже должно быть
// названо, а сетка нужна, чтобы его перепроверить.

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function SingleSupplierPanel({
  columns,
  positions,
  rate,
  saving,
  onPickAll,
  riskOf,
}: {
  columns: Column[];
  positions: EstimateMaterial[];
  rate: ExchangeRate | undefined;
  saving: boolean;
  onPickAll: (col: Column) => void;
  // Риск по ИНН (Checko) — владелец, 2026-09-17: «мы никогда не ставим на
  // первое место поставщика с красными флагами, возникшими в ходе проверки
  // по ИНН. Побеждает всегда самое выгодное предложение из безопасных».
  riskOf: RiskLookup;
}) {
  const ranking = useMemo(() => buildRanking(columns, positions, rate, riskOf), [columns, positions, rate, riskOf]);
  const winner = rankingWinner(ranking);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!winner) return null;
  const { currency } = ranking;

  // Переплата в процентах считается от эталонной корзины ПО ТЕМ ЖЕ
  // позициям: у поставщика, закрывшего 4 из 5, знаменатель тоже из четырёх,
  // иначе он выглядел бы дешевле просто потому, что чего-то не предложил.
  function overpayPct(s: SupplierScore): number | null {
    if (s.total == null || s.overpay == null) return null;
    const reference = s.total - s.overpay;
    return reference > 0 ? s.overpay / reference : null;
  }

  function OverpayLabel({ s }: { s: SupplierScore }) {
    if (s.overpay == null) return <span className="text-ink-faint">—</span>;
    const pct = overpayPct(s);
    const suffix = pct != null ? ` (${pct > 0 ? '+' : '−'}${Math.abs(Math.round(pct * 100))} %)` : '';
    if (Math.round(s.overpay) === 0) return <span className="text-ink-muted">по лучшим ценам</span>;
    return (
      <span className={cn('font-semibold tabular-nums', s.overpay > 0 ? 'text-ink' : 'text-success')}>
        {s.overpay > 0 ? '+' : '−'}
        {formatMoney(Math.abs(s.overpay), currency)}
        <span className="font-normal text-ink-muted">{suffix}</span>
      </span>
    );
  }

  const winnerPct = overpayPct(winner);

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border bg-surface-muted px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Заказать всё у одного</span>
            <span className="mt-0.5 block text-sm text-ink">
              <span className="text-base font-bold">{winner.name}</span>{' '}
              {winner.risk && (
                <span
                  title={winner.risk.summary}
                  className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold align-middle', winner.risk.level === 'danger' ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning')}
                >
                  <AlertTriangle className="h-3 w-3" /> есть риски по ИНН
                </span>
              )}{' '}
              — закрывает {winner.covered} из {positions.length}{' '}
              {plural(positions.length, 'позиции', 'позиций', 'позиций')}, из них{' '}
              <span className="font-semibold">{winner.exact} «ровно»</span>
              {winner.bestExact > 0 && ` (${winner.bestExact} по лучшей цене среди «ровно»)`}
              {winner.alternative > 0 && `, ${winner.alternative} ${plural(winner.alternative, 'аналог', 'аналога', 'аналогов')}`}
              {winner.check > 0 && `, ${winner.check} «уточнить»`}.
            </span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              {winner.total != null ? formatMoney(winner.total, currency) : '—'} на объём ведомости
              {winner.delivery != null ? ` + доставка ${formatMoney(winner.delivery, currency)}` : ', доставка не названа'}
              {winner.overpay != null &&
                Math.round(winner.overpay) !== 0 &&
                ` · ${winner.overpay > 0 ? 'дороже' : 'дешевле'} лучших цен на ${formatMoney(Math.abs(winner.overpay), currency)}${
                  winnerPct != null ? ` (${Math.abs(Math.round(winnerPct * 100))} %)` : ''
                }`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onPickAll(winner.column)}
            className="rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-success hover:text-success"
          >
            Выбрать всё у него
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-ink-muted hover:text-ink">
            {open ? 'Свернуть' : `Все ${ranking.scores.length}`}
          </button>
        </div>
      </div>

      {winner.missing.length > 0 && (
        <p className="text-xs text-warning">
          Цены нет на {winner.missing.length} {plural(winner.missing.length, 'позицию', 'позиции', 'позиций')}:{' '}
          {winner.missing.map((p) => p.name).join('; ')} — на них придётся второй поставщик либо запрос ему же.
        </p>
      )}
      {ranking.noExactPositions.length > 0 && (
        <p className="text-xs text-ink-muted">
          «Ровно по ведомости» никто не дал на {ranking.noExactPositions.length}{' '}
          {plural(ranking.noExactPositions.length, 'позицию', 'позиции', 'позиций')} ({ranking.noExactPositions.map((p) => p.name).join('; ')}) — там
          лучшей ценой считается лучшая замена.
        </p>
      )}
      {ranking.riskyLeader && (
        <p className="text-xs text-warning">
          «{ranking.riskyLeader.name}» был бы выгоднее, но у него риски по проверке ИНН ({ranking.riskyLeader.risk!.summary}) — на первое место не ставим.
        </p>
      )}
      {ranking.incomparable && (
        <p className="text-xs text-warning">Часть цен в другой валюте, а курса на сегодня нет — эти суммы в расчёт не вошли.</p>
      )}

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="py-1 pr-2 font-medium">Поставщик</th>
                <th className="whitespace-nowrap py-1 pr-2 font-medium">Закрыто</th>
                <th className="py-1 pr-2 font-medium">Соответствие</th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-medium">Сумма на объём</th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-medium">Доставка</th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-medium">К лучшим ценам</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {ranking.scores.map((s) => {
                const isOpen = expanded === s.column.offer.id;
                return [
                  <tr key={s.column.offer.id} className={cn('border-t border-border align-top', s === winner && 'bg-success-bg/40')}>
                    <td className="py-1.5 pr-2 font-semibold text-ink">
                      {s.name}
                      {s.risk && (
                        <span title={s.risk.summary} className={cn('ml-1 inline-flex align-middle', s.risk.level === 'danger' ? 'text-danger' : 'text-warning')}>
                          <AlertTriangle className="h-3 w-3" />
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-ink">
                      {s.covered} из {positions.length}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-ink-muted">
                      <span className={cn(s.exact > 0 && 'font-semibold text-ink')}>ровно {s.exact}</span>
                      {s.bestExact > 0 && <span className="text-success"> ({s.bestExact} лучш.)</span>} · аналог {s.alternative} · уточнить {s.check}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-ink">{s.total != null ? formatMoney(s.total, currency) : '—'}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-ink-muted">
                      {s.delivery != null ? formatMoney(s.delivery, currency) : 'не названа'}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-right">
                      <OverpayLabel s={s} />
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : s.column.offer.id)}
                        className="inline-flex items-center gap-0.5 font-medium text-ink-muted hover:text-ink"
                      >
                        {isOpen ? 'скрыть' : 'по позициям'}
                        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
                      </button>
                    </td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${s.column.offer.id}-lines`} className="border-t border-border bg-surface">
                      <td colSpan={7} className="px-2 py-2">
                        <div className="flex flex-col gap-1.5">
                          {s.lines.map((line) => (
                            <div key={line.position.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="min-w-[220px] flex-1 text-ink">{line.position.name}</span>
                              {line.cell ? (
                                <>
                                  <span className="tabular-nums text-ink">
                                    {formatUnit(line.cell.unitPrice, line.cell.currency)}/{line.position.unit}
                                  </span>
                                  <span
                                    className={cn(
                                      'rounded-full px-1.5 py-px text-[10.5px] font-medium',
                                      line.cell.kind === 'exact'
                                        ? 'bg-success-bg text-success'
                                        : line.cell.kind === 'alternative'
                                          ? 'bg-warning-bg text-warning'
                                          : 'bg-surface-muted text-ink-muted',
                                    )}
                                  >
                                    {PURCHASE_ITEM_MATCH_KIND_LABELS[line.cell.kind]}
                                  </span>
                                  {line.isReference ? (
                                    <span className="text-[11px] font-semibold text-success">лучшая цена</span>
                                  ) : line.diff != null && Math.round(line.diff) !== 0 ? (
                                    <span className={cn('text-[11px] tabular-nums', line.diff > 0 ? 'text-ink-muted' : 'text-success')}>
                                      {line.diff > 0 ? '+' : '−'}
                                      {formatMoney(Math.abs(line.diff), currency)} к {line.referenceKind === 'any' ? 'лучшей замене' : 'лучшему «ровно»'} у «
                                      {line.referenceSupplier}»
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-[11px] text-warning">
                                  цены нет
                                  {line.referenceSupplier ? ` · лучшая у «${line.referenceSupplier}»` : ''}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
