import { legacyCatalogEnv } from './_osnovaEnv.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeSearch(s) {
  if (typeof s !== 'string') return '';
  let t = s.replace(/[,() *%\\'"`]/g, ' ').trim();
  if (t.length > 100) t = t.slice(0, 100);
  return t.trim();
}

export const LEGACY_METHOD = 'GET';

const LEGACY_SELECT = 'id,name,inn,website_url,city,phone,email';
const LEGACY_PAGE = 1000; // PostgREST max-rows по умолчанию

// Только чтение (GET) public.suppliers старого проекта: без удалённых и заблокированных.
export async function fetchLegacySuppliers({ search, ids, limit } = {}) {
  const legacy = legacyCatalogEnv();
  if (!legacy) {
    return { available: false, rows: [] };
  }
  try {
    const params = [`select=${LEGACY_SELECT}`, 'deleted_at=is.null', 'blocked_at=is.null', 'order=name.asc,id.asc'];
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const valid = ids.filter((x) => UUID_RE.test(String(x)));
      if (!valid.length) return { available: true, rows: [] };
      params.push(`id=in.(${valid.join(',')})`);
    }
    if (search) {
      const s = sanitizeSearch(search);
      if (s) {
        const like = `*${encodeURIComponent(s)}*`;
        params.push(`or=(name.ilike.${like},inn.ilike.${like},city.ilike.${like})`);
      }
    }
    const total = Math.min(2000, Math.max(1, Number(limit) || 2000));
    const rows = [];
    for (let off = 0; off < total; off += LEGACY_PAGE) {
      const lim = Math.min(LEGACY_PAGE, total - off);
      const url = `${legacy.url}/rest/v1/suppliers?${params.join('&')}&limit=${lim}&offset=${off}`;
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      let res;
      try {
        res = await fetch(url, {
          method: LEGACY_METHOD,
          headers: {
            apikey: legacy.serviceKey,
            Authorization: `Bearer ${legacy.serviceKey}`,
            Accept: 'application/json',
          },
          signal: ac.signal,
        });
      } finally {
        clearTimeout(t);
      }
      if (!res.ok) return { available: false, rows: [] };
      const page = await res.json().catch(() => []);
      if (!Array.isArray(page)) return { available: false, rows: [] };
      rows.push(...page);
      if (page.length < lim) break;
    }
    return { available: true, rows };
  } catch {
    return { available: false, rows: [] };
  }
}

export function mergeSuppliers(clientRows, legacyRows, { search, limit = 50, offset = 0 } = {}) {
  const byRef = new Map();
  const lim = Math.max(1, Math.min(100, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);

  // clientRows: from rpc, may have catalog with nulls + added
  for (const c of (clientRows || [])) {
    if (!c || !c.ref) continue;
    byRef.set(c.ref, { ...c, notes: c.notes || [], prices: c.prices || [] });
  }

  // legacy rows -> map to catalog shape
  for (const l of (legacyRows || [])) {
    if (!l || !l.id) continue;
    const ref = `catalog:${l.id}`;
    const leg = {
      ref,
      id: l.id,
      name: l.name || null,
      inn: l.inn || null,
      website_url: l.website_url || null,
      city: l.city || null,
      phone: l.phone || null,
      email: l.email || null,
      source: 'catalog',
      moderation_status: null,
      notes: [],
      prices: [],
    };
    const exist = byRef.get(ref);
    if (exist && exist.source === 'catalog') {
      // keep client's notes/prices, but fill details from legacy if client had null
      byRef.set(ref, {
        ...leg,
        notes: exist.notes || [],
        prices: exist.prices || [],
      });
    } else {
      byRef.set(ref, leg);
    }
  }

  let all = Array.from(byRef.values());

  // filter added when search
  const s = search ? String(search).toLowerCase() : null;
  all = all.filter((r) => {
    if (r.source !== 'catalog') {
      if (!s) return true;
      const hay = [r.name, r.inn, r.city].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(s);
    }
    return true;
  });

  // client catalog rows (source catalog, name null) kept only if !search
  if (s) {
    all = all.filter((r) => !(r.source === 'catalog' && (r.name == null)));
  }

  // dedupe by ref (already map)
  // sort by name locale ru, nulls last
  all.sort((a, b) => {
    const na = a.name || '';
    const nb = b.name || '';
    if (!na && !nb) return 0;
    if (!na) return 1;
    if (!nb) return -1;
    return na.localeCompare(nb, 'ru');
  });

  const total = all.length;
  const page = all.slice(off, off + lim);
  return { suppliers: page, total };
}
