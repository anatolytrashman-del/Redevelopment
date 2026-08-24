import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, BookOpen, Building2, Lock } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta } from '../lib/pageMeta';
import { fetchObjects } from '../lib/objectsApi';
import type { RealtyObject } from '../data/objects';
import { DISTRICTS, DISTRICTS_WITH_GUIDE } from '../data/districts';

// Хаб раздела "Минск" (SEO_PLAN.md, урл-структура /minsk/...) — комплексы
// компании + гиды по районам + аналитика, всё под одним префиксом. Корень
// сайта (/) сознательно НЕ стал этой страницей: по плану Э2-4 в SEO_PLAN.md
// он зарезервирован под будущую отдельную страницу платформы (другая
// аудитория, другая гео-настройка), а /minsk — city-scoped раздел, готовый
// к появлению других городов рядом (redevelopment.pro/<город>/...) без
// переезда текущих ссылок.
const TITLE = 'Коммерческая недвижимость в Минске — Redevelopment';
const DESCRIPTION =
  'Деловые комплексы, гиды по районам и аналитика рынка коммерческой недвижимости Минска от Redevelopment.';
const PAGE_URL = 'https://redevelopment.pro/minsk';

export function MinskHub() {
  const [objects, setObjects] = useState<RealtyObject[] | null>(null);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
  }, []);

  useEffect(() => {
    fetchObjects()
      .then((all) => setObjects(all.filter((o) => o.landingSlug.trim() !== '')))
      .catch(() => setObjects([]));
  }, []);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 sm:px-8">
          <span className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary">RED</span>EVELOPMENT
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Коммерческая недвижимость в Минске</h1>
          <p className="max-w-2xl text-ink-muted">
            Деловые комплексы компании, гиды по районам для арендаторов и собственников, аналитика рынка.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-ink">Комплексы</h2>
          {objects === null && <p className="text-sm text-ink-faint">Загрузка…</p>}
          {objects && objects.length === 0 && <p className="text-sm text-ink-faint">Скоро здесь появятся объекты.</p>}
          {objects && objects.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {objects.map((o) => (
                <Link
                  key={o.id}
                  to={`/minsk/${o.landingSlug}`}
                  className={cn('flex flex-col gap-3 p-4 transition-colors hover:border-primary/40', glassCardClass)}
                  style={glassCardShadow}
                >
                  <div className="flex h-36 items-center justify-center overflow-hidden rounded-control bg-surface-muted">
                    {o.photoUrls[0] ? (
                      <img src={o.photoUrls[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-8 w-8 text-ink-faint" />
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink">{o.name || o.address}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </div>
                  <p className="text-sm text-ink-muted">
                    {o.address}
                    {o.startPrice ? ` · от $${Math.round(o.startPrice).toLocaleString('ru-RU')}` : ''}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-ink">Гиды по районам</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DISTRICTS.map((d) => {
              const available = DISTRICTS_WITH_GUIDE.includes(d.slug);
              return available ? (
                <Link
                  key={d.slug}
                  to={`/minsk/${d.slug}`}
                  className={cn('flex items-center justify-between gap-2 p-4 transition-colors hover:border-primary/40', glassCardClass)}
                  style={glassCardShadow}
                >
                  <span className="flex items-center gap-2.5 font-medium text-ink">
                    <BookOpen className="h-4 w-4 shrink-0 text-ink-faint" />
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
                    <BookOpen className="h-4 w-4 shrink-0" />
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
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-ink">Аналитика рынка</h2>
          <Link
            to="/minsk/analytics"
            className={cn('flex items-center justify-between gap-2 p-4 transition-colors hover:border-primary/40', glassCardClass)}
            style={glassCardShadow}
          >
            <span className="flex items-center gap-2.5 font-medium text-ink">
              <BarChart3 className="h-4 w-4 shrink-0 text-ink-faint" />
              Цены и предложения по районам
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
          </Link>
        </section>
      </div>
    </div>
  );
}
