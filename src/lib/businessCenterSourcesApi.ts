import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { businessCenterHomepageUrl } from './businessCenterDisplay';
import { BLOCKED_SOURCE_HOSTS, STATIC_SOURCE_HOSTS } from '../data/businessCenterSources';
import { outletBrand, outletDomain } from '../data/mediaOutlets';

export interface SourceSite {
  label: string;
  href: string;
}

interface SourceSiteRow {
  website: string | null;
  developer_info: { website: string | null } | null;
  media_mentions: { url?: string | null; outlet?: string | null }[] | null;
  building_facts: { sourceUrl?: string | null }[] | null;
}

export interface CatalogSources {
  // Сайты самих зданий и их застройщиков.
  sites: SourceSite[];
  // СМИ и прочие публикации, на которые ссылаются карточки зданий:
  // подборка «СМИ о здании» и ссылки-подтверждения у фактов о здании.
  publications: SourceSite[];
}

// Сайт застройщика — обычно ДРУГОЙ домен, чем сайт самого БЦ (см. комментарий
// в BusinessCenterDetailPage.tsx), и для него нет проверенного списка
// исключений BUSINESS_CENTER_WEBSITE_OVERRIDES — та таблица заведена под
// сайты именно зданий. Разбор здесь намеренно копирует ту же нормализацию
// (без overrides), что уже стоит инлайном в BusinessCenterDetailPage.tsx.
function normalizeDeveloperUrl(raw: string | null | undefined): SourceSite | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { href: `${url.protocol}//${url.host}/`, label: url.host.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

// Домен второго уровня — ключ, по которому издание считается одним и тем
// же источником: realt.onliner.by и money.onliner.by — один Onliner, а не
// два (та же нормализация, что у логотипов в src/data/mediaOutlets.ts).
export function secondLevelHost(host: string): string {
  const parts = host.replace(/^www\./, '').split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : parts.join('.');
}

/**
 * Ссылка из карточки здания → строка списка «СМИ и публикации», либо null,
 * если её там быть не должно. Вынесено отдельной функцией и покрыто тестом:
 * правил отсева здесь больше, чем видно с первого взгляда, а ошибка в любом
 * из них выводит лишний домен на публичную страницу.
 */
export function publicationSource(
  rawUrl: string | null | undefined,
  outlet: string | null | undefined,
  siteHosts: Set<string>,
): { key: string; site: SourceSite } | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;
  const key = outletDomain(trimmed);
  // Постоянные источники уже названы в DATA_SOURCE_GROUPS поимённо и с
  // описанием — второй строкой без описания они бы только путали.
  if (!key || STATIC_SOURCE_HOSTS.has(key)) return null;
  // Экстремистские ресурсы не публикуем — см. BLOCKED_SOURCE_HOSTS.
  if (BLOCKED_SOURCE_HOSTS.has(key)) return null;
  // Сайт самого БЦ или застройщика, попавший в ссылку у факта, — не
  // издание: он уже есть в списке сайтов. Сверяем по домену второго
  // уровня, потому что сайт здания бывает на поддомене (absheron.ibiz.by).
  if (siteHosts.has(key)) return null;
  let fullHost: string;
  try {
    fullHost = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  // Ключ дедупликации — второй уровень, а ПОКАЗЫВАЕМ полный хост:
  // darriuss.livejournal.com — конкретный блог, ссылка на «livejournal.com»
  // увела бы читателя не туда. У известных изданий вместо хоста — название
  // из реестра («БелТА», а не «belta.by»).
  const label = outletBrand(trimmed)?.name ?? outlet?.trim() ?? fullHost;
  return { key, site: { href: `https://${fullHost}/`, label } };
}

// Общий каталожный список сайтов зданий и застройщиков плюс изданий, на
// которые ссылаются карточки, для попапа «Источники» (владелец, 2026-09-22:
// одним общим списком, без привязки к конкретному БЦ на его же странице —
// так видно масштаб охвата, а не то, что именно этот застройщик дал
// заметную долю данных). Дедуплицируется по хосту: у одного застройщика
// несколько зданий — сайт в списке один раз.
export async function fetchCatalogSiteSources(): Promise<CatalogSources> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_centers')
      .select('website, developer_info, media_mentions, building_facts')
      .range(0, 999);
    if (error) throw error;
    const rows = (data ?? []) as SourceSiteRow[];
    const byHost = new Map<string, SourceSite>();
    const pubsByHost = new Map<string, SourceSite>();

    // Сайт, уже названный в постоянном списке (bir.by у Минск Мира, t-s.by
    // у «Твоей столицы»), второй раз строкой без описания не показываем.
    const addSite = (site: SourceSite | null) => {
      if (!site) return;
      if (STATIC_SOURCE_HOSTS.has(secondLevelHost(site.label))) return;
      byHost.set(site.label, site);
    };

    for (const row of rows) {
      const centerHref = businessCenterHomepageUrl(row.website);
      if (centerHref) {
        const host = new URL(centerHref).host.replace(/^www\./, '');
        addSite({ href: centerHref, label: host });
      }
      addSite(normalizeDeveloperUrl(row.developer_info?.website ?? null));
    }

    // Домены второго уровня уже собранных сайтов зданий/застройщиков.
    const siteHosts = new Set([...byHost.keys()].map(secondLevelHost));

    const addPublication = (rawUrl: string | null | undefined, outlet?: string | null) => {
      const found = publicationSource(rawUrl, outlet, siteHosts);
      if (found && !pubsByHost.has(found.key)) pubsByHost.set(found.key, found.site);
    };

    // Публикации разбираем ВТОРЫМ проходом, когда сайты зданий и
    // застройщиков уже собраны целиком: иначе ссылка на сайт здания из
    // карточки другого БЦ успела бы попасть в «издания» до того, как этот
    // сайт нашёлся в своей собственной строке. Сначала ВСЕ публикации в
    // СМИ и только потом ссылки у фактов: у первых есть название издания
    // («Архитектура и строительство»), у вторых — только домен, а
    // показывается то, что попало в список первым.
    for (const row of rows) {
      for (const mention of row.media_mentions ?? []) addPublication(mention?.url, mention?.outlet);
    }
    for (const row of rows) {
      for (const fact of row.building_facts ?? []) addPublication(fact?.sourceUrl);
    }

    const byLabel = (a: SourceSite, b: SourceSite) => a.label.localeCompare(b.label, 'ru');
    return {
      sites: [...byHost.values()].sort(byLabel),
      publications: [...pubsByHost.values()].sort(byLabel),
    };
  });
}
