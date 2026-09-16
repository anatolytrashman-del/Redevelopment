import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Building2, Landmark, Store, Briefcase, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import {
  setGenericPageMeta,
  setArticleJsonLd,
  setBreadcrumbJsonLd,
  setFaqJsonLd,
  setNoIndex,
  clearNoIndex,
} from '../lib/pageMeta';
import { fetchPublicMarketOffers } from '../lib/marketOffersApi';
import { fetchPrimaryMarketOffers } from '../lib/primaryMarketOffersApi';
import { buildPrimaryMarketPivot } from '../data/primaryMarketOffers';
import type { PrimaryMarketOffer } from '../data/primaryMarketOffers';
import { netPricePerSqm, netSize } from '../data/marketOffers';
import type { MarketOffer } from '../data/marketOffers';
import {
  MINSK_MIR_TOPIC_SLUGS,
  MINSK_MIR_TOPIC_LABELS,
  isMinskMirTopicSlug,
  minskMirTopicUrl,
} from '../data/minskMirTopics';
import type { MinskMirTopicSlug } from '../data/minskMirTopics';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import type { FaqItem } from '../components/ui/FaqAccordion';

// Посадочные под подсказки Google по Минск Миру (аудит поиска 2026-09-07,
// см. data/minskMirTopics.ts). Один компонент на все темы: у каждой свой
// title/H1/тексты/FAQ (TOPICS ниже), общие — шапка, живые цифры рынка из
// тех же таблиц, что и гид (public_market_offers / primary_market_offers),
// и перелинковка. Правило контента то же, что и на гиде: ни одной
// выдуманной цифры — всё либо считается из базы на рендере, либо уже есть
// в карточках каталога/гида (МФЦ).
//
// Владелец, 2026-09-16: пока здание Red One не куплено, продавать его
// нечего — карточка Red One, ссылки на /minsk/one и все упоминания объекта
// в текстах и FAQ убраны отсюда (как и с гида по району и из каталога БЦ).
// Сам лендинг /minsk/one остаётся доступным по прямой ссылке. Вернуть,
// когда здание будет куплено.
const GUIDE_URL = '/minsk/minsk-mir';
const CATALOG_URL = '/minsk/bcminsk';
const SITE = 'https://redevelopment.pro';
const DATE_PUBLISHED = '2026-09-07';

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function formatLatestUpdate(offers: MarketOffer[]): string {
  const latest = offers.reduce((max, o) => (o.updatedAt > max ? o.updatedAt : max), offers[0].updatedAt);
  const date = new Date(latest);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface MarketCell {
  count: number;
  medianPrice: number;
}

interface MarketSummaryRow {
  propertyType: string;
  finished: MarketCell | null;
  bare: MarketCell | null;
}

// Та же выборка, что и в таблице «Вторичный рынок» гида (reviewed && !rejected,
// цена за чистый м² без террасы), только без разбивки по площади — на
// посадочной нужен один ориентир «сколько стоит», а не полная матрица.
function summarizeMarket(offers: MarketOffer[], dealType: 'sale' | 'rent', propertyTypes: string[]): MarketSummaryRow[] {
  return propertyTypes
    .map((propertyType) => {
      const pick = (finish: string) => {
        const prices = offers
          .filter(
            (o) =>
              o.reviewed && !o.rejected && o.dealType === dealType && o.propertyType === propertyType && o.finishStatus === finish,
          )
          .map(netPricePerSqm);
        return prices.length > 0 ? { count: prices.length, medianPrice: Math.round(median(prices)) } : null;
      };
      return { propertyType, finished: pick('с отделкой'), bare: pick('без отделки') };
    })
    .filter((row) => row.finished || row.bare);
}

function countSmallFinishedOffices(offers: MarketOffer[], dealType: 'sale' | 'rent'): number {
  return offers.filter(
    (o) =>
      o.reviewed && !o.rejected && o.dealType === dealType && o.propertyType === 'Офисы' && netSize(o) < 40 && o.finishStatus === 'с отделкой',
  ).length;
}

function pluralOffers(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} объявление`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} объявления`;
  return `${n} объявлений`;
}

function MarketSummaryTable({
  title,
  unit,
  rows,
  updated,
}: {
  title: string;
  unit: string;
  rows: MarketSummaryRow[];
  updated: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-4 font-semibold">Тип помещения</th>
              <th className="py-2 pr-4 font-semibold">С отделкой</th>
              <th className="py-2 font-semibold">Без отделки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.propertyType}>
                <td className="py-2 pr-4 font-medium text-ink">{row.propertyType}</td>
                {[row.finished, row.bare].map((cell, i) => (
                  <td key={i} className="py-2 pr-4 text-ink">
                    {cell ? (
                      <>
                        <span className="font-semibold">
                          ${cell.medianPrice.toLocaleString('ru-RU')} {unit}
                        </span>
                        <span className="block text-xs text-ink-muted">{pluralOffers(cell.count)}</span>
                      </>
                    ) : (
                      <span className="text-ink-muted">нет предложений</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        Медиана по проверенным объявлениям Kufar и Realt, {updated}. Полная разбивка по площадям — в{' '}
        <Link to={`${GUIDE_URL}#market`} className="font-semibold text-primary-hover hover:underline">
          таблице вторичного рынка
        </Link>{' '}
        гида по району.
      </p>
    </div>
  );
}

function PrimaryMarketTable({ offers, keys }: { offers: PrimaryMarketOffer[]; keys: string[] }) {
  const rows = buildPrimaryMarketPivot(offers).filter((r) => keys.includes(r.key));
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-bold text-ink">Первичный рынок — напрямую от застройщика</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Первичный рынок Минск Мира</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-4 font-semibold">Формат</th>
              <th className="py-2 pr-4 font-semibold">Предложений</th>
              <th className="py-2 pr-4 font-semibold">Площадь</th>
              <th className="py-2 font-semibold">€ за м²</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2 pr-4 font-medium text-ink">{r.label}</td>
                <td className="py-2 pr-4 text-ink">{r.count}</td>
                <td className="py-2 pr-4 text-ink">
                  {r.areaMin}–{r.areaMax} м²
                </td>
                <td className="py-2 text-ink">
                  {r.priceMinEur.toLocaleString('ru-RU')}–{r.priceMaxEur.toLocaleString('ru-RU')}{' '}
                  <span className="text-xs text-ink-muted">(в среднем {r.priceAvgEur.toLocaleString('ru-RU')})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        По предложениям застройщика на bir.by, цена за чистый м² без террас. Подробнее — в разделе{' '}
        <Link to={`${GUIDE_URL}#primary-market`} className="font-semibold text-primary-hover hover:underline">
          «Первичный рынок»
        </Link>{' '}
        гида.
      </p>
    </div>
  );
}

interface TopicSection {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
}

interface TopicContent {
  title: string;
  description: string;
  h1: string;
  intro: ReactNode;
  sections: TopicSection[];
  // Какие живые данные показывать под текстом.
  market?: { sale?: string[]; rent?: string[]; primaryKeys?: string[] };
  faq: FaqItem[];
}

const guideLink = (hash: string, text: string) => (
  <Link to={`${GUIDE_URL}#${hash}`} className="font-semibold text-primary-hover hover:underline">
    {text}
  </Link>
);

const TOPICS: Record<MinskMirTopicSlug, TopicContent> = {
  'biznes-centr': {
    title: 'Бизнес-центр Минск Мир — какие есть, что строится, где взять офис',
    description:
      'Бизнес-центры в районе Минск Мир: строящийся Международный финансовый центр и офисы на первых этажах жилых домов. Что реально доступно сейчас.',
    h1: 'Бизнес-центр Минск Мир: что есть сейчас и что строится',
    intro: (
      <>
        Классический бизнес-центр в самом Минск Мире пока один — Минский международный финансовый центр, и он ещё
        строится. Офисы в районе сегодня — это помещения на первых этажах жилых домов. Ниже — что именно
        доступно, по каким ценам и где смотреть дальше.
      </>
    ),
    sections: [
      {
        icon: Landmark,
        title: 'Минский международный финансовый центр (МФЦ)',
        body: (
          <>
            Единственный бизнес-центр внутри района: класс A, около 97 000 м² общей площади, пять корпусов, главный —
            42-этажная башня на проспекте Мира. Застройщик — «Дана Астра» (Dana Holdings), строительство идёт с 2022
            года, плановая сдача — конец 2027 года. Пока здание не введено, арендовать или купить офис в нём нельзя —
            подробности и статус стройки в{' '}
            <Link to="/minsk/bcminsk/mfc-minsk-mir" className="font-semibold text-primary-hover hover:underline">
              карточке МФЦ
            </Link>
            .
          </>
        ),
      },
      {
        icon: Building2,
        title: 'Готовые бизнес-центры того же застройщика',
        body: (
          <>
            Ближайший действующий БЦ Dana Holdings —{' '}
            <Link to="/minsk/bcminsk/dana-center" className="font-semibold text-primary-hover hover:underline">
              Dana Center
            </Link>{' '}
            (класс B+, 23 000 м²), но он в «Маяке Минска» у метро «Восток», а не в Минск Мире. Все бизнес-центры
            города с классом, площадью, метро и объявлениями — в{' '}
            <Link to={CATALOG_URL} className="font-semibold text-primary-hover hover:underline">
              каталоге бизнес-центров Минска
            </Link>
            , а МФЦ вместе с другими стройками города — на странице{' '}
            <Link to={`${CATALOG_URL}/stroyashchiesya`} className="font-semibold text-primary-hover hover:underline">
              строящихся бизнес-центров
            </Link>
            .
          </>
        ),
      },
      {
        icon: Briefcase,
        title: 'Где взять офис в Минск Мире, пока МФЦ строится',
        body: (
          <>
            Единственный реальный вариант сейчас — помещения на первых этажах жилых домов: продажа и аренда через
            объявления, чаще без отделки (актуальные медианы ниже). Готовых небольших офисов в районе единицы. Общая
            картина по форматам — в{' '}
            {guideLink('property-types', 'гиде по коммерческой недвижимости Минск Мира')}.
          </>
        ),
      },
    ],
    market: { rent: ['Офисы'], sale: ['Офисы'] },
    faq: [
      {
        question: 'Есть ли в Минск Мире бизнес-центр?',
        answer:
          'Действующего классического бизнес-центра в районе пока нет. Единственный — Минский международный финансовый центр (класс A, около 97 000 м²) — строится, плановая сдача в конце 2027 года. Офисы сейчас — только на первых этажах жилых домов.',
      },
      {
        question: 'Когда откроется Международный финансовый центр в Минск Мире?',
        answer:
          'По плану застройщика («Дана Астра», Dana Holdings) — конец 2027 года. Строительство идёт с июля 2022 года; главный корпус — 42-этажная башня высотой около 168 м. Актуальный статус стройки мы ведём в карточке МФЦ в каталоге бизнес-центров.',
      },
      {
        question: 'Dana Center — это бизнес-центр в Минск Мире?',
        answer:
          'Нет. Dana Center того же застройщика находится на ул. Петра Мстиславца, 9 — это «Маяк Минска» у метро «Восток», другой район города. В Минск Мире у Dana Holdings пока только строящийся МФЦ.',
      },
      {
        question: 'Есть ли в Минск Мире небольшие офисы с готовой отделкой?',
        answer:
          'На вторичном рынке района небольших офисов до 40 м² с готовой отделкой единицы — точное число на этот месяц показано на этой странице. Подавляющая часть помещений продаётся и сдаётся без отделки, поэтому готовый к въезду кабинет чаще всего приходится делать самому.',
      },
    ],
  },

  kovorking: {
    title: 'Коворкинг в Минск Мире — что есть в районе и почему их так мало',
    description:
      'Коворкинги в районе Минск Мир: что реально работает, почему сетевых коворкингов в районе нет и с чем это связано.',
    h1: 'Коворкинг в Минск Мире: что есть в районе',
    intro: (
      <>
        Минск Мир — жилой район с 80 000 жителей, ядро которых — специалисты 25–45 лет, но классических коворкингов
        с почасовой или помесячной арендой стола здесь почти нет. Рассказываем, что есть по факту и почему район
        до сих пор остался без сетевого коворкинга.
      </>
    ),
    sections: [
      {
        icon: Users,
        title: 'Что есть в районе сейчас',
        body: (
          <>
            По нашему справочнику организаций Минск Мира (собирается по домам и обновляется ежемесячно) в формате
            коворкинга работает кофейня-коворкинг «Пространство» на ул. Белградской, 4. Сетевых коворкингов с
            переговорными, ресепшен и абонементами на рабочее место в районе нет — они сосредоточены в центре
            Минска. Полная картина по нишам — в разделе{' '}
            {guideLink('business-analytics', 'аналитики по сферам бизнеса')} гида.
          </>
        ),
      },
      {
        icon: Briefcase,
        title: 'Почему коворкинг в спальном районе не появляется сам',
        body: (
          <>
            Коворкингу нужны большие открытые площади с отделкой, а именно готовых офисных помещений в районе
            дефицит: подавляющая часть офисов на вторичном рынке продаётся и сдаётся без отделки (см. цифры ниже).
            Единственный бизнес-центр района — МФЦ — ещё строится, подробнее на странице{' '}
            <Link to={minskMirTopicUrl('biznes-centr')} className="font-semibold text-primary-hover hover:underline">
              о бизнес-центрах Минск Мира
            </Link>
            .
          </>
        ),
      },
    ],
    market: { rent: ['Офисы'] },
    faq: [
      {
        question: 'Есть ли коворкинг в Минск Мире?',
        answer:
          'Сетевых коворкингов в районе нет. По справочнику организаций района в формате коворкинга работает кофейня-коворкинг «Пространство» на ул. Белградской, 4 — остальные коворкинги Минска сосредоточены в центре города.',
      },
      {
        question: 'Появятся ли коворкинги в Минск Мире после запуска МФЦ?',
        answer:
          'Международный финансовый центр планируется к сдаче в конце 2027 года и рассчитан на крупные офисы класса A. Появятся ли в нём коворкинги, застройщик не объявлял — мы следим за статусом в карточке МФЦ в каталоге бизнес-центров.',
      },
    ],
  },

  'kupit-ofis': {
    title: 'Купить офис в Минск Мире — цены за м², первичка и вторичка',
    description:
      'Купить офис в Минск Мире: медианные цены за м² по проверенным объявлениям, предложения застройщика и дефицит небольших офисов с готовой отделкой.',
    h1: 'Купить офис в Минск Мире: цены и что реально продаётся',
    intro: (
      <>
        Офис в Минск Мире можно купить двумя способами: у застройщика на первичном рынке или у собственника на
        вторичном. Ниже — живые цены по каждому варианту, посчитанные по объявлениям, а не оценки «на глаз».
      </>
    ),
    sections: [
      {
        icon: Store,
        title: 'Что продаётся на вторичном рынке',
        body: (
          <>
            Большинство офисов на продажу в районе — без отделки: голый бетон на первом этаже жилого дома, который
            ещё предстоит доводить до рабочего состояния. Готовые к въезду небольшие офисы встречаются единично, и
            это устойчивая особенность района, а не сезонность — подробнее в{' '}
            {guideLink('market', 'сводке вторичного рынка')} гида.
          </>
        ),
      },
      {
        icon: Landmark,
        title: 'Первичный рынок: офисы от застройщика',
        body: (
          <>
            «Дана Астра» продаёт офисы и бизнес-апартаменты напрямую через bir.by — цены за чистый м² ниже в таблице.
            Отдельный формат — бизнес-апартаменты с правом регистрации и юридического адреса, разбор плюсов и минусов —
            в разделе {guideLink('business-apartments', '«Бизнес-апартаменты»')} гида.
          </>
        ),
      },
    ],
    market: { sale: ['Офисы'], primaryKeys: ['offices', 'apartments-sdano', 'apartments-stroitsya'] },
    faq: [
      {
        question: 'Сколько стоит купить офис в Минск Мире?',
        answer:
          'Ориентир — медианная цена за м² по проверенным объявлениям Kufar и Realt в таблице на этой странице, отдельно для офисов с отделкой и без: это разные рынки. У застройщика цены указаны за чистый м² в евро.',
      },
      {
        question: 'Можно ли купить офис в Минск Мире в рассрочку?',
        answer:
          'Рассрочку даёт застройщик на первичном рынке — актуальные условия он публикует на bir.by и меняет по акциям. На вторичном рынке рассрочка возможна только по договорённости с конкретным собственником.',
      },
      {
        question: 'Есть ли в Минск Мире небольшие офисы с отделкой на продажу?',
        answer:
          'На вторичном рынке района офисы до 40 м² с готовой отделкой встречаются единично — точное число на этот месяц показано на странице. Это устойчивая особенность района, а не сезонное колебание.',
      },
      {
        question: 'Офис или бизнес-апартаменты — что выбрать для регистрации компании?',
        answer:
          'Бизнес-апартаменты в Минск Мире дают право регистрации юрлица и прописки по одному адресу, но коммуналка начисляется по тарифу для юрлиц. Обычный офис — нежилое помещение без права прописки, зато с коммунальными платежами по тарифу для нежилых помещений.',
      },
    ],
  },

  'arenda-ofisa': {
    title: 'Аренда офиса в Минск Мире — ставки за м², что сдаётся',
    description:
      'Аренда офиса в Минск Мире: медианные ставки за м² по проверенным объявлениям и почему почти все офисы в районе сдаются без отделки.',
    h1: 'Аренда офиса в Минск Мире: ставки и что сдаётся',
    intro: (
      <>
        Аренда офиса в Минск Мире — это в основном помещения на первых этажах жилых домов, чаще всего без отделки.
        Готовых кабинетов под ключ в аренду в районе почти нет. Ниже — актуальные ставки по объявлениям и разбор,
        что именно предлагается арендатору.
      </>
    ),
    sections: [
      {
        icon: Store,
        title: 'Какие офисы сдаются',
        body: (
          <>
            Основное предложение — помещения без отделки: арендатор сам делает ремонт и, как правило, получает за это
            арендные каникулы. Офисы с готовой отделкой площадью до 40 м² — единичные предложения на весь район.
            Полная матрица ставок по площадям и типам помещений — в {guideLink('market', 'таблице вторичного рынка')}.
          </>
        ),
      },
      {
        icon: Users,
        title: 'Кому нужен офис именно здесь',
        body: (
          <>
            Около 80 000 жителей, плотность в 7,5 раза выше средней по Минску, две станции метро, Avia Mall и
            строящийся финансовый центр — офис в районе нужен тем, кто работает с местными жителями: нотариусам,
            агентствам, IT-командам, у которых сотрудники живут рядом. Портрет аудитории — в разделе{' '}
            {guideLink('audience', '«Целевая аудитория»')} гида.
          </>
        ),
      },
    ],
    market: { rent: ['Офисы', 'Торговые помещения'] },
    faq: [
      {
        question: 'Сколько стоит аренда офиса в Минск Мире?',
        answer:
          'Медианная ставка за м² в месяц по проверенным объявлениям Kufar и Realt показана в таблице на этой странице — отдельно для офисов с отделкой и без, они различаются заметно. Данные обновляются ежемесячно.',
      },
      {
        question: 'Можно ли снять в Минск Мире небольшой офис с отделкой?',
        answer:
          'Редко: таких предложений до 40 м² в районе единицы, их число на текущий месяц показано на странице. Большинство офисов сдаётся без отделки, с арендными каникулами на время ремонта.',
      },
      {
        question: 'Сдаются ли офисы в Международном финансовом центре?',
        answer:
          'Пока нет — МФЦ строится, плановая сдача в конце 2027 года. До этого офисная аренда в районе — только первые этажи жилых домов.',
      },
      {
        question: 'Что выгоднее в Минск Мире — аренда или покупка офиса?',
        answer:
          'Зависит от горизонта. На год-два — аренда, но с ремонтом за свой счёт, если помещение без отделки. На дольше — покупка: платёж по рассрочке или кредиту фиксирован в договоре, а помещение остаётся активом, который можно сдать или продать.',
      },
    ],
  },

  'kommercheskie-pomeshcheniya': {
    title: 'Коммерческие помещения в Минск Мире — цены продажи и аренды',
    description:
      'Коммерческие помещения в Минск Мире: торговые, офисные, кладовые, бизнес-апартаменты. Медианные цены продажи и аренды за м² по проверенным объявлениям и предложения застройщика.',
    h1: 'Коммерческие помещения в Минск Мире: форматы и цены',
    intro: (
      <>
        Минск Мир — самый плотный жилой район Минска, и коммерческие помещения здесь — это в первую очередь первые
        этажи жилых домов: торговля, услуги, офисы, кладовые. Ниже — какие форматы существуют, что продаётся и
        сдаётся прямо сейчас и по каким ценам.
      </>
    ),
    sections: [
      {
        icon: Store,
        title: 'Какие форматы есть',
        body: (
          <>
            Торговые помещения с отдельным входом и витриной, офисные помещения, кладовые, бизнес-апартаменты с
            правом регистрации, машиноместа в паркингах, площади в Avia Mall и — после сдачи — офисы в МФЦ. Разбор
            каждого формата — в разделе {guideLink('property-types', '«Виды коммерческой недвижимости»')} гида.
          </>
        ),
      },
      {
        icon: Users,
        title: 'Кто арендует и покупает',
        body: (
          <>
            Основной спрос — стрит-ритейл и сервисы для 80 000 жителей: продукты, аптеки, бьюти, общепит, пункты
            выдачи, детские и медицинские центры. Какие ниши уже перенасыщены в конкретном квартале, а где ещё
            свободно, показывает {guideLink('quarter-map', 'карта конкуренции по кварталам')}.
          </>
        ),
      },
      {
        icon: Briefcase,
        title: 'Офисы: отдельная история',
        body: (
          <>
            Офисный сегмент в районе самый тонкий: бизнес-центр один и строится, готовых небольших офисов почти нет.
            Подробнее — на страницах{' '}
            <Link to={minskMirTopicUrl('kupit-ofis')} className="font-semibold text-primary-hover hover:underline">
              «Купить офис»
            </Link>{' '}
            и{' '}
            <Link to={minskMirTopicUrl('arenda-ofisa')} className="font-semibold text-primary-hover hover:underline">
              «Аренда офиса»
            </Link>
            .
          </>
        ),
      },
    ],
    market: {
      sale: ['Торговые помещения', 'Офисы', 'Кладовые'],
      rent: ['Торговые помещения', 'Офисы', 'Кладовые'],
      primaryKeys: ['retail', 'offices', 'pantry', 'apartments-sdano', 'apartments-stroitsya'],
    },
    faq: [
      {
        question: 'Какие коммерческие помещения продаются в Минск Мире?',
        answer:
          'Торговые помещения на первых этажах, офисы, кладовые, бизнес-апартаменты и машиноместа. У застройщика — на первичном рынке через bir.by, у собственников — в объявлениях на Kufar и Realt. Актуальные цены за м² по каждому формату показаны на этой странице.',
      },
      {
        question: 'Сколько стоит коммерческое помещение в Минск Мире за м²?',
        answer:
          'Медианные цены продажи и аренды за м² по проверенным объявлениям — в таблицах на этой странице, раздельно для помещений с отделкой и без: это разные рынки, и смешивать их в одну цифру некорректно.',
      },
      {
        question: 'Чем торговое помещение отличается от офисного в Минск Мире?',
        answer:
          'Торговое — с отдельным входом с улицы и витриной на пешеходный поток, под магазин, салон или кафе. Офисное — без витрины, часто со входом из подъезда или общего холла. Торговые помещения в районе стоят дороже за м² и их заметно больше в предложении.',
      },
      {
        question: 'Где посмотреть конкуренцию по нишам перед покупкой помещения?',
        answer:
          'В гиде по Минск Миру: раздел «Плотность бизнеса» и карта конкуренции по кварталам показывают, сколько организаций каждой категории уже работает в каждом квартале, по данным справочника, обновляемого ежемесячно.',
      },
    ],
  },
};

const BREADCRUMB_ROOT = [
  { name: 'Коммерческая недвижимость в Минске', url: `${SITE}/minsk` },
  { name: 'Район Минск Мир', url: `${SITE}${GUIDE_URL}` },
];

export function MinskMirTopicPage() {
  const { topic = '' } = useParams();
  const slug = isMinskMirTopicSlug(topic) ? topic : null;
  const content = slug ? TOPICS[slug] : null;

  const [marketOffers, setMarketOffers] = useState<MarketOffer[] | null>(null);
  const [primaryOffers, setPrimaryOffers] = useState<PrimaryMarketOffer[] | null>(null);

  useEffect(() => {
    if (!content || !slug) {
      setNoIndex();
      return () => clearNoIndex();
    }
    const url = `${SITE}${minskMirTopicUrl(slug)}`;
    setGenericPageMeta({ title: content.title, description: content.description, url, ogType: 'article' });
    setArticleJsonLd({
      headline: content.h1,
      description: content.description,
      url,
      datePublished: DATE_PUBLISHED,
      dateModified: DATE_PUBLISHED,
    });
    setBreadcrumbJsonLd([...BREADCRUMB_ROOT, { name: MINSK_MIR_TOPIC_LABELS[slug] }]);
    setFaqJsonLd(content.faq);
    window.scrollTo(0, 0);
  }, [slug, content]);

  useEffect(() => {
    if (!content?.market) return;
    if (content.market.sale || content.market.rent) {
      fetchPublicMarketOffers()
        .then(setMarketOffers)
        .catch(() => setMarketOffers([]));
    }
    if (content.market.primaryKeys) {
      fetchPrimaryMarketOffers()
        .then(setPrimaryOffers)
        .catch(() => setPrimaryOffers([]));
    }
  }, [content]);

  const marketBlocks = useMemo(() => {
    if (!content?.market || !marketOffers || marketOffers.length === 0) return null;
    const updated = formatLatestUpdate(marketOffers);
    const sale = content.market.sale ? summarizeMarket(marketOffers, 'sale', content.market.sale) : [];
    const rent = content.market.rent ? summarizeMarket(marketOffers, 'rent', content.market.rent) : [];
    const showsOffices = [...(content.market.sale ?? []), ...(content.market.rent ?? [])].includes('Офисы');
    return {
      updated,
      sale,
      rent,
      smallSale: showsOffices && content.market.sale ? countSmallFinishedOffices(marketOffers, 'sale') : null,
      smallRent: showsOffices && content.market.rent ? countSmallFinishedOffices(marketOffers, 'rent') : null,
    };
  }, [content, marketOffers]);

  if (!content || !slug) {
    return (
      <div className="min-h-svh bg-bg">
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 sm:px-8">
          <h1 className="text-2xl font-extrabold text-ink">Страница не найдена</h1>
          <p className="text-ink-muted">Такой темы по Минск Миру нет.</p>
          <Link to={GUIDE_URL} className="font-semibold text-primary-hover hover:underline">
            Гид по коммерческой недвижимости Минск Мира →
          </Link>
        </main>
      </div>
    );
  }

  const otherTopics = MINSK_MIR_TOPIC_SLUGS.filter((s) => s !== slug);

  return (
    <div className="min-h-svh bg-bg">
      <div className="border-b border-border py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-8">
          <Link to="/minsk" className="shrink-0 text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary-hover">RED</span>EVELOPMENT
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-muted sm:flex">
            <Link to={GUIDE_URL} className="whitespace-nowrap transition-colors hover:text-ink">
              Гид по району
            </Link>
            <Link to={CATALOG_URL} className="whitespace-nowrap transition-colors hover:text-ink">
              Бизнес-центры
            </Link>
          </nav>
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Link to="/minsk" className="hover:text-ink">
            Минск
          </Link>
          <span aria-hidden="true">/</span>
          <Link to={GUIDE_URL} className="hover:text-ink">
            Минск Мир
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{MINSK_MIR_TOPIC_LABELS[slug]}</span>
        </nav>

        <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{content.h1}</h1>
          <p className="text-base leading-relaxed text-ink-muted">{content.intro}</p>
        </div>

        <div className={cn('flex flex-col divide-y divide-border', glassCardClass)} style={glassCardShadow}>
          {content.sections.map(({ icon: Icon, title, body }) => (
            <section key={title} className="flex flex-col gap-3 px-6 py-6">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-ink" />
                <h2 className="text-lg font-bold text-ink">{title}</h2>
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
            </section>
          ))}
        </div>

        {content.market && (
          <div className={cn('flex flex-col gap-6 p-6', glassCardClass)} style={glassCardShadow}>
            <h2 className="text-lg font-bold text-ink">Цены в Минск Мире сейчас</h2>
            {marketOffers === null && (content.market.sale || content.market.rent) && (
              <p className="text-sm text-ink-muted">Загружаем объявления…</p>
            )}
            {marketBlocks && marketBlocks.sale.length > 0 && (
              <MarketSummaryTable title="Продажа — медианная цена за м²" unit="за м²" rows={marketBlocks.sale} updated={marketBlocks.updated} />
            )}
            {marketBlocks && marketBlocks.rent.length > 0 && (
              <MarketSummaryTable title="Аренда — медианная ставка за м² в месяц" unit="за м² в месяц" rows={marketBlocks.rent} updated={marketBlocks.updated} />
            )}
            {marketBlocks && (marketBlocks.smallSale !== null || marketBlocks.smallRent !== null) && (
              <p className="rounded-control border border-border bg-surface px-4 py-3 text-sm text-ink">
                Небольших офисов до 40 м² с готовой отделкой в объявлениях сейчас:{' '}
                {marketBlocks.smallSale !== null && (
                  <>
                    на продажу — <strong>{marketBlocks.smallSale}</strong>
                  </>
                )}
                {marketBlocks.smallSale !== null && marketBlocks.smallRent !== null && ', '}
                {marketBlocks.smallRent !== null && (
                  <>
                    в аренду — <strong>{marketBlocks.smallRent}</strong>
                  </>
                )}
                . Это структурный дефицит формата в районе, а не сезонное колебание.
              </p>
            )}
            {marketOffers !== null && marketOffers.length === 0 && (
              <p className="text-sm text-ink-muted">Данные по объявлениям пока не собраны.</p>
            )}
            {content.market.primaryKeys && primaryOffers && primaryOffers.length > 0 && (
              <PrimaryMarketTable offers={primaryOffers} keys={content.market.primaryKeys} />
            )}
          </div>
        )}

        <FaqAccordion title="Частые вопросы" items={content.faq} id="faq" />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Ещё по Минск Миру</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to={GUIDE_URL} className="flex items-center gap-2 font-semibold text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Гид по коммерческой недвижимости Минск Мира — полная картина района
              </Link>
            </li>
            {otherTopics.map((s) => (
              <li key={s}>
                <Link to={minskMirTopicUrl(s)} className="flex items-center gap-2 text-ink hover:text-primary-hover">
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  {MINSK_MIR_TOPIC_LABELS[s]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
