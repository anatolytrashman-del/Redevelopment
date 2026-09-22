import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { MarketSnapshot } from '../../data/marketSnapshots';
import { shortName } from '../../lib/businessCenterDisplay';
import {
  BUSINESS_CLASSES,
  fmtYears,
  paybackYears,
  type BusinessClass,
  type BuildingSupply,
  type LotBucket,
  type PriceDriver,
  type VintageCohort,
} from '../../lib/businessCenterAnalytics';

// Блоки страницы аналитики каталога БЦ. Сознательно РАЗНОГО вида
// (владелец, 2026-09-22: «используй разные дизайны блоков») — восемь
// одинаковых стеклянных карточек с заголовком и списком читаются как одна
// длинная таблица, и глаз перестаёт различать, где кончился один сюжет и
// начался другой. Поэтому: тёмная полоса-шапка с ключевыми цифрами,
// коридор-«ящик с усами» для ставок, «гантели» для драйверов, таблица с
// врезанными микро-барами для классов, SVG-диаграмма рассеяния для
// районов, столбики с пунктиром-ориентиром для окупаемости, столбчатая
// гистограмма для возраста фонда, полосы для лотов, чипы для инфраструктуры.
//
// Общее для всех — только шкала подписей и то, что каждая цифра подписана
// своим n. Сравнение, под которым не написано, по скольким объявлениям оно
// посчитано, на этой странице не показывается вовсе.

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

function fmtRent(n: number): string {
  return `$${(Math.round(n * 10) / 10).toLocaleString('ru-RU')}`;
}

function fmtSale(n: number): string {
  return `$${fmtInt(n)}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function offersWord(n: number): string {
  return plural(n, 'объявлению', 'объявлениям', 'объявлениям');
}

// --- Шапка: ключевые цифры одной полосой --------------------------------
// Единственный тёмный блок на странице. Он же — единственный, где цифры
// стоят без пояснений: это оглавление, а не вывод.

export function HeadlineStrip({ items }: { items: { value: string; label: string; note?: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-3 lg:grid-cols-5"
      style={{ backgroundColor: '#14151a' }}
    >
      {items.map((it) => (
        <div key={it.label} className="flex flex-col gap-1 bg-[#14151a] p-4 sm:p-5">
          <span className="text-xl font-extrabold leading-none text-white sm:text-2xl">{it.value}</span>
          <span className="text-xs font-semibold leading-snug text-white/80">{it.label}</span>
          {it.note && <span className="text-[11px] leading-snug text-white/45">{it.note}</span>}
        </div>
      ))}
    </div>
  );
}

// --- Общая обёртка для «обычных» блоков ---------------------------------

function Section({
  title,
  lead,
  children,
  tone = 'glass',
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  tone?: 'glass' | 'plain';
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 p-6 sm:p-8',
        tone === 'glass' ? glassCardClass : 'rounded-3xl border border-border bg-surface',
      )}
      style={tone === 'glass' ? glassCardShadow : undefined}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {lead && <p className="text-sm leading-relaxed text-ink-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

// --- Коридор ставок ------------------------------------------------------
// «Ящик с усами» без усов: от p25 до p75 полосой, медиана — засечкой.
// Смысл блока ровно в том, чтобы читатель не унёс со страницы одно число:
// половина объявлений лежит ВНЕ этой полосы.

export function RateCorridorBlock({ rent, sale }: { rent: MarketSnapshot | null; sale: MarketSnapshot | null }) {
  const rows = [
    rent && { key: 'rent', title: 'Аренда', unit: '$/м² в месяц', s: rent, fmt: fmtRent },
    sale && { key: 'sale', title: 'Покупка', unit: '$/м²', s: sale, fmt: fmtSale },
  ].filter(Boolean) as { key: string; title: string; unit: string; s: MarketSnapshot; fmt: (n: number) => string }[];
  const usable = rows.filter((r) => r.s.median != null && r.s.p25 != null && r.s.p75 != null);
  if (usable.length === 0) return null;

  return (
    <Section
      title="Сколько стоит метр"
      lead="Тёмная полоса — середина рынка: в неё попадает половина объявлений. Вторая половина лежит за её краями, и «средняя ставка» про неё ничего не говорит."
    >
      <div className="flex flex-col gap-5">
        {usable.map((r) => {
          const { median, p25, p75, n } = r.s;
          // Шкала шире коридора, чтобы полоса не упиралась в края и было
          // видно, что за ней тоже есть рынок.
          const lo = p25! - (p75! - p25!) * 0.9;
          const hi = p75! + (p75! - p25!) * 0.9;
          const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
          return (
            <div key={r.key} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold text-ink">
                  {r.title} <span className="font-medium text-ink-faint">· {r.unit}</span>
                </span>
                <span className="text-xs text-ink-muted">
                  по {n} {offersWord(n)}
                </span>
              </div>
              <div className="relative h-11">
                <div className="absolute inset-x-0 top-5 h-px bg-border" />
                <div
                  className="absolute top-2.5 h-6 rounded-lg bg-ink/85"
                  style={{ left: `${pos(p25!)}%`, width: `${pos(p75!) - pos(p25!)}%` }}
                />
                <div
                  className="absolute top-1 h-9 w-0.5 rounded bg-primary"
                  style={{ left: `${pos(median!)}%` }}
                  aria-hidden="true"
                />
                <span
                  className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums text-ink-muted"
                  style={{ left: `${pos(p25!)}%` }}
                >
                  <span className="absolute -left-0 -translate-x-full pr-2">{r.fmt(p25!)}</span>
                </span>
                <span
                  className="absolute top-2.5 whitespace-nowrap pl-2 text-[11px] font-semibold tabular-nums text-ink-muted"
                  style={{ left: `${pos(p75!)}%` }}
                >
                  {r.fmt(p75!)}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                Медиана <span className="font-bold text-ink">{r.fmt(median!)}</span> · середина рынка{' '}
                {r.fmt(p25!)} – {r.fmt(p75!)} · разброс внутри коридора{' '}
                {Math.round(((p75! - p25!) / median!) * 100)}%
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// --- Драйверы ставки -----------------------------------------------------
// «Гантели»: два кружка на общей шкале и подпись, на сколько процентов
// дороже. Ранжированы по величине надбавки — верхняя строка отвечает на
// вопрос «за что тут вообще платят».

export function PriceDriversBlock({ drivers }: { drivers: PriceDriver[] }) {
  if (drivers.length === 0) return null;
  const all = drivers.flatMap((d) => [d.low.median, d.high.median]);
  const lo = Math.min(...all) * 0.9;
  const hi = Math.max(...all) * 1.05;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <Section
      tone="plain"
      title="От чего зависит ставка"
      lead="Каждая строка — один и тот же рынок, разрезанный по одному признаку здания. Слева медиана дешёвой половины, справа — дорогой."
    >
      <div className="flex flex-col divide-y divide-border">
        {drivers.map((d) => (
          <div key={d.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-ink">{d.title}</span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular-nums',
                  d.deltaPct >= 25 ? 'bg-ink text-white' : 'bg-surface-muted text-ink',
                )}
              >
                +{d.deltaPct}%
              </span>
            </div>
            <div className="relative h-7">
              <div
                className="absolute top-3 h-0.5 rounded bg-border-strong"
                style={{ left: `${pos(d.low.median)}%`, width: `${pos(d.high.median) - pos(d.low.median)}%` }}
              />
              <span
                className="absolute top-1.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-border-strong bg-surface"
                style={{ left: `${pos(d.low.median)}%` }}
                aria-hidden="true"
              />
              <span
                className="absolute top-1.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-primary"
                style={{ left: `${pos(d.high.median)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-xs">
              <span className="text-ink-muted">
                <span className="font-bold tabular-nums text-ink">{fmtRent(d.low.median)}</span> — {d.low.label} ({d.low.n})
              </span>
              {/* grow, а не только text-right: на узком экране строка
                  переносится, и без роста правая половина прилипала бы к
                  левому краю — читалось как ещё одна «дешёвая» сторона. */}
              <span className="grow text-right text-ink-muted">
                <span className="font-bold tabular-nums text-primary-hover">{fmtRent(d.high.median)}</span> — {d.high.label} ({d.high.n})
              </span>
            </div>
            <p className="text-xs leading-snug text-ink-faint">{d.hint}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Классы: таблица с врезанными барами --------------------------------

export interface ClassRow {
  cls: BusinessClass;
  count: number;
  area: number;
  medianAge: number | null;
  rent: MarketSnapshot | null;
  sale: MarketSnapshot | null;
}

export function ClassMatrixBlock({ rows }: { rows: ClassRow[] }) {
  const usable = rows.filter((r) => r.count > 0);
  if (usable.length === 0) return null;
  const maxArea = Math.max(...usable.map((r) => r.area));
  const maxRent = Math.max(...usable.map((r) => r.rent?.median ?? 0));

  return (
    <Section
      title="Цены по классам"
      lead="Ставка, цена покупки и срок окупаемости по каждому классу — и сколько зданий этого класса вообще есть в городе."
    >
      {/* На узком экране пять колонок не помещаются, а горизонтальный скролл
          прятал бы самую интересную — окупаемость. Поэтому до sm блок
          рисуется карточками, а таблицей становится только там, где она
          влезает целиком. */}
      <div className="flex flex-col gap-3 sm:hidden">
        {usable.map((r) => {
          const payback = paybackYears(r.rent?.median ?? null, r.sale?.median ?? null);
          return (
            <div key={r.cls} className="flex flex-col gap-2 rounded-2xl bg-surface-muted p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-ink px-2 text-xs font-extrabold text-white">
                  {r.cls}
                </span>
                <span className="text-sm font-bold text-ink">{r.count} зданий</span>
                {r.area > 0 && <span className="text-xs text-ink-faint">· {fmtInt(r.area)} м²</span>}
                {r.medianAge != null && <span className="text-xs text-ink-faint">· медиана {r.medianAge} г.</span>}
              </div>
              <dl className="grid grid-cols-3 gap-2">
                <div className="flex flex-col">
                  <dt className="text-[11px] text-ink-faint">Аренда</dt>
                  <dd className="text-sm font-bold tabular-nums text-ink">
                    {r.rent?.median != null ? `${fmtRent(r.rent.median)}/м²` : '—'}
                  </dd>
                  {r.rent?.n != null && <dd className="text-[11px] tabular-nums text-ink-faint">{r.rent.n} объявл.</dd>}
                </div>
                <div className="flex flex-col">
                  <dt className="text-[11px] text-ink-faint">Покупка</dt>
                  <dd className="text-sm font-bold tabular-nums text-ink">
                    {r.sale?.median != null ? `${fmtSale(r.sale.median)}/м²` : '—'}
                  </dd>
                  {r.sale?.n != null && <dd className="text-[11px] tabular-nums text-ink-faint">{r.sale.n} объявл.</dd>}
                </div>
                <div className="flex flex-col">
                  <dt className="text-[11px] text-ink-faint">Окупаемость</dt>
                  <dd className="text-sm font-bold tabular-nums text-ink">{payback != null ? fmtYears(payback) : '—'}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <th className="py-2 pr-3 font-semibold">Класс</th>
              <th className="py-2 pr-3 font-semibold">Зданий и площадь</th>
              <th className="py-2 pr-3 font-semibold">Аренда, $/м²</th>
              <th className="py-2 pr-3 font-semibold">Покупка, $/м²</th>
              <th className="py-2 font-semibold">Окупаемость</th>
            </tr>
          </thead>
          <tbody>
            {usable.map((r) => {
              const payback = paybackYears(r.rent?.median ?? null, r.sale?.median ?? null);
              return (
                <tr key={r.cls} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-3 pr-3">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-ink px-2 text-xs font-extrabold text-white">
                      {r.cls}
                    </span>
                    {r.medianAge != null && (
                      <span className="mt-1 block text-[11px] text-ink-faint">медиана {r.medianAge} г.</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <span className="block text-sm font-bold tabular-nums text-ink">{r.count}</span>
                    <span className="mt-1 block h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className="block h-full rounded-full bg-border-strong"
                        style={{ width: `${Math.max(3, (r.area / maxArea) * 100)}%` }}
                      />
                    </span>
                    <span className="mt-1 block text-[11px] tabular-nums text-ink-faint">{fmtInt(r.area)} м²</span>
                  </td>
                  <td className="py-3 pr-3">
                    {r.rent?.median != null ? (
                      <>
                        <span className="block text-sm font-bold tabular-nums text-ink">{fmtRent(r.rent.median)}</span>
                        <span className="mt-1 block h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-surface-muted">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(3, (r.rent.median / maxRent) * 100)}%` }}
                          />
                        </span>
                        <span className="mt-1 block text-[11px] tabular-nums text-ink-faint">
                          {r.rent.p25 != null && r.rent.p75 != null && `${fmtRent(r.rent.p25)}–${fmtRent(r.rent.p75)} · `}
                          {r.rent.n}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-ink-faint">нет данных</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    {r.sale?.median != null ? (
                      <>
                        <span className="block text-sm font-bold tabular-nums text-ink">{fmtSale(r.sale.median)}</span>
                        <span className="mt-1 block text-[11px] tabular-nums text-ink-faint">{r.sale.n} объявл.</span>
                      </>
                    ) : (
                      <span className="text-xs text-ink-faint">нет данных</span>
                    )}
                  </td>
                  <td className="py-3">
                    {payback != null ? (
                      <span className="text-sm font-bold tabular-nums text-ink">{fmtYears(payback)}</span>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// --- Районы: диаграмма рассеяния ----------------------------------------
// Два вопроса сразу: где дорого и где вообще есть из чего выбирать. Списком
// это два блока, точками — один, и в нём видны «дешёвые, но пустые» районы.

export interface DistrictPoint {
  district: string;
  count: number;
  area: number;
  rent: number;
  href: string;
}

export function DistrictScatterBlock({
  points,
  cityRent,
}: {
  points: DistrictPoint[];
  cityRent: number | null;
}) {
  if (points.length < 3) return null;
  const W = 640;
  const H = 320;
  const PAD = { top: 34, right: 18, bottom: 40, left: 54 };
  const rents = points.map((p) => p.rent);
  const areas = points.map((p) => p.area);
  const xMin = Math.min(...rents) - 1.2;
  const xMax = Math.max(...rents) + 1.2;
  const yMax = Math.max(...areas) * 1.12;
  const x = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
  const maxCount = Math.max(...points.map((p) => p.count));
  const r = (n: number) => 6 + Math.sqrt(n / maxCount) * 12;
  const yTicks = [0, yMax / 2, yMax].map((v) => Math.round(v / 50000) * 50000).filter((v, i, a) => a.indexOf(v) === i);

  // Подписи районов раскладываем с проверкой на пересечение. Без неё
  // «Центральный» и «Первомайский» — соседи и по ставке, и по объёму —
  // печатались друг поверх друга, и нижняя строка одного пропадала под
  // верхней строкой другого. Жадная раскладка: пробуем позиции по очереди
  // (над точкой, под точкой, дальше от неё) и берём первую свободную; если
  // свободной нет, оставляем последнюю — подпись потерять хуже, чем
  // наложить.
  const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const labels = points.map((p) => {
    const cx = x(p.rent);
    const cy = y(p.area);
    const name = p.district.replace(' район', '');
    const halfW = Math.max(name.length, 12) * 3.1;
    const rad = r(p.count);
    // Смещение верхней строки блока подписи (имя + строка с цифрами).
    // Блок высотой 26, поэтому «над точкой» — это минус радиус минус вся
    // высота блока, а не минус радиус: иначе нижняя строка ложится внутрь
    // кружка.
    // Вариант, уезжающий за верхний или нижний край картинки, отбрасываем
    // сразу: подпись у точки под самым потолком (Центральный — и самый
    // дорогой район, и самый объёмный) иначе обрезалась viewBox'ом.
    const candidates = [-rad - 30, rad + 8, -rad - 52, rad + 30, -rad - 74, rad + 52].filter(
      (c) => cy + c >= 2 && cy + c + 26 <= H - PAD.bottom + 18,
    );
    let offset = candidates[0] ?? rad + 8;
    for (const c of candidates) {
      const y1 = cy + c;
      const box = { x1: cx - halfW, y1, x2: cx + halfW, y2: y1 + 26 };
      const hit = placed.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
      if (!hit) {
        offset = c;
        break;
      }
    }
    const y1 = cy + offset;
    placed.push({ x1: cx - halfW, y1, x2: cx + halfW, y2: y1 + 26 });
    return { ...p, cx, cy, rad, name, nameY: y1 + 9, metaY: y1 + 21 };
  });

  return (
    <Section
      title="Цены и площади по районам"
      lead="По горизонтали — медианная ставка аренды в районе, по вертикали — сколько офисной площади в нём вообще есть. Размер точки — число зданий каталога."
    >
      <p className="text-xs text-ink-faint sm:hidden">Диаграмму можно прокрутить вбок — или посмотреть тот же порядок списком под ней.</p>
      <div className="-mx-2 overflow-x-auto sm:mx-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[34rem]"
          role="img"
          aria-label="Диаграмма: медианная ставка аренды и объём офисной площади по районам Минска"
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 10 }}>
                {t === 0 ? '0' : `${Math.round(t / 1000)}к`}
              </text>
            </g>
          ))}
          {cityRent != null && (
            <>
              <line
                x1={x(cityRent)}
                x2={x(cityRent)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--color-border-strong)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text x={x(cityRent) + 5} y={PAD.top + 10} className="fill-ink-faint" style={{ fontSize: 10 }}>
                медиана города {fmtRent(cityRent)}
              </text>
            </>
          )}
          {labels.map((p) => (
            <g key={p.district}>
              <circle cx={p.cx} cy={p.cy} r={p.rad} fill="var(--color-primary)" fillOpacity="0.18" />
              <circle cx={p.cx} cy={p.cy} r={4} fill="var(--color-primary)" />
              <text x={p.cx} y={p.nameY} textAnchor="middle" className="fill-ink" style={{ fontSize: 11, fontWeight: 700 }}>
                {p.name}
              </text>
              <text x={p.cx} y={p.metaY} textAnchor="middle" className="fill-ink-faint" style={{ fontSize: 10 }}>
                {p.count} БЦ · {fmtRent(p.rent)}
              </text>
            </g>
          ))}
          <text x={W / 2} y={H - 6} textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 11 }}>
            медианная ставка аренды, $/м² в месяц →
          </text>
          <text
            x={-H / 2}
            y={12}
            transform="rotate(-90)"
            textAnchor="middle"
            className="fill-ink-muted"
            style={{ fontSize: 11 }}
          >
            площадь БЦ, м² →
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {[...points]
          .sort((a, b) => b.rent - a.rent)
          .map((p) => (
            <Link
              key={p.district}
              to={p.href}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-primary hover:text-primary-hover"
            >
              {p.district.replace(' район', '')} · {fmtRent(p.rent)}
            </Link>
          ))}
      </div>
    </Section>
  );
}

// --- Окупаемость: столбики с ориентиром ---------------------------------

export interface PaybackRow {
  label: string;
  years: number;
  rent: number;
  sale: number;
  nRent: number;
  nSale: number;
}

export function PaybackBlock({ rows, cityYears }: { rows: PaybackRow[]; cityYears: number | null }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.years), cityYears ?? 0) * 1.08;

  return (
    <Section
      title="За сколько лет окупится покупка"
      lead={
        cityYears != null ? (
          <>
            По городу метр окупается за <b className="text-ink">{fmtYears(cityYears)}</b> — это красная линия на
            шкале. Тёмные полосы окупаются быстрее города, светлые — медленнее.
          </>
        ) : (
          'Чем короче полоса, тем выгоднее покупать, а не арендовать.'
        )
      }
    >
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs font-semibold text-ink sm:w-36 sm:text-sm">{r.label}</span>
            <span className="relative h-7 flex-1">
              <span
                className={cn(
                  'absolute inset-y-0 left-0 flex items-center justify-end rounded-lg pr-2',
                  cityYears != null && r.years <= cityYears ? 'bg-ink' : 'bg-border-strong',
                )}
                style={{ width: `${(r.years / max) * 100}%` }}
              >
                <span
                  className={cn(
                    'text-[11px] font-extrabold tabular-nums',
                    cityYears != null && r.years <= cityYears ? 'text-white' : 'text-ink',
                  )}
                >
                  {(Math.round(r.years * 10) / 10).toLocaleString('ru-RU')}
                </span>
              </span>
              {cityYears != null && (
                <span
                  className="absolute inset-y-0 w-px bg-primary"
                  style={{ left: `${(cityYears / max) * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="hidden w-32 shrink-0 text-right text-[11px] tabular-nums text-ink-faint sm:block">
              {fmtRent(r.rent)} / {fmtSale(r.sale)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Возраст фонда: столбчатая гистограмма с долями классов -------------

export function VintageBlock({ cohorts }: { cohorts: VintageCohort[] }) {
  if (cohorts.length === 0) return null;
  const max = Math.max(...cohorts.map((c) => c.total));
  const total = cohorts.reduce((s, c) => s + c.total, 0);
  const classColor: Record<BusinessClass, string> = {
    A: 'bg-ink',
    'B+': 'bg-ink/65',
    B: 'bg-ink/40',
    C: 'bg-ink/20',
  };

  return (
    <Section
      tone="plain"
      title="Возраст зданий"
      lead="Столбец — сколько зданий каталога сдано в эти годы, заливка внутри — из каких они классов."
    >
      <div className="flex items-end gap-2 sm:gap-3">
        {cohorts.map((c) => (
          <div key={c.label} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs font-extrabold tabular-nums text-ink">{c.total}</span>
            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-t-lg bg-surface-muted"
              style={{ height: `${Math.max(8, (c.total / max) * 150)}px` }}
            >
              {BUSINESS_CLASSES.map((cls) =>
                c.byClass[cls] > 0 ? (
                  <span
                    key={cls}
                    className={classColor[cls]}
                    style={{ height: `${(c.byClass[cls] / c.total) * 100}%` }}
                    title={`Класс ${cls}: ${c.byClass[cls]}`}
                  />
                ) : null,
              )}
            </div>
            <span className="text-center text-[10px] font-semibold leading-tight text-ink-muted sm:text-[11px]">
              {c.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
        {BUSINESS_CLASSES.map((cls) => (
          <span key={cls} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-sm', classColor[cls])} />
            класс {cls}
          </span>
        ))}
        <span className="text-ink-faint">всего {total} зданий с известным годом</span>
      </div>
    </Section>
  );
}

// --- Что сейчас предлагают: лоты ----------------------------------------

export function LotSizeBlock({
  buckets,
  onPick,
  totalLots,
  totalArea,
  buildings,
  catalogSize,
}: {
  buckets: LotBucket[];
  onPick: (min: number) => void;
  totalLots: number;
  totalArea: number;
  buildings: number;
  catalogSize: number;
}) {
  const usable = buckets.filter((b) => b.n > 0);
  if (usable.length === 0) return null;
  const maxN = Math.max(...usable.map((b) => b.n));

  return (
    <Section
      title="Что предлагают сейчас"
      lead={
        <>
          {totalLots} офисных лотов на {fmtInt(totalArea)} м² в {buildings} зданиях из {catalogSize}. Полоса — сколько
          лотов такого размера, цифра справа — медианная ставка в этой корзине.
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {usable.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => onPick(b.min || 0)}
            className="group flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
          >
            <span className="w-20 shrink-0 text-xs font-semibold text-ink sm:w-24 sm:text-sm">{b.label}</span>
            <span className="relative h-6 flex-1 rounded-lg bg-surface-muted">
              <span
                className="absolute inset-y-0 left-0 flex items-center justify-end rounded-lg bg-ink/80 pr-2 transition-colors group-hover:bg-ink"
                style={{ width: `${Math.max(6, (b.n / maxN) * 100)}%` }}
              >
                <span className="text-[11px] font-bold tabular-nums text-white">{b.n}</span>
              </span>
            </span>
            <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-ink sm:w-28">
              {b.median != null ? `${fmtRent(b.median)}/м²` : '—'}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

// --- Крайние здания ------------------------------------------------------

export function ExtremesBlock({ top, bottom }: { top: BuildingSupply[]; bottom: BuildingSupply[] }) {
  if (top.length === 0 || bottom.length === 0) return null;
  // Разрыв считаем, а не подписываем словом: состав краёв меняется с
  // каждым синком объявлений, и «почти пятикратный» в тексте пережил бы
  // те данные, про которые это было правдой.
  const highest = top[0]?.median ?? null;
  const lowest = bottom[bottom.length - 1]?.median ?? null;
  const gap = highest != null && lowest != null && lowest > 0 ? highest / lowest : null;
  const Column = ({ title, rows, tone }: { title: string; rows: BuildingSupply[]; tone: 'high' | 'low' }) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h3>
      <ol className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.center.slug} className="py-2 first:pt-0 last:pb-0">
            <Link
              to={`/minsk/bcminsk/${r.center.slug}`}
              className="flex items-baseline justify-between gap-3 hover:text-primary-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{shortName(r.center)}</span>
                <span className="block truncate text-[11px] text-ink-faint">
                  {[r.center.businessClass && `класс ${r.center.businessClass}`, r.center.district]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-sm font-extrabold tabular-nums',
                  tone === 'high' ? 'text-primary-hover' : 'text-ink',
                )}
              >
                {r.median != null ? fmtRent(r.median) : '—'}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <Section
      title="Самые дорогие и дешёвые бизнес-центры"
      lead={`Здания каталога с самой высокой и самой низкой медианной ставкой аренды офисов${
        gap != null ? `. Разница между ними — в ${(Math.round(gap * 10) / 10).toLocaleString('ru-RU')} раза` : ''
      }.`}
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Column title="Дороже всего" rows={top} tone="high" />
        <Column title="Дешевле всего" rows={bottom} tone="low" />
      </div>
    </Section>
  );
}

// --- Кто сидит в бизнес-центрах -----------------------------------------

export interface IndustryRow {
  name: string;
  orgs: number;
  share: number;
}

export function TenantIndustriesBlock({
  rows,
  orgTotal,
  buildingTotal,
  otherShare,
}: {
  rows: IndustryRow[];
  orgTotal: number;
  buildingTotal: number;
  otherShare: number;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.orgs));

  return (
    <Section
      tone="plain"
      title="Кто арендует офисы"
      lead={`${fmtInt(orgTotal)} организаций в ${buildingTotal} зданиях каталога, свёрнутые в отрасли — это будущие соседи по зданию.${
        // Оговорка стоит в лиде, а не сноской под списком: без неё первая
        // строка рейтинга выглядит как доля от всех арендаторов, хотя пятая
        // часть из них в отрасли вообще не разнесена.
        otherShare > 0 ? ` Ещё ${otherShare}% карты помечают рубрикой, по которой отрасль не определить, — их в списке нет.` : ''
      }`}
    >
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-xs text-ink sm:w-60 sm:text-sm" title={r.name}>
              {r.name}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(r.orgs / max) * 100}%` }} />
            </span>
            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-ink-muted sm:w-24">
              {r.orgs} · {r.share}%
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Инфраструктура и инженерия: чипы -----------------------------------

export interface AmenityChip {
  label: string;
  count: number;
  total: number;
  href?: string;
}

export function AmenitiesBlock({ groups }: { groups: { title: string; note: string; chips: AmenityChip[] }[] }) {
  const usable = groups.filter((g) => g.chips.some((c) => c.count > 0));
  if (usable.length === 0) return null;

  return (
    <Section
      title="Что есть в зданиях, кроме офисов"
      lead="Доля зданий каталога, у которых признак подтверждён источником. Незакрашенная часть — «в данных не нашли», а не «точно нет»."
    >
      <div className="flex flex-col gap-5">
        {usable.map((g) => (
          <div key={g.title} className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-bold text-ink">{g.title}</h3>
              <p className="text-xs text-ink-faint">{g.note}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.chips
                .filter((c) => c.count > 0)
                .map((c) => {
                  const pct = Math.round((c.count / c.total) * 100);
                  const inner = (
                    <>
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-primary/12"
                        style={{ width: `${pct}%` }}
                        aria-hidden="true"
                      />
                      <span className="relative text-ink">{c.label}</span>
                      <span className="relative font-extrabold tabular-nums text-ink">{c.count}</span>
                      <span className="relative text-[11px] tabular-nums text-ink-faint">{pct}%</span>
                    </>
                  );
                  const className =
                    'relative flex items-center gap-2 overflow-hidden rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold';
                  return c.href ? (
                    <Link key={c.label} to={c.href} className={cn(className, 'hover:border-primary')}>
                      {inner}
                    </Link>
                  ) : (
                    <span key={c.label} className={className}>
                      {inner}
                    </span>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
