import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { deployedSiteMode } from '../../lib/sites';

/**
 * Текстовый логотип сайта.
 * Платформа: RED(красным)EVELOPMENT.
 * Malllist / Officelist: то же начертание у обеих частей, List только цветом.
 */
export function SiteBrandLogo({
  to,
  className,
  as = 'link',
}: {
  /** Куда ведёт клик. По умолчанию `/`: на malllist/officelist хаб каталога живёт на корне (/minsk/tc|bc → 308 на /). */
  to?: string;
  className?: string;
  /** `span` — без ссылки (например, центрированная шапка хаба). */
  as?: 'link' | 'span';
}) {
  const mode = deployedSiteMode();
  const href = to ?? '/';
  const mark =
    mode === 'malls' ? (
      <>
        {/* «List» на #f0efed: #e4152b даёт 4.11:1 при 18px bold (LH 2026-11-08).
            text-primary-hover (#c81124) — тот же приём, что Э8 для «RED», только malllist. */}
        Mall<span className="text-primary-hover">List</span>
      </>
    ) : mode === 'offices' ? (
      <>
        Office<span className="text-primary">List</span>
      </>
    ) : (
      <>
        <span className="font-black text-primary">RED</span>EVELOPMENT
      </>
    );

  const classes = cn('text-lg font-extrabold tracking-wide text-ink', className);
  if (as === 'span') {
    return <span className={classes}>{mark}</span>;
  }
  return (
    <Link to={href} className={cn('shrink-0', classes)}>
      {mark}
    </Link>
  );
}
