import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setFaqJsonLd, setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { SITES } from '../lib/sites';

// Главная malllist.pro — короткая, по ритму casinolist.pro:
// hero → чем отличаемся → города. Полный набор УТП позже.

const ORIGIN = SITES.malls.origin;
const DISPLAY = { fontFamily: 'Georgia, "Times New Roman", serif' } as const;

const TITLE = 'MallList — независимый каталог торговых центров';
const DESCRIPTION =
  'Независимый каталог торговых центров. Факты по объектам — не рекламная выдача. Сейчас открыт Минск.';
const PAGE_URL = `${ORIGIN}/`;

const PRINCIPLES = [
  {
    title: 'Независимый список',
    text: 'Место в каталоге не покупается. Сравниваете объекты, а не рекламную выдачу.',
  },
  {
    title: 'Факты по ТЦ',
    text: 'Площадь, адрес, формат, рейтинг, арендаторы и подборки — в одной карточке здания.',
  },
  {
    title: 'Сначала города',
    text: 'Пилот — Минск. Дальше те же правила каталога, город за городом.',
  },
] as const;

const FAQ_ITEMS = [
  {
    question: 'Что такое MallList?',
    answer:
      'Независимый каталог торговых центров: структурированные данные по объектам для сравнения, без оплаты за место в списке.',
  },
  {
    question: 'Чем MallList отличается от рекламных подборок ТЦ?',
    answer:
      'Мы не продаём позиции в каталоге городов и не ранжируем здания за плату. Список строится как справочник, а не как рекламная витрина.',
  },
  {
    question: 'Какие города уже открыты?',
    answer: 'Сейчас запущен Минск. Другие города появятся позже по той же схеме каталога.',
  },
  {
    question: 'Что есть в каталоге Минска?',
    answer:
      'Карточки торговых центров: площадь, адрес, рейтинг, формат, метро, арендаторы и тематические подборки.',
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
      <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <SiteBrandLogo as="span" />
          <Link
            to="/minsk/tc"
            className="text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            Минск
          </Link>
        </div>
      </header>

      <main>
        {/* 1. Hero — как у CasinoList: заголовок-смысл, одна фраза, один CTA */}
        <section className="relative overflow-hidden border-b border-border/60">
          <span
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                'radial-gradient(ellipse at 18% 0%, rgba(228,21,43,0.08), transparent 42%), radial-gradient(ellipse at 90% 80%, rgba(20,21,26,0.04), transparent 40%), linear-gradient(155deg,#ffffff 0%,#f7f5f0 55%,#f0efed 100%)',
            }}
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-8 sm:py-20 lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:py-24">
            <div className="flex max-w-2xl flex-col gap-5">
              <p className="text-sm font-semibold tracking-wide text-ink-muted">MallList</p>
              <h1
                className="text-3xl font-black leading-[1.08] tracking-tight text-ink sm:text-5xl"
                style={DISPLAY}
              >
                Независимый каталог торговых центров
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-ink/70 sm:text-lg">
                Факты по объектам — не рекламная выдача и не купленные места в списке. Сейчас
                открыт Минск.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/minsk/tc"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Каталог Минска
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Три коротких принципа — без полного УТП-полотна */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-8 sm:py-16" aria-labelledby="why-heading">
          <p className="text-sm font-semibold tracking-wide text-ink-muted">Зачем этот каталог</p>
          <h2
            id="why-heading"
            className="mt-2 text-3xl font-black leading-[1.1] tracking-tight text-ink sm:text-4xl"
            style={DISPLAY}
          >
            Список, а не витрина
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
            MallList собирает торговые центры в одном месте, чтобы их можно было сравнивать. Без
            оплаты за позицию и без обещаний «лучший ТЦ города» за деньги.
          </p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            {PRINCIPLES.map((item) => (
              <li key={item.title} className="flex flex-col gap-2 border-t border-border pt-5">
                <h3 className="text-base font-extrabold text-ink">{item.title}</h3>
                <p className="text-sm leading-relaxed text-ink/70">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. Города */}
        <section
          className="border-t border-border/60 bg-[#f7f5f0]/70"
          aria-labelledby="cities-heading"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8 sm:py-16">
            <p className="text-sm font-semibold tracking-wide text-ink-muted">Где публикуем</p>
            <h2
              id="cities-heading"
              className="mt-2 text-3xl font-black leading-[1.1] tracking-tight text-ink sm:text-4xl"
              style={DISPLAY}
            >
              Города
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">
              Пилот открывает Минск. Дальше — те же правила каталога, город за городом.
            </p>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <li>
                <Link
                  to="/minsk/tc"
                  className={cn(
                    'group flex h-full flex-col overflow-hidden transition-transform hover:-translate-y-0.5',
                    glassCardClass,
                  )}
                  style={glassCardShadow}
                >
                  <div className="relative flex min-h-[10rem] flex-col items-center justify-center overflow-hidden bg-[linear-gradient(165deg,#f4f5f7_0%,#ffffff_55%,#eef0f3_100%)] px-5 py-6 text-center">
                    <span
                      className="pointer-events-none absolute inset-0 opacity-50"
                      style={{
                        background:
                          'radial-gradient(circle at 50% 20%, rgba(228,21,43,0.10), transparent 55%)',
                      }}
                      aria-hidden
                    />
                    <span
                      className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary/40 bg-white text-xl font-black tracking-tight text-ink shadow-[inset_0_0_0_5px_rgba(228,21,43,0.06)] sm:h-[4.5rem] sm:w-[4.5rem] sm:text-2xl"
                      style={DISPLAY}
                    >
                      МН
                    </span>
                    <span
                      className="relative mt-4 text-lg font-black tracking-tight text-ink sm:text-xl"
                      style={DISPLAY}
                    >
                      Минск
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xl font-extrabold text-ink">Минск</p>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                        Live
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-ink/75">
                      Каталог торговых центров: площади, адреса, рейтинги, форматы и подборки
                      магазинов.
                    </p>
                    <span className="mt-5 inline-flex w-fit items-center gap-1 text-sm font-bold text-primary">
                      Открыть каталог
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
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
              MallList — справочный каталог. Карточки торговых центров собираются из открытых
              источников и материалов каталога на сайте; цифры и рейтинги могут отставать от
              изменений в объектах. Мы не продаём места в списке городов и не ранжируем ТЦ за плату.
            </p>
            <CookieFooterLinks />
          </section>
        </div>
      </main>
    </div>
  );
}
