import { useEffect } from 'react';
import { ArrowRight, Building2, ClipboardList, Users } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';

// Главная redevelopment.pro — платформа умных модулей для недвижимости.
// Визуал: та же дизайн-система, что админка / /zakupki / каталоги —
// серый фон, liquid glass, без фото-hero (владелец, 2026-10-11).

const TITLE = 'Redevelopment — умные модули для работы с недвижимостью';
const DESCRIPTION =
  'Модули для закупок, продаж и подбора в недвижимости: вы принимаете решения, рутину закрывают инструменты. Первый модуль — закупки стройматериалов.';
const PAGE_URL = 'https://redevelopment.pro/';

const MODULES = [
  {
    id: 'zakupki',
    title: 'Закупки',
    text: 'Рынок поставщиков, письма, сравнение предложений — после того, как вы решили запускать закупку.',
    href: '/zakupki',
    status: 'live' as const,
    Icon: ClipboardList,
  },
  {
    id: 'developers',
    title: 'Для застройщиков',
    text: 'Шахматка и связка с CRM: продажи объектов без ручного хаоса в таблицах и чатах.',
    href: null,
    status: 'soon' as const,
    Icon: Building2,
  },
  {
    id: 'brokers',
    title: 'Для брокеров',
    text: 'Подборки для клиентов и повторяемая рутина вокруг них — без копипаста из десяти вкладок.',
    href: null,
    status: 'soon' as const,
    Icon: Users,
  },
] as const;

export function PlatformHomePage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
    setOrganizationJsonLd(true);
  }, []);

  return (
    <div className="min-h-svh bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        К содержанию
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <SiteBrandLogo to="/" />
          <nav className="flex items-center gap-5 text-sm font-semibold text-ink-muted">
            <a href="#modules" className="transition-colors hover:text-ink">
              Модули
            </a>
            <a href="/zakupki" className="transition-colors hover:text-ink">
              Закупки
            </a>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:gap-5 sm:px-8 sm:py-12">
        {/* Hero — glass, без фото */}
        <section className={cn('platform-home-rise flex flex-col gap-5 p-6 sm:p-8 sm:gap-6', glassCardClass)} style={glassCardShadow}>
          <p className="text-2xl font-black tracking-wide text-ink sm:text-3xl" aria-label="Redevelopment">
            <span className="text-primary">RED</span>EVELOPMENT
          </p>
          <h1 className="max-w-2xl text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl sm:leading-[1.2]">
            Умные модули для работы с недвижимостью
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Вы принимаете решения. Модули закрывают рутину вокруг закупок, продаж и подбора.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="#modules"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
            >
              Смотреть модули
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="/zakupki"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white/70 px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:border-ink/25"
            >
              Модуль закупок
            </a>
          </div>
        </section>

        {/* Цитата */}
        <section
          className={cn('platform-home-rise platform-home-rise-d1 p-6 sm:p-8', glassCardClass)}
          style={glassCardShadow}
          aria-labelledby="quote-heading"
        >
          <h2 id="quote-heading" className="sr-only">
            Отзыв после первой демонстрации
          </h2>
          <blockquote className="max-w-3xl">
            <p className="text-xl font-extrabold leading-snug tracking-tight text-ink sm:text-2xl sm:leading-[1.3]">
              «Мне кажется, все компании рано или поздно придут к внедрению такого софта.»
            </p>
            <footer className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              <cite className="not-italic font-semibold text-ink">
                Операционный директор компании в сфере редевелопмента
              </cite>
              <span className="mt-1 block">
                Портфель более 10&nbsp;000&nbsp;м². Сказано собственнику на первой
                демонстрации продукта — после той встречи модуль внедрили.
              </span>
            </footer>
          </blockquote>
        </section>

        {/* Принцип */}
        <section
          className={cn('platform-home-rise platform-home-rise-d2 p-6 sm:p-8', glassCardClass)}
          style={glassCardShadow}
          aria-labelledby="principle-heading"
        >
          <h2 id="principle-heading" className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Вы думаете. Модули помогают.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
            Отдельный модуль — под отдельный процесс. Не «платформа вместо людей», а
            инструмент рядом с вашей работой: решение остаётся за вами, тяжёлую
            операционку модуль берёт на себя.
          </p>
        </section>

        {/* Модули */}
        <section
          id="modules"
          className={cn('platform-home-rise platform-home-rise-d3 scroll-mt-20 p-6 sm:p-8', glassCardClass)}
          style={glassCardShadow}
          aria-labelledby="modules-heading"
        >
          <h2 id="modules-heading" className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Модули
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Каждый — под свой бизнес-процесс. Открыт первый; остальные — заготовки направлений.
          </p>

          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {MODULES.map((mod) => {
              const Icon = mod.Icon;
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    {mod.status === 'live' ? (
                      <span className="rounded-md bg-success-bg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-success">
                        Открыт
                      </span>
                    ) : (
                      <span className="rounded-md bg-black/[0.04] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                        Скоро
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-extrabold text-ink">{mod.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{mod.text}</p>
                  {mod.href ? (
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary">
                      Открыть
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  ) : (
                    <span className="mt-4 text-sm font-semibold text-ink-faint">В подготовке</span>
                  )}
                </>
              );

              const className = cn(
                'group flex h-full flex-col rounded-2xl border border-border bg-white/70 p-4 transition-colors hover:border-primary/30 sm:p-5',
                !mod.href && 'opacity-90',
              );

              return (
                <li key={mod.id}>
                  {mod.href ? (
                    <a href={mod.href} className={className}>
                      {inner}
                    </a>
                  ) : (
                    <div className={className}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="flex flex-col gap-3 px-1 pb-8 pt-2 text-sm text-ink-muted">
          <CookieFooterLinks />
        </footer>
      </main>

      <style>{`
        @keyframes platform-home-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .platform-home-rise {
          animation: platform-home-rise 0.5s ease-out both;
        }
        .platform-home-rise-d1 { animation-delay: 0.08s; }
        .platform-home-rise-d2 { animation-delay: 0.16s; }
        .platform-home-rise-d3 { animation-delay: 0.24s; }
        @media (prefers-reduced-motion: reduce) {
          .platform-home-rise,
          .platform-home-rise-d1,
          .platform-home-rise-d2,
          .platform-home-rise-d3 {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
