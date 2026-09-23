import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { loadBcAnalytics } from './buildData';
import { tenantIndustryFromCategory } from './tenantCategories';
import { tenantIndustryLabel } from '../data/tenantIndustries';

// Городской срез арендаторов каталога БЦ: сколько организаций какой рубрики
// сидит в зданиях. Таблица считается SQL-функцией
// refresh_bc_tenant_city_categories() по СЫРЫМ рубрикам Яндекса — свёртка в
// отрасли живёт только здесь, на клиенте (см. подробный разбор «почему не в
// SQL» в начале lib/tenantCategories.ts: вторая копия правил в базе
// разошлась бы с долями на карточке отдельного БЦ, и заметить это было бы
// нечем).
//
// Строка в таблице ровно одна (id boolean, primary key, всегда true) —
// поэтому ни .range(), ни пагинации тут не нужно, в отличие от остальных
// городских выборок.

// В jsonb лежат тройки-массивы [рубрика, организаций, зданий], а не объекты
// — так их пишет SQL-функция.
type CategoryTuple = [string, number, number];

export interface TenantCitySlice {
  orgTotal: number;
  buildingTotal: number;
  /** Отрасли, по убыванию числа организаций. */
  industries: { industry: string; label: string; orgs: number; share: number }[];
  /** Сырые рубрики Яндекса, по убыванию — для блоков, где важна точность формулировки. */
  categories: { name: string; orgs: number; buildings: number }[];
  computedAt: string | null;
}

type TenantCityRow = {
  categories: unknown;
  org_total: number | null;
  building_total: number | null;
  computed_at: string | null;
};

export async function fetchTenantCitySlice(): Promise<TenantCitySlice | null> {
  // Файл сборки (src/lib/buildData.ts): ряд таблицы, как его отдал бы
  // PostgREST; в базу — только если файла нет.
  const fromBuild = (await loadBcAnalytics())?.tenantCity;
  if (fromBuild) return fromBuild.length ? sliceFromRow(fromBuild[0] as TenantCityRow) : null;
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_center_tenant_city_categories')
      .select('categories,org_total,building_total,computed_at')
      .maybeSingle();
    if (error) throw error;
    return data ? sliceFromRow(data as TenantCityRow) : null;
  });
}

// Порция рубрик между передачами потока браузеру. Рубрик в срезе ~2500, и
// каждая идёт через десятки больших регулярок tenantIndustryFromCategory:
// одним куском это 130+ мс на телефоне (отчёт PageSpeed страницы аналитики,
// 2026-09-23) — длинная задача прямо в окне TBT. Порциями по 150 ни одна
// не дотягивает до 50 мс даже при 4× замедлении процессора.
const ROWS_PER_SLICE = 150;
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Один разбор на оба источника — файл сборки и ответ базы.
async function sliceFromRow(data: TenantCityRow): Promise<TenantCitySlice> {
  const raw = (data.categories ?? []) as CategoryTuple[];

  const byIndustry = new Map<string, number>();
  const categories: TenantCitySlice['categories'] = [];
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && i % ROWS_PER_SLICE === 0) await yieldToBrowser();
    const row = raw[i];
    if (!Array.isArray(row) || row.length < 3) continue;
    const [name, orgs, buildings] = row;
    if (!name || !(orgs > 0)) continue;
    categories.push({ name, orgs, buildings });
    const industry = tenantIndustryFromCategory(name);
    byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + orgs);
  }
  // Итог считаем по фактически разобранным строкам, а не по org_total из
  // базы: в org_total входят и карточки, у которых рубрика пустая, и
  // доли от него не складывались бы в 100%.
  const counted = [...byIndustry.values()].reduce((s, n) => s + n, 0);
  const industries = [...byIndustry.entries()]
    .map(([industry, orgs]) => ({
      industry,
      label: tenantIndustryLabel(industry),
      orgs,
      share: counted > 0 ? Math.round((orgs / counted) * 100) : 0,
    }))
    .sort((a, b) => b.orgs - a.orgs);

  return {
    orgTotal: counted,
    buildingTotal: data.building_total ?? 0,
    industries,
    categories: categories.sort((a, b) => b.orgs - a.orgs),
    computedAt: data.computed_at ?? null,
  };
}
