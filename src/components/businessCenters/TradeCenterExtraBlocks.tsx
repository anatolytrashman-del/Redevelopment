// Бизнес-карточки ТЦ без сносок на источники (владелец, 2026-09-25).
import type { ReactNode } from 'react';
import {
  Check,
  Megaphone,
  Phone,
  Quote,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import type {
  RetailFigureEntry,
  RetailInfo,
  RetailPitch,
  RetailQuoteEntry,
} from '../../data/businessCenters';
import {
  formatRetailDate,
  quoteText,
} from '../../lib/tradeCenterRetail';
import { RetailCardTitle } from './TradeCenterRetailParts';
import { retailCardClass } from './tradeCenterRetailStyle';

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
    </div>
  );
}

// Плитка «ТЦ в цифрах»: крупная цифра, подпись и фраза, почему это
// впечатляет (владелец, 2026-09-24: «что-то яркое и интересное людям»).
function NumberTile({ entry, hero }: { entry: RetailFigureEntry; hero: boolean }) {
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
    </div>
  );
}
