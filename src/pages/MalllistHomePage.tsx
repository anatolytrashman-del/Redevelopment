import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Layers, Map, Store } from 'lucide-react';
import { cn } from '../lib/cn';
import { setFaqJsonLd, setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { SITES } from '../lib/sites';

// Главная malllist.pro — визуальный ритм casinolist.pro:
// серый фон страницы → крупные белые rounded-карточки с тенью,
// hero 2 колонки (текст + inset), затем продуктовый путь и города.
// Без манифеста «честной модели».

const ORIGIN = SITES.malls.origin;
const DISPLAY = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

const TITLE = 'MallList — каталог торговых центров';
const DESCRIPTION =
  'Каталог торговых центров по городам. Карточки объектов, подборки, карта — начиная с Минска.';
const PAGE_URL = `${ORIGIN}/`;

const shellCard =
  'rounded-[1.75rem] border border-black/[0.06] bg-white shadow-[0_18px_50px_rgba(20,21,26,0.07)] sm:rounded-[2rem]';

const HERO_MARKS = [
  { Icon: Building2, tone: 'text-ink' },
  { Icon: Store, tone: 'text-primary' },
  { Icon: Map, tone: 'text-ink' },
  { Icon: Layers, tone: 'text-primary' },
] as const;

const SIDE_BADGES = [
  { code: 'МН', label: 'Минск', sub: 'Live' },
  { code: 'список', label: 'Все ТЦ', sub: 'Город' },
  { code: 'карта', label: 'На карте', sub: 'План' },
  { code: 'карточка', label: 'По объекту', sub: 'Детали' },
] as const;

const FLOW = [
  {
    n: '1',
    title: 'Открываете город',
    text: 'Полный список торговых центров',
    ring: 'border-amber-400/80',
  },
  {
    n: '2',
    title: 'Сужаете фильтром',
    text: 'Район, формат, метро, тема',
    ring: 'border-rose-300',
  },
  {
    n: '3',
    title: 'Смотрите карту',
    text: 'Все объекты на одном плане',
    ring: 'border-primary/70',
  },
  {
    n: '4',
    title: 'Заходите в карточку',
    text: 'Площадь, арендаторы, блоки',
    ring: 'border-primary',
  },
] as const;

const FAQ_ITEMS = [
  {
    question: 'Что такое MallList?',
    answer:
      'Каталог торговых центров по городам: карточки объектов, подборки и карта. Сейчас открыт Минск.',
  },
  {
    question: 'Что есть в каталоге Минска?',
    answer:
      'Список торговых центров с карточками: площадь, адрес, формат, метро, арендаторы, подборки магазинов и другие блоки по объекту.',
  },
  {
    question: 'Как пользоваться каталогом?',
    answer:
      'Откройте каталог Минска, сузьте список фильтрами или подборками, смотрите карту и заходите в карточку нужного ТЦ.',
  },
  {
    question: 'Какие города уже открыты?',
    answer: 'Сейчас запущен Минск. Другие города появятся позже в том же формате каталога.',
  },
] as const;

export function MalllistHomePage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL });
    setOrganizationJsonLd(true);
    setFaqJsonLd([...FAQ_ITEMS]);
    return () => setFaqJsonLd([]);
  }, []);

  return (
    <div className="min-h-svh bg-[#f0efeb] text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        К содержанию
      </a>

      <header className="sticky top-0 z-40 bg-[#f0efeb]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <SiteBrandLogo as="span" />
          <nav className="flex items-center gap-5 text-sm font-semibold text-ink-muted">
            <Link to="/minsk/tc" className="transition-colors hover:text-ink">
              Каталог
            </Link>
            <Link to="/minsk/tc" className="transition-colors hover:text-ink">
              Минск
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-16 pt-2 sm:gap-6 sm:px-6 sm:pb-20 lg:px-8">
        {/* 1. Hero — крупная карточка, 2 колонки, как CasinoList */}
        <section className={cn(shellCard, 'relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12 lg:px-12 lg:py-14')}>
          <span
            className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/[0.06] blur-2xl"
            aria-hidden
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
            <div className="flex flex-col gap-6">
              <ul className="flex items-center gap-3" aria-hidden>
                {HERO_MARKS.map(({ Icon, tone }, i) => (
                  <li
                    key={i}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-[#f7f6f2]"
                  >
                    <Icon className={cn('h-4 w-4', tone)} strokeWidth={2.25} />
                  </li>
                ))}
              </ul>

              <h1
                id="home-hero-title"
                className="max-w-xl text-3xl font-black leading-[1.08] tracking-tight text-ink sm:text-5xl sm:leading-[1.06]"
                style={DISPLAY}
              >
                Каталог торговых центров по городам
              </h1>

              <p className="max-w-lg text-base leading-relaxed text-ink/70 sm:text-lg">
                Полный список ТЦ —{' '}
                <mark className="rounded px-1.5 py-0.5 bg-[#e8d9a8]/70 text-ink not-italic">
                  карточки, подборки и карта
                </mark>
                . Сейчас открыт Минск.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/minsk/tc"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(228,21,43,0.28)] transition-transform hover:-translate-y-0.5"
                >
                  Открыть каталог Минска
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <a
                  href="#flow-title"
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/12 bg-white px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:border-black/25"
                >
                  Как это устроено
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </div>

            <aside className="relative rounded-[1.5rem] border border-black/[0.06] bg-[#f7f6f2] p-5 sm:p-6">
              <p className="text-sm font-bold tracking-tight text-ink" style={DISPLAY}>
                Сейчас в каталоге
              </p>
              <ul className="mt-5 grid grid-cols-2 gap-4">
                {SIDE_BADGES.map((b) => (
                  <li key={b.code} className="flex flex-col items-center gap-2 text-center">
                    <span className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-[1.5px] border-[#c4a35a]/80 bg-white px-1 text-center text-[11px] font-extrabold leading-tight tracking-tight text-ink sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xs">
                      {b.code}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                      {b.label}
                      <span className="mt-0.5 block font-medium normal-case tracking-normal text-ink/45">
                        {b.sub}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        {/* 2. Продуктовый путь — карточка со ступенями */}
        <section className={cn(shellCard, 'relative overflow-hidden px-6 py-8 sm:px-10 sm:py-12')} aria-labelledby="flow-title">
          <span
            className="pointer-events-none absolute -right-6 top-4 select-none text-[7.5rem] font-black leading-none text-primary/[0.07] sm:right-6 sm:text-[9rem]"
            style={DISPLAY}
            aria-hidden
          >
            M
          </span>
          <h2
            id="flow-title"
            className="relative max-w-3xl text-3xl font-black leading-[1.1] tracking-tight text-ink sm:text-4xl"
            style={DISPLAY}
          >
            От списка зданий — к{' '}
            <span className="text-primary">карточке объекта</span>
          </h2>
          <p className="relative mt-3 max-w-2xl text-sm leading-relaxed text-ink/65 sm:text-base">
            Смотрите весь город, сужайте срез и открывайте ТЦ с нужными деталями.
          </p>

          <ol className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-2">
            {FLOW.map((step, i) => (
              <li key={step.n} className="relative flex">
                <div
                  className={cn(
                    'flex h-full w-full flex-col gap-2 rounded-2xl border-2 bg-[#faf9f6] p-4 transition-transform hover:-translate-y-0.5',
                    step.ring,
                  )}
                >
                  <span className="text-xs font-bold text-ink-muted">{step.n}</span>
                  <p className="text-sm font-extrabold leading-snug text-ink">{step.title}</p>
                  <p className="text-xs leading-relaxed text-ink/60">{step.text}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <ArrowRight
                    className="absolute -right-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-primary lg:block"
                    aria-hidden
                  />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* 3. Города */}
        <section className={cn(shellCard, 'px-6 py-8 sm:px-10 sm:py-12')} aria-labelledby="markets">
          <p className="text-sm font-semibold tracking-wide text-ink-muted">Города</p>
          <h2
            id="markets"
            className="mt-2 text-3xl font-black leading-[1.1] tracking-tight text-ink sm:text-4xl"
            style={DISPLAY}
          >
            Куда заходим
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/65 sm:text-base">
            Пилот — Минск. Дальше те же карточки и подборки, город за городом.
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <Link
                to="/minsk/tc"
                className="group flex h-full flex-col overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-[#f7f6f2] transition-transform hover:-translate-y-0.5"
              >
                <div className="relative flex min-h-[10.5rem] flex-col items-center justify-center px-5 py-8 text-center">
                  <span
                    className="pointer-events-none absolute inset-0 opacity-80"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 30%, rgba(228,21,43,0.12), transparent 58%)',
                    }}
                    aria-hidden
                  />
                  <span
                    className="relative text-5xl font-black tracking-tight text-ink sm:text-6xl"
                    style={DISPLAY}
                  >
                    МН
                  </span>
                  <span
                    className="relative mt-3 text-xl font-black tracking-tight text-ink"
                    style={DISPLAY}
                  >
                    Минск
                  </span>
                </div>
                <div className="flex flex-1 flex-col border-t border-black/[0.06] bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-extrabold text-ink">Минск</p>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                      Live
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink/70">
                    Каталог торговых центров: карточки, подборки, карта и фильтры.
                  </p>
                  <span className="mt-5 inline-flex w-fit items-center gap-1 text-sm font-bold text-primary">
                    Открыть каталог
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </div>
              </Link>
            </li>
          </ul>
        </section>

        {/* 4. FAQ + источники — тоже в карточке */}
        <section className={cn(shellCard, 'flex flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12')}>
          <FaqAccordion title="Частые вопросы" items={[...FAQ_ITEMS]} id="faq" />

          <div className="flex flex-col gap-3 border-t border-black/[0.06] pt-8 text-sm text-ink-muted" aria-labelledby="sources-heading">
            <h2 id="sources-heading" className="text-base font-bold text-ink">
              Источники и дисклеймер
            </h2>
            <p>
              MallList — каталог торговых центров. Данные в карточках собираются из открытых
              источников и материалов каталога; отдельные поля могут отставать от изменений в
              объектах.
            </p>
            <CookieFooterLinks />
          </div>
        </section>
      </main>
    </div>
  );
}
