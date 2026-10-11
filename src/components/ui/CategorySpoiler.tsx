// Крупные категории-спойлеры для длинных карточек (ТЦ): не FAQ-мелкота,
// а полноценный блок с иконкой, крупным заголовком и короткой подписью.
// Тёплый shopping-тон (персик/терракота) — не фирменный красный и не
// траурный чёрный. <details> — контент в DOM; по #якорю сам раскрывается.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import { tcChipClass } from '../businessCenters/tradeCenterRetailStyle';

export function CategorySpoiler({
  id,
  title,
  subtitle,
  meta,
  icon: Icon,
  index,
  defaultOpen = false,
  children,
  className,
}: {
  id: string;
  title: string;
  subtitle?: string | null;
  /** Короткая метка справа в шапке, напр. «12 якорей». */
  meta?: string | null;
  icon?: LucideIcon;
  /** Порядковый номер категории (01, 02…) — как на casinolist.pro. */
  index?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === `#${id}`) return true;
    return defaultOpen;
  });

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [id]);

  return (
    <details
      id={id}
      className={cn(
        'group mt-6 scroll-mt-32 overflow-hidden',
        glassCardClass,
        'open:bg-[#fff8f2]/95',
        className,
      )}
      style={glassCardShadow}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3.5 p-5 sm:gap-4 sm:px-6 sm:py-5',
          'marker:content-none [&::-webkit-details-marker]:hidden',
          'transition-colors hover:bg-[#fff8f2]/70',
        )}
      >
        {index != null && (
          <span
            className="hidden w-8 shrink-0 font-mono text-[11px] font-bold tracking-[0.16em] text-[#c45c3a]/55 sm:block"
            aria-hidden="true"
          >
            {String(index).padStart(2, '0')}
          </span>
        )}
        {Icon && (
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12',
              tcChipClass,
            )}
          >
            <Icon className="h-5 w-5 sm:h-[1.35rem] sm:w-[1.35rem]" strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-ink sm:text-xl">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 max-w-2xl text-sm leading-snug text-ink/55">{subtitle}</p>
          ) : null}
        </span>
        {meta ? (
          <span className="hidden shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#c45c3a]/70 sm:inline">
            {meta}
          </span>
        ) : null}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e8d0c4] bg-white/80 text-[#c45c3a]/70 transition-colors group-open:border-[#e0b9a8] group-open:text-[#c45c3a]"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-[#efdfd4] px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        {children}
      </div>
    </details>
  );
}
