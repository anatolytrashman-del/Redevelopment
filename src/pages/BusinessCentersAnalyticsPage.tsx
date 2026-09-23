import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3 } from 'lucide-react';
import { cn } from '../lib/cn';
import { glassCardClass, glassCardShadow } from '../lib/glass';
import { setGenericPageMeta, setArticleJsonLd, setBreadcrumbJsonLd, setFaqJsonLd } from '../lib/pageMeta';
import { fetchBusinessCenters, snapshotBusinessCenters } from '../lib/businessCentersApi';
import { CatalogTopNav } from '../components/businessCenters/CatalogTopNav';
import { fetchExternalMetrics, fetchLatestMarketSnapshots, peekLatestMarketSnapshots } from '../lib/marketSnapshotsApi';
import { fetchBusinessCenterOfferSlices } from '../lib/businessCenterOffersApi';
import { fetchTenantCitySlice, type TenantCitySlice } from '../lib/businessCenterTenantCityApi';
import type { BusinessCenter } from '../data/businessCenters';
import type { BusinessCenterOfferSlice } from '../data/businessCenterOffers';
import { SOURCE_LABELS, type ExternalMetric, type MarketSnapshot } from '../data/marketSnapshots';
import { EMPTY_CATALOG_FILTER, catalogFilterToQuery } from '../lib/businessCenterCatalogFilter';
import { districtHubUrl } from '../lib/businessCenterHubs';
import { shortName } from '../lib/businessCenterDisplay';
import { TENANT_INDUSTRY_OTHER } from '../data/tenantIndustries';
import {
  BUSINESS_CLASSES,
  buildCityOffers,
  buildLotBuckets,
  buildPriceDrivers,
  buildVintageCohorts,
  buildBuildingSupply,
  fmtYears,
  medianOf,
  paybackYears,
  type BusinessClass,
} from '../lib/businessCenterAnalytics';
import { MarketContextBlock } from '../components/businessCenters/CatalogMarketBlocks';
import {
  AmenitiesBlock,
  ClassMatrixBlock,
  DistrictScatterBlock,
  ExtremesBlock,
  HeadlineStrip,
  LotSizeBlock,
  PaybackBlock,
  PriceDriversBlock,
  RateCorridorBlock,
  TenantIndustriesBlock,
  VintageBlock,
  type ClassRow,
  type DistrictPoint,
  type PaybackRow,
} from '../components/businessCenters/AnalyticsBlocks';
import { FaqAccordion } from '../components/ui/FaqAccordion';
import { SourcesTrademarkNote } from '../components/businessCenters/SourcesTrademarkNote';
import { pluralRu } from '../lib/pluralRu';

// Аналитика КАТАЛОГА бизнес-центров Минска — отдельная страница (владелец,
// 2026-09-22): эти же блоки раньше стояли ПОД результатами каталога
// (`/minsk/bcminsk` и все его хабы класса/района/метро/улицы/микрорайона),
// до них почти никто не доскролливал, при этом они рендерились одинаково на
// ~286 индексируемых вариантов каталога — фактический дубль контента. Здесь
// у них один постоянный адрес, свой H1 и FAQ, а с каталога на них ведёт
// компактный тизер (см. BusinessCentersMinskPage).
//
// Второй заход (владелец, 2026-09-22): «предложи улучшенный вариант
// страницы… какие срезы статистики лучше всего ответят на вопросы и помогут
// увидеть картинку целиком; используй разные дизайны блоков». Первая версия
// показывала четыре плитки-счётчика, две медианы и список районов — то
// есть отвечала только на «сколько стоит метр в среднем». Вопросы, ради
// которых на такую страницу заходят («от чего зависит цена», «снять или
// купить», «что вообще есть на рынке и в каком состоянии»), не были закрыты
// ни одним блоком. Сейчас страница построена как разбор: сначала коридор
// ставок вместо одного числа, потом разложение ставки на признаки здания,
// дальше структура фонда (классы, районы, возраст), потом что реально
// предлагают сегодня, и в конце — кто в этих зданиях сидит.
//
// Почти все новые срезы считаются из СЫРЫХ объявлений
// (business_center_offers), а не из market_snapshots: в снимках лежат
// только заранее заведённые разрезы (город/класс/район/здание), а возраст,
// метро, тип управления, размер лота там уже свёрнуты. Правило —
// lib/businessCenterAnalytics.ts считает офисный срез ровно так же, как
// scripts/build-market-snapshots.mjs (схлопывание дублей, потом только
// property_type='Офисы'), иначе страница противоречила бы сама себе:
// блок «Ставки» читает снимок, остальные — сырьё.
//
// Отличие от `/minsk/analytics/ofisy/*` (ANALYTICSPLAN.md): та аналитика —
// про рынок офисов Минска ЦЕЛИКОМ (Kufar/Realt/Domovita/Megapolis по всем
// объявлениям), эта — конкретно про каталог из 141 здания на этом сайте.
// Разные срезы данных, не дубль — поэтому и перелинкованы, а не объединены.
const TITLE = 'Аналитика бизнес-центров Минска — ставки, районы, окупаемость';
// 160 символов — бюджет сниппета, см. комментарий в BusinessCentersGuidePage.
const DESCRIPTION =
  'Разбор рынка бизнес-центров Минска по 141 зданию каталога: коридор ставок аренды и продажи, надбавки за метро и класс, окупаемость покупки, структура фонда.';
const PAGE_URL = 'https://redevelopment.pro/minsk/bcminsk/analytics';
const PAGE_H1 = 'Аналитика бизнес-центров Минска';
const DATE_PUBLISHED = '2026-09-22';
const DATE_MODIFIED = '2026-09-22';

// Класс/район показываем в окупаемости только там, где обе стороны дроби
// опираются на живую выборку. Порог по продаже ниже, чем по аренде: лотов
// на продажу в БЦ в разы меньше, и требование 15 оставило бы два района
// из девяти — а без второй стороны дробь не посчитать вовсе.
const MIN_PAYBACK_RENT_N = 15;
const MIN_PAYBACK_SALE_N = 10;
// Медиана по зданию — это цена конкретных комнат. По одному-двум лотам она
// не про здание, поэтому в «краях рынка» здание участвует от трёх лотов.
const MIN_BUILDING_LOTS = 3;

// Не замыкание внутри компонента: такая функция пересоздаётся на каждый
// рендер, и useMemo либо тянет её в зависимости (и пересчитывается всегда),
// либо честно ругается на неполный список.
function snap(
  snapshots: MarketSnapshot[] | null,
  deal: 'rent' | 'sale',
  sliceType: MarketSnapshot['sliceType'],
  sliceKey: string,
): MarketSnapshot | null {
  return (snapshots ?? []).find((s) => s.deal === deal && s.sliceType === sliceType && s.sliceKey === sliceKey) ?? null;
}

function fmtRent(n: number): string {
  return `$${(Math.round(n * 10) / 10).toLocaleString('ru-RU')}`;
}

function fmtSale(n: number): string {
  return `$${Math.round(n).toLocaleString('ru-RU')}`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

export function BusinessCentersAnalyticsPage() {
  const navigate = useNavigate();
  // Стартуем с данных, положенных в сборку (Ш3-b плана
  // docs/bc-catalog-seo-plan.md): их разобрал main.tsx до монтирования,
  // поэтому первый же рендер получается полным — без «Загрузка…» поверх
  // готовой разметки пререндера и без прыжка вёрстки. Нет снимка (SPA-
  // переход, страница вне раздела) — как раньше, null и запрос ниже.
  const [centers, setCenters] = useState<BusinessCenter[] | null>(snapshotBusinessCenters);
  // Первый кадр — с уже пришедшими данными сборки, как в пререндер-снапшоте
  // (peekBuildData в src/lib/buildData.ts), иначе блок прыгает при монтировании.
  const [snapshots, setSnapshots] = useState<MarketSnapshot[] | null>(() => peekLatestMarketSnapshots('ofisy_bc'));
  const [externalMetrics, setExternalMetrics] = useState<ExternalMetric[] | null>(null);
  const [offers, setOffers] = useState<BusinessCenterOfferSlice[] | null>(null);
  const [tenants, setTenants] = useState<TenantCitySlice | null>(null);

  useEffect(() => {
    fetchBusinessCenters().then(setCenters)// Ошибка базы не стирает уже показанный список (снимок сборки): пустой
      // каталог на месте готового — хуже, чем данные часовой давности.
      .catch(() => setCenters((prev) => prev ?? []));
    fetchLatestMarketSnapshots('ofisy_bc').then(setSnapshots).catch(() => setSnapshots([]));
    fetchBusinessCenterOfferSlices().then(setOffers).catch(() => setOffers([]));
    fetchExternalMetrics('ofisy_bc').then(setExternalMetrics).catch(() => setExternalMetrics([]));
    fetchTenantCitySlice().then(setTenants).catch(() => setTenants(null));
  }, []);

  const cityRent = useMemo(() => snap(snapshots, 'rent', 'city', 'all'), [snapshots]);
  const citySale = useMemo(() => snap(snapshots, 'sale', 'city', 'all'), [snapshots]);
  const cityPayback = paybackYears(cityRent?.median ?? null, citySale?.median ?? null);

  const rentOffers = useMemo(() => buildCityOffers(centers, offers, 'rent'), [centers, offers]);

  // --- Структура каталога -----------------------------------------------
  const stock = useMemo(() => {
    if (!centers || centers.length === 0) return null;
    const withArea = centers.filter((c) => c.totalArea != null);
    return {
      total: centers.length,
      area: withArea.reduce((sum, c) => sum + (c.totalArea ?? 0), 0),
      withAreaCount: withArea.length,
      underConstruction: centers.filter((c) => c.status === 'under_construction').length,
    };
  }, [centers]);

  const drivers = useMemo(() => buildPriceDrivers(rentOffers), [rentOffers]);

  const classRows = useMemo<ClassRow[]>(() => {
    if (!centers) return [];
    return BUSINESS_CLASSES.map((cls) => {
      const inside = centers.filter((c) => c.businessClass === cls);
      const years = inside.map((c) => c.yearBuilt).filter((y): y is number => y != null);
      const medianYear = medianOf(years);
      return {
        cls: cls as BusinessClass,
        count: inside.length,
        area: inside.reduce((sum, c) => sum + (c.totalArea ?? 0), 0),
        medianAge: medianYear == null ? null : Math.round(medianYear),
        rent: snap(snapshots, 'rent', 'class', cls),
        sale: snap(snapshots, 'sale', 'class', cls),
      };
    });
  }, [centers, snapshots]);

  const districtPoints = useMemo<DistrictPoint[]>(() => {
    if (!centers) return [];
    const byDistrict = new Map<string, { count: number; area: number }>();
    for (const c of centers) {
      if (!c.district) continue;
      const cur = byDistrict.get(c.district) ?? { count: 0, area: 0 };
      cur.count += 1;
      cur.area += c.totalArea ?? 0;
      byDistrict.set(c.district, cur);
    }
    return [...byDistrict.entries()]
      .map(([district, v]) => {
        const rent = snap(snapshots, 'rent', 'district', district);
        return rent?.median == null
          ? null
          : {
              district,
              count: v.count,
              area: v.area,
              rent: rent.median,
              href:
                districtHubUrl(district) ??
                `/minsk/bcminsk${catalogFilterToQuery({ ...EMPTY_CATALOG_FILTER, districts: [district] })}`,
            };
      })
      .filter((p): p is DistrictPoint => p != null && p.area > 0);
  }, [centers, snapshots]);

  const paybackRows = useMemo<PaybackRow[]>(() => {
    const rows: PaybackRow[] = [];
    for (const s of snapshots ?? []) {
      if (s.sliceType !== 'district' || s.deal !== 'rent' || s.median == null || s.n < MIN_PAYBACK_RENT_N) continue;
      const sale = snap(snapshots, 'sale', 'district', s.sliceKey);
      if (sale?.median == null || sale.n < MIN_PAYBACK_SALE_N) continue;
      const years = paybackYears(s.median, sale.median);
      if (years == null) continue;
      rows.push({
        label: s.sliceKey.replace(' район', ''),
        years,
        rent: s.median,
        sale: sale.median,
        nRent: s.n,
        nSale: sale.n,
      });
    }
    return rows.sort((a, b) => a.years - b.years);
  }, [snapshots]);

  const cohorts = useMemo(() => (centers ? buildVintageCohorts(centers) : []), [centers]);
  const lotBuckets = useMemo(() => buildLotBuckets(rentOffers), [rentOffers]);

  const supply = useMemo(() => {
    const perBuilding = buildBuildingSupply(rentOffers);
    const ranked = buildBuildingSupply(rentOffers, MIN_BUILDING_LOTS)
      .filter((b) => b.median != null)
      .sort((a, b) => b.median! - a.median!);
    return {
      lots: rentOffers.length,
      area: rentOffers.reduce((sum, o) => sum + o.size, 0),
      buildings: perBuilding.length,
      top: ranked.slice(0, 5),
      bottom: ranked.slice(-5).reverse(),
    };
  }, [rentOffers]);

  // «Другое» — это «у организации не указана внятная рубрика», а не
  // отрасль: в общем рейтинге эта строка оказывалась первой и читалась как
  // вывод про рынок. Показываем отрасли без неё, а её долю честно называем
  // в сноске блока.
  const namedIndustries = useMemo(
    () => (tenants?.industries ?? []).filter((i) => i.industry !== TENANT_INDUSTRY_OTHER),
    [tenants],
  );
  const otherIndustryShare = useMemo(
    () => tenants?.industries.find((i) => i.industry === TENANT_INDUSTRY_OTHER)?.share ?? 0,
    [tenants],
  );

  const amenityGroups = useMemo(() => {
    if (!centers || centers.length === 0) return [];
    const total = centers.length;
    const countInfra = (key: string) => centers.filter((c) => c.infraInternal.includes(key)).length;
    const countLayout = (key: string) => centers.filter((c) => c.layoutTypes.includes(key as never)).length;
    return [
      {
        title: 'Сервисы на первых этажах',
        note: 'Кофе и обед внизу — то, о чём вспоминают на второй неделе, а не на просмотре.',
        chips: ['кафе', 'магазин', 'банк', 'кофепоинт', 'банкомат', 'фитнес-центр', 'конференц-зал', 'салон красоты'].map(
          (label) => ({ label, count: countInfra(label), total }),
        ),
      },
      {
        title: 'Какие планировки предлагают',
        note: 'Одно здание обычно умеет несколько — суммы больше каталога здесь не ошибка.',
        chips: [
          { label: 'кабинетная', count: countLayout('cabinet'), total },
          { label: 'блочная', count: countLayout('block'), total },
          { label: 'open space', count: countLayout('open_space'), total },
        ],
      },
      {
        title: 'Инженерия и доступ',
        note: 'Кондиционирование и круглосуточный вход стоят денег и почти никогда не указаны в объявлении.',
        chips: [
          {
            label: 'кондиционирование',
            count: centers.filter((c) => c.airConditioning === 'partial' || c.airConditioning === 'full').length,
            total,
          },
          { label: 'круглосуточный доступ', count: centers.filter((c) => c.is24x7 === true).length, total },
          { label: 'доступная среда', count: centers.filter((c) => c.accessibility.length > 0).length, total },
          {
            label: 'от 2 машиномест на 100 м²',
            count: centers.filter((c) => c.parkingRatio != null && c.parkingRatio >= 2).length,
            total,
          },
        ],
      },
    ];
  }, [centers]);

  const headline = useMemo(() => {
    if (!stock) return [];
    const items: { value: string; label: string; note?: string }[] = [
      {
        value: String(stock.total),
        label: 'бизнес-центров в каталоге',
        note: stock.underConstruction > 0 ? `из них строится ${stock.underConstruction}` : undefined,
      },
      {
        value: `${fmtInt(stock.area / 1000)} тыс. м²`,
        label: 'суммарная площадь',
        note: `по ${stock.withAreaCount} зданиям с известным метражом`,
      },
    ];
    if (cityRent?.median != null) {
      items.push({
        value: `${fmtRent(cityRent.median)}/м²`,
        label: 'медиана аренды в месяц',
        note: `по ${cityRent.n} офисным объявлениям`,
      });
    }
    if (citySale?.median != null) {
      items.push({
        value: `${fmtSale(citySale.median)}/м²`,
        label: 'медиана покупки',
        note: `по ${citySale.n} объявлениям`,
      });
    }
    if (cityPayback != null) {
      items.push({ value: fmtYears(cityPayback), label: 'окупаемость покупки', note: 'аренда без простоя и налогов' });
    }
    return items;
  }, [stock, cityRent, citySale, cityPayback]);

  function goToLotSize(size: number) {
    navigate(
      size > 0
        ? `/minsk/bcminsk${catalogFilterToQuery({ ...EMPTY_CATALOG_FILTER, lotSize: size })}`
        : '/minsk/bcminsk',
    );
  }

  // --- FAQ ---------------------------------------------------------------
  // Правило владельца (CLAUDE.md): FAQ описывает ВСЁ, что есть на странице,
  // и собирается из тех же данных — нет заполненного блока, нет и вопроса.
  const faqItems = useMemo(() => {
    if (centers === null) return [];
    const items: { question: string; answer: string }[] = [];
    // Первая буква ответа — заглавная всегда. Половина ответов собирается
    // из перечислений, которые начинаются с данных («класс A — …», «кафе —
    // 69 зданий», «пешком до метро»), и в готовом тексте это читалось как
    // обрывок фразы. Ставить .toUpperCase() руками в каждом шаблоне — тот
    // же приём в десяти местах, откуда он рано или поздно выпадет.
    const add = (question: string, answer: string) =>
      items.push({ question, answer: answer.charAt(0).toUpperCase() + answer.slice(1) });

    if (cityRent?.median != null && cityRent.p25 != null && cityRent.p75 != null) {
      add(
        'Сколько стоит аренда офиса в бизнес-центре Минска?',
        `Медиана — ${fmtRent(cityRent.median)} за м² в месяц, но опираться на одну эту цифру не стоит: половина объявлений дешевле ${fmtRent(cityRent.p25)}, половина дороже ${fmtRent(cityRent.p75)}. Посчитано по ${cityRent.n} офисным объявлениям в зданиях каталога (Kufar, Realt, Domovita, Megapolis${cityRent.period ? `, ${cityRent.period.slice(0, 7)}` : ''}); магазины и общепит в тех же зданиях в выборку не попали — они дороже офисов и сдвинули бы медиану вверх.`,
      );
    }
    if (citySale?.median != null && citySale.p25 != null && citySale.p75 != null) {
      add(
        'Сколько стоит купить офис в бизнес-центре Минска?',
        `Медиана — ${fmtSale(citySale.median)} за м², большинство предложений укладываются в коридор ${fmtSale(citySale.p25)}–${fmtSale(citySale.p75)} за м² — по ${citySale.n} объявлениям о продаже офисов в зданиях каталога.`,
      );
    }
    if (drivers.length > 0) {
      const [topDriver, secondDriver] = drivers;
      const restCount = drivers.length - (secondDriver ? 2 : 1);
      add(
        'От чего зависит ставка аренды в бизнес-центре?',
        `Сильнее всего на ставку влияет фактор «${topDriver.title}»: «${topDriver.high.label}» — ${fmtRent(topDriver.high.median)}/м², «${topDriver.low.label}» — ${fmtRent(topDriver.low.median)}/м², разница ${topDriver.deltaPct}%.${
          secondDriver ? ` На втором месте — «${secondDriver.title}», разница ${secondDriver.deltaPct}%.` : ''
        }${
          restCount > 0
            ? ` Ещё ${restCount} ${pluralRu(restCount, 'признак', 'признака', 'признаков')} ${pluralRu(restCount, 'разобран', 'разобраны', 'разобраны')} в таблице выше.`
            : ''
        } Это одномерные срезы: признаки связаны между собой (новое здание обычно и классом выше, и ближе к метро), поэтому надбавки нельзя складывать одна на одну.`,
      );
    }
    const classesWithRate = classRows.filter((r) => r.count > 0 && r.rent?.median != null);
    if (classesWithRate.length === 1) {
      const only = classesWithRate[0];
      add(
        'Чем отличаются классы A, B+, B и C по цене и по количеству зданий?',
        `Хватает данных только по классу ${only.cls}: ${only.count} зданий, аренда ${fmtRent(only.rent!.median!)}/м²${
          only.sale?.median != null ? `, покупка ${fmtSale(only.sale.median)}/м²` : ''
        }. По остальным классам в каталоге пока меньше объявлений, чем нужно для устойчивой медианы.`,
      );
    } else if (classesWithRate.length > 1) {
      const byRentDesc = [...classesWithRate].sort((a, b) => b.rent!.median! - a.rent!.median!);
      const byCountDesc = [...classesWithRate].sort((a, b) => b.count - a.count);
      const pricey = byRentDesc[0];
      const cheap = byRentDesc[byRentDesc.length - 1];
      const common = byCountDesc[0];
      const rare = byCountDesc[byCountDesc.length - 1];
      const totalClassed = classesWithRate.reduce((sum, r) => sum + r.count, 0);
      add(
        'Чем отличаются классы A, B+, B и C по цене и по количеству зданий?',
        `Дороже всех — класс ${pricey.cls}, ${fmtRent(pricey.rent!.median!)}/м²; дешевле всех — класс ${cheap.cls}, ${fmtRent(cheap.rent!.median!)}/м². По числу зданий картина обратная: класс ${common.cls} — самый массовый (${common.count} из ${totalClassed}), класс ${rare.cls} — самый редкий (${rare.count}). Самый дорогой класс не самый распространённый: качественного фонда в городе заметно меньше, чем обычного. Полная раскладка по классам — с окупаемостью и медианным годом постройки — в таблице выше.`,
      );
    }
    if (districtPoints.length > 0) {
      const byRentDesc = [...districtPoints].sort((a, b) => b.rent - a.rent);
      const priciest = byRentDesc[0];
      const biggestStock = [...districtPoints].sort((a, b) => b.area - a.area).find((p) => p.district !== priciest.district);
      const choiceNote = biggestStock
        ? ` Но дорогой район не значит богатый выбором: больше всего фонда — ${biggestStock.district}, ${fmtInt(biggestStock.area)} м² в ${biggestStock.count} ${pluralRu(biggestStock.count, 'здании', 'зданиях', 'зданиях')}, а аренда там ${fmtRent(biggestStock.rent)}/м²${
            biggestStock.rent < priciest.rent ? ', заметно дешевле' : ''
          }.`
        : '';
      add(
        'В каких районах Минска дороже всего снять офис?',
        `Дороже всего — ${priciest.district}, ${fmtRent(priciest.rent)}/м² (${priciest.count} БЦ, ${fmtInt(priciest.area)} м²).${choiceNote} Цены и площади по всем районам — на диаграмме выше.`,
      );
    }
    if (paybackRows.length > 0 && cityPayback != null) {
      const fastest = paybackRows[0];
      const slowest = paybackRows[paybackRows.length - 1];
      const spread =
        paybackRows.length > 1 && slowest.label !== fastest.label
          ? ` Разброс по районам большой: быстрее всего — ${fastest.label}, ${fmtYears(fastest.years)}; дольше всего — ${slowest.label}, ${fmtYears(slowest.years)}.`
          : '';
      add(
        'Что выгоднее — снять офис или купить?',
        `По городу метр в среднем окупается арендой за ${fmtYears(cityPayback)}.${spread} Это прикидка в лоб — медианная цена продажи делится на медианную годовую аренду того же среза, без простоя между арендаторами, налога на недвижимость и эксплуатационных платежей, — реальный срок будет длиннее.`,
      );
    }
    if (cohorts.length > 0) {
      const totalCohorted = cohorts.reduce((sum, c) => sum + c.total, 0);
      const biggest = [...cohorts].sort((a, b) => b.total - a.total)[0];
      add(
        'Когда построены бизнес-центры Минска?',
        `Больше всего зданий каталога сдано в период ${biggest.label} — ${biggest.total} из ${totalCohorted}. Класс A — самый молодой сегмент каталога, класс C — самый старый; для строящихся зданий указан заявленный срок сдачи, а не факт. Разбивка по всем периодам — на графике выше.`,
      );
    }
    if (supply.lots > 0) {
      const busiestBucket = [...lotBuckets].filter((b) => b.n > 0).sort((a, b) => b.n - a.n)[0];
      add(
        'Сколько офисов в бизнес-центрах Минска предлагается прямо сейчас?',
        `${supply.lots} офисных лотов общей площадью ${fmtInt(supply.area)} м² — сейчас в предложении в ${supply.buildings} ${pluralRu(supply.buildings, 'здании', 'зданиях', 'зданиях')} из ${centers.length}.${
          busiestBucket
            ? ` Чаще всего встречаются лоты ${busiestBucket.label} — ${busiestBucket.n} ${pluralRu(busiestBucket.n, 'лот', 'лота', 'лотов')}${
                busiestBucket.median != null ? `, медиана ${fmtRent(busiestBucket.median)}/м²` : ''
              }.`
            : ''
        } Один и тот же лот, выложенный сразу на нескольких площадках, посчитан один раз; остальные здания либо сдают напрямую через управляющую компанию, либо сейчас без свободных площадей. Полная раскладка по размеру лота — в таблице выше.`,
      );
    }
    if (supply.top.length > 0 && supply.bottom.length > 0) {
      const priciestBuilding = supply.top[0];
      const cheapestBuilding = supply.bottom[0];
      const highest = priciestBuilding.median;
      const lowest = cheapestBuilding.median;
      const gapRaw = highest != null && lowest != null && lowest > 0 ? highest / lowest : null;
      const gap = gapRaw != null && gapRaw > 1.05 ? Math.round(gapRaw * 10) / 10 : null;
      // «1,5 раза», «5,2 раза» — у дробных чисел в русском всегда родительный
      // единственного, склонение по 1/2-4/5+ работает только для целых
      // (иначе «в 5 раза» вместо «в 5 раз», если разрыв округлился ровно).
      const timesWord = gap == null ? '' : Number.isInteger(gap) ? pluralRu(gap, 'раз', 'раза', 'раз') : 'раза';
      add(
        'Какие бизнес-центры Минска самые дорогие и самые дешёвые?',
        `Дороже всего — ${shortName(priciestBuilding.center)}, ${fmtRent(highest!)}/м²; дешевле всего — ${shortName(cheapestBuilding.center)}, ${fmtRent(lowest!)}/м²${
          gap != null ? ` — разница в ${gap.toLocaleString('ru-RU')} ${timesWord}` : ''
        }. Топ-5 в каждую сторону — в таблице выше. Считались только здания, где сейчас не меньше ${MIN_BUILDING_LOTS} офисных лотов: по одному-двум объявлениям медиана — это цена конкретной комнаты, а не уровень здания.`,
      );
    }
    if (tenants && namedIndustries.length > 0) {
      const top = namedIndustries.slice(0, 3);
      const parts = top.map((i) => `${i.label} — ${i.orgs} организаций (${i.share}%)`);
      const topText = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}` : parts[0];
      add(
        'Кто арендует офисы в бизнес-центрах Минска?',
        `${fmtInt(tenants.orgTotal)} организаций в ${tenants.buildingTotal} ${pluralRu(tenants.buildingTotal, 'здании', 'зданиях', 'зданиях')} каталога по данным Яндекс.Карт. Крупнейшие отрасли: ${topText}. Ещё ${otherIndustryShare}% организаций числятся под рубриками, по которым отрасль не определить, — в списке выше их нет. Кофейни, пункты выдачи и салоны на первых этажах попадают в тот же список, что и офисные арендаторы.`,
      );
    }
    if (amenityGroups.length > 0 && centers.length > 0) {
      const flat = amenityGroups.flatMap((g) => g.chips).filter((c) => c.count > 0);
      if (flat.length > 0) {
        const sorted = [...flat].sort((a, b) => b.count - a.count);
        const mostCommon = sorted[0];
        const leastCommon = sorted[sorted.length - 1];
        add(
          'Что есть в бизнес-центрах Минска, кроме офисов?',
          `Чаще всего в зданиях каталога встречается «${mostCommon.label}» — ${mostCommon.count} из ${mostCommon.total} зданий.${
            leastCommon.label !== mostCommon.label ? ` Реже всего — «${leastCommon.label}», ${leastCommon.count} зданий.` : ''
          } Полный список по сервисам, планировкам и инженерии — в таблице выше. Признак считается по данным 2ГИС и prometr.by: пустая доля означает «в источнике не указано», а не «точно нет».`,
        );
      }
    }
    const hoa = centers.filter((c) => c.managementType === 'hoa').length;
    const uk = centers.filter((c) => c.managementType === 'single_uk').length;
    if (hoa + uk > 0) {
      add(
        'Чем товарищество собственников отличается от единой управляющей компании?',
        `В каталоге ${hoa} зданий под товариществом собственников и ${uk} — под единой УК; тип управления известен для ${hoa + uk} из ${centers.length}. У товарищества много владельцев: условия и отделка отличаются от этажа к этажу, зато с конкретным собственником можно торговаться. У единой УК один договор и общие правила на всё здание — и в среднем по каталогу ставка выше, хотя внутри класса B это правило уже не держится.`,
      );
    }
    const contextMetrics = [
      ['colliers', 'vacancy_rate', 'вакантность офисов по городу', '%'],
      ['colliers', 'total_stock', 'арендопригодных офисов', 'тыс. м²'],
      ['colliers', 'new_supply', 'введено за 2025 год', 'тыс. м²'],
      ['rezultativnaya-nedvizhimost', 'new_supply_forecast_2026', 'прогноз ввода на 2026', 'тыс. м²'],
      ['rezultativnaya-nedvizhimost', 'vacancy_rate', 'вакантность качественных БЦ', '%'],
      ['goskomimushchestvo', 'registered_deals', 'сделок за первое полугодие 2026', ''],
    ].flatMap(([source, metric, label, unit]) => {
      const row = externalMetrics?.find((m) => m.source === source && m.metric === metric && m.sliceKey === null);
      if (!row) return [];
      // «9.6 %» — две ошибки в трёх символах: точка вместо запятой и пробел
      // перед процентом. Пробел нужен только перед словесной единицей
      // («54,2 тыс. м²»), а у «%» и у пустой единицы его быть не должно.
      const value = `${Number(row.value).toLocaleString('ru-RU')}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
      return [`${label} — ${value} (${SOURCE_LABELS[row.source] ?? row.source}, ${row.period})`];
    });
    if (contextMetrics.length > 0) {
      const text =
        contextMetrics.length > 1
          ? `${contextMetrics.slice(0, -1).join(', ')} и ${contextMetrics[contextMetrics.length - 1]}`
          : contextMetrics[0];
      add(
        'Какая вакантность на рынке офисов Минска и сколько его строят?',
        `${text}. Это данные по рынку офисов Минска целиком, а не только по каталогу этого сайта: классификации источников (Colliers — A/B1/B2, «Результативная недвижимость» — B+/B−) не совпадают с классами A/B+/B/C в каталоге, поэтому сравнивать их напрямую нельзя.`,
      );
    }
    add(
      'Откуда взяты эти цифры и чего в них нет?',
      `Ставки посчитаны по объявлениям Kufar, Realt, Domovita и Megapolis, привязанным к зданиям каталога${
        cityRent?.period ? ` (срез за ${cityRent.period.slice(0, 7)})` : ''
      }; везде медиана, а не среднее — одно дорогое предложение её не сдвинет. Характеристики зданий — из prometr.by, 2ГИС, Яндекс.Карт и собственного ресёрча по сайтам управляющих компаний: если поле не заполнено, здание просто не попадает в этот конкретный срез — это не значит «ноль» или «у здания такого нет». Главное ограничение: это цены предложения, а не сделки — насколько они снижаются после торга, по Минску никто публично не считает.`,
    );
    add(
      'Чем эта страница отличается от общей аналитики рынка офисов?',
      `Здесь разобран каталог конкретных зданий этого сайта: класс, возраст, удалённость от метро, тип управления и паркинг известны по каждому зданию поштучно, поэтому ставку можно разложить на надбавки и сравнить здания между собой. Аналитика рынка офисов Минска целиком — по всем объявлениям города, включая помещения вне бизнес-центров, — на отдельной странице «Аналитика рынка».`,
    );
    return items;
  }, [
    centers,
    cityRent,
    citySale,
    cityPayback,
    drivers,
    classRows,
    districtPoints,
    paybackRows,
    cohorts,
    lotBuckets,
    supply,
    tenants,
    namedIndustries,
    otherIndustryShare,
    amenityGroups,
    externalMetrics,
  ]);

  useEffect(() => {
    setGenericPageMeta({ title: TITLE, description: DESCRIPTION, url: PAGE_URL, ogType: 'article' });
    setArticleJsonLd({
      headline: TITLE,
      description: DESCRIPTION,
      url: PAGE_URL,
      datePublished: DATE_PUBLISHED,
      dateModified: DATE_MODIFIED,
    });
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

  const ready = centers !== null && centers.length > 0;

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
          <span className="text-ink">Аналитика</span>
        </nav>

        <div className={cn('flex flex-col gap-3 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 shrink-0 text-primary-hover" />
            <h1 className="text-2xl font-extrabold leading-tight text-ink sm:text-3xl">{PAGE_H1}</h1>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">
            Ставки аренды и цены продажи, надбавки за метро, класс и возраст здания, срок окупаемости покупки и что
            предлагают прямо сейчас. Посчитано по{' '}
            {centers ? `${centers.length} ${pluralRu(centers.length, 'зданию', 'зданиям', 'зданиям')}` : 'зданиям'}{' '}
            каталога и действующим объявлениям в них. Аналитика рынка офисов Минска целиком — на странице{' '}
            <Link to="/minsk/analytics/ofisy/arenda" className="font-semibold text-primary-hover hover:underline">
              «Аналитика рынка»
            </Link>
            .
          </p>
        </div>

        {centers === null && <p className="text-sm text-ink-muted">Загрузка…</p>}

        {ready && (
          <>
            <HeadlineStrip items={headline} />
            <RateCorridorBlock rent={cityRent} sale={citySale} />
            <PriceDriversBlock drivers={drivers} />
            <ClassMatrixBlock rows={classRows} />
            <DistrictScatterBlock points={districtPoints} cityRent={cityRent?.median ?? null} />
            <PaybackBlock rows={paybackRows} cityYears={cityPayback} />
            <VintageBlock cohorts={cohorts} />
            <LotSizeBlock
              buckets={lotBuckets}
              onPick={goToLotSize}
              totalLots={supply.lots}
              totalArea={supply.area}
              buildings={supply.buildings}
              catalogSize={centers.length}
            />
            <ExtremesBlock top={supply.top} bottom={supply.bottom} />
            {tenants && (
              <TenantIndustriesBlock
                rows={namedIndustries.slice(0, 12).map((i) => ({ name: i.label, orgs: i.orgs, share: i.share }))}
                orgTotal={tenants.orgTotal}
                buildingTotal={tenants.buildingTotal}
                otherShare={otherIndustryShare}
              />
            )}
            <AmenitiesBlock groups={amenityGroups} />
            <MarketContextBlock metrics={externalMetrics} />
          </>
        )}

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
              <Link to="/minsk/bcminsk/rating" className="flex items-center gap-2 text-ink hover:text-primary-hover">
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
            <li>
              <Link to="/minsk/analytics/metodika" className="flex items-center gap-2 text-ink hover:text-primary-hover">
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                Методика: как считаются медианы и коридоры
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
