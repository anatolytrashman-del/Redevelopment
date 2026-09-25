import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { glassCardShadow } from '../../lib/glass';
import { pluralRu } from '../../lib/pluralRu';
import { anchorsForPage, formatFloorBadge, formatFloorLabel } from '../../lib/tradeCenterRetail';
import { SearchInput } from '../ui/SearchInput';
import type { RetailInfo } from '../../data/businessCenters';
import type { TenantOrganizationView } from '../../data/businessCenterTenants';
import { buildFloorBoard, exactOrganization, nearbyOrganizations, normalizeBrand, popularShops, searchOrganizations, shopLabel, type UniqueBrand } from '../../lib/tradeCenterGuide';
import { RetailCardTitle as CardTitle, SourcesLine } from './TradeCenterRetailParts';
import { retailCardClass as cardClass } from './tradeCenterRetailStyle';

export function TradeCenterGuide({ info, organizations, name, uniqueBrands = [] }: {
  info: RetailInfo | null;
  organizations: TenantOrganizationView[];
  name: string;
  uniqueBrands?: UniqueBrand[];
}) {
  const floors = useMemo(() => buildFloorBoard(info?.floorsGuide ?? [], organizations), [info, organizations]);
  // «Часто ищут» — сначала якорные арендаторы: по числу отзывов наверх
  // выходили рестораны и бар отеля, а не то, за чем едут в ТЦ.
  const popular = useMemo(() => {
    const anchors = anchorsForPage(info ?? null).map((anchor) => normalizeBrand(anchor.name));
    const byAnchor = anchors
      .map((key) => organizations.find((org) => normalizeBrand(org.name) === key))
      .filter((org): org is TenantOrganizationView => Boolean(org));
    const rest = popularShops(organizations, Infinity).filter((org) => !byAnchor.includes(org));
    return [...byAnchor, ...rest].slice(0, 5);
  }, [info, organizations]);
  const shopCount = organizations.filter((org) => shopLabel(org)).length;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TenantOrganizationView | null>(null);
  const matches = searchOrganizations(organizations, query);
  const active = selected && organizations.includes(selected) ? selected : exactOrganization(organizations, query);
  const hasSearch = organizations.length > 0;
  const hasUnique = hasSearch && floors.length > 0 && uniqueBrands.length >= 3;
  if (!hasSearch && !floors.length) return null;
  const approximateCount = Math.floor(shopCount / 10) * 10;
  const subtitle = [
    floors.length ? `${floors.length} ${pluralRu(floors.length, 'уровень', 'уровня', 'уровней')}` : '',
    shopCount ? `около ${approximateCount} ${pluralRu(approximateCount, 'магазина', 'магазинов', 'магазинов')}, кафе и сервисов` : '',
  ].filter(Boolean).join(', ');
  const select = (org: TenantOrganizationView) => { setQuery(org.name); setSelected(org); };

  return (
    <section id="floors" className={cardClass} style={glassCardShadow}>
      {/* Сохраняем старые ссылки на арендаторов (владелец, 2026-09-25). */}
      <span id="tenants" className="block scroll-mt-32" aria-hidden="true" />
      <div>
        <CardTitle id="floors" label={`Что где в ${name}`} />
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {hasSearch && (
        <div className="rounded-[18px] border border-border bg-white px-4 py-3.5 sm:px-[18px]">
          <SearchInput type="search" aria-label={`Найти магазин в ${name}`} placeholder="Найти магазин" value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(null); }} wrapperClassName="w-full" />
          <div aria-live="polite">
            {query.trim() && matches.length === 0 && <p className="mt-3 border-t border-dashed border-border pt-3 text-sm text-ink-muted">Не нашли „{query.trim()}“</p>}
            {matches.length > 0 && <ul className="mt-3 divide-y divide-dashed divide-border border-t border-dashed border-border">
              {matches.map((org, index) => {
                const nearby = nearbyOrganizations(organizations, org);
                return <li key={`${org.name}-${index}`}>
                  <button type="button" onClick={() => select(org)} className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 py-3 text-left text-sm hover:bg-surface-muted focus-visible:outline-primary">
                    <strong className="text-ink">{org.name}</strong>
                    {org.floor ? <span className="rounded-lg bg-primary px-2 py-0.5 text-xs font-bold text-white">{formatFloorLabel(org.floor)}</span>
                      : <span className="text-xs text-ink-muted">этаж не указан</span>}
                    {nearby.length > 0 && <span className="text-xs text-ink-muted">рядом {nearby.map((item) => item.name).join(', ')}</span>}
                  </button>
                </li>;
              })}
            </ul>}
          </div>
          {popular.length > 0 && <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span>Часто ищут:</span>
            {popular.map((org, index) => <button key={`${org.name}-${index}`} type="button" className="underline decoration-dotted underline-offset-4 hover:text-primary" onClick={() => select(org)}>{org.name}</button>)}
          </div>}
        </div>
      )}
      {(floors.length > 0 || hasUnique) && <div className={cn('grid gap-6', floors.length > 0 && hasUnique && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
        {floors.length > 0 && <div className="rounded-[22px] bg-[#1b1c20] p-3.5 text-white">
          <div className="mx-[30px] mb-2 h-2.5 rounded-t-[10px] bg-white/5" aria-hidden="true" />
          <ol className="divide-y divide-white/10">
            {floors.map((floor) => {
              const hit = active?.floor === floor.floor;
              return <li key={floor.floor} className={cn('grid grid-cols-[44px_minmax(0,1fr)] items-center gap-1 px-1.5 py-3 sm:grid-cols-[54px_minmax(0,1fr)]', hit && 'rounded-xl bg-[#2a1418]')}>
                <span className={cn('text-center text-[22px] font-extrabold sm:text-[26px]', hit && 'text-primary')}>{formatFloorBadge(floor.floor)}</span>
                <div>
                  <h3 className="text-base font-bold">{floor.theme}{hit && <span className="ml-2 inline-block rounded-md bg-primary px-1.5 py-px align-middle text-[11px] text-white">{active.name} здесь</span>}</h3>
                  {floor.brands.length > 0 && <p className="mt-0.5 text-[13px] text-white/65">{floor.brands.join(' · ')}</p>}
                </div>
              </li>;
            })}
          </ol>
        </div>}
        {hasUnique && <aside className="rounded-[22px] border border-border bg-white p-5">
          <h3 className="text-base font-bold text-ink">Только здесь</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">Этих магазинов нет в других торговых центрах Минска из нашего каталога</p>
          <ul className="mt-3.5 divide-y divide-border border-t border-border">
            {uniqueBrands.slice(0, 7).map((brand) => <li key={brand.name} className="flex items-baseline justify-between gap-2.5 py-2 text-sm font-semibold text-ink">
              {brand.name}<span className="text-right text-xs font-normal text-ink-muted">{brand.label}</span>
            </li>)}
          </ul>
        </aside>}
      </div>}
      <div className="text-xs leading-relaxed text-ink-muted">
        <SourcesLine entries={info?.floorsGuide ?? []} />
        {hasSearch && <p className="mt-2">Полного списка арендаторов на странице нет: любой магазин находится поиском.</p>}
      </div>
    </section>
  );
}
