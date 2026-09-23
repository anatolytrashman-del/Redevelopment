import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd, setGenericPageMeta } from '../lib/pageMeta';
import { fetchBusinessCenters, snapshotBusinessCenters } from '../lib/businessCentersApi';
import { fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { shortName } from '../lib/businessCenterDisplay';
import { fmtYears } from '../lib/businessCenterAnalytics';
import { pluralRu } from '../lib/pluralRu';
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import {
  GUIDE_SEGMENT,
  classProfiles,
  costExample,
  fmtArea,
  fmtMoney,
  fmtPct,
  fmtPeriod,
  fmtRate,
  latestPeriod,
  rentTierSplit,
} from '../lib/businessCenterGuide';
import {
  AD_TRAPS,
  CONTRACT_CHECKLIST,
  INSPECTION_CHECKLIST,
  TENANT_GLOSSARY,
} from '../data/businessCenterGuideContent';

// Справочник по рынку бизнес-центров Минска (владелец, 2026-09-22: «"Как
// устроен рынок бизнес-центров в Минске" — на главной мне это не нужно» →
// текст уехал сюда с /minsk/bcminsk; потом: «сделан он ультра-хуёво, жду
// идей по улучшению текстовой части» → страница переписана целиком).
//
// Что здесь принципиально другое по сравнению с первой версией:
//
// 1. Текст держится на СВОИХ данных, а не на пересказе. Таблица классов,
//    тезис о двух ярусах рынка и окупаемость считаются из каталога и
//    market_snapshots (lib/businessCenterGuide.ts, покрыто тестами) — то
//    есть это единственный текст про классы БЦ в Минске, где за каждым
//    утверждением стоит выборка, а не общие слова про «скоростные лифты».
// 2. Разведено с /minsk/bcminsk/analytics: там измеряем рынок (графики,
//    районы, драйверы ставки), здесь объясняем, как он устроен и как
//    выбирать. География и «что сейчас строится» отсюда убраны — они были
//    дублем аналитики.
// 3. Блок «Срезы каталога» (ковёр чипов + алфавитный перечень зданий)
//    удалён отсюда вместе с компонентом — владелец, 2026-09-22: «срезы
//    каталога из видимой части сайта надо вообще убрать». Чем держится
//    перелинковка без него — см. комментарий на том же месте в
//    BusinessCentersMinskPage.tsx.
//
// Длинные текстовые блоки (осмотр, словарь, объявления) лежат данными в
// data/businessCenterGuideContent.ts: из них же собирается FAQ, поэтому
// правило владельца «FAQ описывает всё, что есть на странице» выполняется
// механически, а не второй рукописной копией текста.
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/gid';
const DATE_PUBLISHED = '2026-09-22';
const TITLE = 'Как устроен рынок бизнес-центров в Минске: классы, ставки, договор';
// Описание держим в 160 символов — бюджет сниппета (DESCRIPTION_BUDGET в
// lib/pageMeta.ts, туда же приведены описания каталога и карточек). Раньше
// здесь было 254 символа: в выдаче хвост про осмотр и договор всё равно
// обрезался, а обрезанный сниппет Google охотнее подменяет своим текстом.
const DESCRIPTION =
  'Справочник по бизнес-центрам Минска на данных каталога: чем различаются классы A, B+, B и C, сколько платит арендатор сверх ставки и что проверить в договоре.';
const PAGE_H1 = 'Как устроен рынок бизнес-центров в Минске';

interface Section {
  id: string;
  label: string;
}

export function BusinessCentersGuidePage() {
  // Стартуем с данных, положенных в сборку (Ш3-b плана
  // docs/bc-catalog-seo-plan.md): их разобрал main.tsx до монтирования,
  // поэтому первый же рендер получается полным — без «Загрузка…» поверх
  // готовой разметки пререндера и без прыжка вёрстки. Нет снимка (SPA-
  // переход, страница вне раздела) — как раньше, null и запрос ниже.
  const [centers, setCenters] = useState<BusinessCenter[] | null>(snapshotBusinessCenters);
  const [snapshots, setSnapshots] = useState<MarketSnapshot[] | null>(null);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      // Ошибка базы не стирает уже показанный список (снимок сборки): пустой
      // каталог на месте готового — хуже, чем данные часовой давности.
      .catch(() => setCenters((prev) => prev ?? []));
    // Снимки нужны только ради восьми строк среза по классу, но отдельного
    // запроса под них нет — берём тот же набор, что и аналитика, он
    // маленький (сотни строк агрегатов, не объявления).
    fetchLatestMarketSnapshots(GUIDE_SEGMENT)
      .then(setSnapshots)
      .catch(() => setSnapshots([]));
  }, []);

  const total = centers?.length ?? 0;
  // Пререндер снимает страницу, как только со страницы исчезло слово
  // «Загрузка…» (scripts/prerender.mjs) — без этого флага снимок делался бы
  // ДО ответа Supabase, и половина страницы (таблица классов, ярусы,
  // окупаемость, расчёт) в статический HTML не попадала бы вовсе.
  const loading = centers === null || snapshots === null;
  const profiles = useMemo(() => classProfiles(centers ?? [], snapshots ?? []), [centers, snapshots]);
  const tiers = useMemo(() => rentTierSplit(profiles), [profiles]);
  const cost = useMemo(() => costExample(profiles), [profiles]);
  const period = useMemo(() => fmtPeriod(latestPeriod(snapshots ?? [])), [snapshots]);

  // Окупаемость показываем только там, где есть обе медианы; порядок — от
  // быстрой к долгой, потому что в этом и состоит вывод блока.
  const paybackRows = useMemo(
    () => profiles.filter((p) => p.payback != null).sort((a, b) => (a.payback ?? 0) - (b.payback ?? 0)),
    [profiles],
  );

  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [];
    if (profiles.length > 0) list.push({ id: 'klassy', label: 'Классы A, B+, B и C в цифрах' });
    if (tiers) list.push({ id: 'yarusy', label: 'Почему классов четыре, а ярусов два' });
    if (paybackRows.length > 0) list.push({ id: 'pokupka', label: 'Аренда или покупка' });
    list.push({ id: 'osmotr', label: 'Как отличить класс на осмотре' });
    if (cost) list.push({ id: 'skolko', label: 'Сколько платит арендатор' });
    list.push({ id: 'slovar', label: 'Словарь арендатора' });
    list.push({ id: 'obyavlenie', label: 'Как читать объявление' });
    list.push({ id: 'dogovor', label: 'Что проверить в договоре' });
    list.push({ id: 'faq', label: 'Частые вопросы' });
    return list;
  }, [profiles.length, tiers, paybackRows.length, cost]);

  // FAQ собирается из тех же данных и тех же массивов, что показаны выше
  // (правило владельца 2026-09-17): нет блока — нет вопроса, и ответ не
  // может разойтись с текстом, потому что берётся из него же.
  const faqItems = useMemo(() => {
    const items: { question: string; answer: string }[] = [];
    const add = (question: string, answer: string) => items.push({ question, answer });

    if (total > 0) {
      add(
        'Сколько бизнес-центров в каталоге?',
        `${total} ${pluralRu(total, 'здание', 'здания', 'зданий')} Минска — от небольших офисных домов на несколько кабинетов до многокорпусных комплексов. По каждому есть карточка с адресом, классом, арендаторами и предложениями аренды и продажи.`,
      );
    }
    for (const p of profiles) {
      const parts: string[] = [`В каталоге ${p.count} ${pluralRu(p.count, 'такое здание', 'таких здания', 'таких зданий')}.`];
      if (p.medianYear != null) parts.push(`Медианный год постройки — ${p.medianYear}.`);
      if (p.medianArea != null) parts.push(`Медианная площадь здания — ${fmtArea(p.medianArea)}.`);
      if (p.rent) parts.push(`Медианная ставка аренды офиса — ${fmtRate(p.rent.median)} за м² в месяц.`);
      if (p.sale) parts.push(`Медианная цена покупки — ${fmtMoney(p.sale.median)} за м².`);
      if (p.examples.length > 0) parts.push(`Примеры: ${p.examples.map((c) => shortName(c)).join(', ')}.`);
      add(`Что такое класс ${p.cls} и сколько он стоит?`, parts.join(' '));
    }
    add(
      'Кто присваивает бизнес-центру класс?',
      'Обязательной сертификации классов в Беларуси нет: класс присваивают сами застройщики и управляющие компании, ориентируясь на международную практику. Поэтому у зданий одного формального класса от разных застройщиков сервис может отличаться сильнее, чем у зданий соседних классов.',
    );
    if (tiers) {
      const [top, bottom] = tiers.tiers;
      add(
        'Насколько классы отличаются по цене на самом деле?',
        `Формальных классов четыре, а ценовых ярусов на рынке два. Классы ${top.classes.join(' и ')} стоят практически одинаково (${fmtRate(top.low)}–${fmtRate(top.high)} за м² в месяц), классы ${bottom.classes.join(' и ')} — тоже (${fmtRate(bottom.low)}–${fmtRate(bottom.high)}). Разница внутри пары — меньше ${fmtPct(Math.max(1, tiers.innerGapPct))}, между парами — ${fmtPct(tiers.gapPct)}. Для арендатора это значит, что выбирать надо ярус, а не букву.`,
      );
    }
    if (paybackRows.length > 0) {
      const fastest = paybackRows[0];
      const slowest = paybackRows[paybackRows.length - 1];
      add(
        'Что выгоднее окупается — дорогой класс или дешёвый?',
        `Быстрее всех окупается класс ${fastest.cls}: ${fmtYears(fastest.payback as number)} при покупке по медианной цене и сдаче по медианной ставке. Дольше всех — класс ${slowest.cls}, ${fmtYears(slowest.payback as number)}. Это валовая прикидка: без простоя, налогов, эксплуатации и изменения цен.`,
      );
    }
    add(
      'Как отличить класс здания на осмотре?',
      `Проверяются простые вещи: ${INSPECTION_CHECKLIST.slice(0, 6)
        .map((i) => i.title.toLowerCase())
        .join(', ')} и другие пункты чек-листа на этой странице. Всё это видно за один визит и не требует документов.`,
    );
    for (const item of INSPECTION_CHECKLIST.slice(0, 4)) {
      add(`Что смотреть при осмотре офиса: ${item.title.toLowerCase()}`, item.text);
    }
    if (cost) {
      add(
        `Сколько стоит снять офис ${cost.area} м² в Минске?`,
        `По медианной ставке класса ${cost.cls} (${fmtRate(cost.ratePerSqm)} за м² в месяц) аренда ${cost.area} м² — ${fmtMoney(cost.monthlyNet)} в месяц без НДС и ${fmtMoney(cost.monthlyWithVat)} с НДС ${cost.vatRate}%. Сверху платятся эксплуатационные и коммунальные, а на въезд обычно нужен обеспечительный платёж в одну-две ставки: ${fmtMoney(cost.moveInLow)}–${fmtMoney(cost.moveInHigh)} одним платежом.`,
      );
    }
    add(
      'Из чего складывается стоимость аренды офиса?',
      'Из базовой арендной платы за метр, эксплуатационных платежей за обслуживание здания, коммунальных по потреблению, машиномест и — если помещение сдаётся без отделки — бюджета на ремонт. В объявлении обычно указана только первая строка.',
    );
    for (const t of TENANT_GLOSSARY) {
      add(`Что такое «${t.term.toLowerCase()}» в аренде офиса?`, t.text);
    }
    add(
      'На что обращать внимание в объявлении об аренде офиса?',
      `${AD_TRAPS.map((t) => t.title.toLowerCase()).join('; ')} — разбор каждого пункта есть на этой странице.`,
    );
    add(
      'Нужно ли регистрировать договор аренды офиса в Беларуси?',
      'Нет. Договоры аренды капитальных строений и изолированных помещений государственной регистрации не подлежат независимо от срока — это правило отменено Декретом № 24 ещё в 2008 году, хотя устаревшее требование «от года — регистрировать» до сих пор встречается в статьях. Договор действует с момента подписания сторонами.',
    );
    add(
      'На какой срок заключается договор аренды помещения?',
      'Гражданский кодекс требует срок не менее трёх лет для аренды капитального строения или изолированного помещения; более короткий срок возможен только с согласия арендатора. То есть годовой договор нужно просить отдельно.',
    );
    add(
      'Можно ли установить арендную плату в долларах?',
      'Нет: привязка арендной платы к иностранной валюте в Беларуси запрещена, в договоре указывается сумма в белорусских рублях. Долларовые ставки в объявлениях — способ сравнивать предложения между собой, а не то, что попадёт в договор.',
    );
    for (const item of CONTRACT_CHECKLIST.slice(3)) {
      add(`Аренда офиса: ${item.title.toLowerCase()}`, item.text);
    }
    return items;
  }, [total, profiles, tiers, paybackRows, cost]);

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

  const card = cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass);

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
            Здесь — как устроен офисный рынок Минска и как на нём выбирать: что стоит за классами A, B+, B и C, по
            какой цене они реально сдаются, сколько платит арендатор сверх ставки в объявлении и что проверить на
            осмотре и в договоре. Все цифры посчитаны по нашему каталогу
            {total > 0 ? ` из ${total} ${pluralRu(total, 'здания', 'зданий', 'зданий')}` : ''} и по
            объявлениям с Kufar, Realt, Domovita и Megapolis
            {period ? `, ставки — на ${period}` : ''}. Сами здания с фильтрами, картой и ставками — в{' '}
            <Link to="/minsk/bcminsk" className="font-semibold text-primary-hover hover:underline">
              каталоге бизнес-центров
            </Link>
            .
          </p>
          <nav aria-label="Содержание" className="flex flex-wrap gap-2 pt-1">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-primary hover:text-primary-hover"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>

        {loading && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {profiles.length > 0 && (
          <section id="klassy" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-extrabold text-ink">Классы A, B+, B и C в цифрах</h2>
              <p className="text-sm font-semibold text-ink">
                Класс — это не характеристика качества, а ярлык, который здание присвоило себе само. Сравнивать классы
                имеет смысл только по фактам: возраст, размер, этажность и цена.
              </p>
            </div>

            {/* На узком экране таблица из шести колонок не читается —
                карточка на класс; от sm та же информация таблицей. */}
            <div className="flex flex-col gap-4 sm:hidden">
              {profiles.map((p) => (
                <div key={p.cls} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-ink px-2 text-xs font-extrabold text-white">
                      {p.cls}
                    </span>
                    <span className="text-sm font-bold text-ink">
                      {p.count} {pluralRu(p.count, 'здание', 'здания', 'зданий')} в каталоге
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-ink-faint">Медианный год</dt>
                      <dd className="font-semibold tabular-nums text-ink">{p.medianYear ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Медианная площадь</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {p.medianArea != null ? fmtArea(p.medianArea) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Аренда, $/м² в месяц</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {p.rent ? fmtRate(p.rent.median) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-faint">Покупка, $/м²</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {p.sale ? fmtMoney(p.sale.median) : '—'}
                      </dd>
                    </div>
                  </dl>
                  {p.examples.length > 0 && (
                    <p className="text-xs text-ink-muted">
                      Примеры:{' '}
                      {p.examples.map((c, i) => (
                        <span key={c.slug}>
                          {i > 0 && ', '}
                          <Link to={`/minsk/bcminsk/${c.slug}`} className="text-primary-hover hover:underline">
                            {shortName(c)}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden sm:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    <th className="py-2 pr-3 font-semibold">Класс</th>
                    <th className="py-2 pr-3 font-semibold">Зданий</th>
                    <th className="py-2 pr-3 font-semibold">Медианный год</th>
                    <th className="py-2 pr-3 font-semibold">Медианная площадь</th>
                    <th className="py-2 pr-3 font-semibold">Этажей</th>
                    <th className="py-2 pr-3 font-semibold">Аренда, $/м²</th>
                    <th className="py-2 font-semibold">Покупка, $/м²</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.cls} className="border-b border-border/60 align-top last:border-0">
                      <td className="py-3 pr-3">
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-ink px-2 text-xs font-extrabold text-white">
                          {p.cls}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-bold tabular-nums text-ink">{p.count}</td>
                      <td className="py-3 pr-3 tabular-nums text-ink">{p.medianYear ?? '—'}</td>
                      <td className="py-3 pr-3 tabular-nums text-ink">
                        {p.medianArea != null ? fmtArea(p.medianArea) : '—'}
                      </td>
                      <td className="py-3 pr-3 tabular-nums text-ink">
                        {p.medianFloors != null ? p.medianFloors.toLocaleString('ru-RU') : '—'}
                      </td>
                      <td className="py-3 pr-3 tabular-nums text-ink">
                        {p.rent ? fmtRate(p.rent.median) : '—'}
                        {p.rent && (
                          <span className="block text-[11px] tabular-nums text-ink-faint">
                            {p.rent.n} объявл.{p.rent.reliable ? '' : ', мало данных'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 tabular-nums text-ink">
                        {p.sale ? fmtMoney(p.sale.median) : '—'}
                        {p.sale && (
                          <span className="block text-[11px] tabular-nums text-ink-faint">
                            {p.sale.n} объявл.{p.sale.reliable ? '' : ', мало данных'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="hidden flex-col gap-1.5 text-sm text-ink-muted sm:flex">
              {profiles
                .filter((p) => p.examples.length > 0)
                .map((p) => (
                  <p key={p.cls}>
                    <span className="font-semibold text-ink">Класс {p.cls}:</span>{' '}
                    {p.examples.map((c, i) => (
                      <span key={c.slug}>
                        {i > 0 && ', '}
                        <Link to={`/minsk/bcminsk/${c.slug}`} className="text-primary-hover hover:underline">
                          {shortName(c)}
                        </Link>
                      </span>
                    ))}
                  </p>
                ))}
            </div>

            <p className="text-sm leading-relaxed text-ink-muted">
              Обязательной сертификации классов в Беларуси нет. Класс присваивают застройщик и управляющая компания,
              ориентируясь на международную практику, — никакой третьей стороны, которая бы это проверяла, в стране не
              существует. Поэтому два здания с одной и той же буквой в объявлении могут отличаться сильнее, чем здания
              соседних классов: буква говорит о намерении собственника, а таблица выше — о том, что за ней стоит.
            </p>
          </section>
        )}

        {tiers && (
          <section id="yarusy" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
            <h2 className="text-xl font-extrabold text-ink">Почему классов четыре, а ярусов два</h2>
            <p className="text-sm font-semibold text-ink">
              По ставке аренды рынок делится не на четыре класса, а на две группы: внутри группы разница меньше{' '}
              {fmtPct(Math.max(1, tiers.innerGapPct))}, между группами — {fmtPct(tiers.gapPct)}.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {tiers.tiers.map((tier, i) => (
                <div key={tier.classes.join('-')} className="flex flex-col gap-1 rounded-xl border border-border p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {i === 0 ? 'Верхний ярус' : 'Нижний ярус'}
                  </span>
                  <span className="text-lg font-extrabold text-ink">
                    Классы {tier.classes.join(' и ')}
                  </span>
                  <span className="text-sm tabular-nums text-ink-muted">
                    {tier.low === tier.high
                      ? `${fmtRate(tier.low)} за м² в месяц`
                      : `${fmtRate(tier.low)}–${fmtRate(tier.high)} за м² в месяц`}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              Практический вывод простой: торговаться за букву бессмысленно, а выбирать надо ярус. Внутри яруса
              переплата за более высокий класс почти не видна в ставке — зато видна в возрасте здания, инженерии и
              парковке (см. таблицу выше). А переход между ярусами — это и есть то решение, которое меняет бюджет
              аренды примерно на треть.
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Разрывы считаются заново при каждом открытии страницы по медианам текущих объявлений. Если рынок
              выровняется, этот блок со страницы исчезнет сам: мы не держим здесь заранее написанных выводов. Как
              ставки менялись по районам, возрасту зданий и размеру лота — в{' '}
              <Link to="/minsk/bcminsk/analytics" className="text-primary-hover hover:underline">
                аналитике каталога
              </Link>
              .
            </p>
          </section>
        )}

        {paybackRows.length > 0 && (
          <section id="pokupka" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
            <h2 className="text-xl font-extrabold text-ink">Аренда или покупка</h2>
            <p className="text-sm font-semibold text-ink">
              Самый престижный класс окупается не быстрее всех, а дольше: за дорогой метр платят ожиданиями, а не
              арендным потоком.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    <th className="py-2 pr-3 font-semibold">Класс</th>
                    <th className="py-2 pr-3 font-semibold">Аренда, $/м² в месяц</th>
                    <th className="py-2 pr-3 font-semibold">Покупка, $/м²</th>
                    <th className="py-2 font-semibold">Окупаемость</th>
                  </tr>
                </thead>
                <tbody>
                  {paybackRows.map((p) => (
                    <tr key={p.cls} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3 font-bold text-ink">{p.cls}</td>
                      <td className="py-3 pr-3 tabular-nums text-ink">{p.rent ? fmtRate(p.rent.median) : '—'}</td>
                      <td className="py-3 pr-3 tabular-nums text-ink">{p.sale ? fmtMoney(p.sale.median) : '—'}</td>
                      <td className="py-3 font-semibold tabular-nums text-ink">{fmtYears(p.payback as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              Это валовая прикидка «в лоб»: медианная цена метра делится на годовую аренду того же метра. В ней нет
              простоя между арендаторами, налогов, эксплуатации, ремонта и изменения цен — реальный срок будет
              длиннее. Но порядок величин она показывает честно, и именно из этой арифметики растёт редевелопмент:
              дешёвый метр в здании нижнего яруса возвращает вложенное быстрее, чем дорогой в верхнем.
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Считать под свой объект — с окупаемостью по районам, размеру лота и возрасту здания — удобнее в{' '}
              <Link to="/minsk/bcminsk/analytics" className="text-primary-hover hover:underline">
                аналитике каталога
              </Link>{' '}
              и в{' '}
              <Link to="/minsk/analytics/ofisy/prodazha" className="text-primary-hover hover:underline">
                аналитике продаж офисов
              </Link>
              .
            </p>
          </section>
        )}

        <section id="osmotr" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
          <h2 className="text-xl font-extrabold text-ink">Как отличить класс на осмотре</h2>
          <p className="text-sm font-semibold text-ink">
            Двенадцать пунктов, которые проверяются глазами за один визит. Ни один из них не требует документов,
            специалиста или согласия арендодателя.
          </p>
          <ol className="flex flex-col gap-3">
            {INSPECTION_CHECKLIST.map((item, i) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-bold tabular-nums text-ink">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-ink">{item.title}</span>
                  <span className="text-sm leading-relaxed text-ink-muted">{item.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {cost && (
          <section id="skolko" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
            <h2 className="text-xl font-extrabold text-ink">Сколько платит арендатор</h2>
            <p className="text-sm font-semibold text-ink">
              Ставка из объявления — это не сумма, которую вы заплатите. Вот тот же офис {cost.area} м² класса{' '}
              {cost.cls} по медианной ставке, разложенный по строкам.
            </p>
            <dl className="flex flex-col divide-y divide-border">
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-sm text-ink-muted">Ставка из объявления, за м² в месяц</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink">{fmtRate(cost.ratePerSqm)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-sm text-ink-muted">Аренда {cost.area} м² в месяц</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink">{fmtMoney(cost.monthlyNet)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-sm text-ink-muted">То же с НДС {cost.vatRate}%, если арендодатель его платит</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink">{fmtMoney(cost.monthlyWithVat)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-sm text-ink-muted">Эксплуатационные и коммунальные</dt>
                <dd className="text-right text-sm font-semibold text-ink">отдельной строкой, спрашивать заранее</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-sm text-ink-muted">Обеспечительный платёж, одна-две ставки</dt>
                <dd className="text-sm font-semibold tabular-nums text-ink">
                  {fmtMoney(cost.depositLow)}–{fmtMoney(cost.depositHigh)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-sm font-bold text-ink">Чтобы въехать, одним платежом</dt>
                <dd className="text-sm font-extrabold tabular-nums text-ink">
                  {fmtMoney(cost.moveInLow)}–{fmtMoney(cost.moveInHigh)}
                </dd>
              </div>
            </dl>
            <p className="text-sm leading-relaxed text-ink-muted">
              Строки, которых нет в расчёте, но которые бывают в договоре: машиноместа (считаются отдельно от офиса),
              ремонт под себя, если помещение сдают без отделки, и комиссия агентства. Эксплуатационные и коммунальные
              в объявлениях почти никогда не выделены — поэтому мы их не подставляем, а называем как вопрос
              арендодателю: сколько за метр в месяц и что в эту сумму входит.
            </p>
          </section>
        )}

        <section id="slovar" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
          <h2 className="text-xl font-extrabold text-ink">Словарь арендатора</h2>
          <p className="text-sm font-semibold text-ink">
            Слова, которые встречаются в объявлении и в договоре и стоят денег, если понять их не так.
          </p>
          <dl className="flex flex-col divide-y divide-border">
            {TENANT_GLOSSARY.map((t) => (
              <div key={t.term} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <dt className="text-sm font-bold text-ink">{t.term}</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">{t.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="obyavlenie" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
          <h2 className="text-xl font-extrabold text-ink">Как читать объявление</h2>
          <p className="text-sm font-semibold text-ink">
            Мы собираем объявления с Kufar, Realt, Domovita и Megapolis и видим их насквозь. Вот что в них регулярно
            вводит в заблуждение.
          </p>
          <dl className="flex flex-col divide-y divide-border">
            {AD_TRAPS.map((t) => (
              <div key={t.title} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <dt className="text-sm font-bold text-ink">{t.title}</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">{t.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="dogovor" className={cn(card, 'scroll-mt-20')} style={glassCardShadow}>
          <h2 className="text-xl font-extrabold text-ink">Что проверить в договоре</h2>
          <p className="text-sm font-semibold text-ink">
            Белорусская аренда устроена не так, как её описывают в статьях: регистрировать договор не нужно, срок по
            умолчанию — три года, а ставку в долларах в договор вписать нельзя.
          </p>
          <dl className="flex flex-col divide-y divide-border">
            {CONTRACT_CHECKLIST.map((item) => (
              <div key={item.title} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <dt className="text-sm font-bold text-ink">{item.title}</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">{item.text}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-ink-faint">
            Раздел собран по Гражданскому и Налоговому кодексам, Декрету № 24 и Указу № 138 и сверен в сентябре 2026
            года. Это справка для подготовки к переговорам, а не юридическая консультация: законодательство меняется,
            а условия конкретного договора важнее любого общего правила.
          </p>
        </section>

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
              <Link
                to="/minsk/bcminsk/analytics"
                className="flex items-center gap-2 text-ink hover:text-primary-hover"
              >
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Аналитика каталога: районы, ставки, арендаторы
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
            <li>
              <Link to="/minsk/minsk-mir" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Гид по кварталу Минск Мир
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
