import { useEffect } from 'react';
import { ArrowRight, ClipboardList, FileStack, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';

// Главная redevelopment.pro — платформа умных модулей для недвижимости.
// Визуал: та же дизайн-система, что админка / /zakupki / каталоги —
// серый фон, liquid glass, без фото-hero (владелец, 2026-10-11).

const TITLE = 'Redevelopment — умные модули для строительства и недвижимости';
const DESCRIPTION =
  'Специализированные модули для строительства, редевелопмента и продаж недвижимости: закупки стройматериалов, шахматка с CRM, контроль версий документов.';
const PAGE_URL = 'https://redevelopment.pro/';

const MODULES = [
  {
    id: 'zakupki',
    title: 'Закупки стройматериалов',
    text: 'Рынок поставщиков, письма, сравнение предложений — после того, как вы решили запускать закупку.',
    href: '/zakupki',
    status: 'demo' as const,
    Icon: ClipboardList,
  },
  {
    id: 'chess',
    title: 'Шахматка + CRM + AI',
    text: 'Продажи объектов без ручного хаоса в таблицах и чатах: шахматка в связке с CRM.',
    href: null,
    status: 'queue' as const,
    Icon: LayoutGrid,
  },
  {
    id: 'versions',
    title: 'Контроль версий',
    text: 'Всегда актуальные версии документов: дизайн-проекты, инженерные проекты и сопутствующие файлы.',
    href: null,
    status: 'queue' as const,
    Icon: FileStack,
  },
] as const;

const PRINCIPLE_STEPS = [
  { t: 'Модуль', d: 'узкий процесс' },
  { t: 'ИИ', d: 'повторяющееся' },
  { t: 'Человек', d: 'решения' },
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
        {/* Hero — две колонки: смысл + Claude */}
        <section
          className={cn(
            'platform-home-rise grid items-stretch gap-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1.35fr_0.85fr]',
            glassCardClass,
          )}
          style={glassCardShadow}
        >
          <div className="flex min-w-0 flex-col justify-center gap-5">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl sm:leading-[1.2]">
              Умные модули для закупок, продаж и&nbsp;документов
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Для команд в&nbsp;строительстве, редевелопменте и&nbsp;продажах. Вы принимаете
              решения — модуль закрывает повторяющуюся работу вокруг них.
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
          </div>

          <aside
            className="flex min-w-0 flex-col justify-center gap-4 rounded-[1.25rem] border border-[#d97757]/35 bg-gradient-to-br from-[#fff8f4] to-[#ffece0] p-5 shadow-[0_8px_28px_rgba(196,90,56,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-6"
            aria-label="Claude"
          >
            <div className="flex items-center gap-3">
              <img
                src="/zakupki-static/claude-asterisk.svg"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0"
              />
              <p className="text-lg font-extrabold leading-none text-ink whitespace-nowrap">
                На умных ИИ-моделях
              </p>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm font-medium leading-snug text-ink-muted">
              <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#d97757]">
                <strong className="font-bold text-ink">Claude</strong> от{' '}
                <strong className="font-bold text-ink">Anthropic</strong> — передовой ИИ для сложных
                задач
              </li>
              <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#d97757]">
                Не общий чат, а <strong className="font-bold text-ink">узкий помощник</strong> внутри
                модуля
              </li>
              <li className="relative pl-4 before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#d97757]">
                Только в <strong className="font-bold text-ink">заданных ситуациях</strong>; остальное —
                человеку
              </li>
            </ul>
          </aside>
        </section>

        {/* Цитата */}
        <section
          className={cn('platform-home-rise platform-home-rise-d1 px-6 py-5 sm:px-8 sm:py-6', glassCardClass)}
          style={glassCardShadow}
          aria-labelledby="quote-heading"
        >
          <h2 id="quote-heading" className="sr-only">
            Отзыв после первой демонстрации
          </h2>
          <blockquote className="min-w-0">
            <p className="text-lg font-extrabold leading-snug tracking-tight text-ink sm:text-xl lg:text-[1.35rem] xl:text-2xl">
              «Мне кажется, все компании рано или поздно придут к внедрению такого софта.»
            </p>
            <footer className="mt-3 text-sm leading-snug text-ink-muted">
              <cite className="not-italic font-semibold text-ink">
                Операционный директор · редевелопмент · 10&nbsp;000+&nbsp;м²
              </cite>
              <span className="text-ink-faint">
                {' '}
                — сказал собственнику после самой первой демки; модуль внедрили с&nbsp;первого раза
              </span>
            </footer>
          </blockquote>
        </section>

        {/* Принцип — две колонки: текст + три шага */}
        <section
          className={cn(
            'platform-home-rise platform-home-rise-d2 grid items-stretch gap-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1.35fr_0.85fr]',
            glassCardClass,
          )}
          style={glassCardShadow}
          aria-labelledby="principle-heading"
        >
          <div className="flex min-w-0 flex-col justify-center">
            <h2 id="principle-heading" className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              Вы принимаете решения. Модули берут повторяющееся.
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-muted">
              Мы не верим, что ИИ заменит человека. Но с&nbsp;ним можно сильно урезать то, что
              и&nbsp;так понятно и повторяется: письма, сверки, сбор цен, однотипные ответы.
            </p>
          </div>

          <aside
            className="flex min-w-0 flex-col justify-center gap-2.5"
            aria-label="Модуль, ИИ и человек"
          >
            {PRINCIPLE_STEPS.map((step) => (
              <div
                key={step.t}
                className="flex items-baseline gap-3 rounded-xl border border-border bg-white/70 px-4 py-3"
              >
                <span className="text-base font-extrabold text-ink">{step.t}</span>
                <span className="text-sm text-ink-muted">{step.d}</span>
              </div>
            ))}
          </aside>
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
            Каждый — под свой бизнес-процесс.
          </p>

          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {MODULES.map((mod) => {
              const Icon = mod.Icon;
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.05] text-ink-muted">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    {mod.status === 'demo' ? (
                      <span className="rounded-md bg-[#f5f0e6] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#8a7340]">
                        Закрытая демо
                      </span>
                    ) : (
                      <span className="rounded-md bg-black/[0.04] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                        В очереди
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 text-base font-extrabold text-ink">{mod.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{mod.text}</p>
                  {mod.href ? (
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary">
                      Смотреть
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  ) : (
                    <span className="mt-4 text-sm font-semibold text-ink-faint">В очереди</span>
                  )}
                </>
              );

              const className = cn(
                'group flex h-full flex-col rounded-2xl border border-border bg-white/70 p-4 transition-colors hover:border-ink/20 sm:p-5',
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
