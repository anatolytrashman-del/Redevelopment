import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { deployedSiteMode } from '../../lib/sites';
import { isLobstersBrand } from '../../lib/siteBrand';
import { LobstersLogo } from './BrandWordmark';

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
  /** Куда ведёт клик. По умолчанию: malls → `/minsk/tc`, offices → `/minsk/bc`, иначе `/`. */
  to?: string;
  className?: string;
  /** `span` — без ссылки (например, центрированная шапка хаба). */
  as?: 'link' | 'span';
}) {
  const mode = deployedSiteMode();
  const href = to ?? (mode === 'malls' ? '/minsk/tc' : mode === 'offices' ? '/minsk/bc' : '/');
  const mark =
    mode === 'malls' ? (
      <>
        Mall<span className="text-primary">List</span>
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
  if (mode === 'platform' && isLobstersBrand()) {
    // lobsters.pro: логотип-картинка Lobsters (src/lib/siteBrand.ts).
    const logo = <LobstersLogo size="sm" height={28} />;
    if (as === 'span') return <span className={cn('inline-flex', className)}>{logo}</span>;
    return (
      <Link to={href} className={cn('inline-flex shrink-0', className)}>
        {logo}
      </Link>
    );
  }
  if (as === 'span') {
    return <span className={classes}>{mark}</span>;
  }
  return (
    <Link to={href} className={cn('shrink-0', classes)}>
      {mark}
    </Link>
  );
}
