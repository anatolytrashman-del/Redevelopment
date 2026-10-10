import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { setFaqJsonLd, setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { SITES } from '../lib/sites';

// Главная malllist.pro — ритм casinolist.pro (hero → что внутри → города),
// без манифеста «честной модели»: у каталога ТЦ другая экономика и полный
// набор блоков по объектам.

const ORIGIN = SITES.malls.origin;
const DISPLAY = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

const TITLE = 'MallList — каталог торговых центров';
const DESCRIPTION =
  'Каталог торговых центров по городам. Карточки объектов, подборки, карта — начиная с Минска.';
const PAGE_URL = `${ORIGIN}/`;

const FEATURES = [
  {
    title: 'Полный список ТЦ',
    text: 'Все торговые центры города в одном каталоге — не короткая рекламная подборка.',
  },
  {
    title: 'Карточка объекта',
    text: 'Площадь, адрес, формат, метро, арендаторы и полезные блоки по зданию.',
  },
  {
    title: 'Подборки и карта',
    text: 'Фильтры, тематические списки и карта — чтобы быстро сузить выбор.',
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
    <div className="min-h-svh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        К содержанию
      </a>

      <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
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

      <main id="main">
        {/* Hero — full-bleed, бренд как главный сигнал (как CasinoList) */}
        <section className="relative overflow-hidden border-b border-border/60">
          <span
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 12% -10%, rgba(228,21,43,0.14), transparent 46%), radial-gradient(ellipse at 88% 110%, rgba(20,21,26,0.05), transparent 42%), linear-gradient(160deg,#ffffff 0%,#f6f4ef 48%,#efece6 100%)',
            }}
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-20 sm:px-8 sm:py-28 lg:py-32">
            <div className="flex max-w-3xl flex-col gap-6">
              <p
                className="text-4xl font-black tracking-tight text-ink sm:text-6xl lg:text-7xl"
                style={DISPLAY}
              >
                Mall<span className="text-primary">List</span>
              </p>
              <h1
                id="home-hero-title"
                className="max-w-2xl text-2xl font-black leading-[1.12] tracking-tight text-ink sm:text-4xl"
                style={DISPLAY}
              >
                Каталог торговых центров
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-ink/70 sm:text-lg">
                Полный список ТЦ города — карточки объектов, подборки и карта. Сейчас открыт Минск.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/minsk/tc"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Открыть каталог Минска
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Что внутри — без манифеста модели, только продуктовые блоки */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20" aria-labelledby="inside-title">
          <p className="text-sm font-semibold tracking-wide text-ink-muted">В каталоге</p>
          <h2
            id="inside-title"
            className="mt-2 max-w-3xl text-3xl font-black leading-[1.1] tracking-tight text-ink sm:text-4xl"
            style={DISPLAY}
          >
            От списка зданий — к карточке объекта
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Смотрите весь город целиком, сужайте подборками и открывайте ТЦ с нужными деталями.
          </p>
          <ul className="mt-12 grid gap-8 sm:grid-cols-3">
            {FEATURES.map((item, i) => (
              <li
                key={item.title}
                className="flex flex-col gap-2 border-t border-border pt-6"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <h3 className="text-base font-extrabold text-ink">{item.title}</h3>
                <p className="text-sm leading-relaxed text-ink/70">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Города — как Destinations у CasinoList */}
        <section className="border-t border-border/60 bg-[#f3f1eb]" aria-labelledby="markets">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-20">
            <p className="text-sm font-semibold tracking-wide text-ink-muted">Города</p>
            <h2
              id="markets"
              className="mt-2 text-3xl font-black leading-[1.1] tracking-tight text-ink sm:text-4xl"
              style={DISPLAY}
            >
              Куда заходим
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              Пилот — Минск. Дальше те же карточки и подборки, город за городом.
            </p>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <li>
                <Link
                  to="/minsk/tc"
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-white transition-transform hover:-translate-y-0.5"
                >
                  <div className="relative flex min-h-[11rem] flex-col items-center justify-center overflow-hidden px-5 py-8 text-center">
                    <span
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'radial-gradient(circle at 50% 30%, rgba(228,21,43,0.12), transparent 58%), linear-gradient(165deg,#f7f5f0 0%,#ffffff 55%,#eef0f3 100%)',
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
                  <div className="flex flex-1 flex-col border-t border-border/60 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-lg font-extrabold text-ink">Минск</p>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
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
          </div>
        </section>

        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-8">
          <FaqAccordion title="Частые вопросы" items={[...FAQ_ITEMS]} id="faq" />

          <section className="flex flex-col gap-3 text-sm text-ink-muted" aria-labelledby="sources-heading">
            <h2 id="sources-heading" className="text-base font-bold text-ink">
              Источники и дисклеймер
            </h2>
            <p>
              MallList — каталог торговых центров. Данные в карточках собираются из открытых
              источников и материалов каталога; отдельные поля могут отставать от изменений в
              объектах.
            </p>
            <CookieFooterLinks />
          </section>
        </div>
      </main>
    </div>
  );
}
