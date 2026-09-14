/*
 * Закладка «Снять меню» — читает разделы каталога поставщика прямо из
 * отрисованной страницы и показывает их деревом, готовым для
 * scripts/supply-categories/review.mjs sections.
 *
 * Владелец, 2026-09-14: «протестируем твоё решение по DOM и без расширения,
 * закладкой. Если будет работать в 7 из 10 случаев, уже супер».
 *
 * Зачем вообще: серверный краулер (supplier_site_snapshots) качает голый
 * HTML без JavaScript, поэтому у части сайтов видит пустоту (77volt.ru,
 * aviastal.ru — 0 разделов) или уходит в сотни фильтров одного раздела и не
 * доходит до соседних вкладок (3dplitka.ru). Здесь страница уже отрисована
 * браузером, и — главное — подменю, которое видно только при наведении,
 * почти всегда УЖЕ лежит в разметке, просто спрятано стилями. Поэтому один
 * клик заменяет два десятка наведений со скриншотами.
 *
 * Ничего никуда не отправляет: показывает дерево, даёт скопировать или
 * скачать. Транспорт (расширение/страница приёма) делаем после того, как
 * станет ясно, что распознавание вообще работает.
 */
(function () {
  var MIN_LINKS = 8;

  // Явно не-товарные пункты. Список намеренно короткий: «Услуги» и
  // «Производство» сюда НЕ входят — у Авиасталь «Производство» оказалось
  // настоящим товарным разделом (металлоконструкции, стеллажи, заборы).
  // Лучше отдать лишнее на разбор модели, чем молча потерять раздел.
  var SKIP = new RegExp(
    '^\\s*(контакты|о компании|о нас|доставка|оплата|доставка и оплата|вакансии|корзина|войти|' +
      'вход|личный кабинет|регистрация|главная|поиск|карта сайта|политика|пользовательское соглашение|' +
      'обратная связь|написать|заказать звонок|新|блог|новости|отзывы|как заказать|возврат|' +
      'гарантия|сертификаты|реквизиты|справочники|франшиза|сотрудничество)\\s*$',
    'i',
  );

  function visibleText(a) {
    return (a.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function usefulLink(a) {
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return false;
    if (/^(javascript:|tel:|mailto:)/i.test(href)) return false;
    var t = visibleText(a);
    if (t.length < 2 || t.length > 120) return false;
    if (SKIP.test(t)) return false;
    return true;
  }

  /* Глубина — по вложенности списков между ссылкой и контейнером меню.
     Меню на <div> выйдет плоским: это не беда, плоский список названий
     разделов остаётся нормальной уликой, просто менее структурированной. */
  function depthWithin(a, container) {
    var d = 0;
    var el = a.parentElement;
    while (el && el !== container && el !== document.body) {
      var tag = el.tagName;
      if (tag === 'UL' || tag === 'OL') d++;
      el = el.parentElement;
    }
    return d;
  }

  function collectFrom(container) {
    var out = [];
    var links = container.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (!usefulLink(links[i])) continue;
      out.push({
        title: visibleText(links[i]),
        href: links[i].getAttribute('href'),
        depth: depthWithin(links[i], container),
      });
    }
    return out;
  }

  /* Контейнеры-кандидаты: сначала честная семантика (nav/role), потом
     классы и id, в которых встречается menu/nav/catalog. */
  function candidateContainers() {
    var sel = [
      'nav',
      '[role="navigation"]',
      '[class*="menu" i]',
      '[class*="nav" i]',
      '[class*="catalog" i]',
      '[class*="katalog" i]',
      '[id*="menu" i]',
      '[id*="nav" i]',
      '[id*="catalog" i]',
      '[id*="katalog" i]',
    ].join(',');
    var found;
    try {
      found = document.querySelectorAll(sel);
    } catch (e) {
      found = document.querySelectorAll('nav');
    }
    var list = [];
    for (var i = 0; i < found.length; i++) list.push(found[i]);
    /* Вложенные контейнеры выкидываем: если меню внутри меню, берём
       внешнее — иначе одни и те же ссылки соберутся дважды с разной
       глубиной. */
    return list.filter(function (el) {
      return !list.some(function (other) {
        return other !== el && other.contains(el);
      });
    });
  }

  /* Запасной путь, если в навигации почти ничего не нашлось: берём самую
     большую группу ссылок с общим началом пути (/catalog/..., /produkty/...) */
  function fallbackByPathPrefix() {
    var byPrefix = {};
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      if (!usefulLink(links[i])) continue;
      var path;
      try {
        path = new URL(links[i].href, location.href).pathname;
      } catch (e) {
        continue;
      }
      var parts = path.split('/').filter(Boolean);
      if (!parts.length) continue;
      var key = parts[0];
      (byPrefix[key] = byPrefix[key] || []).push({
        title: visibleText(links[i]),
        href: links[i].getAttribute('href'),
        depth: Math.max(0, parts.length - 1),
      });
    }
    var best = [];
    Object.keys(byPrefix).forEach(function (k) {
      if (byPrefix[k].length > best.length) best = byPrefix[k];
    });
    return best;
  }

  function dedupe(items) {
    var seen = {};
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var key = items[i].title.toLowerCase() + '|' + (items[i].href || '');
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(items[i]);
    }
    return out;
  }

  var containers = candidateContainers();
  var items = [];
  for (var i = 0; i < containers.length; i++) items = items.concat(collectFrom(containers[i]));
  items = dedupe(items);
  var usedFallback = false;
  if (items.length < MIN_LINKS) {
    items = dedupe(fallbackByPathPrefix());
    usedFallback = true;
  }

  /* Нормализуем глубину: минимальная встреченная становится нулём, иначе
     всё дерево уезжает вправо на пару уровней. */
  var minDepth = items.reduce(function (m, it) {
    return it.depth < m ? it.depth : m;
  }, 99);
  var text = items
    .map(function (it) {
      return new Array(Math.max(0, it.depth - minDepth) + 1).join('  ') + it.title;
    })
    .join('\n');

  var host = location.hostname.replace(/^www\./i, '');
  var header =
    host + ' — разделов: ' + items.length + (usedFallback ? ' (по адресам ссылок, навигацию найти не удалось)' : '');

  /* Панель в теневом дереве: стили страницы до неё не дотянутся, а наши —
     до страницы. */
  var host_el = document.createElement('div');
  host_el.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
  var root = host_el.attachShadow ? host_el.attachShadow({ mode: 'open' }) : host_el;
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.bg{position:fixed;inset:0;background:rgba(0,0,0,.45);font:14px -apple-system,Segoe UI,Roboto,sans-serif}' +
    '.win{position:absolute;top:5vh;left:50%;transform:translateX(-50%);width:min(720px,92vw);max-height:90vh;' +
    'display:flex;flex-direction:column;gap:12px;background:#fff;border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
    'h2{margin:0;font-size:16px;color:#111}' +
    'pre{flex:1;overflow:auto;margin:0;padding:12px;background:#f6f6f6;border-radius:10px;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap}' +
    '.row{display:flex;gap:8px;justify-content:flex-end}' +
    'button{font:inherit;padding:8px 16px;border-radius:999px;border:1px solid #ddd;background:#fff;cursor:pointer}' +
    'button.p{background:#d92d20;border-color:#d92d20;color:#fff}' +
    '</style>' +
    '<div class="bg"><div class="win">' +
    '<h2></h2><pre></pre>' +
    '<div class="row"><button class="close">Закрыть</button><button class="dl">Скачать .txt</button>' +
    '<button class="p copy">Скопировать</button></div>' +
    '</div></div>';
  root.querySelector('h2').textContent = header;
  root.querySelector('pre').textContent = text || 'Ничего не нашлось — похоже, меню рисуется не ссылками. Нужен скрин.';
  root.querySelector('.close').onclick = function () {
    host_el.remove();
  };
  root.querySelector('.copy').onclick = function () {
    navigator.clipboard.writeText(host + '\n' + text).then(function () {
      root.querySelector('.copy').textContent = 'Скопировано';
    });
  };
  root.querySelector('.dl').onclick = function () {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = host + '-menu.txt';
    a.click();
  };
  document.body.appendChild(host_el);
})();
