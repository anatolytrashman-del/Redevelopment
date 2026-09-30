// Карточка ТЦ, которую выбрал человек, когда автоматический поиск её не нашёл
// (владелец, 2026-09-29: «не нравится открывать руками список организаций»).
// Человек только открывает карточку здания в окне Chrome — дальше скрипты
// сами идут во вкладки «Внутри» и «Отзывы». Выбор запоминается в
// tmp/yandex-org-picked.json: шаг отзывов берёт ту же карточку и больше
// ничего не спрашивает, повторный прогон — тоже.

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('tmp/yandex-org-picked.json');

// /maps/org/<seoname>/<id>/… или /maps/org/<id>/… → { id, seoname }.
export function orgFromUrl(url) {
  const match = String(url ?? '').match(/\/org\/(?:([^/?#]+)\/)?(\d{5,})(?:[/?#]|$)/);
  if (!match) return null;
  return { id: match[2], seoname: match[1] ?? null, name: null, picked: true };
}

export function loadPickedOrgs() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function savePickedOrg(slug, org) {
  const all = loadPickedOrgs();
  all[slug] = { id: org.id, seoname: org.seoname ?? null };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(all, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
}

// Выбор, который совпал с карточкой другого здания (человек нажал Enter, пока
// в окне ещё была открыта предыдущая карточка, 2026-09-29), не считается.
export function pickedOrgFor(slug) {
  const all = loadPickedOrgs();
  const saved = all[slug];
  if (!saved) return null;
  const clash = Object.entries(all).some(([other, org]) => other !== slug && String(org.id) === String(saved.id));
  if (clash) return null;
  return { id: String(saved.id), seoname: saved.seoname ?? null, name: null, picked: true };
}

// Поиск здания в окне Chrome: человеку остаётся нажать на нужный результат.
export function searchUrlFor(entry, cityPath = '157/minsk') {
  const text = [entry.name, entry.address].filter(Boolean).join(' ').replace(/[«»"]/g, ' ');
  return `https://yandex.by/maps/${cityPath}/search/${encodeURIComponent(text)}/`;
}

// Без seoname в адресе: у карточки ALL (seoname «all») Яндекс отдаёт 404 на
// /maps/org/all/<id>/…, а /maps/org/<id>/… открывается.
export function withoutSeoname(org) {
  return { ...org, seoname: null };
}
