import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, BookOpen, Lock, ShoppingBag, Users, Warehouse } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { DISTRICTS, DISTRICTS_WITH_GUIDE } from '../data/districts';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';

// Хаб раздела "Минск" (SEO_PLAN.md, урл-структура /minsk/...) — только
// гиды по районам, под общим city-scoped префиксом. Корень сайта (/)
// сознательно НЕ стал этой страницей: по плану Э2-4 в SEO_PLAN.md он
// зарезервирован под будущую отдельную страницу платформы (другая
// аудитория, другая гео-настройка), а /minsk — city-scoped раздел, готовый
// к появлению других городов рядом (redevelopment.pro/<город>/...) без
// переезда текущих ссылок.
// Владелец (2026-08-25) убрал отсюда секцию "Комплексы" (список объектов
// компании — Red One и т.п.) и "Аналитика рынка" (ссылка на удалённый
// /minsk/analytics) — хаб теперь только про гиды по районам, сам объект
// по-прежнему доступен напрямую по своей ссылке (/minsk/one), просто не
// перечисляется здесь.
// Аудит поиска 2026-09-07 вернул сюда две ссылки — на каталог БЦ и на Red
// One: с /minsk не было ни одной входящей ссылки ни на /minsk/bc, ни на
// /minsk/one, каталог и все карточки БЦ оказались «островом» и не попали в
// индекс ни Google, ни Яндекса.
// Владелец, 2026-09-16: ссылка на Red One отсюда снова убрана — пока
// здание не куплено, продавать его нечего (СМИ смотрят страницы
// статистики). Так же убраны ссылки и блоки Red One с гида по району,
// посадочных Минск Мира, каталога БЦ и аналитических страниц; сам лендинг
// /minsk/one остаётся доступным по прямой ссылке. Вернуть, когда здание
// будет куплено.
// Владелец, 2026-09-16 (позже в тот же день): секция "Справочники и
// объекты" убрана целиком — вместе с ней ушли ссылки на /minsk/bc и
// /minsk/analytics ("пока"). Обе страницы остаются доступны по прямым
// ссылкам и в sitemap, но входящих ссылок с /minsk у них больше нет —
// ровно та ситуация "острова", из-за которой их сюда возвращали 2026-09-07
// (каталог БЦ) и по ANALYTICSPLAN.md 2026-09-07 (аналитика). Возвращать
// секцию — по команде владельца.
// Владелец, 2026-09-22: команда вернуть ссылку на каталог БЦ — секция
// "Каталоги" ниже (не полное возвращение убранной 2026-09-16 секции, только
// сами каталоги объектов, без аналитики и Red One). Плюс три "скоро"-плашки
// под будущие каталоги (ТЦ, коворкинги, склады) — страниц под них пока нет,
// роутов в App.tsx для них соответственно тоже нет.
const CATALOGS = [
  { name: 'Бизнес-центры', icon: Building2, href: '/minsk/bc' },
  { name: 'Торговые центры', icon: ShoppingBag, href: null },
  { name: 'Коворкинги', icon: Users, href: null },
  { name: 'Склады', icon: Warehouse, href: null },
] as const;

const TITLE = 'Коммерческая недвижимость в Минске — Redevelopment';
const DESCRIPTION = 'Каталог бизнес-центров и гиды по районам Минска для арендаторов и собственников коммерческой недвижимости.';
const PAGE_URL = 'https://redevelopment.pro/minsk';

export function MinskHub() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
    setOrganizationJsonLd(true);
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

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">Коммерческая недвижимость в Минске</h1>
          <p className="max-w-2xl text-ink">Каталоги объектов и гиды по районам для арендаторов и собственников коммерческой недвижимости.</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-ink">Каталоги</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CATALOGS.map((c) => {
              const Icon = c.icon;
              return c.href ? (
                <Link
                  key={c.name}
                  to={c.href}
                  className={cn('flex items-center justify-between gap-2 p-4 transition-colors hover:border-primary/40', glassCardClass)}
                  style={glassCardShadow}
                >
                  <span className="flex items-center gap-2.5 font-medium text-ink">
                    <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
                    {c.name}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              ) : (
                <div
                  key={c.name}
                  className="flex items-center justify-between gap-2 rounded-control border border-border p-4 text-ink-faint"
                >
                  <span className="flex items-center gap-2.5 font-medium">
                    <Icon className="h-4 w-4 shrink-0" />
                    {c.name}
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

        <CookieFooterLinks />
      </main>
    </div>
  );
}
