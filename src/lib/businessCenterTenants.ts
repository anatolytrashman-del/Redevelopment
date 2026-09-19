// Сборка организаций здания к виду, в котором их рисует карточка БЦ, и
// сворачивание городского среза рубрик в отрасли.
//
// Два источника приводятся к одному типу TenantOrganizationView: Яндекс
// (основной, с этажом, офисом, рейтингом и ссылкой) и 2GIS (фолбэк, только
// название и рубрика). Блок на карточке один и просто не рисует то, чего в
// данных нет.
import type { Gis2TenantOrganization, TenantIndustryCityProfile } from '../data/businessCenter2gis';
import type { TenantOrganization } from '../data/businessCenters';
import type {
  TenantCityCategories,
  TenantOrganizationView,
  TenantSourceOrganization,
} from '../data/businessCenterTenants';
import { TENANT_INDUSTRY_OTHER } from '../data/tenantIndustries';
import {
  cleanTenantCategory,
  formatTenantPlacement,
  isBuildingOwnCard,
  isTenantAmenity,
  parseTenantPlacement,
  tenantAmenityLabel,
  tenantIndustryFromCategory,
} from './tenantCategories';

// «Бизнес-центр «Порт»» и «Порт» — одно и то же здание: сравниваем по имени
// без типа, кавычек и регистра.
function normalizeBuildingName(name: string | null | undefined): string | null {
  if (!name) return null;
  const stripped = name
    .replace(/бизнес-центр|бизнес центр|деловой центр|б\s?ц\b/giu, '')
    .replace(/[«»"'`]/gu, '')
    .trim()
    .toLowerCase();
  return stripped || null;
}

export interface TenantAmenity {
  category: string;
  count: number;
}

export interface BuildingTenants {
  tenants: TenantOrganizationView[];
  amenities: TenantAmenity[];
}

/**
 * Организации здания из яндексовского среза.
 *
 * Оборудование (банкоматы, кофейные автоматы, туалеты) выносится из списка
 * арендаторов в отдельный перечень: иначе «организаций в здании» больше, чем
 * арендаторов на самом деле, а в отраслях появляются «Места» из туалетов.
 *
 * Порядок — по числу оценок на саму организацию. Раньше так было нельзя:
 * карусель Яндекса и выдача 2GIS отдавали рейтинг только по зданию целиком, и
 * список приходилось сортировать по размеру группы (см. комментарий в
 * BusinessCenterDetailPage). В срезе число оценок есть у 45% организаций —
 * у кого его нет, те идут после, по алфавиту, а не с выдуманным нулём.
 */
export function buildTenantsFromSnapshot(
  organizations: TenantSourceOrganization[],
  buildingName?: string | null,
): BuildingTenants {
  const buildingKey = normalizeBuildingName(buildingName);
  const tenants: TenantOrganizationView[] = [];
  const amenityCounts = new Map<string, number>();

  for (const org of organizations) {
    const rubric = cleanTenantCategory(org.category);
    // Карточка самого здания («Порт» с рубрикой «Бизнес-центр», «Метрополь» с
    // «Торговый центр») — не арендатор.
    if (isBuildingOwnCard(org.category, normalizeBuildingName(org.name) === buildingKey && buildingKey !== null)) continue;
    // Подпись берём каноническую, а не как назвали точку в источнике:
    // «Кофейный автомат», «Кофейный автомат Альфа-Бизнес Хаб» и «Кофейный
    // автомат, кофе с собой» — одно и то же оборудование.
    const amenityLabel = tenantAmenityLabel(org.category, org.name);
    if (amenityLabel) {
      amenityCounts.set(amenityLabel, (amenityCounts.get(amenityLabel) ?? 0) + 1);
      continue;
    }
    const placement = parseTenantPlacement(org.rawText);
    const industry = tenantIndustryFromCategory(org.category);
    tenants.push({
      name: org.name,
      rubric,
      industry: industry === TENANT_INDUSTRY_OTHER ? null : industry,
      placement: formatTenantPlacement(placement),
      floor: placement.floor,
      rating: org.rating,
      reviewCount: org.reviewCount,
      url: org.sourceUrl,
    });
  }

  tenants.sort((a, b) => {
    const aReviews = a.reviewCount ?? -1;
    const bReviews = b.reviewCount ?? -1;
    if (aReviews !== bReviews) return bReviews - aReviews;
    return a.name.localeCompare(b.name, 'ru');
  });

  const amenities = Array.from(amenityCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'ru'));

  return { tenants, amenities };
}

/**
 * Организации из материализованного списка в строке БЦ
 * (`business_centers.tenant_organizations`). Это тот же Яндекс, разложенный по
 * колонке отдельным проходом: название, рубрика, рейтинг и число оценок есть,
 * места в здании и ссылки на карточку — нет (их видит только живой срез).
 * Остаётся для зданий, которых в срезе ещё нет.
 */
export function buildTenantsFromLegacyList(
  organizations: TenantOrganization[],
  buildingName?: string | null,
): BuildingTenants {
  return buildTenantsFromSnapshot(
    organizations.map((org) => ({
      name: org.name,
      sourceId: null,
      sourceUrl: null,
      category: org.category || null,
      rating: org.rating ?? null,
      reviewCount: org.reviewCount ?? null,
      rawText: null,
    })),
    buildingName,
  );
}

/** Тот же вид для фолбэка на 2GIS: места, рейтинга и ссылки там нет. */
export function buildTenantsFromGis2(organizations: Gis2TenantOrganization[]): TenantOrganizationView[] {
  return organizations.map((org) => ({
    name: org.name,
    rubric: org.rubric,
    industry: org.industry,
    placement: null,
    floor: null,
    rating: null,
    reviewCount: null,
    url: null,
  }));
}

/**
 * Городской срез рубрик → городской профиль отраслей.
 *
 * На карточке БЦ сейчас не используется: полосы «здание против каталога»
 * владелец убрал 2026-09-19 («разбор по отраслям вообще не нужен»). Функция
 * живёт дальше ради отраслевых хабов каталога (К16 в
 * docs/bc-catalog-redesign-plan.md) — им нужен ровно этот свод, и он уже
 * покрыт тестами.
 *
 * SQL складывает город по сырым рубрикам и про отрасли ничего не знает
 * (см. refresh_bc_tenant_city_categories и комментарий в tenantCategories.ts),
 * поэтому свернуть его в 28 отраслей — работа клиента. Считается ровно той же
 * картой, что и отрасли конкретного здания, иначе полоса здания и метка
 * города меряли бы разными линейками.
 *
 * Оборудование выкидывается и здесь — город должен считаться так же, как
 * здание, иначе сравнение врёт на долю банкоматов.
 */
export function foldCityCategoriesToIndustries(city: TenantCityCategories): TenantIndustryCityProfile {
  const orgCounts = new Map<string, number>();
  const buildingCounts = new Map<string, number>();
  let orgTotal = 0;

  for (const [category, orgCount, buildingCount] of city.categories) {
    if (isTenantAmenity(category)) continue;
    const industry = tenantIndustryFromCategory(category);
    orgCounts.set(industry, (orgCounts.get(industry) ?? 0) + orgCount);
    // Зданий по отрасли — сумма по рубрикам, то есть ВЕРХНЯЯ оценка: одно и то
    // же здание считается в каждой своей рубрике этой отрасли. На карточке это
    // число не показывается (нужен только buildingTotal), оно нужно будущим
    // отраслевым хабам — К16 в плане каталога; там его придётся считать
    // запросом по зданиям, а не отсюда.
    buildingCounts.set(industry, (buildingCounts.get(industry) ?? 0) + buildingCount);
    orgTotal += orgCount;
  }

  const industries = Array.from(orgCounts.entries())
    .map(([industry, orgCount]) => ({
      industry,
      orgCount,
      buildingCount: buildingCounts.get(industry) ?? 0,
    }))
    .sort((a, b) => b.orgCount - a.orgCount || a.industry.localeCompare(b.industry));

  return {
    industries,
    orgTotal,
    buildingTotal: city.buildingTotal,
    computedAt: city.computedAt,
  };
}

export interface FloorGroup {
  floor: string;
  count: number;
}

/**
 * Сколько организаций на каждом этаже. Считается только по тем, у кого этаж
 * известен (в срезе это 57%), поэтому сумма меньше числа организаций — так и
 * подписывается на карточке, без досчёта «остальные, наверное, на первом».
 *
 * Живёт здесь, а не в компоненте блока, потому что тем же расклад пользуется
 * FAQ страницы БЦ: два места, считающие этажи по-своему, разошлись бы, и
 * видимый блок противоречил бы разметке FAQPage.
 */
export function buildFloorGroups(organizations: TenantOrganizationView[]): FloorGroup[] {
  const counts = new Map<string, number>();
  for (const org of organizations) {
    if (!org.floor) continue;
    counts.set(org.floor, (counts.get(org.floor) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([floor, count]) => ({ floor, count }))
    .sort((a, b) => {
      // Числовые этажи по возрастанию, «цокольный»/«подвальный» — после них
      // по алфавиту: сравнение строк поставило бы 10-й этаж между 1-м и 2-м.
      const aNum = Number(a.floor);
      const bNum = Number(b.floor);
      const aIsNum = !Number.isNaN(aNum);
      const bIsNum = !Number.isNaN(bNum);
      if (aIsNum && bIsNum) return aNum - bNum;
      if (aIsNum) return -1;
      if (bIsNum) return 1;
      return a.floor.localeCompare(b.floor, 'ru');
    });
}

export function formatFloorLabel(floor: string): string {
  return `${floor} этаж`;
}
