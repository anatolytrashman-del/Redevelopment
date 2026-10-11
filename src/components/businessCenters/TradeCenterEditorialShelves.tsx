import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type {
  TcBrowseFigure,
  TcBrowseFigureIcon,
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
    case 'metro-rail':
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
    case 'metro-node':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="28" fill={gold} opacity="0.22" />
          <circle cx="50" cy="50" r="28" fill="none" stroke={gold} strokeWidth="4" />
          <line x1="50" y1="10" x2="50" y2="90" stroke={cream} strokeWidth="5" />
          <line x1="10" y1="50" x2="90" y2="50" stroke={cream} strokeWidth="5" />
          <circle cx="50" cy="50" r="8" fill={cream} />
        </svg>
      );
    case 'metro-fork':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M18 78 L50 22 L82 78" fill="none" stroke={gold} strokeWidth="6" strokeLinejoin="round" />
          <circle cx="50" cy="22" r="8" fill={cream} />
          <circle cx="18" cy="78" r="7" fill={cream} opacity="0.7" />
          <circle cx="82" cy="78" r="7" fill={cream} opacity="0.7" />
          <line x1="50" y1="40" x2="50" y2="70" stroke={ink} strokeWidth="4" />
        </svg>
      );
    case 'metro-ring':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r="30" fill="none" stroke={gold} strokeWidth="5" />
          <circle cx="50" cy="50" r="16" fill="none" stroke={cream} strokeWidth="3.5" />
          <circle cx="50" cy="20" r="6" fill={cream} />
          <circle cx="76" cy="65" r="6" fill={cream} opacity="0.75" />
          <circle cx="24" cy="65" r="6" fill={cream} opacity="0.75" />
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
    case 'district-skyline':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="12" y="40" width="16" height="42" fill={gold} opacity="0.35" />
          <rect x="34" y="22" width="18" height="60" fill={cream} opacity="0.28" />
          <rect x="58" y="34" width="14" height="48" fill={gold} opacity="0.25" />
          <rect x="76" y="48" width="12" height="34" fill={cream} opacity="0.22" />
          <path d="M8 84 H92" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'district-blocks':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="14" y="22" width="30" height="56" fill={gold} opacity="0.28" />
          <rect x="14" y="22" width="30" height="56" fill="none" stroke={gold} strokeWidth="2.5" />
          <rect x="52" y="34" width="30" height="44" fill={cream} opacity="0.2" />
          <rect x="52" y="34" width="30" height="44" fill="none" stroke={cream} strokeWidth="2.5" />
          <path d="M10 82 H90" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'district-grid':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x="16" y="16" width="68" height="68" fill="none" stroke={gold} strokeWidth="3.5" />
          <line x1="16" y1="39" x2="84" y2="39" stroke={cream} strokeWidth="2.5" />
          <line x1="16" y1="61" x2="84" y2="61" stroke={cream} strokeWidth="2.5" />
          <line x1="39" y1="16" x2="39" y2="84" stroke={ink} strokeWidth="2.5" />
          <line x1="61" y1="16" x2="61" y2="84" stroke={ink} strokeWidth="2.5" />
        </svg>
      );
    case 'district-arc':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M14 72 Q50 18 86 72" fill="none" stroke={gold} strokeWidth="6" />
          <path d="M24 72 Q50 34 76 72" fill="none" stroke={cream} strokeWidth="4" />
          <rect x="42" y="58" width="16" height="24" fill={ink} opacity="0.45" />
        </svg>
      );
    case 'district-steps':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M12 78 H36 V58 H56 V38 H76 V18 H88" fill="none" stroke={gold} strokeWidth="5" strokeLinejoin="round" />
          <rect x="16" y="62" width="16" height="16" fill={cream} opacity="0.3" />
          <rect x="40" y="42" width="16" height="16" fill={cream} opacity="0.3" />
          <rect x="64" y="22" width="16" height="16" fill={cream} opacity="0.3" />
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

/** Иконки сводки: мягкая заливка + ясный силуэт (не «радуга» тонких линий). */
function GlanceIcon({ icon }: { icon: TcBrowseFigureIcon }) {
  switch (icon) {
    case 'malls':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <rect x="5" y="10" width="22" height="16" rx="2.5" fill="currentColor" opacity="0.12" />
          <path d="M5 14h22" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9 10V8.5A2.5 2.5 0 0111.5 6h9A2.5 2.5 0 0123 8.5V10" stroke="currentColor" strokeWidth="1.7" />
          <path d="M11 18h4M17 18h4M11 22h4M17 22h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'area':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <path d="M7 11l9-5 9 5v12l-9 5-9-5V11z" fill="currentColor" opacity="0.12" />
          <path d="M7 11l9-5 9 5v12l-9 5-9-5V11z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M16 6v22M7 11l9 5 9-5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'metro':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="11" fill="currentColor" opacity="0.12" />
          <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.7" />
          <path d="M11 21V12l5 7 5-7v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'cinema':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <rect x="4" y="8" width="17" height="16" rx="2" fill="currentColor" opacity="0.12" />
          <rect x="4" y="8" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M21 12.5l6-3v13l-6-3v-7z" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case 'parking':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="11" fill="currentColor" opacity="0.12" />
          <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.7" />
          <path d="M13 22V10h5a4 4 0 010 8h-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'food':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <circle cx="16" cy="18" r="8" fill="currentColor" opacity="0.12" />
          <path d="M10 7v8M13 7v8M16 7v8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M13 15c0 3 1.3 5 3 6.5V26" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M21 8v18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M21 8c2.2 0 3.5 1.8 3.5 4S23.2 16 21 16" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case 'kids':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <circle cx="12" cy="11" r="4" fill="currentColor" opacity="0.14" />
          <circle cx="12" cy="11" r="3.5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="21" cy="12" r="3" fill="currentColor" opacity="0.14" />
          <circle cx="21" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 24c1.2-4 3.2-6 5-6s3.8 2 5 6M17 24c.8-3 2.2-4.5 4-4.5s3 1.5 3.8 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case 'fun':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <path
            d="M16 5l2.4 7H26l-6 4.4 2.3 7L16 19.2 9.7 23.4l2.3-7-6-4.4h7.6L16 5z"
            fill="currentColor"
            opacity="0.14"
          />
          <path
            d="M16 5l2.4 7H26l-6 4.4 2.3 7L16 19.2 9.7 23.4l2.3-7-6-4.4h7.6L16 5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'shopping':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <path d="M8 12h16l-1.4 13H9.4L8 12z" fill="currentColor" opacity="0.12" />
          <path d="M8 12h16l-1.4 13H9.4L8 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 12a4 4 0 018 0" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case 'brands':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <path d="M8 10h16v14H8V10z" fill="currentColor" opacity="0.12" />
          <path d="M11 10V8.5A2.5 2.5 0 0113.5 6h5A2.5 2.5 0 0121 8.5V10" stroke="currentColor" strokeWidth="1.7" />
          <rect x="8" y="10" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case 'late':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="11" fill="currentColor" opacity="0.12" />
          <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.7" />
          <path d="M16 9v8l5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'grocery':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <path d="M7 13h18l-1.8 12H8.8L7 13z" fill="currentColor" opacity="0.12" />
          <path d="M7 13h18l-1.8 12H8.8L7 13z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M12 13a2.8 2.8 0 015.6 0M18.5 13A2.8 2.8 0 0124 13" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'center':
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <circle cx="16" cy="14" r="6" fill="currentColor" opacity="0.12" />
          <path d="M16 26s-8-7.2-8-12a8 8 0 1116 0c0 4.8-8 12-8 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <circle cx="16" cy="14" r="2.6" fill="currentColor" />
        </svg>
      );
    case 'budget':
    default:
      return (
        <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" fill="none" aria-hidden>
          <path d="M16 5l11 11-11 11L5 16 16 5z" fill="currentColor" opacity="0.12" />
          <path d="M16 5l11 11-11 11L5 16 16 5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M16 11v10M13 14.5h5.2a2.2 2.2 0 010 4.4H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
      className={cn('ml-reveal overflow-hidden', glassCardClass)}
      style={glassCardShadow}
    >
      {/* Одна панель с равномерной сеткой линий — см. .ml-glance-grid в index.css. */}
      <ul className="ml-glance-grid m-0 grid list-none grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map((fig) => {
          const accent = Boolean(fig.accent);
          const cellClass = cn(
            'relative flex min-h-[5.75rem] flex-col items-center justify-center gap-1.5 px-3 py-4 text-center',
            accent && 'bg-[linear-gradient(165deg,rgba(201,162,39,0.14),rgba(201,162,39,0.03)_70%)]',
            'transition-colors hover:bg-black/[0.03]',
          );
          const inner = (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-2.5',
                  accent ? 'text-[#6b5410]' : 'text-ink',
                )}
              >
                <GlanceIcon icon={fig.icon} />
                <span
                  className="text-[1.4rem] font-bold tabular-nums tracking-tight sm:text-[1.65rem]"
                  style={accent ? { fontFamily: 'Georgia, "Times New Roman", serif' } : undefined}
                >
                  {fig.value}
                </span>
              </span>
              <span className="text-[11px] font-semibold leading-snug tracking-wide text-ink/50 sm:text-[12px]">
                {fig.label}
              </span>
            </>
          );
          return (
            <li key={fig.id} className="min-w-0 bg-transparent">
              {fig.href ? (
                <Link to={fig.href} className={cn(cellClass, 'outline-none focus-visible:bg-black/[0.045]')}>
                  {inner}
                </Link>
              ) : (
                <div className={cellClass}>{inner}</div>
              )}
            </li>
          );
        })}
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
