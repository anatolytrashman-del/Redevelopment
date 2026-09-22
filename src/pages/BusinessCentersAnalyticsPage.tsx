import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, DollarSign } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd } from '../lib/pageMeta';
import { fetchBusinessCenters } from '../lib/businessCentersApi';
import { fetchExternalMetrics, fetchLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { fetchBusinessCenterLotSizes } from '../lib/businessCenterOffersApi';
import type { BusinessCenter } from '../data/businessCenters';
import { SOURCE_LABELS, MIN_RELIABLE_N, type ExternalMetric, type MarketSnapshot } from '../data/marketSnapshots';
import { EMPTY_CATALOG_FILTER, buildOfferIndex, catalogFilterToQuery } from '../lib/businessCenterCatalogFilter';
import { districtHubUrl } from '../lib/businessCenterHubs';
import { FactTile } from '../components/businessCenters/BusinessCenterVisuals';
import {
  AvailableNowBlock,
  DistrictDensityBlock,
  ManagementBlock,
  MarketContextBlock,
} from '../components/businessCenters/CatalogMarketBlocks';
import { FaqAccordion } from '../components/ui/FaqAccordion';

// Аналитика КАТАЛОГА бизнес-центров Минска — вынесена в отдельную страницу
// (владелец, 2026-09-22): эти же блоки раньше стояли ПОД результатами
// каталога (`/minsk/bcminsk` и все его хабы класса/района/метро/улицы/
// микрорайона) и до них почти никто не доскролливал, при этом они
// рендерились одинаково на ~286 индексируемых вариантов каталога —
// фактический дубль контента. Здесь у них один постоянный адрес, свой H1 и
// FAQ, а с каталога на них ведёт компактный тизер (см. BusinessCentersMinskPage).
//
// Отличие от `/minsk/analytics/ofisy/*` (ANALYTICSPLAN.md): та аналитика —
// про рынок офисов Минска ЦЕЛИКОМ (Kufar/Realt/Domovita/Megapolis по всем
// объявлениям), эта — конкретно про каталог из 143+ зданий на этом сайте
// (кто ими управляет, что сейчас сдаётся именно в них, как они распределены
// по районам). Разные срезы данных, не дубль — поэтому и перелинкованы, а
// не объединены в одну страницу.
const TITLE = 'Аналитика бизнес-центров Минска — ставки, районы, управление';
const DESCRIPTION =
  'Аналитика каталога бизнес-центров Минска: медианные ставки аренды и продажи, насыщенность районов, кто управляет зданиями, что сейчас сдаётся и продаётся, контекст рынка офисов.';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/analytics';
const PAGE_H1 = 'Аналитика бизнес-центров Минска';
const DATE_PUBLISHED = '2026-09-22';

function formatRate(n: number, deal: 'rent' | 'sale'): string {
  const rounded = deal === 'rent' ? Math.round(n * 10) / 10 : Math.round(n);
  return `$${rounded.toLocaleString('ru-RU')}${deal === 'rent' ? '/м²/мес' : '/м²'}`;
}

export function BusinessCentersAnalyticsPage() {
  const navigate = useNavigate();
  const [centers, setCenters] = useState<BusinessCenter[] | null>(null);
  const [officeSnapshots, setOfficeSnapshots] = useState<MarketSnapshot[] | null>(null);
  const [externalMetrics, setExternalMetrics] = useState<ExternalMetric[] | null>(null);
  const [lotSizes, setLotSizes] = useState<{ businessCenterSlug: string; size: number }[] | null>(null);

  useEffect(() => {
    fetchBusinessCenters()
      .then(setCenters)
      .catch(() => setCenters([]));
    fetchLatestMarketSnapshots('ofisy_bc')
      .then(setOfficeSnapshots)
      .catch(() => setOfficeSnapshots([]));
    fetchBusinessCenterLotSizes()
      .then(setLotSizes)
      .catch(() => setLotSizes([]));
    fetchExternalMetrics('ofisy_bc')
      .then(setExternalMetrics)
      .catch(() => setExternalMetrics([]));
  }, []);

  const offerIndex = useMemo(() => buildOfferIndex(officeSnapshots, lotSizes), [officeSnapshots, lotSizes]);

  const rateRent = useMemo(
    () => (officeSnapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === 'city' && s.sliceKey === 'all'),
    [officeSnapshots],
  );
  const rateSale = useMemo(
    () => (officeSnapshots ?? []).find((s) => s.deal === 'sale' && s.sliceType === 'city' && s.sliceKey === 'all'),
    [officeSnapshots],
  );

  // Блоки здесь не привязаны к состоянию фильтра каталога (страница
  // самостоятельная, не хаб) — клик по строке/плитке не подсвечивает
  // выбор на месте, а ведёт на каталог с уже применённым фильтром: та же
  // логика урлов, что и у чипов каталога (urlForFilter в
  // BusinessCentersMinskPage.tsx), только сразу навигация, без
  // промежуточного локального состояния.
  function goToDistrict(district: string) {
    navigate(districtHubUrl(district) ?? `/minsk/bcminsk${catalogFilterToQuery({ ...EMPTY_CATALOG_FILTER, districts: [district] })}`);
  }
  function goToFact(id: string) {
    navigate(`/minsk/bcminsk${catalogFilterToQuery({ ...EMPTY_CATALOG_FILTER, facts: [id] })}`);
  }
  function goToLotSize(size: number | null) {
    navigate(size ? `/minsk/bcminsk${catalogFilterToQuery({ ...EMPTY_CATALOG_FILTER, lotSize: size })}` : '/minsk/bcminsk');
  }

  const districtTotals = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of centers ?? []) if (c.district) counts[c.district] = (counts[c.district] ?? 0) + 1;
    return counts;
  }, [centers]);

  const faqItems = useMemo(() => {
    if (centers === null) return [];
    const items: { question: string; answer: string }[] = [];
    const add = (question: string, answer: string) => items.push({ question, answer });

    if (rateRent?.median != null || rateSale?.median != null) {
      const parts: string[] = [];
      if (rateRent?.median != null) parts.push(`аренда — ${formatRate(rateRent.median, 'rent')} (по ${rateRent.n} объявлениям)`);
      if (rateSale?.median != null) parts.push(`продажа — ${formatRate(rateSale.median, 'sale')} (по ${rateSale.n} объявлениям)`);
      add(
        'Какая медианная ставка аренды и продажи офисов в бизнес-центрах Минска?',
        `${parts.join('; ')}. Медиана по объявлениям Kufar, Realt, Domovita и Megapolis${rateRent?.period ? `, период ${rateRent.period.slice(0, 7)}` : ''}. Подробный разбор рынка офисов — на странице «Аналитика рынка».`,
      );
    }
    if (Object.keys(districtTotals).length) {
      add(
        'Как каталог бизнес-центров распределён по районам?',
        Object.entries(districtTotals)
          .sort((a, b) => b[1] - a[1])
          .map(([district, n]) => {
            const area = (centers ?? []).filter((c) => c.district === district).reduce((sum, c) => sum + (c.totalArea ?? 0), 0);
            const rate = (officeSnapshots ?? []).find((s) => s.sliceType === 'district' && s.deal === 'rent' && s.sliceKey === district)?.median;
            return `${district}: ${n} БЦ${area > 0 ? `, ${Math.round(area).toLocaleString('ru-RU')} м² по заполненным площадям` : ''}${rate != null ? `, медиана аренды $${rate}/м²` : ''}`;
          })
          .join('; '),
      );
    }
    const hoa = centers.filter((c) => c.managementType === 'hoa').length;
    const uk = centers.filter((c) => c.managementType === 'single_uk').length;
    if (hoa + uk > 0) {
      add(
        'Какие типы управления представлены в каталоге бизнес-центров?',
        `Товарищество собственников — ${hoa}, единая управляющая компания — ${uk}; тип известен для ${hoa + uk} из ${centers.length} зданий. У товарищества условия и ставка могут отличаться от этажа к этажу, но с конкретным собственником можно торговаться; у единой УК — общие правила на всё здание и обычно более высокая ставка.`,
      );
    }
    const withLots = centers.filter((c) => (offerIndex.lotSizesBySlug.get(c.slug)?.length ?? 0) > 0);
    if (withLots.length) {
      add(
        'Сколько бизнес-центров каталога сейчас сдаётся или продаётся?',
        `${withLots.length} из ${centers.length} зданий каталога с активными объявлениями на Kufar, Realt, Domovita и Megapolis. Остальные сдают напрямую через управляющую компанию либо заняты — отсутствие объявления не значит отсутствие свободных помещений.`,
      );
    }
    const contextMetrics = [
      ['colliers', 'vacancy_rate', 'Вакантность по городу', '%'],
      ['colliers', 'total_stock', 'Арендопригодные офисы', 'тыс. м²'],
      ['colliers', 'new_supply', 'Ввод за 2025 год', 'тыс. м²'],
      ['rezultativnaya-nedvizhimost', 'new_supply_forecast_2026', 'Прогноз ввода на 2026', 'тыс. м²'],
      ['rezultativnaya-nedvizhimost', 'vacancy_rate', 'Вакантность качественных БЦ', '%'],
      ['goskomimushchestvo', 'registered_deals', 'Сделки за первое полугодие 2026', ''],
    ].flatMap(([source, metric, label, unit]) => {
      const row = externalMetrics?.find((m) => m.source === source && m.metric === metric && m.sliceKey === null);
      return row ? [`${label}: ${row.value} ${unit} (${SOURCE_LABELS[row.source] ?? row.source}, ${row.period})`] : [];
    });
    if (contextMetrics.length) {
      add(
        'Что происходит на рынке офисов Минска сейчас?',
        `${contextMetrics.join('; ')}. Классификации внешних источников (Colliers — A/B1/B2, «Результативная недвижимость» — B+/B−) не совпадают с классами A/B+/B/C в этом каталоге, поэтому приведены только общегородские значения.`,
      );
    }
    add(
      'Чем эта страница отличается от общей аналитики рынка офисов?',
      'Здесь — аналитика именно по каталогу бизнес-центров этого сайта: кто управляет зданиями, что сейчас сдаётся и продаётся в них, как они распределены по районам. Аналитика рынка офисов Минска целиком (по всем объявлениям аренды и продажи, не только из каталога) — на отдельной странице «Аналитика рынка».',
    );
    return items;
  }, [centers, districtTotals, officeSnapshots, externalMetrics, rateRent, rateSale, offerIndex]);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, ogType: 'article' });
    setArticleJsonLd({ headline: TITLE, description: DESCRIPTION, url: PAGE_URL, datePublished: DATE_PUBLISHED, dateModified: DATE_PUBLISHED });
    setBreadcrumbJsonLd([
      { name: 'Коммерческая недвижимость в Минске', url: 'https://redevelopment.pro/minsk' },
      { name: 'Бизнес-центры Минска', url: 'https://redevelopment.pro/minsk/bcminsk' },
      { name: 'Аналитика' },
    ]);
  }, []);

  useEffect(() => {
    setFaqJsonLd(faqItems);
    return () => setFaqJsonLd([]);
  }, [faqItems]);

  return (
    <div className="min-h-svh bg-bg">
      <div className="sticky top-0 z-30 border-b border-border bg-bg/90 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-8">
          <Link to="/minsk" className="text-lg font-extrabold tracking-wide text-ink">
            <span className="font-black text-primary-hover">RED</span>EVELOPMENT
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-ink-muted sm:flex">
            <Link to="/minsk/bcminsk" className="whitespace-nowrap transition-colors hover:text-ink">
              Каталог
            </Link>
            <Link to="/minsk/bcminsk/reyting" className="whitespace-nowrap transition-colors hover:text-ink">
              Рейтинг
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
          <Link to="/minsk/bcminsk" className="hover:text-ink">
            Бизнес-центры
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">Аналитика</span>
        </nav>

        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 shrink-0 text-primary-hover" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            Ставки, районы, управление зданиями и текущие объявления — по {centers ? `${centers.length} зданиям` : 'зданиям'} каталога
            бизнес-центров этого сайта. Аналитика рынка офисов Минска целиком (по всем объявлениям, не только из
            каталога) — на странице{' '}
            <Link to="/minsk/analytics/ofisy/arenda" className="font-semibold text-primary-hover hover:underline">
              «Аналитика рынка»
            </Link>
            .
          </p>
        </div>

        {centers === null && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {centers !== null && centers.length > 0 && (
          <>
            {(rateRent?.median != null || rateSale?.median != null) && (
              <div className={cn('flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
                <h2 className="text-lg font-bold text-ink">Ставки аренды и продажи</h2>
                <p className="text-xs text-ink-faint">
                  Медиана по объявлениям Kufar, Realt, Domovita и Megapolis по Минску{rateRent?.period ? `, ${rateRent.period.slice(0, 7)}` : ''}.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rateRent?.median != null && (
                    <FactTile
                      icon={DollarSign}
                      value={formatRate(rateRent.median, 'rent')}
                      label={rateRent.n >= MIN_RELIABLE_N ? `Аренда (по ${rateRent.n} объявлениям)` : `Аренда — ориентировочно (${rateRent.n})`}
                    />
                  )}
                  {rateSale?.median != null && (
                    <FactTile
                      icon={DollarSign}
                      value={formatRate(rateSale.median, 'sale')}
                      label={rateSale.n >= MIN_RELIABLE_N ? `Продажа (по ${rateSale.n} объявлениям)` : `Продажа — ориентировочно (${rateSale.n})`}
                    />
                  )}
                </div>
                <Link
                  to="/minsk/analytics/ofisy/arenda"
                  className="inline-flex w-fit items-center gap-1 text-sm text-primary-hover hover:underline"
                >
                  Подробная аналитика по офисам Минска
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            <AvailableNowBlock centers={centers} offers={offerIndex} lotSize={null} onPickLotSize={goToLotSize} />
            <DistrictDensityBlock centers={centers} snapshots={officeSnapshots} activeDistricts={[]} onPickDistrict={goToDistrict} />
            <ManagementBlock centers={centers} activeFacts={[]} onPickFact={goToFact} />
            <MarketContextBlock metrics={externalMetrics} />
          </>
        )}

        <FaqAccordion title="Частые вопросы" items={faqItems} id="faq" />

        <div className={cn('flex flex-col gap-3 p-6', glassCardClass)} style={glassCardShadow}>
          <h2 className="text-lg font-bold text-ink">Ещё по бизнес-центрам Минска</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/minsk/bcminsk" className="flex items-center gap-2 font-semibold text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Полный каталог бизнес-центров Минска
              </Link>
            </li>
            <li>
              <Link to="/minsk/bcminsk/reyting" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Рейтинг лучших бизнес-центров
              </Link>
            </li>
            <li>
              <Link to="/minsk/analytics" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Аналитика рынка офисов, торговых, складов и машиномест Минска
              </Link>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
