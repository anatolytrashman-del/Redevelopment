// Скриншоты каталога поставщика, загруженные вручную при верификации
// (вкладка Закупки → Верификация). Владелец, 2026-09-14: «я уже понял, что
// твой автоматический анализ сайта работает хуёво, мы будем верифицировать
// каждого поставщика вручную, загружая скрины. Нужно какое-то решение,
// чтобы скрины массово грузить, чтобы потом движок их анализировал».
//
// Зачем вообще: краулер (supplier_site_snapshots) ломается тремя разными
// способами — меню есть в тексте, но не разобралось в разделы (aviastal.ru,
// 77volt.ru); ушёл в сотни фильтров одного раздела и не дошёл до соседних
// вкладок (3dplitka.ru); сайт закрыт капчей или рисует меню скриптом
// (169.ru). Скрин закрывает все три случая разом.
//
// Строка — на ДОМЕН, как и снимок сайта: разделы принадлежат сайту компании,
// а не конкретной карточке-предложению (у одной компании их несколько, по
// одной на категорию закупки).
//
// Важное про роли: скрин даёт только РАЗДЕЛЫ, а не категории. Расшифровка
// ложится в снимок как manual://-разделы (review.mjs sections), и уже по ним
// категории присваиваются с обязательной уликой. Иначе вернулась бы та же
// выдумка категорий, что и у старого автоклассификатора, только через
// картинки.
export const SUPPLIER_SCREENSHOTS_BUCKET = 'supplier-screenshots';

export type SupplierScreenshotStatus = 'pending' | 'done' | 'skipped';

export interface SupplierScreenshot {
  id: string;
  host: string;
  storagePath: string;
  publicUrl: string;
  uploadedAt: string;
  status: SupplierScreenshotStatus;
  // Что модель прочитала с картинки (заполняет разбор в сессии, см.
  // scripts/supply-categories/screenshots.mjs). Хранится, чтобы владелец мог
  // проверить расшифровку глазами, а не доверять ей вслепую.
  transcript: string;
  processedAt: string | null;
  note: string;
}

export interface SupplierScreenshotRow {
  id: string;
  host: string;
  storage_path: string;
  public_url: string;
  uploaded_at: string;
  status: string;
  transcript: string | null;
  processed_at: string | null;
  note: string | null;
}
