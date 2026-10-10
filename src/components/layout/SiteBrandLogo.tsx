import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { deployedSiteMode } from '../../lib/sites';

/**
 * Текстовый логотип сайта.
 * Платформа: RED(красным)EVELOPMENT.
 * Malllist: Mall + List(красным) — по аналогии с CasinoList.
 */
export function SiteBrandLogo({
  to,
  className,
  as = 'link',
}: {
  /** Куда ведёт клик. По умолчанию: malls → `/`, иначе `/minsk`. */
  to?: string;
  className?: string;
  /** `span` — без ссылки (например, центрированная шапка хаба). */
  as?: 'link' | 'span';
}) {
  const mode = deployedSiteMode();
  const href = to ?? (mode === 'malls' ? '/' : '/minsk');
  const mark =
    mode === 'malls' ? (
      <>
        Mall<span className="font-black text-primary">List</span>
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
