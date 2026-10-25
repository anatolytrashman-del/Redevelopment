// Ручные уточнения к карточкам арендаторов, присланные самими арендаторами.
//
// Срез Яндекс.Карт (business_center_tenant_source_snapshots) и колонка
// business_centers.tenant_organizations перезаписываются скриптом сбора
// целиком, поэтому то, что прислал владелец организации, держим здесь: правка
// применяется поверх любого нового среза и переживает пересборку данных.
// Ключ — id организации в Яндексе (sourceId): он постоянный и не зависит от
// того, как точка подписана в выдаче. Для старого списка без sourceId — по
// паре «слаг здания + название».
//
// 2026-10-25 — NaturalFabrics (БЦ «Порт», 1 этаж, помещение 10): письмо по
// поручению владельца магазина — ссылка «Сайт магазина» рядом со ссылкой на
// карточку Яндекс Карт, которая остаётся. Адрес: Минск, пр-т Независимости,
// 177, секция 1, помещение 10.
export interface TenantOverride {
  website?: string | null;
  // Подпись ссылки на сайт; по умолчанию «Сайт».
  websiteLabel?: string | null;
  contactsUrl?: string | null;
}

export const TENANT_OVERRIDES_BY_SOURCE_ID: Record<string, TenantOverride> = {
  // NaturalFabrics — https://yandex.by/maps/org/naturalfabrics/184449260132/
  '184449260132': {
    website: 'https://naturalfabrics.by/',
    websiteLabel: 'Сайт магазина',
    contactsUrl: 'https://naturalfabrics.by/contacts',
  },
};

export const TENANT_OVERRIDES_BY_NAME: Record<string, Record<string, TenantOverride>> = {
  port: {
    naturalfabrics: TENANT_OVERRIDES_BY_SOURCE_ID['184449260132'],
  },
};

export function findTenantOverride(
  sourceId: string | null | undefined,
  name: string,
  buildingSlug?: string | null,
): TenantOverride | null {
  if (sourceId && TENANT_OVERRIDES_BY_SOURCE_ID[sourceId]) return TENANT_OVERRIDES_BY_SOURCE_ID[sourceId];
  if (!buildingSlug) return null;
  return TENANT_OVERRIDES_BY_NAME[buildingSlug]?.[name.trim().toLowerCase()] ?? null;
}
