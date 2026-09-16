import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Gauge, Gem, History, MessageSquare, Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import type { MarketSnapshot } from '../../data/marketSnapshots';
import { mapRatingFromHighlights } from '../../lib/businessCenterDisplay';
import type { CatalogOfferIndex } from '../../lib/businessCenterCatalogFilter';
import type { MarketPosition } from '../../lib/businessCenterMarketPosition';
import { SUBSCALE_META, type BusinessCenterIndex } from '../../lib/businessCenterIndex';
import { VERDICT_SIGNATURE } from '../../lib/businessCenterVerdict';

// Авторские блоки карточки БЦ (Б1, Б8, Б10, Б11 плана
// docs/bc-catalog-redesign-plan.md) — то, чего на странице не было вовсе:
// до 2026-09-16 карточка отвечала «какая тут площадь», но не «много это или
// мало». Общая идея взята у аналитики Минск Мира: каждое число стоит рядом
// с базой сравнения и выводом, а не само по себе.

// --- Б1. Место на рынке ------------------------------------------------

function Bar({
  label,
  value,
  max,
  tone,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'subject' | 'baseline';
  unit: string;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={cn('w-28 shrink-0 text-xs sm:w-36', tone === 'subject' ? 'font-bold text-ink' : 'text-ink-muted')}>
        {label}
      </span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span
          className={cn('block h-full rounded-full', tone === 'subject' ? 'bg-primary' : 'bg-border-strong')}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className={cn('w-24 shrink-0 text-right text-xs tabular-nums', tone === 'subject' ? 'font-bold text-ink' : 'text-ink-muted')}>
        {/* Деньги пишем как «$18/м²», а не «18 $/м²» — так же, как везде
            на сайте; остальные единицы идут после числа. */}
        {unit.startsWith('$') ? `$${value.toLocaleString('ru-RU')}${unit.slice(1)}` : `${value.toLocaleString('ru-RU')} ${unit}`}
      </span>
    </div>
  );
}

export function MarketPositionBlock({
  center,
  position,
}: {
  center: BusinessCenter;
  position: MarketPosition;
}) {
  if (position.bars.length === 0 && position.areaRankCity === null) return null;
  return (
    // id — якорь для липкого меню «На странице» (Б7). scroll-mt — чтобы
    // заголовок не уезжал под липкую шапку при переходе по якорю.
    <div id="market" className={cn('mt-6 flex scroll-mt-32 flex-col gap-5 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Gauge className="h-5 w-5 shrink-0 text-ink-muted" />
          Место на рынке
        </h2>
        <p className="text-xs text-ink-faint">
          Сравнение с медианами по классу, району и городу: ставки — по объявлениям Kufar и Realt,
          остальное — по справочнику 143 бизнес-центров (prometr.by и 2ГИС).
        </p>
      </div>

      {position.areaRankCity && (
        <p className="text-sm text-ink-muted">
          По площади это{' '}
          <span className="font-bold text-ink">
            {position.areaRankCity.rank}-й из {position.areaRankCity.total}
          </span>{' '}
          бизнес-центр в каталоге
          {position.areaRankDistrict && center.district && (
            <>
              {' '}
              и{' '}
              <span className="font-bold text-ink">
                {position.areaRankDistrict.rank}-й из {position.areaRankDistrict.total}
              </span>{' '}
              в своём районе ({center.district})
            </>
          )}
          .
        </p>
      )}

      <div className="flex flex-col gap-5">
        {position.bars.map((bar) => {
          const max = Math.max(bar.value, ...bar.baselines.map((b) => b.value));
          return (
            <div key={bar.label} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold text-ink">{bar.label}</span>
                {bar.note && <span className="text-xs text-ink-muted">{bar.note}</span>}
              </div>
              <Bar label="это здание" value={bar.value} max={max} tone="subject" unit={bar.unit} />
              {bar.baselines.map((b) => (
                <Bar key={b.label} label={b.label} value={b.value} max={max} tone="baseline" unit={bar.unit} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Б8. Сколько это в реальных деньгах --------------------------------

const OFFICE_SIZES = [50, 100, 200];

export function MoneyBlock({
  center,
  offers,
  snapshots,
}: {
  center: BusinessCenter;
  offers: CatalogOfferIndex;
  snapshots: MarketSnapshot[] | null;
}) {
  const rentBuilding = offers.rentBySlug.get(center.slug)?.median ?? null;
  const saleBuilding = offers.saleBySlug.get(center.slug)?.median ?? null;
  const classRent =
    center.businessClass
      ? ((snapshots ?? []).find((s) => s.deal === 'rent' && s.sliceType === 'class' && s.sliceKey === center.businessClass)
          ?.median ?? null)
      : null;
  const classSale =
    center.businessClass
      ? ((snapshots ?? []).find((s) => s.deal === 'sale' && s.sliceType === 'class' && s.sliceKey === center.businessClass)
          ?.median ?? null)
      : null;

  // Ставка здания, если она есть; иначе — медиана класса С ЯВНОЙ ПОМЕТКОЙ.
  // Молча подставить класс вместо здания нельзя: пользователь прочитает
  // цифру как «столько стоит ЗДЕСЬ».
  const rent = rentBuilding ?? classRent;
  const sale = saleBuilding ?? classSale;
  const rentIsClass = rentBuilding == null && classRent != null;
  const saleIsClass = saleBuilding == null && classSale != null;
  if (rent == null) return null;

  // Окупаемость покупки: цена за м² делить на годовую аренду того же метра.
  // Считаем только когда ОБЕ цифры про это здание — смешивать цену здания с
  // арендой класса (или наоборот) значит получить число ни о чём.
  const paybackYears =
    rentBuilding != null && saleBuilding != null && rentBuilding > 0
      ? Math.round((saleBuilding / (rentBuilding * 12)) * 10) / 10
      : null;

  return (
    <div className={cn('mt-6 flex flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Coins className="h-5 w-5 shrink-0 text-ink-muted" />
        Сколько это в деньгах
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OFFICE_SIZES.map((size) => (
          <div key={size} className="flex flex-col gap-1 rounded-2xl bg-surface-muted p-4">
            <span className="text-xs text-ink-muted">Офис {size} м² в аренду</span>
            <span className="text-lg font-extrabold text-ink">
              ≈ ${Math.round(size * rent).toLocaleString('ru-RU')}
              <span className="text-sm font-semibold text-ink-muted"> / мес</span>
            </span>
            {sale != null && (
              <span className="text-xs text-ink-faint">
                купить ≈ ${Math.round(size * sale).toLocaleString('ru-RU')}
              </span>
            )}
          </div>
        ))}
      </div>
      {paybackYears != null && (
        <p className="text-sm text-ink-muted">
          При этих ставках покупка окупается арендой примерно за{' '}
          <span className="font-bold text-ink">{paybackYears.toLocaleString('ru-RU')} года</span> — без учёта
          эксплуатационных платежей, налогов и простоя.
        </p>
      )}
      <p className="text-xs text-ink-faint">
        {rentIsClass || saleIsClass
          ? `Расчёт по медиане класса ${center.businessClass} — по самому зданию активных объявлений сейчас нет.`
          : 'Расчёт по медиане активных объявлений этого здания на Kufar и Realt. Это ориентир, а не оферта: реальная ставка зависит от этажа, отделки и срока договора.'}
      </p>
    </div>
  );
}

// --- Б10. Таймлайн истории ---------------------------------------------

// Годы из свободного текста «Интересных фактов» (есть у 133 зданий).
// Диапазон 1850–2100 — чтобы не принять за год площадь («18 007 м²») или
// номер дома; берём только первое упоминание в предложении, иначе одна
// фраза про «с 1998 по 2004» даёт две точки на шкале об одном и том же.
const YEAR_RE = /\b(1[89]\d{2}|20\d{2}|21\d{2})\b/;

export interface HistoryPoint {
  year: number;
  text: string;
}

export function extractHistoryPoints(center: BusinessCenter): HistoryPoint[] {
  const source = center.highlights.find((h) => h.icon === 'history');
  if (!source) return [];
  const points: HistoryPoint[] = [];
  for (const raw of source.text.split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = raw.replace(/^[-–—•\s]+/, '').trim();
    if (!sentence) continue;
    const m = sentence.match(YEAR_RE);
    if (!m) continue;
    const year = Number(m[1]);
    if (points.some((p) => p.year === year)) continue;
    points.push({ year, text: sentence });
  }
  return points.sort((a, b) => a.year - b.year);
}

export function HistoryTimeline({ center }: { center: BusinessCenter }) {
  const points = useMemo(() => extractHistoryPoints(center), [center]);
  // Одна точка — это не шкала, а предложение: такой «таймлайн» выглядел бы
  // как ошибка вёрстки. Текст в этом случае остаётся в общем блоке фактов.
  if (points.length < 2) return null;
  return (
    <div id="history" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <History className="h-5 w-5 shrink-0 text-ink-muted" />
        История здания
      </h2>
      <ol className="flex flex-col gap-4 border-l border-border pl-5">
        {points.map((p) => (
          <li key={p.year} className="relative">
            <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="block text-sm font-bold text-ink">{p.year}</span>
            <span className="block text-sm leading-relaxed text-ink-muted">{p.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- Б11. Что говорят ---------------------------------------------------

export function WhatTheySayBlock({ center, reviewQuotes }: { center: BusinessCenter; reviewQuotes: string[] }) {
  const yandex = mapRatingFromHighlights(center.highlights);
  const hasGis = center.gisRating != null;
  if (!yandex && !hasGis && reviewQuotes.length === 0) return null;
  return (
    <div id="reviews" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <MessageSquare className="h-5 w-5 shrink-0 text-ink-muted" />
        Что говорят
      </h2>
      {/* Два источника рядом, но НЕ усреднённые в одну цифру: сводить чужие
          оценки в собственный рейтинг мы не собираемся (решение из
          BCMINSK_SEO_PLAN.md — никакого AggregateRating), да и считаются
          они по-разному. */}
      <div className="flex flex-wrap gap-3">
        {hasGis && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3">
            <Star className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{center.gisRating}</span> на 2ГИС
              {center.gisReviewCount != null && ` · ${center.gisReviewCount} оценок`}
            </span>
          </div>
        )}
        {yandex && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3">
            <Star className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{yandex.label}</span> на {yandex.source}
            </span>
          </div>
        )}
      </div>
      {reviewQuotes.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviewQuotes.map((q) => (
            <blockquote key={q} className="border-l-2 border-border pl-3 text-sm italic leading-relaxed text-ink-muted">
              {q}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Б4. Техпараметры интерпретированными плитками ----------------------
//
// Сырая таблица prometr.by отвечает «1,5», но не «это много или мало».
// Здесь у каждого числа есть вторая строка с базой сравнения, а сама
// таблица уезжает в раскрывающийся блок «Все параметры» — атрибуция
// источника сохраняется, но первой страница показывает смысл, а не выгрузку.

const LAYOUT_LABELS: Record<string, string> = {
  cabinet: 'кабинетная',
  block: 'блочная',
  open_space: 'open-space',
};

const MANAGEMENT_HINT: Record<string, string> = {
  hoa: 'здание в собственности многих владельцев — условия и торг могут отличаться по этажам',
  single_uk: 'единые правила и один договор на всё здание; обычно дороже, чем у товарищества',
};

export interface TechTile {
  label: string;
  value: string;
  note: string | null;
}

// Доля зданий, у которых значение МЕНЬШЕ — чтобы сказать «топ-15% по
// городу». Считается по тем, у кого параметр вообще известен, и об этом
// честно сказано в подписи блока.
function topPercent(value: number, all: number[]): number | null {
  if (all.length < 10) return null;
  const below = all.filter((v) => v < value).length;
  return Math.max(1, Math.round((1 - below / all.length) * 100));
}

export function buildTechTiles(center: BusinessCenter, all: BusinessCenter[]): TechTile[] {
  const tiles: TechTile[] = [];
  const sameClass = center.businessClass ? all.filter((c) => c.businessClass === center.businessClass) : [];
  const medianOf = (pick: (c: BusinessCenter) => number | null, list: BusinessCenter[]) => {
    const vals = list.map(pick).filter((v): v is number => v != null);
    if (vals.length < 5) return null;
    const s = [...vals].sort((a, b) => a - b);
    return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };

  if (center.parkingRatio != null) {
    const m = medianOf((c) => c.parkingRatio, sameClass);
    tiles.push({
      label: 'Парковка',
      value: `${center.parkingRatio.toLocaleString('ru-RU')} маш./100 м²`,
      note:
        m != null
          ? `${center.parkingRatio >= m ? 'выше' : 'ниже'} медианы класса ${center.businessClass} (${m.toLocaleString('ru-RU')})`
          : null,
    });
  }
  if (center.floorPlateArea != null) {
    const top = topPercent(
      center.floorPlateArea,
      all.map((c) => c.floorPlateArea).filter((v): v is number => v != null),
    );
    tiles.push({
      label: 'Типовой этаж',
      value: `${center.floorPlateArea.toLocaleString('ru-RU')} м²`,
      note: top != null ? `топ-${top}% по городу` : null,
    });
  }
  if (center.managementType) {
    tiles.push({
      label: 'Управление',
      value: center.managementType === 'single_uk' ? 'Единая УК' : 'Товарищество собственников',
      note: MANAGEMENT_HINT[center.managementType] ?? null,
    });
  }
  if (center.layoutTypes.length > 0) {
    tiles.push({
      label: 'Планировка',
      value: center.layoutTypes.map((t) => LAYOUT_LABELS[t] ?? t).join(', '),
      note: center.layoutTypes.includes('open_space') ? 'open-space гибче под рост команды' : null,
    });
  }
  if (center.ceilingHeight != null) {
    const m = medianOf((c) => c.ceilingHeight, all);
    tiles.push({
      label: 'Потолки',
      value: `${center.ceilingHeight.toLocaleString('ru-RU')} м`,
      note: m != null ? `медиана по каталогу — ${m.toLocaleString('ru-RU')} м` : null,
    });
  }
  if (center.elevators != null) {
    tiles.push({
      label: 'Лифтов',
      value: String(center.elevators),
      note:
        center.totalArea != null && center.elevators > 0
          ? `по одному на ${Math.round(center.totalArea / center.elevators).toLocaleString('ru-RU')} м²`
          : null,
    });
  }
  if (center.airConditioning) {
    tiles.push({
      label: 'Кондиционирование',
      value: center.airConditioning === 'none' ? 'нет' : center.airConditioning === 'partial' ? 'частично' : 'есть',
      note: center.airConditioning === 'partial' ? 'не во всех помещениях — уточнять по конкретному блоку' : null,
    });
  }
  if (center.freeSpaceMin != null) {
    tiles.push({
      label: 'Свободные площади',
      value:
        center.freeSpaceMax != null && center.freeSpaceMax !== center.freeSpaceMin
          ? `${center.freeSpaceMin.toLocaleString('ru-RU')}–${center.freeSpaceMax.toLocaleString('ru-RU')} м²`
          : `${center.freeSpaceMin.toLocaleString('ru-RU')} м²`,
      note: 'по данным prometr.by, не по объявлениям',
    });
  }
  return tiles;
}

export function TechTilesBlock({ center, all }: { center: BusinessCenter; all: BusinessCenter[] }) {
  const tiles = useMemo(() => buildTechTiles(center, all), [center, all]);
  if (tiles.length === 0) return null;
  return (
    <div id="tech" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Gauge className="h-5 w-5 shrink-0 text-ink-muted" />
          Что это значит на практике
        </h2>
        <p className="text-xs text-ink-faint">
          Сравнение считается по зданиям, у которых параметр известен, — у части каталога его нет в
          источнике.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-2xl bg-surface-muted p-4">
            <span className="text-xs text-ink-muted">{t.label}</span>
            <span className="text-base font-bold leading-snug text-ink">{t.value}</span>
            {t.note && <span className="text-xs leading-snug text-ink-faint">{t.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- К9. Индекс Redevelopment на карточке -------------------------------
//
// Число само по себе ничего не объясняет, поэтому рядом всегда: разбивка по
// подшкалам, сколько подшкал удалось посчитать и ссылка на открытую
// методику. Собственник здания с низким индексом должен за два клика
// увидеть, из чего он сложился.

export function IndexBlock({ index, rank, total }: { index: BusinessCenterIndex; rank: number | null; total: number }) {
  return (
    <div id="index" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Gem className="h-5 w-5 shrink-0 text-ink-muted" />
        Индекс Redevelopment
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-white">
          {index.value}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-ink-muted">
            из 100, посчитан по {index.known} {index.known === 1 ? 'подшкале' : 'подшкалам'} из 5
          </span>
          {rank != null && (
            <span className="text-sm text-ink-muted">
              <span className="font-bold text-ink">
                {rank}-е место из {total}
              </span>{' '}
              среди бизнес-центров каталога с посчитанным индексом
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {index.subscales.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-ink-muted sm:w-36">{SUBSCALE_META[s.key].label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full bg-border-strong" style={{ width: `${s.score}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{s.score}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-faint">
        Только измеримые параметры здания: расстояния, класс, парковка, инфраструктура, наличие
        активных объявлений. Усреднённых оценок пользователей в индексе нет.{' '}
        <Link to="/minsk/bcminsk/metodika" className="font-semibold text-primary-hover hover:underline">
          Как считается
        </Link>
      </p>
    </div>
  );
}

// --- Б2. Кому подходит --------------------------------------------------
//
// Показывается правленый вручную текст, если он есть, иначе — авточерновик
// из порогов (lib/businessCenterVerdict.ts). Так страница не ждёт, пока до
// неё дойдут руки: у 116 зданий из 143 не было даже описания в прозе.
// Подпись про оценку обязательна — читатель должен понимать, что это наш
// вывод из открытых данных, а не позиция собственника.

export function VerdictBlock({
  verdict,
  pros,
  cons,
  edited,
}: {
  verdict: string;
  pros: string[];
  cons: string[];
  edited: boolean;
}) {
  if (!verdict && pros.length === 0 && cons.length === 0) return null;
  return (
    <div id="verdict" className={cn('mt-6 flex scroll-mt-32 flex-col gap-4 p-6 sm:p-8', glassCardClass)} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <Gauge className="h-5 w-5 shrink-0 text-ink-muted" />
        Кому подходит
      </h2>
      {verdict && <p className="text-sm leading-relaxed text-ink">{verdict}</p>}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pros.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Плюсы</span>
              <ul className="flex flex-col gap-1.5">
                {pros.map((p) => (
                  <li key={p} className="flex gap-2 text-sm leading-snug text-ink-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cons.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">На что смотреть</span>
              <ul className="flex flex-col gap-1.5">
                {cons.map((c) => (
                  <li key={c} className="flex gap-2 text-sm leading-snug text-ink-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-ink-faint">
        {VERDICT_SIGNATURE}
        {!edited && ' · собрано автоматически по порогам, без ручной правки'}
      </p>
    </div>
  );
}
