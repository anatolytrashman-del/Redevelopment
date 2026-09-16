import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow, glassPillClass, glassPillShadow } from '../lib/glass';
import { setBreadcrumbJsonLd, setGenericPageMeta } from '../lib/pageMeta';
import { MIN_INDEX_SUBSCALES, SUBSCALE_META, type SubscaleKey } from '../lib/businessCenterIndex';

// Открытая методика «Индекса Redevelopment» (К9 плана
// docs/bc-catalog-redesign-plan.md). Существует ровно потому, что оценка
// чужого здания числом требует объяснения: собственник БЦ с низким
// индексом должен по этой странице понять, из чего он сложился, и увидеть,
// что там нет ни одной вкусовщины — только измеримые параметры.
//
// Подшкалы и веса берутся ИЗ КОДА (SUBSCALE_META), а не переписаны здесь
// руками: иначе текст методики и реальный расчёт разъехались бы при первой
// же правке порогов.

const TITLE = 'Индекс Redevelopment: как считается оценка бизнес-центра';
const DESCRIPTION =
  'Открытая методика индекса бизнес-центров Минска: пять подшкал (локация, здание, парковка, инфраструктура, рынок), веса, пороги и правило «нет данных — не ноль».';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/metodika';

const THRESHOLDS: Record<SubscaleKey, string[]> = {
  location: [
    'До ближайшей станции метро: 1 500 м и дальше — 0 баллов, 300 м и ближе — 100. Расстояние по прямой, по координатам 2ГИС.',
    'До площади Независимости: 8 км и дальше — 0, 500 м и ближе — 100.',
  ],
  building: [
    'Деловой класс: A — 100, B+ — 80, B — 60, C — 40.',
    'Потолки: 2,5 м — 0, 3,5 м и выше — 100.',
    'Лифты: один лифт на 12 000 м² и больше — 0, на 3 000 м² и меньше — 100.',
    'Кондиционирование: есть — 100, частично — 60, нет — 0.',
  ],
  parking: ['Машиномест на 100 м²: 0 — 0 баллов, 2 и больше — 100.'],
  infra: [
    'Внутри здания (кафе, магазин, банк, кофепоинт, банкомат, фитнес, конференц-зал, салон красоты): 0 позиций — 0, 5 и больше — 100. Вес внутри — 65%.',
    'В шаговой доступности: 0 — 0, 6 и больше — 100. Вес — 35%.',
  ],
  market: [
    'Активные объявления: есть и аренда, и продажа — 100; что-то одно — 70; ничего — 0.',
    'Рейтинг 2ГИС: 3,5 — 0, 5,0 — 100. Отсутствие рейтинга баллов не отнимает.',
  ],
};

export function BusinessCenterIndexMethodPage() {
  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, ogType: 'article' });
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bcminsk' },
      { name: 'Методика индекса' },
    ]);
  }, []);

  return (
    <div className="min-h-svh bg-bg px-4 py-8 sm:py-14">
      <div className="mx-auto flex max-w-3xl items-center justify-between pb-5">
        <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary-hover">RED</span>EVELOPMENT
        </Link>
        <Link
          to="/minsk/bcminsk"
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:text-primary',
            glassPillClass,
          )}
          style={glassPillShadow}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Все бизнес-центры
        </Link>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{TITLE}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            Индекс — это число от 0 до 100 рядом с каждым бизнес-центром каталога. Он складывается из
            пяти подшкал и построен только на измеримых параметрах здания: расстояниях, классе,
            обеспеченности парковкой, составе инфраструктуры и наличии активных объявлений.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            Чего в индексе <strong>нет</strong>: усреднённых оценок пользователей. Рейтинги 2ГИС и
            Яндекс.Карт мы показываем отдельно и как есть, а собственный «средний балл» из чужих
            отзывов не выводим — он не был бы ни нашим измерением, ни честным пересказом чужого.
          </p>
        </div>

        <div className={cn('flex flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Пять подшкал и их веса</h2>
          {(Object.keys(SUBSCALE_META) as SubscaleKey[]).map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold text-ink">{SUBSCALE_META[key].label}</span>
                <span className="text-xs font-semibold text-ink-muted">вес {SUBSCALE_META[key].weight}%</span>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${SUBSCALE_META[key].weight * 3}%` }}
                />
              </span>
              <p className="text-xs text-ink-muted">{SUBSCALE_META[key].what}</p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-ink-muted">
                {THRESHOLDS[key].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Три правила, без которых индексу нельзя верить</h2>
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-muted">
            <p>
              <strong className="text-ink">Пороги фиксированные, а не «лучше среднего».</strong> Если бы
              баллы считались как место в выборке, оценка здания менялась бы каждый раз, когда в каталог
              добавляют другие здания, — сравнить её со снимком прошлого года было бы нельзя.
            </p>
            <p>
              <strong className="text-ink">Отсутствие данных — не ноль.</strong> Подшкала, по которой нет
              данных, в расчёте не участвует вовсе, а её вес перераспределяется на остальные. Иначе
              здание, про которое просто меньше известно, выглядело бы худшим. Рядом с индексом всегда
              написано, по скольким подшкалам он посчитан.
            </p>
            <p>
              <strong className="text-ink">Меньше {MIN_INDEX_SUBSCALES} подшкал — индекса нет.</strong> По
              одной-двум это уже не оценка, а случайность: такому зданию число не показывается совсем.
            </p>
          </div>
        </div>

        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Нашли ошибку в данных?</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            Индекс считается по тому, что мы собрали из открытых источников (prometr.by, 2ГИС, Kufar,
            Realt). Если вы собственник или управляющая компания и видите, что параметры вашего здания
            устарели, — напишите, поправим и пересчитаем.
          </p>
          <a
            href="mailto:anatoly.trashman@gmail.com?subject=Данные%20бизнес-центра%20в%20каталоге"
            className="w-fit text-sm font-semibold text-primary-hover hover:underline"
          >
            anatoly.trashman@gmail.com
          </a>
        </div>
      </main>
    </div>
  );
}
