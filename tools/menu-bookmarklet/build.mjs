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
  body { font: 16px/1.6 -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 17px; margin-top: 36px; }
  .lead { color: #555; margin-top: 0; }
  .drag { display: inline-block; padding: 12px 28px; border-radius: 999px; background: #d92d20; color: #fff; text-decoration: none; font-weight: 600; cursor: grab; }
  .step { display: flex; gap: 14px; margin: 18px 0; }
  .n { flex: 0 0 28px; height: 28px; border-radius: 50%; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
  .step div { flex: 1; }
  code, kbd { background: #f2f2f2; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
  .note { background: #f8f8f8; border-radius: 12px; padding: 16px 20px; margin-top: 12px; font-size: 14px; color: #444; }
  button { font: inherit; padding: 8px 18px; border-radius: 999px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
  details { margin-top: 10px; }
  summary { cursor: pointer; font-weight: 600; }
</style>

<h1>Закладка «Снять меню»</h1>
<p class="lead">Читает разделы каталога прямо со страницы поставщика — включая те,
что показываются только при наведении.</p>

<h2>Установка в Chrome</h2>

<div class="step"><div class="n">1</div><div>
  Если панели закладок не видно — <kbd>⌘+Shift+B</kbd> (на Windows <kbd>Ctrl+Shift+B</kbd>).
</div></div>

<div class="step"><div class="n">2</div><div>
  <b>Перетащите мышью эту кнопку вверх, на панель закладок</b> — туда, где остальные ваши закладки.<br><br>
  <a class="drag" href="${href.replace(/"/g, '&quot;')}">Снять меню</a>
</div></div>

<h2>Как пользоваться</h2>

<div class="step"><div class="n">1</div><div>Открыть сайт поставщика — лучше сразу страницу каталога.</div></div>
<div class="step"><div class="n">2</div><div>Нажать закладку «Снять меню» на панели.</div></div>
<div class="step"><div class="n">3</div><div>Появится окно с деревом разделов — нажать «Скопировать».</div></div>
<div class="step"><div class="n">4</div><div><b>Прислать текст в чат.</b> Админку открывать не нужно: закладка ничего никуда не отправляет, это проверочная версия.</div></div>

<details>
  <summary>Если пользуетесь Safari</summary>
  <div class="note">
    В Safari перетаскивание такой кнопки часто не срабатывает. Тогда так:
    <ol>
      <li>Нажмите кнопку ниже — код скопируется в буфер.</li>
      <li>В Safari: <kbd>⌘+D</kbd> на любой странице, сохранить в «Избранное», назвать «Снять меню».</li>
      <li>Меню «Закладки» → «Править закладки», найти её, вставить скопированный код в поле адреса.</li>
    </ol>
    <p><button id="copy">Скопировать код закладки</button></p>
  </div>
</details>

<div class="note">
  <b>Если ничего не нашлось</b> — меню на этом сайте нарисовано не ссылками.
  Тогда работает прежний способ: скриншот в карточке верификации.
  <br><br>
  <b>Если дерево кривое</b> (лишнее из подвала, странные пункты) — всё равно
  скопируйте и пришлите: по таким случаям и будет видно, что чинить.
</div>

<script>
  const CODE = document.querySelector('.drag').getAttribute('href');
  document.getElementById('copy').onclick = function () {
    navigator.clipboard.writeText(CODE).then(() => { this.textContent = 'Скопировано'; });
  };
</script>
</html>
`;

fs.writeFileSync(path.join(dir, 'install.html'), html);
console.log(`install.html готов, длина закладки ${href.length} символов`);
