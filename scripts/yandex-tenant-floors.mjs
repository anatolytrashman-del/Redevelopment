// Этаж организации внутри здания по Яндекс Картам.
//
// В тексте карточки из списка «Внутри» этаж есть не всегда: у Galleria Minsk
// из 313 организаций подпись с этажом была у 245, и формат двоякий — «этаж 2»
// на странице дома и «2 этаж» в плитках вкладки «Внутри». Надёжный источник —
// собственная карточка организации: у всего, что стоит на поэтажном плане ТЦ,
// там есть businessProperties.level — номер уровня плана, тот же, что на
// переключателе этажей на карте (проверено 2026-09-24 на 12 организациях
// Galleria без подписи: уровень нашёлся у всех 12, включая −1).
// Поэтому: сначала текст карточки, и только для оставшихся — карточка
// организации, по одному запросу на каждую.

const MINUS_RE = /[−–—]/g;

/** Номер этажа из текста карточки: «этаж 2», «2 этаж», «этаж −1», «цокольный этаж». */
export function floorFromText(rawText) {
  const text = String(rawText ?? '').replace(MINUS_RE, '-');
  const after = text.match(/этаж\s+(-?\d{1,2})(?![\d])/iu);
  if (after) return after[1];
  const before = text.match(/(?:^|\s)(-?\d{1,2})\s+этаж(?![\p{L}])/iu);
  if (before) return before[1];
  if (/цокол\p{L}*\s+этаж|этаж\s+цокол/iu.test(text)) return 'цокольный';
  return null;
}

// state-view — JSON состояния страницы, который Яндекс кладёт в HTML.
function pageState(html) {
  const match = html.match(/<script type="application\/json" class="state-view">(.*?)<\/script>/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function ownItem(html, orgId) {
  const state = pageState(html);
  const items = state?.stack?.[0]?.results?.items ?? [];
  return items.find((candidate) => String(candidate?.id) === String(orgId)) ?? null;
}

/**
 * Уровень плана из HTML карточки организации. Берём ровно карточку с этим id:
 * на странице есть и соседние организации («Похожие места»), у них свои уровни.
 */
export function levelFromOrgHtml(html, orgId) {
  const item = ownItem(html, orgId);
  if (!item) return null;
  const level = item.businessProperties?.level;
  if (typeof level === 'string' && level.trim()) return level.trim().replace(MINUS_RE, '-');
  return floorFromText(item.additionalAddress);
}

/**
 * Точка организации [долгота, широта] из её карточки. У магазинов с
 * поэтажного плана ТЦ это место самого магазина внутри здания, а не общая
 * точка дома (проверено 2026-09-24 на «Европе»: Denny Rose и Lakbi на 3 этаже
 * в 46 м друг от друга) — из этих точек рисуется наша схема этажа.
 */
export function coordsFromOrgHtml(html, orgId) {
  const coords = ownItem(html, orgId)?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lon, lat] = coords.map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

export const isCaptchaHtml = (html) => /showcaptcha|checkcaptcha|SmartCaptcha/.test(html) && !/class="state-view"/.test(html);

/**
 * Проставляет floor каждой организации: из текста, а у кого там пусто — из её
 * карточки. fetchHtml(url) отдаёт HTML; onCaptcha(url) вызывается, если вместо
 * карточки пришла проверка, и должен вернуть true, если можно повторить
 * (человек прошёл её в браузере), или false — тогда обход останавливается, а
 * уже найденное сохраняется. Уже заполненный floor не трогаем.
 */
export async function fillTenantFloors(organizations, { fetchHtml, onCaptcha = async () => false, delay = async () => {}, log = () => {}, withCoords = false }) {
  const stats = { fromText: 0, fromCard: 0, kept: 0, missing: 0, coords: 0, stopped: false };
  const result = organizations.map((organization) => {
    if (organization.floor) {
      stats.kept += 1;
      return organization;
    }
    const floor = floorFromText(organization.rawText);
    if (floor) stats.fromText += 1;
    return floor ? { ...organization, floor } : { ...organization };
  });
  // withCoords: в карточку идём и за точкой магазина — то есть ко всем, у
  // кого её ещё нет, даже если этаж уже известен по тексту.
  const needsCard = (organization) => !organization.floor || (withCoords && !organization.coords);
  const pending = result.filter((organization) => needsCard(organization) && organization.sourceId && organization.sourceUrl);
  if (pending.length > 0) log(`  ${withCoords ? 'этаж и точка' : 'этаж'} по карточкам: ${pending.length} организаций`);
  for (const [index, organization] of pending.entries()) {
    const url = organization.sourceUrl.replace(/\/(?:inside|reviews|photos|menu|prices)\/?$/, '/');
    let html = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      html = await fetchHtml(url).catch(() => null);
      if (!html || !isCaptchaHtml(html)) break;
      if (!(await onCaptcha(url))) {
        stats.stopped = true;
        break;
      }
    }
    if (stats.stopped) break;
    const level = html && !organization.floor ? levelFromOrgHtml(html, organization.sourceId) : null;
    if (level) {
      organization.floor = level;
      stats.fromCard += 1;
    }
    const coords = html && withCoords ? coordsFromOrgHtml(html, organization.sourceId) : null;
    if (coords) {
      organization.coords = coords;
      stats.coords += 1;
    }
    if ((index + 1) % 25 === 0) log(`    ${index + 1}/${pending.length}`);
    await delay();
  }
  stats.missing = result.filter((organization) => !organization.floor).length;
  return { organizations: result, stats };
}
