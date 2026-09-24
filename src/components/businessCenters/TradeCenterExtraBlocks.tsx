// Дополнительные карточки страницы ТЦ (2026-09-23, схема
// tc-catalog/codex/briefs/extras-schema.md), все из business_centers.retail_info:
//
// - «Посетителю» — одна карточка на пять тем (режим работы, парковка, как
//   добраться, правила посещения, скидки и события). Пять отдельных
//   карточек по две-три строки раздули бы страницу на пару экранов; здесь
//   короткие панели стоят в две колонки (CSS columns сами выравнивают
//   высоту колонок). Удобства (retail_info.services) с 2026-09-24 живут не
//   здесь, а в общем блоке «Инфраструктура» вместе с оборудованием из
//   Яндекс.Карт (TradeCenterInfrastructure.tsx).
// - «Арендаторам и рекламодателям» — для бизнес-аудитории сайта: крупные
//   цифры аудитории, под ними аренда и реклама бок о бок.
// - «ТЦ в цифрах» и «Цитаты».
//
// Каждая панель и каждая карточка рисуется только при наличии данных;
// источники — один список без дублей внизу карточки (SourcesLine).
import type { ReactNode } from 'react';
import {
  Bus,
  BusFront,
  CalendarDays,
  Car,
  CarFront,
  Check,
  Clock,
  Footprints,
  Gift,
  Megaphone,
  Phone,
  Quote,
  ScrollText,
  SquareParking,
  Store,
  TrainFront,
  TramFront,
  Van,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type {
  RetailFigureEntry,
  RetailInfo,
  RetailPitch,
  RetailQuoteEntry,
  RetailSource,
  RetailTransportMode,
} from '../../data/businessCenters';
import {
  TRANSPORT_MODE_LABELS,
  figureMeta,
  formatRetailDate,
  quoteText,
  sortTransport,
} from '../../lib/tradeCenterRetail';
import { RetailCardTitle, SourcesLine } from './TradeCenterRetailParts';
import { retailCardClass } from './tradeCenterRetailStyle';

const TRANSPORT_ICONS: Record<RetailTransportMode, LucideIcon> = {
  metro: TrainFront,
  bus: Bus,
  trolleybus: BusFront,
  tram: TramFront,
  minibus: Van,
  shuttle: CarFront,
  car: Car,
  walk: Footprints,
};

/** Подпанель внутри карточки: рамка, заголовок h3 с иконкой. */
function Panel({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-white/65 p-4', className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Строки «подпись … значение»: значение прижато вправо, а не влезло —
 * переносится под подпись и встаёт влево (justify-between с одним
 * элементом в строке прижимает его к началу).
 */
function ValueRows({ rows }: { rows: { key: string; label: ReactNode; value: string }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-border/70">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 first:pt-0 last:pb-0">
          <dt className="min-w-0 break-words text-sm text-ink-muted">{row.label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium text-ink tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</h4>;
}

// --- Посетителю ------------------------------------------------------------

export function TradeCenterVisitCard({ info }: { info: RetailInfo }) {
  const { hours, hoursNote, parking, rules, loyalty, events } = info;
  const transport = sortTransport(info.transport);
  const parkingDate = formatRetailDate(parking?.date);

  const panels: ReactNode[] = [];
  if (hours.length || hoursNote) {
    panels.push(
      <Panel key="hours" icon={Clock} title="Режим работы">
        {hours.length > 0 && (
          <ValueRows
            rows={hours.map((h, i) => ({
              key: `${h.zone}-${i}`,
              label: (
                <>
                  {h.zone}
                  {h.note && <span className="block text-xs text-ink-faint">{h.note}</span>}
                </>
              ),
              value: h.value,
            }))}
          />
        )}
        {hoursNote && <p className="break-words text-xs leading-relaxed text-ink-muted">{hoursNote}</p>}
      </Panel>,
    );
  }
  if (parking) {
    panels.push(
      <Panel key="parking" icon={SquareParking} title="Парковка">
        {parking.summary && <p className="break-words text-sm leading-relaxed text-ink-muted">{parking.summary}</p>}
        {parking.items.length > 0 && (
          <ValueRows rows={parking.items.map((item, i) => ({ key: `${item.label}-${i}`, label: item.label, value: item.value }))} />
        )}
        {parkingDate && <p className="text-xs text-ink-faint">Данные на {parkingDate}</p>}
      </Panel>,
    );
  }
  if (transport.length) {
    panels.push(
      <Panel key="transport" icon={TrainFront} title="Как добраться">
        <ul className="flex flex-col gap-2.5">
          {transport.map((t, i) => {
            const Icon = TRANSPORT_ICONS[t.mode];
            return (
              <li key={`${t.mode}-${i}`} className="flex items-start gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  title={TRANSPORT_MODE_LABELS[t.mode]}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 break-words pt-0.5 text-sm leading-relaxed text-ink-muted">
                  <span className="sr-only">{TRANSPORT_MODE_LABELS[t.mode]}: </span>
                  {t.text}
                </p>
              </li>
            );
          })}
        </ul>
      </Panel>,
    );
  }
  if (rules.length) {
    panels.push(
      <Panel key="rules" icon={ScrollText} title="Правила посещения">
        <ul className="flex flex-col gap-1">
          {rules.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
              <span className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
              <span className="min-w-0 break-words">{r.text}</span>
            </li>
          ))}
        </ul>
      </Panel>,
    );
  }
  if (loyalty.length || events.length) {
    panels.push(
      <Panel key="loyalty" icon={Gift} title="Скидки и события">
        {loyalty.length > 0 && (
          <div className="flex flex-col gap-2">
            {events.length > 0 && <SubHeading>Скидки и сертификаты</SubHeading>}
            <ul className="flex flex-col gap-2">
              {loyalty.map((l, i) => (
                <li key={`${l.name}-${i}`} className="break-words text-sm leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">{l.name}</span>
                  {l.text && <> — {l.text}</>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {events.length > 0 && (
          <div className="flex flex-col gap-2">
            {loyalty.length > 0 && <SubHeading>События</SubHeading>}
            <ul className="flex flex-col gap-2">
              {events.map((e, i) => {
                const when = formatRetailDate(e.date);
                return (
                  <li key={`${e.name}-${i}`} className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="break-words text-sm font-semibold text-ink">{e.name}</span>
                      {when && (
                        <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                          <CalendarDays className="h-3 w-3" aria-hidden="true" />
                          {when}
                        </span>
                      )}
                    </span>
                    {e.text && <span className="break-words text-sm leading-relaxed text-ink-muted">{e.text}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Panel>,
    );
  }

  const sources: RetailSource[] = [
    ...hours,
    ...(parking ? [parking] : []),
    ...transport,
    ...rules,
    ...loyalty,
    ...events,
  ];

  return (
    <div id="visit" className={retailCardClass} style={glassCardShadow}>
      <RetailCardTitle id="visit" />
      {panels.length > 0 && (
        // Одна панель — на всю ширину; несколько — в две колонки на md+.
        // break-inside-avoid: панель не рвётся между колонками.
        <div className={cn('-mb-3', panels.length > 1 && 'md:columns-2 md:gap-3')}>
          {panels.map((panel, i) => (
            <div key={i} className="mb-3 break-inside-avoid">
              {panel}
            </div>
          ))}
        </div>
      )}
      <SourcesLine entries={sources} />
    </div>
  );
}

// --- Для бизнеса -----------------------------------------------------------

// Контакты набирает ресёрч свободным текстом: почту, сайт и телефон делаем
// ссылками, остальное — как есть.
const CONTACT_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s,;]+)|(\+375[\d\s()-]{9,}\d)/g;

function ContactText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CONTACT_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [value, email, url, phone] = match;
    const href = email ? `mailto:${email}` : url ? url : `tel:${phone.replace(/[^\d+]/g, '')}`;
    parts.push(
      <a
        key={index}
        href={href}
        {...(url ? { target: '_blank', rel: 'nofollow noopener noreferrer' } : {})}
        className={cn(
          'font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary',
          // Телефон не рвём посреди номера («123-45-⏎67»), почту и адрес — можно.
          phone ? 'whitespace-nowrap' : 'break-words',
        )}
      >
        {value}
      </a>,
    );
    last = index + value.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function PitchPanel({ icon, title, pitch }: { icon: LucideIcon; title: string; pitch: RetailPitch }) {
  return (
    <Panel icon={icon} title={title}>
      {pitch.text && <p className="break-words text-sm leading-relaxed text-ink-muted">{pitch.text}</p>}
      {pitch.points.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {pitch.points.map((point, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
              <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words">{point}</span>
            </li>
          ))}
        </ul>
      )}
      {pitch.contacts && (
        <p className="mt-auto flex items-start gap-2 rounded-xl bg-primary/[0.06] px-3 py-2 text-sm leading-relaxed text-ink">
          <Phone className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 break-words">
            <ContactText text={pitch.contacts} />
          </span>
        </p>
      )}
    </Panel>
  );
}

function FigureTile({ entry, size }: { entry: RetailFigureEntry; size: 'lg' | 'md' }) {
  const meta = figureMeta(entry);
  return (
    <div
      className={cn(
        // Нечётная последняя плитка в сетке из двух колонок — на всю ширину,
        // а не сиротой с дырой справа.
        'flex min-w-0 flex-col gap-1 rounded-2xl max-sm:[&:last-child:nth-child(odd)]:col-span-2',
        size === 'lg' ? 'bg-primary/[0.06] p-4' : 'border border-border bg-white/65 p-3.5',
      )}
    >
      <span
        className={cn(
          'break-words font-bold leading-tight text-ink tabular-nums',
          size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg',
        )}
      >
        {entry.value}
      </span>
      <span className="break-words text-xs leading-snug text-ink-muted">{entry.label}</span>
      {meta && <span className="mt-auto break-words pt-0.5 text-[11px] leading-snug text-ink-faint">{meta}</span>}
    </div>
  );
}

const AUDIENCE_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' };

export function TradeCenterBusinessCard({ info }: { info: RetailInfo }) {
  const { audience, leasing, advertising } = info;
  const both = Boolean(leasing && advertising);
  return (
    <div
      id="business"
      className={cn(retailCardClass, 'ring-1 ring-primary/15')}
      style={glassCardShadow}
    >
      <div className="flex flex-col gap-1">
        <RetailCardTitle id="business" />
        <p className="text-sm text-ink-muted">Для бизнеса: кто сюда ходит, как снять помещение и где разместить рекламу.</p>
      </div>
      {audience.length > 0 && (
        <div className={cn('grid grid-cols-2 gap-3', AUDIENCE_COLS[audience.length] ?? 'sm:grid-cols-4')}>
          {audience.map((a, i) => (
            <FigureTile key={`${a.label}-${i}`} entry={a} size="lg" />
          ))}
        </div>
      )}
      {(leasing || advertising) && (
        <div className={cn('grid grid-cols-1 gap-3', both && 'md:grid-cols-2')}>
          {leasing && <PitchPanel icon={Store} title="Аренда помещений" pitch={leasing} />}
          {advertising && <PitchPanel icon={Megaphone} title="Реклама в ТЦ" pitch={advertising} />}
        </div>
      )}
      <SourcesLine
        entries={[...audience, ...(leasing ? [leasing] : []), ...(advertising ? [advertising] : [])]}
      />
    </div>
  );
}

// Плитка «ТЦ в цифрах»: крупная цифра, подпись и фраза, почему это
// впечатляет (владелец, 2026-09-24: «что-то яркое и интересное людям»).
function NumberTile({ entry, hero }: { entry: RetailFigureEntry; hero: boolean }) {
  const meta = figureMeta(entry);
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-2xl p-4',
        hero ? 'bg-primary/[0.06] sm:p-5' : 'border border-border bg-white/65',
      )}
    >
      <span
        className={cn(
          'break-words font-bold leading-none tracking-tight text-primary tabular-nums',
          hero ? 'text-3xl sm:text-4xl' : 'text-2xl',
        )}
      >
        {entry.value}
      </span>
      <span className="break-words text-sm font-semibold leading-snug text-ink">{entry.label}</span>
      {entry.text && <span className="break-words text-xs leading-relaxed text-ink-muted">{entry.text}</span>}
      {meta && <span className="mt-auto break-words pt-0.5 text-[11px] leading-snug text-ink-faint">{meta}</span>}
    </div>
  );
}

export function TradeCenterNumbersCard({ numbers }: { numbers: RetailFigureEntry[] }) {
  const hero = numbers.slice(0, 2);
  const rest = numbers.slice(2);
  return (
    <div id="numbers" className={retailCardClass} style={glassCardShadow}>
      <RetailCardTitle id="numbers" />
      <div className={cn('grid grid-cols-1 gap-2.5', hero.length > 1 && 'sm:grid-cols-2')}>
        {hero.map((n, i) => (
          <NumberTile key={`${n.label}-${i}`} entry={n} hero />
        ))}
      </div>
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((n, i) => (
            <NumberTile key={`${n.label}-${i}`} entry={n} hero={false} />
          ))}
        </div>
      )}
      <SourcesLine entries={numbers} />
    </div>
  );
}

export function TradeCenterQuotesCard({ quotes }: { quotes: RetailQuoteEntry[] }) {
  return (
    <div id="quotes" className={retailCardClass} style={glassCardShadow}>
      <RetailCardTitle id="quotes" />
      <div className={cn('grid grid-cols-1 gap-3', quotes.length > 1 && 'md:grid-cols-2')}>
        {quotes.map((q, i) => {
          const when = formatRetailDate(q.date);
          const text = quoteText(q);
          return (
            <figure key={i} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-white/65 p-4">
              <Quote className="h-4 w-4 shrink-0 text-primary/50" aria-hidden="true" />
              <blockquote className="break-words text-sm leading-relaxed text-ink">{text}</blockquote>
              <figcaption className="mt-auto break-words text-xs text-ink-muted">
                — {q.who}
                {when && <span className="text-ink-faint">, {when}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <SourcesLine entries={quotes} />
    </div>
  );
}
