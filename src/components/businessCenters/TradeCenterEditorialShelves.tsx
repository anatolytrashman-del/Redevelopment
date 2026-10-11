import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { TcEditorialCard, TcEditorialShelf, TcLookbookArt } from '../../lib/tradeCenterEditorialShelves';

const DISPLAY = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

/** Чистая геометрия: линии и формы, без букв и фигуративов. */
function LookbookArt({ art }: { art: TcLookbookArt }) {
  const stroke = 'rgba(247,241,228,0.72)';
  const accent = '#c9a227';
  const soft = 'rgba(0,0,0,0.22)';
  switch (art) {
    case 'shopping':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1="18" y1="22" x2="82" y2="22" stroke={accent} strokeWidth="2.5" />
          <line x1="28" y1="22" x2="28" y2="78" stroke={stroke} strokeWidth="2" />
          <line x1="50" y1="22" x2="50" y2="86" stroke={stroke} strokeWidth="2.5" />
          <line x1="72" y1="22" x2="72" y2="70" stroke={soft} strokeWidth="2" />
          <line x1="28" y1="52" x2="72" y2="52" stroke={accent} strokeWidth="1.5" opacity="0.7" />
        </svg>
      );
    case 'cinema':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="14" y="20" width="72" height="60" fill="none" stroke={accent} strokeWidth="2.5" />
          <line x1="14" y1="36" x2="86" y2="36" stroke={stroke} strokeWidth="1.5" />
          <line x1="14" y1="64" x2="86" y2="64" stroke={stroke} strokeWidth="1.5" />
          <line x1="32" y1="20" x2="32" y2="80" stroke={soft} strokeWidth="1.5" />
          <line x1="68" y1="20" x2="68" y2="80" stroke={soft} strokeWidth="1.5" />
        </svg>
      );
    case 'free-parking':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="30" fill="none" stroke={accent} strokeWidth="2.5" />
          <circle cx="50" cy="50" r="16" fill="none" stroke={stroke} strokeWidth="2" />
          <line x1="20" y1="80" x2="80" y2="80" stroke={soft} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'foodcourt':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="28" fill="none" stroke={accent} strokeWidth="2.5" />
          <circle cx="50" cy="50" r="12" fill="none" stroke={stroke} strokeWidth="2" />
          <line x1="50" y1="18" x2="50" y2="38" stroke={soft} strokeWidth="2" />
        </svg>
      );
    case 'kids':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="34" cy="38" r="14" fill="none" stroke={accent} strokeWidth="2.5" />
          <rect x="52" y="28" width="26" height="26" fill="none" stroke={stroke} strokeWidth="2.5" />
          <path d="M26 72 L50 56 L74 72" fill="none" stroke={soft} strokeWidth="2.5" />
        </svg>
      );
    case 'entertainment':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon
            points="50,16 58,40 84,40 64,56 72,82 50,66 28,82 36,56 16,40 42,40"
            fill="none"
            stroke={accent}
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'budget':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon points="50,14 86,50 50,86 14,50" fill="none" stroke={accent} strokeWidth="2.5" />
          <polygon points="50,30 70,50 50,70 30,50" fill="none" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'center':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="20" y="20" width="60" height="60" fill="none" stroke={accent} strokeWidth="2.5" />
          <line x1="20" y1="50" x2="80" y2="50" stroke={stroke} strokeWidth="2" />
          <line x1="50" y1="20" x2="50" y2="80" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'all':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1="18" y1="28" x2="82" y2="28" stroke={accent} strokeWidth="2.5" />
          <line x1="18" y1="50" x2="82" y2="50" stroke={stroke} strokeWidth="2.5" />
          <line x1="18" y1="72" x2="82" y2="72" stroke={soft} strokeWidth="2.5" />
          <line x1="34" y1="18" x2="34" y2="82" stroke={stroke} strokeWidth="1.5" opacity="0.6" />
        </svg>
      );
    case 'metro-near':
    case 'metro-blue':
    case 'metro-red':
    case 'metro-green':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1="12" y1="50" x2="88" y2="50" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <circle cx="28" cy="50" r="6" fill="none" stroke={stroke} strokeWidth="2.5" />
          <circle cx="50" cy="50" r="8" fill="none" stroke={accent} strokeWidth="2.5" />
          <circle cx="72" cy="50" r="6" fill="none" stroke={stroke} strokeWidth="2.5" />
        </svg>
      );
    case 'brand-gold-apple':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="54" r="26" fill="none" stroke={stroke} strokeWidth="2.5" />
          <path d="M50 20 C50 20 62 28 58 40" fill="none" stroke={accent} strokeWidth="2.5" />
          <line x1="34" y1="48" x2="66" y2="60" stroke={soft} strokeWidth="1.5" />
        </svg>
      );
    case 'brand-sport':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M16 68 Q50 22 84 68" fill="none" stroke={accent} strokeWidth="3" />
          <path d="M24 76 Q50 40 76 76" fill="none" stroke={stroke} strokeWidth="2.5" />
          <line x1="50" y1="24" x2="50" y2="44" stroke={soft} strokeWidth="2" />
        </svg>
      );
    case 'brand-beauty':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="50" cy="52" rx="22" ry="28" fill="none" stroke={accent} strokeWidth="2.5" />
          <line x1="28" y1="52" x2="72" y2="52" stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'brand-fashion':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1="22" y1="18" x2="78" y2="82" stroke={accent} strokeWidth="2.5" />
          <line x1="78" y1="18" x2="22" y2="82" stroke={stroke} strokeWidth="2.5" />
          <rect x="30" y="30" width="40" height="40" fill="none" stroke={soft} strokeWidth="2" />
        </svg>
      );
    case 'district':
    default:
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="18" y="24" width="28" height="54" fill="none" stroke={accent} strokeWidth="2.5" />
          <rect x="54" y="36" width="28" height="42" fill="none" stroke={stroke} strokeWidth="2.5" />
          <line x1="18" y1="78" x2="82" y2="78" stroke={soft} strokeWidth="2" />
        </svg>
      );
  }
}

function LookbookCard({ card, delayClass }: { card: TcEditorialCard; delayClass?: string }) {
  return (
    <li className={cn('ml-reveal snap-start w-[9rem] sm:w-[10.5rem] lg:w-[11.5rem]', delayClass)}>
      <Link
        to={card.href}
        title={`${card.title} — ${card.countLabel}`}
        aria-label={`${card.title} — ${card.countLabel}`}
        className="group flex flex-col gap-2.5 rounded-xl p-1.5 -m-1.5 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/50"
      >
        <span
          className="ml-lookbook-cover relative aspect-square w-full overflow-hidden rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.14)] ring-1 ring-black/8"
          style={{ background: `linear-gradient(155deg, ${card.from} 0%, ${card.to} 100%)` }}
          aria-hidden
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 55%)',
            }}
          />
          <LookbookArt art={card.art} />
        </span>
        {/* font-bold (700), не font-black: ExtraBold-файл субсетирован только
            под латинские A–Z — иначе «Mark Formelle» рвёт вес по буквам. */}
        <span className="min-w-0 px-0.5">
          <span className="block truncate text-[15px] font-bold leading-snug tracking-tight text-ink sm:text-[16px]">
            {card.title}
          </span>
          <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-ink-muted">
            {card.countLabel}
          </span>
        </span>
      </Link>
    </li>
  );
}

function ShelfRow({ shelf }: { shelf: TcEditorialShelf }) {
  return (
    <section aria-labelledby={`tc-shelf-${shelf.id}`} className="flex flex-col gap-3">
      <div className="px-0.5">
        <h3
          id={`tc-shelf-${shelf.id}`}
          className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]"
          style={DISPLAY}
        >
          {shelf.title}
        </h3>
        <p className="mt-1 text-sm text-ink/60">{shelf.lead}</p>
      </div>
      <ul
        className="ml-lookbook-shelf-row -mx-1 flex list-none gap-2 overflow-x-auto px-1 pb-2"
        style={{ scrollbarGutter: 'stable' }}
      >
        {shelf.cards.map((card, i) => (
          <LookbookCard
            key={card.id}
            card={card}
            delayClass={i === 1 ? 'ml-reveal-delay-1' : i === 2 ? 'ml-reveal-delay-2' : undefined}
          />
        ))}
      </ul>
    </section>
  );
}

export function TradeCenterEditorialShelves({ shelves }: { shelves: TcEditorialShelf[] }) {
  if (!shelves.length) return null;
  return (
    <div
      className={cn('flex flex-col gap-9 overflow-hidden p-6 sm:gap-11 sm:p-8', glassCardClass)}
      style={glassCardShadow}
    >
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.id} shelf={shelf} />
      ))}
    </div>
  );
}
