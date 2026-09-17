import { Link } from 'react-router-dom';
import { Scale, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { BusinessCenter } from '../../data/businessCenters';
import { shortName } from '../../lib/businessCenterDisplay';
import { nearestMetroMeters, type CatalogOfferIndex } from '../../lib/businessCenterCatalogFilter';

// К14 плана docs/bc-catalog-redesign-plan.md — сравнение до четырёх БЦ.
//
// Сравнение живёт в URL (?compare=slug,slug) и показывается блоком НАД
// результатами, а не модалкой: у Modal в этом проекте жёсткий z-50 и свой
// обработчик Escape на каждую копию, вложенных модалок не бывает (см.
// CLAUDE.md), а сравнение нужно смотреть, продолжая листать каталог.
//
// Лучшее значение в строке подсвечивается только там, где «лучше» имеет
// однозначный смысл. У площади здания его нет: большое здание лучше для
// одних задач и хуже для других — такие строки просто показываются без
// выделения, а не раскрашиваются наугад.

type Direction = 'higher' | 'lower' | null;

interface CompareRow {
  label: string;
  better: Direction;
  value: (c: BusinessCenter, offers: CatalogOfferIndex) => number | null;
  format: (v: number) => string;
}

const ROWS: CompareRow[] = [
  {
    label: 'Аренда, $/м²',
    better: 'lower',
    value: (c, o) => o.rentBySlug.get(c.slug)?.median ?? null,
    format: (v) => `$${v}`,
  },
  {
    label: 'Продажа, $/м²',
    better: 'lower',
    value: (c, o) => o.saleBySlug.get(c.slug)?.median ?? null,
    format: (v) => `$${Math.round(v).toLocaleString('ru-RU')}`,
  },
  {
    label: 'Активных лотов',
    better: 'higher',
    value: (c, o) => {
      const n = (o.rentBySlug.get(c.slug)?.n ?? 0) + (o.saleBySlug.get(c.slug)?.n ?? 0);
      return n > 0 ? n : null;
    },
    format: (v) => String(v),
  },
  { label: 'До метро', better: 'lower', value: (c) => nearestMetroMeters(c), format: (v) => `${v.toLocaleString('ru-RU')} м по прямой` },
  {
    label: 'Общая площадь, м²',
    better: null,
    value: (c) => c.totalArea,
    format: (v) => v.toLocaleString('ru-RU'),
  },
  {
    label: 'Типовой этаж, м²',
    better: 'higher',
    value: (c) => c.floorPlateArea,
    format: (v) => v.toLocaleString('ru-RU'),
  },
  {
    label: 'Парковка, маш./100 м²',
    better: 'higher',
    value: (c) => c.parkingRatio,
    format: (v) => v.toLocaleString('ru-RU'),
  },
  { label: 'Потолки, м', better: 'higher', value: (c) => c.ceilingHeight, format: (v) => v.toLocaleString('ru-RU') },
  { label: 'Лифтов', better: 'higher', value: (c) => c.elevators, format: (v) => String(v) },
  { label: 'Рейтинг 2ГИС', better: 'higher', value: (c) => c.gisRating, format: (v) => v.toLocaleString('ru-RU') },
];

const TEXT_ROWS: { label: string; value: (c: BusinessCenter) => string | null }[] = [
  { label: 'Класс', value: (c) => c.businessClass },
  { label: 'Район', value: (c) => c.district },
  {
    label: 'Управление',
    value: (c) => (c.managementType == null ? null : c.managementType === 'single_uk' ? 'Единая УК' : 'ТС'),
  },
  {
    label: 'Планировка',
    value: (c) =>
      c.layoutTypes.length === 0
        ? null
        : c.layoutTypes.map((t) => ({ cabinet: 'кабинетная', block: 'блочная', open_space: 'open-space' })[t] ?? t).join(', '),
  },
];

export function CatalogCompare({
  centers,
  offers,
  onRemove,
  onClear,
}: {
  centers: BusinessCenter[];
  offers: CatalogOfferIndex;
  onRemove: (slug: string) => void;
  onClear: () => void;
}) {
  if (centers.length < 2) return null;

  return (
    <div className={cn('flex flex-col gap-4 overflow-x-auto p-4 sm:p-6', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Scale className="h-5 w-5 shrink-0 text-ink-muted" />
          Сравнение
        </h2>
        <button type="button" onClick={onClear} className="text-sm font-semibold text-ink-muted hover:text-ink">
          Очистить
        </button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-44 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Параметр
            </th>
            {centers.map((c) => (
              <th key={c.slug} scope="col" className="px-2 py-2 text-left align-top">
                <span className="flex items-start justify-between gap-2">
                  <Link to={`/minsk/bcminsk/${c.slug}`} className="text-sm font-bold text-ink hover:text-primary-hover">
                    {shortName(c)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => onRemove(c.slug)}
                    aria-label={`Убрать ${shortName(c)} из сравнения`}
                    className="shrink-0 text-ink-faint hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TEXT_ROWS.map((row) => (
            <tr key={row.label} className="border-t border-border/60">
              <th scope="row" className="px-2 py-2 text-left font-medium text-ink-muted">
                {row.label}
              </th>
              {centers.map((c) => (
                <td key={c.slug} className="px-2 py-2 text-ink">
                  {row.value(c) ?? <span className="text-ink-faint">Нет данных</span>}
                </td>
              ))}
            </tr>
          ))}
          {ROWS.map((row) => {
            const values = centers.map((c) => row.value(c, offers));
            const known = values.filter((v): v is number => v != null);
            // Выделяем лучшее только когда есть что сравнивать: при одной
            // известной цифре «лучшая» из одной — это не сравнение.
            const best =
              row.better == null || known.length < 2
                ? null
                : row.better === 'higher'
                  ? Math.max(...known)
                  : Math.min(...known);
            return (
              <tr key={row.label} className="border-t border-border/60">
                <th scope="row" className="px-2 py-2 text-left font-medium text-ink-muted">
                  {row.label}
                </th>
                {values.map((v, i) => (
                  <td
                    key={centers[i].slug}
                    className={cn(
                      'px-2 py-2 tabular-nums',
                      v != null && best != null && v === best ? 'font-bold text-[#0f6b3d]' : 'text-ink',
                    )}
                  >
                    {v == null ? <span className="text-ink-faint">Нет данных</span> : row.format(v)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
