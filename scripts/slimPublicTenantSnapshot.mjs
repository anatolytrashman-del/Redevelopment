// Ужимает снимок арендаторов для публичного /data/bc/<slug>.extra.json.
//
// В jsonb сборе лежат поля, которые карточка не читает (buildingUrl,
// buildingAddress — один и тот же адрес на каждую организацию) и rawText,
// нужный только когда этаж ещё не вынесен в org.floor. У «Замка» это
// ~205 → ~93 КБ tenants и столько же меньше ожидания до createRoot
// (main.tsx ждёт .extra вместе с остальными файлами раздела).

const KEEP_ALWAYS = ['name', 'sourceId', 'sourceUrl', 'category', 'rating', 'reviewCount', 'floor', 'coords'];
const RAW_TEXT_HINT = /офис|помещение|секция|кабинет|подъезд/i;

/** @param {unknown} org */
export function slimPublicTenantOrganization(org) {
  if (!org || typeof org !== 'object') return org;
  /** @type {Record<string, unknown>} */
  const src = org;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of KEEP_ALWAYS) {
    const value = src[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  const floor = typeof src.floor === 'string' ? src.floor.trim() : '';
  const rawText = typeof src.rawText === 'string' ? src.rawText : '';
  // Этажа нет — разбираем placement из rawText (parseTenantPlacement).
  // Этаж есть, но в rawText ещё офис/секция — оставляем, иначе теряем
  // «помещение 22» при уже известном этаже.
  if (rawText && (!floor || RAW_TEXT_HINT.test(rawText))) out.rawText = rawText;
  return out;
}

/** @param {unknown} tenants */
export function slimPublicTenantSnapshot(tenants) {
  if (!tenants || typeof tenants !== 'object') return tenants;
  /** @type {Record<string, unknown>} */
  const row = { ...tenants };
  if (Array.isArray(row.organizations)) {
    row.organizations = row.organizations.map(slimPublicTenantOrganization);
  }
  return row;
}

/** @param {unknown} extra */
export function slimPublicExtraFile(extra) {
  if (!extra || typeof extra !== 'object') return extra;
  /** @type {Record<string, unknown>} */
  const out = { ...extra };
  if (out.tenants) out.tenants = slimPublicTenantSnapshot(out.tenants);
  return out;
}
