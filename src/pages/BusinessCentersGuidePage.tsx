import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd, setGenericPageMeta } from '../lib/pageMeta';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { shortName } from '../lib/businessCenterDisplay';
import type { BusinessCenter } from '../data/businessCenters';
import { CatalogSlicesBlock } from '../components/businessCenters/CatalogSlicesBlock';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { FaqAccordion } from '../components/ui/FaqAccordion';

// Справочная страница каталога БЦ (владелец, 2026-09-22: «срезы каталога на
// главной мне не нужны... "Как устроен рынок бизнес-центров в Минске" — на
// главной мне это не нужно»). Оба блока переехали сюда с /minsk/bcminsk
// целиком, вместе с алфавитным перечнем всех зданий: текст и полсотни
// внутренних ссылок на хабы нужны поиску, но не нужны человеку, который
// пришёл в каталог смотреть здания. На главной осталась одна строка-ссылка
// сюда.
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/gid';
const DATE_PUBLISHED = '2026-09-22';
const TITLE = 'Как устроен рынок бизнес-центров в Минске: классы, география, ставки';
const DESCRIPTION =
  'Справочник по бизнес-центрам Минска: чем отличаются классы A, B+, B и C, где сосредоточены здания разного уровня, на что смотреть при выборе офиса и из чего складывается ставка аренды. Все разделы каталога и полный список зданий.';
const PAGE_H1 = 'Как устроен рынок бизнес-центров в Минске';

export function BusinessCentersGuidePage() {
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
  }, []);

  const total = centers?.length ?? 0;

  // Абсолютные числа по всему каталогу: страница описывает рынок, а не
  // чью-то выборку с фильтрами, поэтому никакого скоупа здесь нет.
  const districtTotals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) if (c.district) counts[c.district] = (counts[c.district] ?? 0) + 1;
    return counts;
  }, [centers]);

  const topDistrictsByCount = useMemo(
    () => Object.entries(districtTotals).sort((a, b) => b[1] - a[1]).slice(0, 3),
    [districtTotals],
  );

  const classDistrictBreakdown = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const c of centers ?? []) {
      if (!c.businessClass || !c.district) continue;
      map[c.businessClass] ??= {};
      map[c.businessClass][c.district] = (map[c.businessClass][c.district] ?? 0) + 1;
    }
    const result: Record<string, string> = {};
    for (const cls of Object.keys(map)) {
      const top = Object.entries(map[cls]).sort((a, b) => b[1] - a[1])[0];
      if (top) result[cls] = top[0];
    }
    return result;
  }, [centers]);

  const underConstructionNames = useMemo(
    () => (centers ?? []).filter((c) => c.status === 'under_construction').map((c) => shortName(c)),
    [centers],
  );

  // FAQ описывает всё, что есть на странице (правило владельца, 2026-09-17):
  // вопросы собраны из тех же данных, что показаны выше, — нет блока, нет
  // и вопроса.
  const faqItems = useMemo(() => {
    if (centers === null || centers.length === 0) return [];
    const items: { question: string; answer: string }[] = [];
    const add = (question: string, answer: string) => items.push({ question, answer });
    add(
      'Сколько бизнес-центров в каталоге?',
      `${total} зданий Минска — от небольших офисных домов на несколько кабинетов до многокорпусных комплексов.${
        underConstructionNames.length ? ` Из них строятся ${underConstructionNames.length}.` : ''
      }`,
    );
    add(
      'Чем отличаются классы A, B+, B и C?',
      'Классы описывают уровень инженерии, отделки и сервиса: от наиболее высокого A через B+ и B до более простого C. Конкретные характеристики следует проверять в карточке здания.',
    );
    add(
      'Кто присваивает бизнес-центру класс?',
      'Единой обязательной сертификации классов в Беларуси нет: класс присваивают сами застройщики и управляющие компании, ориентируясь на международную практику. Поэтому у зданий одного формального класса от разных застройщиков сервис может заметно отличаться.',
    );
    if (topDistrictsByCount.length) {
      add(
        'В каких районах Минска больше всего бизнес-центров?',
        `${topDistrictsByCount.map(([d, n]) => `${d} район — ${n}`).join('; ')}. Полное распределение по районам — в срезах каталога ниже.`,
      );
    }
    if (Object.keys(classDistrictBreakdown).length) {
      add(
        'Где чаще встречаются здания разных классов?',
        Object.entries(classDistrictBreakdown).map(([cls, district]) => `Класс ${cls} — ${district} район`).join('; '),
      );
    }
    if (underConstructionNames.length) {
      add(
        'Какие бизнес-центры сейчас строятся?',
        `${underConstructionNames.join(', ')}. Раздел обновляется по мере появления новых данных о ходе строительства и сроках сдачи.`,
      );
    }
    add(
      'Есть ли бизнес-центры в квартале Минск Мир?',
      'В каталоге по адресу в этом квартале сейчас один объект — строящийся Международный финансовый центр. По самому кварталу есть отдельный гид с картой конкуренции по категориям бизнеса, инфраструктурой и планами застройки.',
    );
    add(
      'На что смотреть при выборе офиса?',
      'На класс и площадь, транспортную доступность, парковку, планировку, инфраструктуру внутри и рядом, управление зданием, соседей и условия договора: срок, индексацию и состав эксплуатационных платежей.',
    );
    add(
      'Из чего складывается стоимость аренды?',
      'Из базовой арендной платы, эксплуатационных и коммунальных платежей, а при необходимости — бюджета на отделку под арендатора. Состав платежей уточняйте по конкретному объявлению.',
    );
    add(
      'Какие разделы каталога есть?',
      'Подборки по классу, району, микрорайону, улице, станции метро и статусу строительства — все они перечислены в срезах каталога на этой странице, там же полный алфавитный список зданий со ссылками на их страницы.',
    );
    return items;
  }, [centers, total, topDistrictsByCount, classDistrictBreakdown, underConstructionNames]);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, ogType: 'article' });
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: DATE_PUBLISHED,
      dateModified: DATE_PUBLISHED,
    });
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bcminsk' },
      { name: 'Справочник' },
    ]);
  }, []);

  useEffect(() => {
    setFaqJsonLd(faqItems);
    return () => setFaqJsonLd([]);
  }, [faqItems]);

  return (
    <div className="min-h-svh bg-bg">
      <CatalogTopNav centers={centers} width="max-w-3xl" />

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
        <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <Link to="/minsk" className="hover:text-ink">
            Минск
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/minsk/bcminsk" className="hover:text-ink">
            Бизнес-центры
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">Справочник</span>
        </nav>

        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <BookOpen className="h-6 w-6 shrink-0 text-primary-hover" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            {total > 0 ? `В каталоге собрано ${total} бизнес-центров Минска` : 'В каталоге собраны бизнес-центры Минска'}{' '}
            — от небольших офисных зданий на несколько кабинетов до многокорпусных комплексов на десятки тысяч
            квадратных метров. Ниже — как устроена классификация, где физически сосредоточены объекты разного уровня и
            на что стоит смотреть, выбирая офис в аренду или для покупки. Сами здания с фильтрами, картой и ставками —
            в{' '}
            <Link to="/minsk/bcminsk" className="font-semibold text-primary-hover hover:underline">
              каталоге бизнес-центров
            </Link>
            .
          </p>
        </div>

        <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-muted">
            <div className="flex flex-col gap-1.5">
              <h2 id="klassy" className="scroll-mt-24 text-base font-bold text-ink">Классы A, B+, B и C</h2>
              <p>
                Деловой класс бизнес-центра — это не маркетинговая метка, а сложившаяся на рынке коммерческой
                недвижимости система координат по качеству здания и уровню сервиса. <strong>Класс A</strong> — самый
                высокий уровень: современная инженерия (климат-контроль, резервное электропитание, скоростные лифты),
                профессиональная управляющая компания, достаточная парковка и, как правило, расположение в деловых
                зонах города. <strong>Класс B+</strong> обычно уступает классу A по расположению или инженерным
                системам, но сопоставим по качеству отделки и управлению зданием. <strong>Класс B</strong> — крепкий
                средний сегмент: хорошая для повседневной работы отделка и инженерия, но без премиальных опций класса
                A. <strong>Класс C</strong> — более простые здания, часто реконструированные под офисы из другого
                назначения, с базовой отделкой и минимальным набором сервисов; ставки аренды здесь обычно ниже, чем в
                других классах. Единой обязательной сертификации классов в Беларуси нет — застройщики и управляющие
                компании присваивают класс сами, ориентируясь на международную практику (стандарты вроде
                BOMA/Euromoney), поэтому у объектов одного и того же формального класса от разных застройщиков сервис
                может заметно отличаться.
              </p>
            </div>

            {(topDistrictsByCount.length > 0 || Object.keys(classDistrictBreakdown).length > 0) && (
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base font-bold text-ink">География: где сосредоточены бизнес-центры</h2>
                <p>
                  {topDistrictsByCount.length > 0 && (
                    <>
                      Больше всего бизнес-центров в каталоге приходится на{' '}
                      {topDistrictsByCount.map(([d, n]) => `${d} район (${n})`).join(', ')}.{' '}
                    </>
                  )}
                  {Object.keys(classDistrictBreakdown).length > 0 && (
                    <>
                      По деловым классам распределение неравномерно:{' '}
                      {Object.entries(classDistrictBreakdown)
                        .map(([cls, district]) => `класс ${cls} чаще всего встречается в ${district} районе`)
                        .join(', ')}
                      .
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-bold text-ink">Квартал Минск Мир</h2>
              <p>
                {/* Минск Мир — не отдельный фильтр каталога (это не
                    административный район и не распознанный 2GIS-микрорайон,
                    см. DISTRICT_SLUGS/MICRODISTRICT_SLUGS в
                    businessCenterHubs.ts), в каталоге по адресу в этом
                    квартале сейчас только один БЦ — строящийся МФЦ, поэтому
                    ссылка на его карточку, а не на выдуманный срез
                    (проверено по базе 2026-09-21, LB-0.4). */}
                Один из объектов каталога — строящийся{' '}
                <Link to="/minsk/bcminsk/mfc-minsk-mir" className="text-primary-hover hover:underline">
                  Международный финансовый центр
                </Link>{' '}
                в квартале Минск Мир — у него есть отдельный{' '}
                <Link to="/minsk/minsk-mir" className="text-primary-hover hover:underline">
                  гид по району
                </Link>{' '}
                с картой конкуренции по категориям бизнеса, инфраструктурой и планами застройки.
              </p>
            </div>

            {underConstructionNames.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base font-bold text-ink">Что сейчас строится</h2>
                <p>
                  Сейчас в каталоге {underConstructionNames.length}{' '}
                  {underConstructionNames.length === 1 ? 'строящийся объект' : 'строящихся объекта'}:{' '}
                  {underConstructionNames.join(', ')}. Раздел обновляется по мере появления новых данных о ходе
                  строительства и сроках сдачи. Все они собраны на странице{' '}
                  <Link to="/minsk/bcminsk/stroyashchiesya" className="text-primary-hover hover:underline">
                    строящихся бизнес-центров
                  </Link>
                  .
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-bold text-ink">На что смотреть при выборе офиса</h2>
              <p>
                Кроме класса и площади, на комфорт работы в здании и итоговую стоимость аренды влияет ряд менее
                очевидных параметров: транспортная доступность (расстояние до метро и наличие парковки — как для
                сотрудников, так и для посетителей), тип планировки (открытая планировка гибче под рост команды,
                кабинетная — привычнее для части бизнесов), состав инфраструктуры в самом здании и рядом с ним (кафе,
                банки, аптеки), качество управления зданием (скорость реакции на заявки, чистота, охрана) и состав
                соседей — в одном бизнес-центре с вами могут работать десятки других компаний, что важно и для деловых
                контактов, и для общей атмосферы. Отдельно стоит уточнять условия договора аренды: минимальный срок,
                порядок индексации ставки и то, что входит в эксплуатационные платежи помимо самой аренды.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-bold text-ink">Из чего складывается ставка аренды</h2>
              <p>
                Итоговая ставка за квадратный метр обычно состоит из нескольких компонентов: базовой арендной платы
                (зависит в первую очередь от класса здания и расположения), эксплуатационных платежей (обслуживание
                инженерных систем, уборка, охрана общих зон — часто выставляются отдельной строкой), коммунальных
                платежей по факту потребления и, при необходимости отделки помещения под арендатора, отдельного
                бюджета на ремонт. Ставки в разных бизнес-центрах одного класса могут заметно различаться в
                зависимости от расположения, возраста здания и текущей заполняемости — актуальные предложения по
                конкретным зданиям смотрите в карточках объектов, в разделе «Объявления с Kufar, Realt, Domovita и
                Megapolis», а медианы по рынку — в{' '}
                <Link to="/minsk/analytics/ofisy/arenda" className="text-primary-hover hover:underline">
                  аналитике офисов
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {centers === null && <p className="text-sm text-ink-muted">Загрузка…</p>}
        {centers !== null && <CatalogSlicesBlock centers={centers} />}

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Ещё по бизнес-центрам Минска</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/minsk/bcminsk" className="flex items-center gap-2 font-semibold text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Каталог бизнес-центров Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/rating" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Рейтинг бизнес-центров класса A
              </Link>
            </li>
            <li>
              <Link to="/minsk/analytics/rajony" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Сравнение районов Минска по ставкам
              </Link>
            </li>
          </ul>
        </div>

        <FaqAccordion title="Частые вопросы" items={faqItems} id="faq" />

        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Источники</h2>
          <SourcesTrademarkNote />
        </div>
      </main>
    </div>
  );
}
