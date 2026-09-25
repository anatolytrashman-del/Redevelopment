// «Инфраструктура» карточки ТЦ (2026-09-24): оборудование из Яндекс.Карт
// (банкоматы, туалеты, велопарковка — с числом) и удобства с сайта ТЦ
// (retail_info.services — с этажом и пояснением) одним списком по группам.
// У БЦ на этом месте остаётся BuildingAmenities. Сборка групп, FAQ и модель
// высоты — lib/tradeCenterInfrastructure.ts.
import { LayoutGrid } from 'lucide-react';
import { glassCardShadow } from '../../lib/glass';
import {
  infrastructureItemMeta,
  type InfrastructureGroup,
  type InfrastructureItem,
} from '../../lib/tradeCenterInfrastructure';
import { amenityIcon, SERVICE_GROUP_ICONS, serviceIcon } from './amenityIcons';
import { retailCardClass } from './tradeCenterRetailStyle';

function InfrastructureTile({ item, group }: { item: InfrastructureItem; group: InfrastructureGroup }) {
  const Icon = item.amenity ? amenityIcon(item.amenity) : serviceIcon(item.title, group.id);
  const meta = infrastructureItemMeta(item);
  return (
    <li className="flex min-w-0 items-start gap-2.5 rounded-xl bg-surface-muted/80 px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-icon-bg text-icon">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="flex min-h-7 min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 break-words text-[13px] font-semibold leading-snug text-ink">{item.title}</span>
          {meta && <span className="shrink-0 text-[11px] font-medium text-primary tabular-nums">{meta}</span>}
        </span>
        {item.text && <span className="break-words text-xs leading-snug text-ink-muted">{item.text}</span>}
      </span>
    </li>
  );
}

export function TradeCenterInfrastructure({
  groups,
}: {
  groups: InfrastructureGroup[];
}) {
  if (!groups.length) return null;
  return (
    <div id="amenities" className={retailCardClass} style={glassCardShadow}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
        <LayoutGrid className="h-5 w-5 shrink-0 text-icon" />
        Инфраструктура
      </h2>
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const GroupIcon = SERVICE_GROUP_ICONS[group.id];
          return (
            <section key={group.id} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                <GroupIcon className="h-4 w-4 shrink-0 text-icon" aria-hidden="true" />
                {group.label}
              </h3>
              {/* На телефоне плитки в одну колонку: в две узкие длинное
                  название рвалось посреди слова. */}
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <InfrastructureTile key={item.key} item={item} group={group} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
