#!/usr/bin/env node
// Собирает bookmarklet.js в страницу установки: ссылку, которую нужно
// перетащить на панель закладок. Минификации нет намеренно — переносы строк
// в javascript:-адресе кодируются как %0A и прекрасно работают, зато закладку
// можно в любой момент прочитать и понять, что она делает.
//
//   node tools/menu-bookmarklet/build.mjs
//   → tools/menu-bookmarklet/install.html
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'tools/menu-bookmarklet');
// Из исходника вырезаем блочные комментарии и отступы: закладка длиной
// 23 тысячи символов формально работает, но такую строку неприятно и
// вставлять руками, и отлаживать. Переносы строк остаются.
const src = fs.readFileSync(path.join(dir, 'bookmarklet.js'), 'utf8');
const min = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .join('\n');
fs.writeFileSync(path.join(dir, 'bookmarklet.min.js'), min);
const href = 'javascript:' + encodeURIComponent(min);

const html = `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<title>Закладка «Снять меню»</title>
<style>
  body { font: 16px/1.6 -apple-system, Segoe UI, Roboto, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 22px; }
  .drag { display: inline-block; margin: 16px 0; padding: 12px 24px; border-radius: 999px; background: #d92d20; color: #fff; text-decoration: none; font-weight: 600; }
  ol { padding-left: 20px; }
  li { margin: 8px 0; }
  code { background: #f2f2f2; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
  .note { background: #f8f8f8; border-radius: 12px; padding: 16px 20px; margin-top: 28px; font-size: 14px; color: #444; }
</style>

<h1>Закладка «Снять меню»</h1>
<p>Читает разделы каталога прямо со страницы поставщика — включая те, что
показываются только при наведении. Ничего никуда не отправляет: показывает
дерево, даёт скопировать или скачать файлом.</p>

<p><b>Перетащите эту кнопку на панель закладок:</b></p>
<p><a class="drag" href="${href.replace(/"/g, '&quot;')}">Снять меню</a></p>

<ol>
  <li>Если панели закладок не видно — <code>Ctrl+Shift+B</code> (на Mac <code>⌘+Shift+B</code>).</li>
  <li>Откройте сайт поставщика — лучше сразу страницу каталога.</li>
  <li>Нажмите закладку «Снять меню».</li>
  <li>Появится окно с деревом разделов — «Скопировать» или «Скачать .txt».</li>
</ol>

<div class="note">
  <b>Если ничего не нашлось</b> — значит меню на этом сайте нарисовано не
  ссылками (картинкой или скриптом без адресов). Тогда работает прежний
  способ: скриншот в карточке верификации.
  <br><br>
  <b>Если дерево кривое</b> (много лишнего из подвала, странные пункты) —
  всё равно скопируйте: по таким случаям и будет видно, что чинить.
</div>
</html>
`;

fs.writeFileSync(path.join(dir, 'install.html'), html);
console.log(`install.html готов, длина закладки ${href.length} символов`);
