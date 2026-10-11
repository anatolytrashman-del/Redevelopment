import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type {
  TcBrowseFigure,
  TcEditorialCard,
  TcEditorialShelf,
  TcLookbookArt,
} from '../../lib/tradeCenterEditorialShelves';

const DISPLAY = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

/**
 * Плотные «виниловые» обложки в духе casinolist: толстые полосы и формы,
 * не тонкие линии на пустом фоне. Букв и фигуративов нет — только геометрия.
 */
function LookbookArt({ art }: { art: TcLookbookArt }) {
  const cream = 'rgba(247,241,228,0.55)';
  const gold = '#c9a227';
  const ink = 'rgba(0,0,0,0.28)';
  switch (art) {
    case 'shopping':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M0 100 L100 0" stroke={gold} strokeWidth="22" opacity="0.45" />
          <path d="M-20 90 L90 -20" stroke={cream} strokeWidth="14" />
          <path d="M20 120 L120 20" stroke={ink} strokeWidth="10" />
          <rect x="58" y="58" width="28" height="28" fill="none" stroke={cream} strokeWidth="2.5" />
        </svg>
      );
    case 'cinema':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="10" y="18" width="80" height="64" rx="4" fill="none" stroke={gold} strokeWidth="3" />
          <rect x="22" y="30" width="56" height="40" fill={cream} opacity="0.2" />
          <line x1="10" y1="40" x2="90" y2="40" stroke={cream} strokeWidth="2.5" />
          <line x1="10" y1="60" x2="90" y2="60" stroke={cream} strokeWidth="2.5" />
          <line x1="34" y1="18" x2="34" y2="82" stroke={ink} strokeWidth="3" />
          <line x1="66" y1="18" x2="66" y2="82" stroke={ink} strokeWidth="3" />
        </svg>
      );
    case 'free-parking':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="46" r="28" fill={gold} opacity="0.22" />
          <circle cx="50" cy="46" r="28" fill="none" stroke={gold} strokeWidth="3.5" />
          <circle cx="50" cy="46" r="14" fill="none" stroke={cream} strokeWidth="2.5" />
          <path d="M18 82 H82" stroke={cream} strokeWidth="5" strokeLinecap="round" />
          <path d="M28 74 H72" stroke={ink} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'foodcourt':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="32" fill={gold} opacity="0.18" />
          <circle cx="50" cy="50" r="32" fill="none" stroke={gold} strokeWidth="3.5" />
          <circle cx="50" cy="50" r="16" fill="none" stroke={cream} strokeWidth="3" />
          <circle cx="50" cy="50" r="5" fill={cream} opacity="0.7" />
          <line x1="50" y1="12" x2="50" y2="28" stroke={ink} strokeWidth="3" />
        </svg>
      );
    case 'kids':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="36" cy="40" r="18" fill={gold} opacity="0.25" />
          <circle cx="36" cy="40" r="18" fill="none" stroke={gold} strokeWidth="3" />
          <rect x="54" y="28" width="30" height="30" rx="3" fill="none" stroke={cream} strokeWidth="3" />
          <path d="M20 78 L50 58 L80 78" fill="none" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
        </svg>
      );
    case 'entertainment':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon
            points="50,12 58,38 86,38 64,56 72,84 50,66 28,84 36,56 14,38 42,38"
            fill={gold}
            opacity="0.28"
          />
          <polygon
            points="50,12 58,38 86,38 64,56 72,84 50,66 28,84 36,56 14,38 42,38"
            fill="none"
            stroke={cream}
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'budget':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon points="50,8 92,50 50,92 8,50" fill={gold} opacity="0.22" />
          <polygon points="50,8 92,50 50,92 8,50" fill="none" stroke={gold} strokeWidth="3" />
          <polygon points="50,28 72,50 50,72 28,50" fill="none" stroke={cream} strokeWidth="2.5" />
        </svg>
      );
    case 'center':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="14" y="14" width="72" height="72" fill={cream} opacity="0.12" />
          <rect x="14" y="14" width="72" height="72" fill="none" stroke={gold} strokeWidth="3.5" />
          <line x1="14" y1="50" x2="86" y2="50" stroke={cream} strokeWidth="3" />
          <line x1="50" y1="14" x2="50" y2="86" stroke={cream} strokeWidth="3" />
          <circle cx="50" cy="50" r="8" fill={ink} />
        </svg>
      );
    case 'all':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="12" y="20" width="76" height="12" fill={gold} opacity="0.55" />
          <rect x="12" y="44" width="76" height="12" fill={cream} opacity="0.45" />
          <rect x="12" y="68" width="76" height="12" fill={ink} />
          <rect x="28" y="12" width="8" height="76" fill={cream} opacity="0.35" />
        </svg>
      );
    case 'metro-near':
    case 'metro-blue':
    case 'metro-red':
    case 'metro-green':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <line x1="8" y1="50" x2="92" y2="50" stroke={gold} strokeWidth="6" strokeLinecap="round" />
          <circle cx="26" cy="50" r="9" fill={cream} opacity="0.35" />
          <circle cx="26" cy="50" r="9" fill="none" stroke={cream} strokeWidth="2.5" />
          <circle cx="50" cy="50" r="12" fill={gold} opacity="0.35" />
          <circle cx="50" cy="50" r="12" fill="none" stroke={gold} strokeWidth="3" />
          <circle cx="74" cy="50" r="9" fill={cream} opacity="0.35" />
          <circle cx="74" cy="50" r="9" fill="none" stroke={cream} strokeWidth="2.5" />
        </svg>
      );
    case 'brand-gold-apple':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="56" r="28" fill={cream} opacity="0.18" />
          <circle cx="50" cy="56" r="28" fill="none" stroke={cream} strokeWidth="3.5" />
          <path d="M50 16 C50 16 66 28 60 44" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" />
          <path d="M0 100 L100 0" stroke={ink} strokeWidth="8" opacity="0.5" />
        </svg>
      );
    case 'brand-sport':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M8 72 Q50 18 92 72" fill="none" stroke={gold} strokeWidth="8" strokeLinecap="round" />
          <path d="M18 82 Q50 38 82 82" fill="none" stroke={cream} strokeWidth="5" strokeLinecap="round" />
          <circle cx="50" cy="28" r="6" fill={cream} />
        </svg>
      );
    case 'brand-beauty':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="50" cy="54" rx="24" ry="30" fill={gold} opacity="0.2" />
          <ellipse cx="50" cy="54" rx="24" ry="30" fill="none" stroke={gold} strokeWidth="3.5" />
          <line x1="26" y1="54" x2="74" y2="54" stroke={cream} strokeWidth="3" />
          <circle cx="50" cy="54" r="6" fill={cream} opacity="0.65" />
        </svg>
      );
    case 'brand-fashion':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M0 100 L100 0" stroke={gold} strokeWidth="18" opacity="0.5" />
          <path d="M100 100 L0 0" stroke={cream} strokeWidth="12" opacity="0.55" />
          <rect x="28" y="28" width="44" height="44" fill="none" stroke={ink} strokeWidth="3" />
        </svg>
      );
    case 'district':
    default:
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="14" y="22" width="30" height="56" fill={gold} opacity="0.28" />
          <rect x="14" y="22" width="30" height="56" fill="none" stroke={gold} strokeWidth="2.5" />
          <rect x="52" y="34" width="30" height="44" fill={cream} opacity="0.2" />
          <rect x="52" y="34" width="30" height="44" fill="none" stroke={cream} strokeWidth="2.5" />
          <path d="M10 82 H90" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
  }
}

function LookbookCard({ card, delayClass }: { card: TcEditorialCard; delayClass?: string }) {
  return (
    <li className={cn('ml-reveal shrink-0 snap-start w-[9.5rem] sm:w-[11rem] lg:w-[12rem]', delayClass)}>
      <Link
        to={card.href}
        title={`${card.title} — ${card.countLabel}`}
        aria-label={`${card.title} — ${card.countLabel}`}
        className="group flex flex-col gap-2.5 rounded-xl p-1.5 -m-1.5 transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/50"
      >
        <span
          className="ml-lookbook-cover relative aspect-square w-full overflow-hidden rounded-xl shadow-[0_10px_24px_rgba(0,0,0,0.16)] ring-1 ring-black/10"
          style={{ background: `linear-gradient(160deg, ${card.from} 0%, ${card.to} 100%)` }}
          aria-hidden
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background: 'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.16), transparent 48%)',
            }}
          />
          <LookbookArt art={card.art} />
          <span
            className="pointer-events-none absolute left-2.5 top-2.5 z-[1] h-2.5 w-2.5 rounded-full ring-2 ring-white/25"
            style={{ backgroundColor: '#c9a227' }}
          />
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
        className="ml-lookbook-shelf-row -mx-1 flex list-none gap-3 overflow-x-auto px-1 pb-2"
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

export function TradeCenterBrowseGlance({ figures }: { figures: TcBrowseFigure[] }) {
  if (!figures.length) return null;
  return (
    <section
      aria-label="Ключевые цифры каталога"
      className="ml-reveal grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-6"
    >
      {figures.map((fig) => {
        const inner = (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-2 text-xl font-bold tabular-nums tracking-tight sm:text-2xl',
                fig.accent ? 'text-[#6b5410]' : 'text-ink',
              )}
            >
              {fig.value}
            </span>
            <span className="text-[11px] font-bold leading-snug text-ink-muted sm:text-[12px]">
              {fig.label}
            </span>
          </>
        );
        const className = cn(
          'flex flex-col items-center justify-center gap-1 px-3 py-3 text-center',
          glassCardClass,
          fig.accent && 'border-[#c9a227]/40',
        );
        if (fig.href) {
          return (
            <Link
              key={fig.id}
              to={fig.href}
              className={cn(className, 'transition-colors hover:bg-white/70')}
              style={glassCardShadow}
            >
              {inner}
            </Link>
          );
        }
        return (
          <div key={fig.id} className={className} style={glassCardShadow}>
            {inner}
          </div>
        );
      })}
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
