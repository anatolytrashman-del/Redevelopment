// Блок «Инфраструктура» под каталогом арендаторов: оборудование и точки
// самообслуживания внутри здания (туалеты, банкоматы, терминалы, парковки).
//
// Раньше они шли в тот же каталог отдельным направлением «Оборудование» и
// попадали в счётчик организаций. Владелец, 2026-09-23, увидев у ТЦ по 15–54
// таких записей: «сделай их блоком Инфраструктура, иконками с короткими
// заголовками, под арендаторами». Подписи канонические — их задаёт
// tenantAmenityLabel в lib/tenantCategories.ts, заголовки плиток — там же
// (tenantAmenityTitle), иконки — amenityIcons.ts; новая подпись без иконки
// рисуется с общей.
import { LayoutGrid } from 'lucide-react';
import { cn } from '../../lib/cn';
import { glassCardClass, glassCardShadow } from '../../lib/glass';
import type { TenantAmenity } from '../../lib/businessCenterTenants';
import { tenantAmenityTitle } from '../../lib/tenantCategories';
import { amenityIcon } from './amenityIcons';

// У ТЦ вместо этого блока — TradeCenterInfrastructure (оборудование вместе с
// удобствами из retail_info.services, по группам).
export function BuildingAmenities({ amenities }: { amenities: TenantAmenity[] }) {
  if (amenities.length === 0) return null;
  return (
    <div id="amenities" className={cn('mt-6 scroll-mt-32 overflow-hidden', glassCardClass)} style={glassCardShadow}>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
          <LayoutGrid className="h-5 w-5 shrink-0 text-icon" />
          Инфраструктура
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {amenities.map((amenity) => {
            const Icon = amenityIcon(amenity.category);
            return (
              <li
                key={amenity.category}
                className="flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-border bg-white/65 p-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-icon-bg text-icon">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight text-ink">
                    {tenantAmenityTitle(amenity.category)}
                  </span>
                  <span className="block text-xs text-ink-muted">{amenity.count} шт.</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
