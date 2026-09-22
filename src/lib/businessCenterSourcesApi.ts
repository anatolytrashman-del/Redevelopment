import { supabase } from './supabase';
import { withRetry } from './withRetry';
import { businessCenterHomepageUrl } from './businessCenterDisplay';

export interface SourceSite {
  label: string;
  href: string;
}

interface SourceSiteRow {
  website: string | null;
  developer_info: { website: string | null } | null;
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

// Общий каталожный список сайтов зданий и застройщиков для попапа
// «Источники» (владелец, 2026-09-22: одним общим списком, без привязки к
// конкретному БЦ на его же странице — так видно масштаб охвата, а не то,
// что именно этот застройщик дал заметную долю данных). Дедуплицируется по
// хосту: у одного застройщика несколько зданий — сайт в списке один раз.
export async function fetchCatalogSiteSources(): Promise<SourceSite[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('business_centers')
      .select('website, developer_info')
      .range(0, 999);
    if (error) throw error;
    const rows = (data ?? []) as SourceSiteRow[];
    const byHost = new Map<string, SourceSite>();
    for (const row of rows) {
      const centerHref = businessCenterHomepageUrl(row.website);
      if (centerHref) {
        const host = new URL(centerHref).host.replace(/^www\./, '');
        byHost.set(host, { href: centerHref, label: host });
      }
      const dev = normalizeDeveloperUrl(row.developer_info?.website ?? null);
      if (dev) byHost.set(dev.label, dev);
    }
    return [...byHost.values()].sort((a, b) => a.label.localeCompare(b.label));
  });
}
