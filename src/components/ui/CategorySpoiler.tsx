// Крупные категории-спойлеры для длинных карточек (ТЦ): не FAQ-мелкота,
// а полноценный блок с иконкой, крупным заголовком и короткой подписью.
// <details> — контент в DOM и для краулеров, даже когда закрыто.
// По #якорю из меню «На странице» спойлер сам раскрывается.
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';

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
      className={cn('group mt-6 scroll-mt-32', glassCardClass, className)}
      style={glassCardShadow}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3.5 p-5 sm:gap-4 sm:p-6',
          'marker:content-none [&::-webkit-details-marker]:hidden',
          'transition-colors hover:bg-white/35',
        )}
      >
        {index != null && (
          <span
            className="hidden w-8 shrink-0 font-mono text-[11px] font-bold tracking-[0.18em] text-ink-faint sm:block"
            aria-hidden="true"
          >
            {String(index).padStart(2, '0')}
          </span>
        )}
        {Icon && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-icon-bg text-icon sm:h-14 sm:w-14">
            <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{title}</h2>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-muted">{subtitle}</p>
          ) : null}
        </span>
        {meta ? (
          <span className="hidden shrink-0 text-xs font-bold uppercase tracking-wide text-ink-muted sm:inline">
            {meta}
          </span>
        ) : null}
        <ChevronDown
          className="h-5 w-5 shrink-0 text-ink-faint transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-border/70 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        {children}
      </div>
    </details>
  );
}
