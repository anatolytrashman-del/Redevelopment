// «Путеводитель по ТЦ» (владелец, 2026-09-25): слияние «Что на каком этаже»
// и «Каталог арендаторов» в один блок — только у ТЦ, БЦ этот компонент не
// использует вовсе (там по-прежнему TenantDirectory без изменений).
//
// Режимы (мало у каких ТЦ есть полный срез Яндекса с этажами — их ~20 из
// каталога):
// - full — у части организаций известен этаж (доля ≥ FLOOR_SHARE_MIN, тот же
//   порог, что раньше был в TenantDirectory): стопка этажей + панель этажа
//   (чипы по категориям) + поиск + вкладка «Категории × этажи».
// - floorsOnly — организаций с этажом мало/нет, но есть текстовый гид
//   floorsGuide: та же стопка, но панель — только текст, без чипов; поиска и
//   матрицы нет (метчить организацию с этажом всё равно нечем).
// - compact — floorsGuide нет, а организации есть, но без этажей: обычный
//   каталог без стопки — поиск и категории.
// - none — данных нет вовсе, блок не рисуется.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import { SearchInput } from '../ui/SearchInput';
import type { RetailInfo } from '../../data/businessCenters';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import {
  NO_FLOOR,
  buildMatrix,
  collectFloors,
  countByFloor,
  defaultFloor,
  floorGuideText,
  floorHeading,
  floorPillLabel,
  groupByCategory,
  hasUnplacedOrgs,
  searchOrganizations,
  toGuideOrgs,
  type GuideOrg,
} from '../../lib/tradeCenterGuide';
import { RetailCardTitle as CardTitle, SourcesLine } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';

// Тот же порог, что раньше был в TenantDirectory (FLOOR_SUMMARY_MIN_SHARE):
// на трети организаций с известным этажом — это срез здания, а не случайная
// выборка. Ниже порога стопку по организациям не строим, только текст гида.
const FLOOR_SHARE_MIN = 0.3;

function categorySlug(direction: string): string {
  return direction.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, '-');
}

function OrgChip({ org, highlighted }: { org: GuideOrg; highlighted: boolean }) {
  const body = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition',
        highlighted ? 'border-primary bg-primary/10 text-ink' : 'border-border bg-white/70 text-ink',
      )}
      title={org.rubric ?? undefined}
    >
      {org.name}
      {org.rating != null && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 text-xs text-ink-muted">
          <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
          {org.rating.toFixed(1)}
        </span>
      )}
    </span>
  );
  if (!org.url) return body;
  return (
    <a href={org.url} target="_blank" rel="nofollow noopener noreferrer" className="hover:opacity-80">
      {body}
    </a>
  );
}

export function TradeCenterGuide({
  info,
  organizations,
  name,
}: {
  info: RetailInfo | null;
  organizations: TenantOrganizationView[];
  name: string;
}) {
  const floorsGuide = useMemo(() => info?.floorsGuide ?? [], [info]);
  const orgs = useMemo(() => toGuideOrgs(organizations), [organizations]);
  const orgsWithFloorShare = orgs.length ? orgs.filter((o) => o.floor).length / orgs.length : 0;
  const useFloorPerOrg = orgs.length > 0 && orgsWithFloorShare >= FLOOR_SHARE_MIN;

  const mode: 'full' | 'floorsOnly' | 'compact' | 'none' = useFloorPerOrg
    ? 'full'
    : floorsGuide.length > 0
      ? 'floorsOnly'
      : orgs.length > 0
        ? 'compact'
        : 'none';

  const floors = useMemo(
    () => collectFloors(floorsGuide, mode === 'full' ? orgs : []),
    [floorsGuide, orgs, mode],
  );
  const floorsWithUnplaced = useMemo(
    () => (mode === 'full' && hasUnplacedOrgs(orgs) ? [...floors, NO_FLOOR] : floors),
    [floors, orgs, mode],
  );
  const counts = useMemo(() => countByFloor(orgs), [orgs]);

  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'floors' | 'matrix'>('floors');
  const [query, setQuery] = useState('');
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedFloor((current) => current ?? defaultFloor(floorsWithUnplaced, counts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = useMemo(
    () => (mode === 'full' ? searchOrganizations(orgs, query) : []),
    [orgs, query, mode],
  );
  const matchedFloors = useMemo(
    () => new Set(matches.map((m) => m.floor ?? NO_FLOOR)),
    [matches],
  );
  const matchedNames = useMemo(() => new Set(matches.map((m) => m.name)), [matches]);

  useEffect(() => {
    if (query.trim() && matchedFloors.size === 1) {
      const only = [...matchedFloors][0];
      setSelectedFloor(only);
    }
  }, [query, matchedFloors]);

  useEffect(() => {
    if (!pendingCategory) return;
    const el = containerRef.current?.querySelector(`[data-category="${categorySlug(pendingCategory)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setPendingCategory(null);
  }, [pendingCategory, selectedFloor]);

  if (mode === 'none') return null;

  const activeFloor = selectedFloor ?? floorsWithUnplaced[0] ?? null;
  const orgsForFloor = activeFloor != null ? orgs.filter((o) => (o.floor ?? NO_FLOOR) === activeFloor) : [];
  const categoryGroups = groupByCategory(mode === 'compact' ? orgs : orgsForFloor);
  const guideText = activeFloor != null && activeFloor !== NO_FLOOR ? floorGuideText(floorsGuide, activeFloor) : null;
  const matrix = mode === 'full' ? buildMatrix(orgs, floors) : null;

  return (
    <div id="floors" className={cardClass} style={glassCardShadow} ref={containerRef}>
      {/* Старый якорь #tenants — на него ссылается соседний корпус того же
          комплекса (retailInfo.tenantsAt) и, возможно, внешние ссылки. */}
      <span id="tenants" className="block scroll-mt-32" aria-hidden="true" />
      <CardTitle id="floors" />

      {mode === 'full' && (
        <div className="flex gap-1 rounded-xl border border-border bg-white/60 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('floors')}
            className={cn('flex-1 rounded-lg px-3 py-1.5 transition', activeTab === 'floors' ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink')}
          >
            По этажам
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={cn('flex-1 rounded-lg px-3 py-1.5 transition', activeTab === 'matrix' ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink')}
          >
            Категории × этажи
          </button>
        </div>
      )}

      {mode === 'full' && activeTab === 'floors' && (
        <label className="flex min-h-0 w-full">
          <SearchInput
            type="search"
            aria-label={`Найти магазин в ${name}`}
            placeholder="Найти магазин"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            wrapperClassName="w-full"
          />
        </label>
      )}
      {mode === 'compact' && (
        <SearchInput
          type="search"
          aria-label={`Найти магазин в ${name}`}
          placeholder="Найти магазин"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {(mode === 'full' || mode === 'compact') && query.trim() && matches.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {matches.map((m, i) => (
            <li key={`${m.name}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  if (mode === 'full' && m.floor) setSelectedFloor(m.floor);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="truncate text-ink">{m.name}</span>
                {mode === 'full' && (
                  <span className="shrink-0 text-xs text-ink-muted">{m.floor ? formatFloorSuffix(m.floor) : 'этаж не указан'}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(mode === 'full' || mode === 'compact') && query.trim() && matches.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-ink-muted">
          Не нашли «{query.trim()}» в каталоге.
        </p>
      )}

      {(mode === 'full' || mode === 'floorsOnly') && (!((mode === 'full') && activeTab === 'matrix')) && (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 sm:w-40 sm:flex-col sm:overflow-visible sm:pb-0">
            {floorsWithUnplaced.map((floor) => {
              const active = floor === activeFloor;
              const count = counts.get(floor) ?? 0;
              const matched = matchedFloors.has(floor);
              return (
                <button
                  key={floor}
                  type="button"
                  onClick={() => setSelectedFloor(floor)}
                  aria-pressed={active}
                  className={cn(
                    'flex shrink-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition sm:shrink',
                    active ? 'border-primary bg-primary text-white' : 'border-border bg-white/65 text-ink hover:border-primary/40',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {floorPillLabel(floor)}
                    {matched && <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : 'bg-primary')} aria-hidden="true" />}
                  </span>
                  {mode === 'full' && (
                    <span className={cn('font-normal', active ? 'text-white/80' : 'text-ink-muted')}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-w-0 flex-1">
            {activeFloor != null && (
              <>
                <h3 className="text-base font-bold text-ink">{floorHeading(activeFloor)}</h3>
                {guideText && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{guideText}</p>}
                {mode === 'full' && (
                  <div className="mt-3 flex flex-col gap-3">
                    {categoryGroups.length > 0 ? (
                      categoryGroups.map((group) => (
                        <div key={group.direction} data-category={categorySlug(group.direction)}>
                          <p className="text-xs font-semibold text-ink-muted">
                            {group.direction} · {group.count}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {group.orgs.map((org, i) => (
                              <OrgChip key={`${org.name}-${i}`} org={org} highlighted={matchedNames.has(org.name)} />
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-ink-faint">На этом этаже организации не найдены в каталоге.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {mode === 'full' && activeTab === 'matrix' && matrix && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white/90 px-2 py-1.5 text-left text-xs font-semibold text-ink-muted">Направление</th>
                {matrix.floors.map((floor) => (
                  <th key={floor} className="px-2 py-1.5 text-center text-xs font-semibold text-ink-muted">
                    {floorPillLabel(floor)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.direction}>
                  <td className="sticky left-0 whitespace-nowrap bg-white/90 px-2 py-1.5 text-xs font-medium text-ink">{row.direction}</td>
                  {matrix.floors.map((floor) => {
                    const count = row.counts[floor] ?? 0;
                    const max = row.total || 1;
                    const intensity = count === 0 ? 0 : Math.min(1, 0.25 + (count / max) * 0.75);
                    return (
                      <td key={floor} className="p-0.5 text-center">
                        {count > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFloor(floor);
                              setActiveTab('floors');
                              setPendingCategory(row.direction);
                            }}
                            className="flex h-9 w-full items-center justify-center rounded-lg text-xs font-semibold text-ink transition hover:ring-1 hover:ring-primary"
                            style={{ backgroundColor: `rgba(228, 21, 43, ${intensity * 0.35})` }}
                          >
                            {count}
                          </button>
                        ) : (
                          <span className="flex h-9 w-full items-center justify-center text-xs text-ink-faint">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'compact' && (
        <div className="flex flex-col gap-3">
          {categoryGroups.map((group) => (
            <div key={group.direction}>
              <p className="text-xs font-semibold text-ink-muted">
                {group.direction} · {group.count}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.orgs.map((org, i) => (
                  <OrgChip key={`${org.name}-${i}`} org={org} highlighted={matchedNames.has(org.name)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <SourcesLine entries={floorsGuide} />
    </div>
  );
}

function formatFloorSuffix(floor: string): string {
  return `${floorPillLabel(floor)} этаж`;
}
