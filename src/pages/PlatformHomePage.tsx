import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';
import { SITES } from '../lib/sites';

// Тот же Telegram, что на лендинге Red One (ObjectLandingPage).
const FOUNDER_TELEGRAM_URL = 'https://t.me/a_trashman';
const FOUNDER_ONLINE_FROM_HOUR = 9;
const FOUNDER_ONLINE_TO_HOUR = 23;

function TelegramLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#29A9EB" />
      <path
        fill="#FFFFFF"
        d="M5 12.3 18.5 7c.6-.2 1.1.2.9 1.1l-2.3 10.9c-.2.7-.6.9-1.2.6l-3.4-2.5-1.6 1.6c-.2.2-.3.3-.6.3l.2-3.1 5.7-5.1c.2-.2 0-.3-.3-.1l-7 4.4L5 13.7c-.6-.2-.6-.6 0-.9z"
      />
      <path fill="#B9DCF2" d="m10.5 15.4-.2 3.1c.3 0 .4-.1.6-.3l1.6-1.6-2-1.2z" />
    </svg>
  );
}

function isFounderOnlineNow() {
  const moscowHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Moscow',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  return moscowHour >= FOUNDER_ONLINE_FROM_HOUR && moscowHour < FOUNDER_ONLINE_TO_HOUR;
}

// Главная redevelopment.pro — каталоги + платформа умных модулей.
// Preview 2026-10-11: лого без меню; блок каталогов над блоком модулей.
// В прод не выкатывать — работаем на preview.

const TITLE = 'Redevelopment — каталоги и умные модули для недвижимости';
const DESCRIPTION =
  'Каталоги OfficeList и MallList плюс умные модули для индустрии недвижимости.';
const PAGE_URL = 'https://redevelopment.pro/';

const CATALOGS: {
  id: string;
  href: string;
  text: string;
  mark: ReactNode;
}[] = [
  {
    id: 'offices',
    href: SITES.offices.origin,
    text: 'Каталог бизнес-центров: карточки зданий, рейтинги, классы и аналитика.',
    mark: (
      <>
        Office<span className="text-primary">List</span>
      </>
    ),
  },
  {
    id: 'malls',
    href: SITES.malls.origin,
    text: 'Каталог торговых центров: площади, форматы, арендаторы и подборки.',
    mark: (
      <>
        Mall<span className="text-primary">List</span>
      </>
    ),
  },
];

export function PlatformHomePage() {
  const [founderOnline, setFounderOnline] = useState(isFounderOnlineNow);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
    setOrganizationJsonLd(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setFounderOnline(isFounderOnlineNow()), 60_000);
    return () => clearInterval(timer);
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <SiteBrandLogo to="/" />
            <ThemeToggle />
          </div>
          <a
            href={FOUNDER_TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            title={founderOnline ? 'Онлайн — на связи' : 'Офлайн — отвечу завтра'}
            aria-label={`Написать основателю в Telegram — ${founderOnline ? 'онлайн' : 'офлайн'}`}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink hover:border-primary hover:text-primary sm:py-1.5',
              glassPillClass,
            )}
            style={glassPillShadow}
          >
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center sm:h-5 sm:w-5">
              <TelegramLogo className="h-7 w-7 sm:h-5 sm:w-5" />
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white',
                  founderOnline ? 'bg-success' : 'bg-ink-faint',
                )}
              />
            </span>
            <span className="hidden sm:inline">Написать основателю</span>
          </a>
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-8 sm:py-12">
        {/* Каталоги — выше блока модулей */}
        <section
          className={cn(
            'platform-home-rise grid items-stretch gap-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1.35fr_0.85fr]',
            glassCardClass,
          )}
          style={glassCardShadow}
          aria-labelledby="catalogs-heading"
        >
          <div className="flex min-w-0 flex-col justify-center gap-5">
            <h1
              id="catalogs-heading"
              className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl sm:leading-[1.2]"
            >
              Каталоги недвижимости
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Открытые справочники по бизнес-центрам и торговым центрам — с карточками, фильтрами
              и данными, которые можно сравнивать.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="inline-flex items-center rounded-md bg-success-bg px-5 py-2.5 text-sm font-bold text-success/80">
                Запущен пилот
              </span>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col justify-center gap-2.5" aria-label="OfficeList и MallList">
            {CATALOGS.map((cat) => (
              <a
                key={cat.id}
                href={cat.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-border bg-white/70 p-4 transition-colors hover:border-ink/20 sm:p-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-lg font-extrabold tracking-wide text-ink">
                    {cat.mark}
                    <ArrowRight
                      className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      aria-hidden
                    />
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm leading-snug text-ink-muted">
                    {cat.text}
                  </span>
                </span>
              </a>
            ))}
          </aside>
        </section>

        {/* Умные модули */}
        <section
          className={cn(
            'platform-home-rise platform-home-rise-d1 grid items-stretch gap-6 p-6 sm:gap-8 sm:p-8 lg:grid-cols-[1.35fr_0.85fr]',
            glassCardClass,
          )}
          style={glassCardShadow}
        >
          <div className="flex min-w-0 flex-col justify-center gap-5">
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl sm:leading-[1.2]">
              Умные модули для индустрии недвижимости
            </h2>
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
        .platform-home-rise-d1 { animation-delay: 0.08s; }
        @media (prefers-reduced-motion: reduce) {
          .platform-home-rise,
          .platform-home-rise-d1 { animation: none; }
        }
      `}</style>
    </div>
  );
}
