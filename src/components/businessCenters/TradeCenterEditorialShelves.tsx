import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { TcEditorialCard, TcEditorialShelf, TcLookbookArt } from '../../lib/tradeCenterEditorialShelves';

const DISPLAY = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

function LookbookArt({ art }: { art: TcLookbookArt }) {
  // Абстрактные «витринные» мотивы — шопинг без бумажного пакета.
  switch (art) {
    case 'shopping':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M22 28 H78" stroke="#c9a227" strokeWidth="3" opacity="0.7" />
          <path d="M34 28 V72" stroke="rgba(247,241,228,0.55)" strokeWidth="2.5" />
          <path d="M50 28 V78" stroke="rgba(247,241,228,0.7)" strokeWidth="3" />
          <path d="M66 28 V68" stroke="rgba(0,0,0,0.25)" strokeWidth="2.5" />
          <path d="M34 48 Q42 58 50 48 Q58 38 66 48" fill="none" stroke="#c9a227" strokeWidth="2.5" opacity="0.55" />
        </svg>
      );
    case 'cinema':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="12" y="18" width="76" height="64" rx="6" fill="none" stroke="#c9a227" strokeWidth="3" opacity="0.55" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={18 + i * 14} y="26" width="8" height="8" rx="1.5" fill="rgba(247,241,228,0.45)" />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={`b${i}`} x={18 + i * 14} y="66" width="8" height="8" rx="1.5" fill="rgba(247,241,228,0.35)" />
          ))}
          <rect x="28" y="42" width="44" height="16" rx="3" fill="rgba(201,162,39,0.45)" />
        </svg>
      );
    case 'free-parking':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="28" fill="none" stroke="#c9a227" strokeWidth="4" opacity="0.55" />
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fill="rgba(247,241,228,0.9)"
            fontSize="36"
            fontWeight="800"
            fontFamily="Georgia, serif"
          >
            P
          </text>
          <path d="M18 78 Q50 62 82 78" fill="none" stroke="rgba(247,241,228,0.35)" strokeWidth="4" />
        </svg>
      );
    case 'foodcourt':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="52" r="30" fill="none" stroke="#c9a227" strokeWidth="3" opacity="0.5" />
          <circle cx="50" cy="52" r="18" fill="rgba(247,241,228,0.35)" />
          <circle cx="50" cy="52" r="8" fill="rgba(0,0,0,0.2)" />
          <path d="M22 28 H78" stroke="rgba(247,241,228,0.4)" strokeWidth="3" />
        </svg>
      );
    case 'kids':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="32" cy="40" r="12" fill="#c9a227" opacity="0.55" />
          <rect x="48" y="30" width="22" height="22" rx="5" fill="rgba(247,241,228,0.4)" />
          <path d="M28 68 H72 L64 88 H36 Z" fill="rgba(0,0,0,0.22)" />
        </svg>
      );
    case 'entertainment':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M50 18 L56 40 L78 40 L60 54 L68 76 L50 62 L32 76 L40 54 L22 40 L44 40 Z" fill="#c9a227" opacity="0.5" />
          <circle cx="22" cy="72" r="4" fill="rgba(247,241,228,0.45)" />
          <circle cx="78" cy="28" r="3.5" fill="rgba(247,241,228,0.35)" />
          <circle cx="70" cy="78" r="3" fill="rgba(0,0,0,0.25)" />
        </svg>
      );
    case 'budget':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M50 16 L84 50 L50 84 L16 50 Z" fill="none" stroke="#c9a227" strokeWidth="4" opacity="0.55" />
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fill="rgba(247,241,228,0.9)"
            fontSize="28"
            fontWeight="800"
            fontFamily="Georgia, serif"
          >
            %
          </text>
        </svg>
      );
    case 'center':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="22" y="28" width="56" height="48" rx="4" fill="none" stroke="#c9a227" strokeWidth="3" opacity="0.55" />
          <path d="M22 48 H78" stroke="rgba(247,241,228,0.4)" strokeWidth="2" />
          <path d="M50 28 V76" stroke="rgba(247,241,228,0.35)" strokeWidth="2" />
          <circle cx="50" cy="48" r="6" fill="#c9a227" opacity="0.7" />
        </svg>
      );
    case 'metro-near':
    case 'metro-blue':
    case 'metro-red':
    case 'metro-green':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="26" fill="none" stroke="#c9a227" strokeWidth="4" opacity="0.55" />
          <text
            x="50"
            y="60"
            textAnchor="middle"
            fill="rgba(247,241,228,0.95)"
            fontSize="34"
            fontWeight="900"
            fontFamily="Georgia, serif"
          >
            M
          </text>
          <path d="M14 78 H86" stroke="rgba(247,241,228,0.35)" strokeWidth="5" strokeLinecap="round" />
          <circle cx="28" cy="78" r="5" fill="rgba(247,241,228,0.55)" />
          <circle cx="50" cy="78" r="5" fill="#c9a227" opacity="0.8" />
          <circle cx="72" cy="78" r="5" fill="rgba(247,241,228,0.45)" />
        </svg>
      );
    case 'brand-gold-apple':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <ellipse cx="50" cy="56" rx="24" ry="26" fill="rgba(247,241,228,0.2)" stroke="#f7f1e4" strokeWidth="3" />
          <path d="M50 28 Q58 18 66 22" fill="none" stroke="#f7f1e4" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="58" cy="30" rx="8" ry="4" fill="rgba(247,241,228,0.55)" transform="rotate(-35 58 30)" />
          <circle cx="40" cy="48" r="5" fill="rgba(255,255,255,0.25)" />
        </svg>
      );
    case 'brand-sport':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M18 62 Q50 28 82 62" fill="none" stroke="#c9a227" strokeWidth="5" opacity="0.65" />
          <path d="M26 70 Q50 42 74 70" fill="none" stroke="rgba(247,241,228,0.45)" strokeWidth="4" />
          <circle cx="50" cy="38" r="4" fill="#c9a227" />
        </svg>
      );
    case 'brand-beauty':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M50 20 C68 20 78 38 78 52 C78 72 50 86 50 86 C50 86 22 72 22 52 C22 38 32 20 50 20 Z" fill="none" stroke="#c9a227" strokeWidth="3" opacity="0.55" />
          <circle cx="50" cy="50" r="10" fill="rgba(247,241,228,0.4)" />
        </svg>
      );
    case 'brand-fashion':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M30 30 H70 L62 78 H38 Z" fill="none" stroke="#c9a227" strokeWidth="3" opacity="0.55" />
          <path d="M38 30 Q50 42 62 30" fill="none" stroke="rgba(247,241,228,0.55)" strokeWidth="3" />
          <circle cx="50" cy="24" r="4" fill="#c9a227" opacity="0.8" />
        </svg>
      );
    case 'district':
    default:
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="18" y="22" width="28" height="56" rx="3" fill="rgba(201,162,39,0.45)" />
          <rect x="52" y="34" width="30" height="44" rx="3" fill="rgba(247,241,228,0.35)" />
          <rect x="24" y="30" width="8" height="8" rx="1" fill="rgba(0,0,0,0.22)" />
          <rect x="38" y="30" width="8" height="8" rx="1" fill="rgba(0,0,0,0.18)" />
          <rect x="24" y="46" width="8" height="8" rx="1" fill="rgba(0,0,0,0.18)" />
          <rect x="58" y="42" width="8" height="8" rx="1" fill="rgba(0,0,0,0.2)" />
          <rect x="70" y="42" width="8" height="8" rx="1" fill="rgba(0,0,0,0.15)" />
        </svg>
      );
  }
}

function SealDisc() {
  // Круглая «печать витрины» — не виниловая пластинка казино и не пакет.
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" fill="none" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#f7f1e4" />
      <circle cx="32" cy="32" r="30" stroke="#c9a227" strokeWidth="2" />
      <circle cx="32" cy="32" r="22" stroke="#e4152b" strokeWidth="1.5" opacity="0.55" />
      <circle cx="32" cy="32" r="14" fill="#e4152b" opacity="0.9" />
      <circle cx="32" cy="32" r="6" fill="#f7f1e4" />
      <circle cx="32" cy="32" r="2.5" fill="#c9a227" />
    </svg>
  );
}

function LookbookCard({ card, delayClass }: { card: TcEditorialCard; delayClass?: string }) {
  return (
    <li className={cn('ml-reveal snap-start w-[9.5rem] sm:w-[11rem] lg:w-[12rem]', delayClass)}>
      <Link
        to={card.href}
        title={`${card.title} — ${card.countLabel}`}
        aria-label={`${card.title} — ${card.countLabel}`}
        className="group flex flex-col gap-3 overflow-visible rounded-xl p-1.5 pr-6 -m-1.5 transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/50"
      >
        <div className="relative aspect-square w-[88%] overflow-visible">
          <span
            className="ml-lookbook-seal pointer-events-none absolute inset-[4%] z-0 drop-shadow-[0_6px_14px_rgba(138,12,26,0.28)]"
            aria-hidden
          >
            <SealDisc />
          </span>
          <span
            className="ml-lookbook-cover relative z-10 flex h-full w-full items-center justify-center overflow-hidden rounded-lg shadow-[0_10px_24px_rgba(0,0,0,0.16)] ring-1 ring-black/10"
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
        </div>
        <span className="min-w-0 w-[88%] px-0.5">
          <span className="block text-[17px] font-black tracking-[-0.02em] text-ink sm:text-[18px]">{card.title}</span>
          <span className="mt-1 block truncate text-[12px] font-semibold tabular-nums text-ink-muted">
            {card.countLabel}
          </span>
        </span>
      </Link>
    </li>
  );
}

function ShelfRow({ shelf }: { shelf: TcEditorialShelf }) {
  return (
    <section aria-labelledby={`tc-shelf-${shelf.id}`} className="flex flex-col gap-4">
      <div className="px-1">
        <h3
          id={`tc-shelf-${shelf.id}`}
          className="text-[1.65rem] font-black tracking-tight text-ink sm:text-3xl"
          style={DISPLAY}
        >
          {shelf.title}
        </h3>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/65 sm:text-base">{shelf.lead}</p>
      </div>
      <ul
        className="ml-lookbook-shelf-row -mx-1 flex list-none gap-1 overflow-x-auto px-1 pb-2"
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
      className={cn('flex flex-col gap-10 overflow-hidden p-6 sm:gap-12 sm:p-8', glassCardClass)}
      style={glassCardShadow}
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-ink-muted">Авторские подборки</p>
        <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl" style={DISPLAY}>
          Листайте по интересу
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-ink/65 sm:text-base">
          Короткие срезы каталога — как сценарий вечера, бренд, район или станция метро. Не весь
          список сразу, а то, за чем обычно едут минчане.
        </p>
      </div>
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.id} shelf={shelf} />
      ))}
    </div>
  );
}
