// Реестр изданий для блока «СМИ о здании» (владелец, 2026-09-20: «в блок
// ставим логотип СМИ (в png и без фона), заголовок статьи, дату статьи»).
//
// Почему реестр, а не поле в строке публикации: одно издание пишет про десятки
// зданий, и логотип у него один. Храни мы картинку рядом с каждой публикацией
// — она размножилась бы по всей базе, а замена логотипа превратилась бы в
// обход 141 карточки. Здесь же добавление нового издания — одна строка плюс
// один PNG в public/media-logos/.
//
// Логотипы лежат СВОИМИ файлами, а не ссылками на сайт издания: горячая
// ссылка на чужой сервер отвалится при первом же редизайне их сайта и утечёт
// реферером, кто именно на них ссылается.

// Ключ — домен второго уровня (см. outletDomain ниже), а не полный хост:
// realt.onliner.by и money.onliner.by — один и тот же Onliner с одним
// логотипом.
export interface MediaOutletBrand {
  // Как называть издание, если логотипа нет или картинка не загрузилась.
  name: string;
  // Путь к прозрачному PNG в public/. null — логотипа у нас нет, в блоке
  // вместо картинки показывается name текстом (так и задумано: подборка не
  // должна ждать, пока найдётся очередной логотип).
  logo: string | null;
}

const OFFICE_LIFE: MediaOutletBrand = { name: 'Office Life', logo: '/media-logos/officelife.png' };

export const mediaOutlets: Record<string, MediaOutletBrand> = {
  'belta.by': { name: 'БелТА', logo: '/media-logos/belta.png' },
  'onliner.by': { name: 'Onliner', logo: '/media-logos/onliner.png' },
  'realt.by': { name: 'Realt.by', logo: '/media-logos/realt.png' },
  // Office Life переехал с officelife.media на officelife.by (старый домен
  // отдаёт 301). Ссылки в подборках остались на обоих, поэтому в реестре
  // оба ключа — иначе у части публикаций пропал бы логотип.
  'officelife.by': OFFICE_LIFE,
  'officelife.media': OFFICE_LIFE,
};

// Домены, у которых значащая часть — три уровня, а не два. Пусто до первого
// реального случая: гадать заранее, какой из будущих источников окажется на
// co.uk или com.by, смысла нет, а лишние правила ломают простые домены.
const threeLevelDomains: string[] = [];

/**
 * Домен-ключ реестра из ссылки на публикацию: `https://realt.onliner.by/...`
 * → `onliner.by`. Возвращает пустую строку для мусорной ссылки — вызывающий
 * код тогда просто не найдёт бренд и покажет название издания текстом.
 */
export function outletDomain(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
  host = host.replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastThree = parts.slice(-3).join('.');
  if (threeLevelDomains.some((d) => lastThree.endsWith(d))) return lastThree;
  return parts.slice(-2).join('.');
}

export function outletBrand(url: string): MediaOutletBrand | null {
  return mediaOutlets[outletDomain(url)] ?? null;
}
