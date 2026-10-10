import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lock, MapPin } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setFaqJsonLd, setGenericPageMeta, setOrganizationJsonLd } from '../lib/pageMeta';
import { SiteBrandLogo } from '../components/layout/SiteBrandLogo';
import { CookieFooterLinks } from '../components/layout/CookieFooterLinks';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { SITES } from '../lib/sites';

// Главная отдельного проекта malllist.pro (PUBLIC_SITE=malls).
// Владелец, 2026-10-10: базовая страница «как у CasinoList» — независимый
// список ТЦ, без полного набора УТП; каталог городов с запуском Минска;
// сам каталог города — уже существующий /minsk/tc.

const ORIGIN = SITES.malls.origin;

const CITIES = [
  {
    name: 'Минск',
    href: '/minsk/tc' as string | null,
    blurb: 'Каталог торговых центров: площади, адреса, рейтинги, магазины.',
  },
] as const;

const TITLE = 'MallList — независимый список торговых центров';
const DESCRIPTION =
  'MallList — независимый каталог торговых центров. Сейчас открыт Минск: площади, адреса, рейтинги и подборки магазинов.';
const PAGE_URL = `${ORIGIN}/`;

const FAQ_ITEMS = [
  {
    question: 'Что такое MallList?',
    answer:
      'MallList — независимый список торговых центров. Мы собираем и структурируем открытые данные по ТЦ, чтобы сравнивать объекты в одном месте, без рекламных мест в выдаче.',
  },
  {
    question: 'Какие города уже есть в каталоге?',
    answer:
      'Сейчас запущен Минск: полный каталог торговых центров с карточками зданий, рейтингами и подборками. Другие города появятся позже.',
  },
  {
    question: 'Что есть в каталоге Минска?',
    answer:
      'Список торговых центров Минска: площадь, адрес, рейтинг, формат, близость к метро, арендаторы и тематические подборки. Откройте раздел «Минск», чтобы перейти к каталогу.',
  },
  {
    question: 'MallList связан с продажей или арендой конкретных помещений?',
    answer:
      'Нет. Это справочный каталог ТЦ. Сделки, бронирование и CRM остаются на других сервисах; здесь — сравнение и навигация по торговым центрам.',
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
      <header className="border-b border-border py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 sm:px-8">
          <SiteBrandLogo as="span" />
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:px-8">
        <section className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Mall<span className="text-primary">List</span>
          </h1>
          <p className="max-w-2xl text-base text-ink sm:text-lg">
            Независимый список торговых центров. Сравнивайте ТЦ по площади, адресу, рейтингу и
            составу арендаторов — без оплаты за место в выдаче.
          </p>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="cities-heading">
          <h2 id="cities-heading" className="text-lg font-bold text-ink">
            Города
          </h2>
          <p className="text-sm text-ink-muted">Каталог городов. Сейчас открыт Минск.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CITIES.map((city) =>
              city.href ? (
                <Link
                  key={city.name}
                  to={city.href}
                  className={cn(
                    'flex items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40',
                    glassCardClass,
                  )}
                  style={glassCardShadow}
                >
                  <span className="flex flex-col gap-1 text-left">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <MapPin className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                      {city.name}
                    </span>
                    <span className="text-sm text-ink-muted">{city.blurb}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              ) : (
                <div
                  key={city.name}
                  className="flex items-center justify-between gap-3 rounded-control border border-border p-5 text-ink-faint"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                    {city.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    скоро
                  </span>
                </div>
              ),
            )}
          </div>
        </section>

        <FaqAccordion title="Частые вопросы" items={[...FAQ_ITEMS]} id="faq" />

        <section className="flex flex-col gap-3 text-sm text-ink-muted" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-base font-bold text-ink">
            Источники и дисклеймер
          </h2>
          <p>
            MallList — справочный каталог. Карточки торговых центров собираются из открытых
            источников и материалов самого каталога на сайте; цифры и рейтинги могут отставать от
            изменений в объектах. Мы не продаём места в списке городов и не ранжируем ТЦ за плату.
          </p>
          <CookieFooterLinks />
        </section>
      </main>
    </div>
  );
}
