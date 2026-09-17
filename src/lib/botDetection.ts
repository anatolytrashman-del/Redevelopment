// Единый признак «это не человек» — им пользуются и счётчик «N онлайн»
// (onlinePresence.ts), и инициализация Метрики/VK-пикселя в index.html.
//
// Почему два места. Счётчики стоят инлайном в <head> и срабатывают ДО
// загрузки бандла, поэтому сама проверка продублирована там же на голом JS
// (файл-близнец, см. правило про близнецов в CLAUDE.md). Чтобы решение всё
// же было ОДНО, index.html кладёт результат в window.__isLikelyBot, а этот
// модуль сначала смотрит на флаг и считает сам только если его нет
// (юнит-тесты, пререндер, странный порядок загрузки). Правится регулярка —
// правится в обоих файлах: разойдутся — «онлайн» и «Показатели» начнут
// считать разную аудиторию, а понять это по цифрам нельзя.
//
// Headless-браузеры (Playwright/Puppeteer/Selenium — на них работает
// большинство ИИ-агентов и скрейперов, выполняющих JS страницы) выставляют
// navigator.webdriver в true; обычный браузер человека — никогда. Плюс явные
// строки UA известных ботов и AI-краулеров, которые тоже рендерят JS (значит
// без этой проверки попадали бы и в presence, и в визиты Метрики). Не
// претендует на 100% точность — убирает основной шум.
export const BOT_UA_PATTERN =
  /bot|spider|crawl|slurp|headless|puppeteer|playwright|selenium|phantomjs|gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|ccbot|perplexitybot|bytespider|petalbot|mj12bot|dotbot|ahrefsbot|semrushbot|facebookexternalhit|telegrambot|discordbot|whatsapp/i;

export function isLikelyBot(): boolean {
  // globalThis, а не window: в браузере это один и тот же объект (index.html
  // пишет флаг именно в window), а в тестах/ноде window может не быть вовсе.
  const flag = (globalThis as { __isLikelyBot?: boolean }).__isLikelyBot;
  if (typeof flag === 'boolean') return flag;
  if (typeof navigator === 'undefined') return false;
  if (navigator.webdriver) return true;
  return BOT_UA_PATTERN.test(navigator.userAgent);
}
