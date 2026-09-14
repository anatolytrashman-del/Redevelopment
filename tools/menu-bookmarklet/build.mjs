#!/usr/bin/env node
// Собирает закладки в одну страницу установки: кнопки, которые нужно
// перетащить на панель закладок. Минификации нет намеренно — переносы строк
// в javascript:-адресе кодируются как %0A и прекрасно работают, зато закладку
// можно в любой момент прочитать и понять, что она делает.
//
// Закладок две (вторая с 2026-09-14):
//   bookmarklet.js — «Снять меню»: дерево разделов каталога;
//   contacts.js    — «Снять контакт»: телефон/почта/мессенджер по клику.
// Обе шлют снятое в открывшую вкладку админки (lib/menuCaptureReceiver.ts).
//
//   node tools/menu-bookmarklet/build.mjs
//   → tools/menu-bookmarklet/install.html
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'tools/menu-bookmarklet');

// Из исходника вырезаем блочные комментарии и отступы: закладка длиной
// 23 тысячи символов формально работает, но такую строку неприятно и
// вставлять руками, и отлаживать. Переносы строк остаются.
function build(name) {
  const src = fs.readFileSync(path.join(dir, `${name}.js`), 'utf8');
  const min = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  fs.writeFileSync(path.join(dir, `${name}.min.js`), min);
  return 'javascript:' + encodeURIComponent(min);
}

const menuHref = build('bookmarklet');
const contactsHref = build('contacts');
const esc = (s) => s.replace(/"/g, '&quot;');

const html = `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<title>Закладки для верификации поставщиков</title>
<style>
  body { font: 16px/1.6 -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 17px; margin-top: 36px; }
  .lead { color: #555; margin-top: 0; }
  .drag { display: inline-block; padding: 12px 28px; border-radius: 999px; background: #d92d20; color: #fff; text-decoration: none; font-weight: 600; cursor: grab; }
  .drag.second { background: #111; }
  .step { display: flex; gap: 14px; margin: 18px 0; }
  .n { flex: 0 0 28px; height: 28px; border-radius: 50%; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
  .step div { flex: 1; }
  code, kbd { background: #f2f2f2; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
  .note { background: #f8f8f8; border-radius: 12px; padding: 16px 20px; margin-top: 12px; font-size: 14px; color: #444; }
  button { font: inherit; padding: 8px 18px; border-radius: 999px; border: 1px solid #ddd; background: #fff; cursor: pointer; }
  details { margin-top: 10px; }
  summary { cursor: pointer; font-weight: 600; }
</style>

<h1>Закладки для верификации поставщиков</h1>
<p class="lead">Две кнопки на панели закладок. Обе снимают данные прямо со страницы
поставщика и отправляют их в открытую вкладку админки — переписывать руками ничего не нужно.</p>

<h2>Установка в Chrome</h2>

<div class="step"><div class="n">1</div><div>
  Если панели закладок не видно — <kbd>⌘+Shift+B</kbd> (на Windows <kbd>Ctrl+Shift+B</kbd>).
</div></div>

<div class="step"><div class="n">2</div><div>
  <b>Перетащите мышью обе кнопки вверх, на панель закладок.</b> Если такие кнопки
  там уже есть — сначала удалите старые (правой кнопкой → «Удалить»), иначе
  сработает прежняя версия.<br><br>
  <a class="drag" href="${esc(menuHref)}">Снять меню</a>
  &nbsp;&nbsp;
  <a class="drag second" href="${esc(contactsHref)}">Снять контакт</a>
</div></div>

<h2>Как пользоваться</h2>

<div class="step"><div class="n">1</div><div>
  В админке — «Закупки» → «Верификация» → <b>«Начать верификацию»</b>. Сайт поставщика
  откроется соседней вкладкой. Важно открывать его именно так: закладки отправляют
  снятое в ту вкладку, из которой сайт открыли.
</div></div>
<div class="step"><div class="n">2</div><div>
  <b>«Снять меню»</b> — нажать на панели закладок. Появится зелёное уведомление
  «Меню снято: N разделов». Поставщик уйдёт в блок «ждут распознавания» — так и надо.
</div></div>
<div class="step"><div class="n">3</div><div>
  <b>«Снять контакт»</b> — нажать на панели, внизу появится чёрная плашка.
  Дальше кликать по телефону, почте, значку Telegram/WhatsApp/Max. Ссылки при этом
  <b>не открываются</b> — значение уходит в карточку. Если номер просто текстом и
  клик берёт не то — <b>выделите его мышью</b>, снимется сразу. Выход — <kbd>Esc</kbd>
  или «Готово».
</div></div>
<div class="step"><div class="n">4</div><div>
  Вернуться во вкладку админки. Пустые поля карточки уже заполнены снятым. Если
  снятое <b>не совпало</b> с тем, что было в карточке, — оно показано отдельным
  жёлтым блоком с кнопками «Заменить» / «Не надо»: само ничего не затирается.
</div></div>

<div class="note">
  <b>Уведомление красное, «Админка не ответила»</b> — обновите вкладку админки
  (<kbd>⌘+Shift+R</kbd>) и попробуйте ещё раз.
  <br><br>
  <b>«Сайт открыт не из карточки»</b> — сайт открыли вручную (адресной строкой или
  из истории). Закройте вкладку и откройте сайт кнопкой из карточки верификации.
  <br><br>
  <b>Меню не нашлось</b> — на этом сайте оно нарисовано не ссылками. Работает прежний
  способ: скриншот, вставить в карточку через <kbd>⌘+V</kbd>.
</div>

<details>
  <summary>Если пользуетесь Safari</summary>
  <div class="note">
    В Safari перетаскивание таких кнопок часто не срабатывает. Тогда так:
    <ol>
      <li>Нажмите нужную кнопку ниже — код скопируется в буфер.</li>
      <li>В Safari: <kbd>⌘+D</kbd> на любой странице, сохранить в «Избранное», назвать «Снять меню» (или «Снять контакт»).</li>
      <li>Меню «Закладки» → «Править закладки», найти её, вставить скопированный код в поле адреса.</li>
    </ol>
    <p>
      <button data-code="menu">Скопировать код «Снять меню»</button>
      <button data-code="contacts">Скопировать код «Снять контакт»</button>
    </p>
  </div>
</details>

<script>
  const CODE = {
    menu: document.querySelector('.drag').getAttribute('href'),
    contacts: document.querySelector('.drag.second').getAttribute('href'),
  };
  document.querySelectorAll('[data-code]').forEach((b) => {
    b.onclick = function () {
      navigator.clipboard.writeText(CODE[this.dataset.code]).then(() => { this.textContent = 'Скопировано'; });
    };
  });
</script>
</html>
`;

fs.writeFileSync(path.join(dir, 'install.html'), html);
console.log(`install.html готов: «Снять меню» ${menuHref.length} символов, «Снять контакт» ${contactsHref.length}`);
