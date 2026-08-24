import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowRight, BarChart3, Lock } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta } from '../lib/pageMeta';
import { DISTRICTS, DISTRICTS_WITH_ANALYTICS } from '../data/districts';

const TITLE = 'Аналитика рынка коммерческой недвижимости Минска';
const DESCRIPTION = 'Цены и предложения по продаже и аренде коммерческих помещений — по районам Минска.';
const PAGE_URL = 'https://redevelopment.pro/minsk/analytics';

export function MinskAnalyticsHub() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
  }, []);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 sm:px-8">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <Link to="/minsk" className="w-fit text-sm font-medium text-ink-muted hover:text-primary">
            ← Минск
          </Link>
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Аналитика рынка</h1>
          <p className="max-w-xl text-ink-muted">
            Действующие предложения продажи и аренды коммерческих помещений — количество и медианная цена за м² по
            районам Минска.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DISTRICTS.map((d) => {
            const available = DISTRICTS_WITH_ANALYTICS.includes(d.slug);
            return available ? (
              <Link
                key={d.slug}
                to={`/minsk/analytics/${d.slug}`}
                className={cn('flex items-center justify-between gap-2 p-4 transition-colors hover:border-primary/40', glassCardClass)}
                style={glassCardShadow}
              >
                <span className="flex items-center gap-2.5 font-medium text-ink">
                  <BarChart3 className="h-4 w-4 shrink-0 text-ink-faint" />
                  {d.name}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            ) : (
              <div
                key={d.slug}
                className="flex items-center justify-between gap-2 rounded-control border border-border p-4 text-ink-faint"
              >
                <span className="flex items-center gap-2.5 font-medium">
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  {d.name}
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <Lock className="h-3.5 w-3.5" />
                  скоро
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
