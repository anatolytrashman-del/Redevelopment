import { useEffect } from 'react';
import { ArrowRight, Building2, ClipboardList, Users } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setFaqJsonLd, setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';
import { FaqAccordion } from '../components/ui/FaqAccordion';

// Главная redevelopment.pro — платформа умных модулей для недвижимости
// (не каталог БЦ/ТЦ: те уехали на officelist/malllist). Концепт владельца
// 2026-10-11: как Contour — отдельные модули под бизнес-процессы; идея
// «вы думаете, модули закрывают рутину», без давления «ИИ/автоматизация».

const TITLE = 'Redevelopment — умные модули для работы с недвижимостью';
const DESCRIPTION =
  'Модули для закупок, продаж и подбора в недвижимости: вы принимаете решения, рутину закрывают инструменты. Первый модуль — закупки стройматериалов.';
const PAGE_URL = 'https://redevelopment.pro/';

const FAQ_ITEMS = [
  {
    question: 'Что такое Redevelopment?',
    answer:
      'Компания делает умные модули для бизнеса в сфере недвижимости — отдельные инструменты под конкретные процессы: закупки, продажи, подбор объектов для клиентов.',
  },
  {
    question: 'Чем модули отличаются от «софта, который всё сделает сам»?',
    answer:
      'Модули не заменяют ваше решение. Вы по-прежнему думаете и запускаете процесс — модуль закрывает тяжёлую рутину вокруг: поиск, рассылки, сравнение, оформление.',
  },
  {
    question: 'Какие модули уже есть?',
    answer:
      'Сейчас открыт модуль закупок стройматериалов. Модули для застройщиков и для брокеров — в подготовке; на главной они показаны как направления, без обещания сроков.',
  },
  {
    question: 'Для кого это?',
    answer:
      'Для команд в стройке и недвижимости: закупки на объекте, продажи застройщика, работа брокера с подборками для клиентов. Каждый модуль заточен под свой процесс.',
  },
  {
    question: 'Откуда цитата на главной?',
    answer:
      'Это первая живая реакция после самой первой демонстрации продукта собственнику компании в сфере редевелопмента. После той встречи модуль внедрили. Имя и компания не названы намеренно.',
  },
  {
    question: 'Где каталоги бизнес-центров и торговых центров?',
    answer:
      'Каталоги вынесены на отдельные сайты: бизнес-центры — officelist.pro, торговые центры — malllist.pro. Redevelopment.pro — про продуктовые модули.',
  },
] as const;

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
    setFaqJsonLd([...FAQ_ITEMS]);
    return () => setFaqJsonLd([]);
  }, []);

  return (
    <div className="min-h-svh bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        К содержанию
      </a>

      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <SiteBrandLogo to="/" className="text-white [&_.text-primary]:text-primary" />
          <nav className="flex items-center gap-5 text-sm font-semibold text-white/75">
            <a href="#modules" className="transition-colors hover:text-white">
              Модули
            </a>
            <a href="/zakupki" className="transition-colors hover:text-white">
              Закупки
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero — один экран: бренд, смысл, CTA. Без карточек и вторичного контента. */}
        <section className="relative flex min-h-svh flex-col justify-end overflow-hidden bg-[#14151a] pb-14 pt-28 sm:pb-20 sm:pt-32">
          <img
            src="/images/business-centers-hero/futuris-1600-w1200.webp"
            srcSet="/images/business-centers-hero/futuris-1600-w720.webp 720w, /images/business-centers-hero/futuris-1600-w1200.webp 1200w"
            sizes="100vw"
            alt=""
            width={1200}
            height={800}
            fetchPriority="high"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-45"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#14151a] via-[#14151a]/75 to-[#14151a]/35"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary sm:w-1.5"
            aria-hidden
          />

          <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <p
              className="platform-home-rise text-4xl font-black tracking-wide text-white sm:text-6xl lg:text-7xl"
              aria-label="Redevelopment"
            >
              <span className="text-primary">RED</span>EVELOPMENT
            </p>
            <h1 className="platform-home-rise platform-home-rise-d1 mt-6 max-w-2xl text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl sm:leading-[1.15]">
              Умные модули для работы с недвижимостью
            </h1>
            <p className="platform-home-rise platform-home-rise-d2 mt-4 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
              Вы принимаете решения. Модули закрывают рутину вокруг закупок, продаж и подбора.
            </p>
            <div className="platform-home-rise platform-home-rise-d3 mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#modules"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
              >
                Смотреть модули
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a
                href="/zakupki"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/5 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-white/10"
              >
                Модуль закупок
              </a>
            </div>
          </div>
        </section>

        {/* Цитата — сразу после hero, по заданию владельца */}
        <section
          className="border-b border-border bg-bg"
          aria-labelledby="quote-heading"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <h2 id="quote-heading" className="sr-only">
              Отзыв после первой демонстрации
            </h2>
            <blockquote className="max-w-3xl">
              <p className="text-2xl font-extrabold leading-snug tracking-tight text-ink sm:text-3xl sm:leading-[1.25]">
                «Мне кажется, все компании рано или поздно придут к внедрению такого софта.»
              </p>
              <footer className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
                <cite className="not-italic font-semibold text-ink">
                  Операционный директор компании в сфере редевелопмента
                </cite>
                <span className="mt-1 block">
                  Портфель более 10&nbsp;000&nbsp;м². Сказано собственнику на первой
                  демонстрации продукта — после той встречи модуль внедрили.
                </span>
              </footer>
            </blockquote>
          </div>
        </section>

        {/* Принцип */}
        <section className="bg-bg" aria-labelledby="principle-heading">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="principle-heading"
              className="max-w-2xl text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
            >
              Вы думаете. Модули помогают.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Отдельный модуль — под отдельный процесс. Не «платформа вместо людей», а
              инструмент рядом с вашей работой: решение остаётся за вами, тяжёлую
              операционку модуль берёт на себя.
            </p>
          </div>
        </section>

        {/* Модули — карточки как контейнеры перехода/ожидания */}
        <section id="modules" className="scroll-mt-6 bg-bg pb-6" aria-labelledby="modules-heading">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="modules-heading"
              className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl"
            >
              Модули
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
              Каждый — под свой бизнес-процесс. Открыт первый; остальные — заготовки
              направлений.
            </p>

            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {MODULES.map((mod) => {
                const Icon = mod.Icon;
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
                    <h3 className="mt-5 text-lg font-extrabold text-ink">{mod.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{mod.text}</p>
                    {mod.href ? (
                      <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary">
                        Открыть
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    ) : (
                      <span className="mt-5 text-sm font-semibold text-ink-faint">В подготовке</span>
                    )}
                  </>
                );

                const className = cn(
                  'group flex h-full flex-col p-5 transition-transform hover:-translate-y-0.5 sm:p-6',
                  glassCardClass,
                  !mod.href && 'opacity-90',
                );

                return (
                  <li key={mod.id}>
                    {mod.href ? (
                      <a href={mod.href} className={className} style={glassCardShadow}>
                        {inner}
                      </a>
                    ) : (
                      <div className={className} style={glassCardShadow}>
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <FaqAccordion title="Частые вопросы" items={[...FAQ_ITEMS]} id="faq" />

          <div
            className="flex flex-col gap-3 border-t border-border pt-8 text-sm text-ink-muted"
            aria-labelledby="sources-heading"
          >
            <h2 id="sources-heading" className="text-base font-bold text-ink">
              Источники и дисклеймер
            </h2>
            <p>
              Redevelopment — продуктовая компания: умные модули для процессов в
              недвижимости. Цитата на странице — реальная реакция с первой
              демонстрации продукта; имя и компания не раскрываются. Описания модулей
              «скоро» — направления разработки, не оферта и не срок релиза. Каталоги
              зданий ведутся на officelist.pro и malllist.pro.
            </p>
            <CookieFooterLinks />
          </div>
        </section>
      </main>

      <style>{`
        @keyframes platform-home-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .platform-home-rise {
          animation: platform-home-rise 0.65s ease-out both;
        }
        .platform-home-rise-d1 { animation-delay: 0.1s; }
        .platform-home-rise-d2 { animation-delay: 0.2s; }
        .platform-home-rise-d3 { animation-delay: 0.3s; }
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
