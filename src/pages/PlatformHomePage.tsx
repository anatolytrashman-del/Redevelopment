import { useEffect } from 'react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';

// Главная redevelopment.pro — платформа умных модулей для недвижимости.
// Комбо 2026-10-11: только лого + один главный блок (без меню и нижних секций).
// В прод не выкатывать — работаем на preview.

const TITLE = 'Redevelopment — умные модули для индустрии недвижимости';
const DESCRIPTION =
  'Умные модули для индустрии недвижимости: закупки, продажи и документы на моделях Claude.';
const PAGE_URL = 'https://redevelopment.pro/';

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
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4 sm:px-8">
          <SiteBrandLogo to="/" />
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-8 sm:py-12">
        <section
          className={cn(
            'platform-home-rise grid items-stretch gap-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1.35fr_0.85fr]',
            glassCardClass,
          )}
          style={glassCardShadow}
        >
          <div className="flex min-w-0 flex-col justify-center gap-5">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl sm:leading-[1.2]">
              Умные модули для индустрии недвижимости
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Для команд в&nbsp;строительстве, редевелопменте и&nbsp;продажах. Вы принимаете
              решения — модуль закрывает повторяющуюся работу вокруг них.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span
                className="inline-flex items-center gap-1.5 rounded-md bg-black/[0.06] px-5 py-2.5 text-sm font-bold text-ink-muted"
                aria-disabled="true"
              >
                В работе
              </span>
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
        @media (prefers-reduced-motion: reduce) {
          .platform-home-rise { animation: none; }
        }
      `}</style>
    </div>
  );
}
