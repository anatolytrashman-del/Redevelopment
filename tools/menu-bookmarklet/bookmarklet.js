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

  // Явно не-товарные пункты. Якоря в конце нет намеренно: на живом сайте
  // встречается «Корзина0», «Сравнение товаров0» — счётчик приклеен к
  // названию. «Производство» сюда НЕ входит: у Авиасталь это оказался
  // настоящий товарный раздел (металлоконструкции, стеллажи, заборы).
  var SKIP = new RegExp(
    '^\\s*(контакты|о компании|о нас|доставка|оплата|условия оплаты|условия доставки|' +
      'вакансии|карьера|корзина|избранные товары|сравнение|войти|вход|личный кабинет|' +
      'регистрация|главная|поиск|карта сайта|политик|пользовательское соглашение|согласие|' +
      'cookie|обратная связь|написать|заказать звонок|блог|новости|акции|отзывы|как купить|' +
      'как заказать|возврат|гарантия|сертификаты|реквизиты|справочники|франшиза|' +
      'сотрудничество|наши клиенты|офисы компании|помощь|обзоры|идеи интерьера|проекты|' +
      'компания|галерея|бренды|вопрос-ответ|калькулятор|онлайн расч|вконтакте|instagram|telegram|' +
      'facebook|youtube|whatsapp|max|яндекс)',
    'i',
  );

  // Внутри ссылки часто лежит инлайновый <svg> со своим <style> — его текст
  // попадает в textContent, и в дерево прилетает «.clsw-1{fill:#fff…}».
  function visibleText(a) {
    var clone = a.cloneNode(true);
    var junk = clone.querySelectorAll ? clone.querySelectorAll('style,script') : [];
    for (var i = 0; i < junk.length; i++) junk[i].remove();
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function usefulLink(a) {
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return false;
    if (/^(javascript:|tel:|mailto:)/i.test(href)) return false;
    var t = visibleText(a);
    if (t.length < 2 || t.length > 120) return false;
    if (SKIP.test(t)) return false;
    // Логотип и «на главную»: ведут в корень сайта, товарным разделом не бывают.
    try {
      if (new URL(a.href, location.href).pathname.replace(/\/+$/, '') === '') return false;
    } catch (e) {
      /* относительный мусор — пусть решают остальные проверки */
    }
    return true;
  }

  /* Глубина — по АДРЕСУ ссылки: /catalog/potolki → 0, /catalog/potolki/ekonom
     → 1. Так же строит дерево серверный краулер (sectionTree в review.mjs),
     и так же это работает независимо от вёрстки. Первая версия считала
     вложенность списков <ul>, и на первом же живом сайте (msk.avangardrf.ru,
     меню целиком на <div>) всё дерево вышло плоским — 127 строк без единого
     отступа.

     Вложенность разметки оставлена запасным вариантом: если адреса ничего не
     говорят (все ссылки одного уровня, или это одностраничник с якорями),
     считаем по спискам, как раньше. */
  function pathDepth(a) {
    try {
      var parts = new URL(a.href, location.href).pathname.split('/').filter(Boolean);
      return parts.length;
    } catch (e) {
      return -1;
    }
  }

  function listDepth(a, container) {
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
        byPath: pathDepth(links[i]),
        byList: listDepth(links[i], container),
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
        byPath: parts.length,
        byList: 0,
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

  /* Берём ту метрику, которая вообще различает уровни: если все адреса
     одной длины — толку от них нет, смотрим на вложенность списков. */
  function spread(items, key) {
    var min = 99;
    var max = -99;
    for (var i = 0; i < items.length; i++) {
      var v = items[i][key];
      if (v < 0) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min: min === 99 ? 0 : min, levels: max - min };
  }

  var byPath = spread(items, 'byPath');
  var byList = spread(items, 'byList');
  var useKey = byPath.levels >= byList.levels ? 'byPath' : 'byList';
  var base = useKey === 'byPath' ? byPath.min : byList.min;

  /* Ноль отсчитываем от ОСНОВНОЙ группы ссылок (обычно /catalog/…), а не от
     самой короткой ссылки вообще. Иначе одинокие «Услуги» (/services, один
     сегмент) делают базой единицу, и весь каталог уезжает вправо на уровень,
     как будто у дерева есть невидимый корень. */
  if (useKey === 'byPath') {
    var groups = {};
    for (var gi = 0; gi < items.length; gi++) {
      var h = items[gi].href || '';
      var seg;
      try {
        seg = new URL(h, location.href).pathname.split('/').filter(Boolean)[0] || '';
      } catch (e) {
        seg = '';
      }
      (groups[seg] = groups[seg] || []).push(items[gi]);
    }
    var main = null;
    Object.keys(groups).forEach(function (k) {
      if (!main || groups[k].length > main.length) main = groups[k];
    });
    if (main && main.length > 1) {
      base = main.reduce(function (m, it) {
        return it.byPath >= 0 && it.byPath < m ? it.byPath : m;
      }, 99);
      if (base === 99) base = byPath.min;
    }
  }
  var text = items
    .map(function (it) {
      var d = Math.max(0, (it[useKey] < 0 ? base : it[useKey]) - base);
      return new Array(d + 1).join('  ') + it.title;
    })
    .join('\n');

  var host = location.hostname.replace(/^www\./i, '');

  /* Отправка в админку. Вкладку с сайтом открыла сама админка
     (openSupplierSiteTab в SupplierVerificationTab.tsx), поэтому window.opener
     указывает на неё — шлём дерево туда. Ни токенов в закладке, ни
     всплывающих окон, ни ручного копирования.

     Владелец, 2026-09-14: «я не хочу вручную пересылать каждый раз. Надо так:
     открылась вкладка, Светлана нажала кнопку снимка, система записала в
     память и, если всё ок, показала уведомление».

     Если сайт открыт сам по себе (не из карточки), opener пустой — тогда
     показываем прежнее окно с копированием, чтобы способ не пропадал совсем. */
  var ORIGIN = 'https://redevelopment.pro';
  function sendToAdmin(onDone) {
    var opener = null;
    try {
      opener = window.opener && !window.opener.closed ? window.opener : null;
    } catch (e) {
      opener = null;
    }
    if (!opener) return false;
    var acked = false;
    function onAck(e) {
      if (!e.data || e.data.source !== 'redevelopment-menu-capture-ok') return;
      acked = true;
      window.removeEventListener('message', onAck);
      onDone(true, e.data.count);
    }
    window.addEventListener('message', onAck);
    opener.postMessage({ source: 'redevelopment-menu-capture', host: host, pageUrl: location.href, tree: text }, ORIGIN);
    /* Ответа может не быть: админка открыта не на вкладке «Верификация» или
       вообще перешла на другую страницу. Через 2.5 секунды честно говорим,
       что подтверждения нет, и показываем дерево для копирования. */
    setTimeout(function () {
      if (!acked) {
        window.removeEventListener('message', onAck);
        onDone(false, 0);
      }
    }, 2500);
    return true;
  }

  /* Короткое уведомление прямо на странице поставщика — чтобы не
     переключаться на вкладку админки ради подтверждения. */
  function toast(message, ok) {
    var el = document.createElement('div');
    el.style.cssText =
      'position:fixed;z-index:2147483647;left:50%;top:24px;transform:translateX(-50%);' +
      'padding:14px 24px;border-radius:999px;color:#fff;font:600 15px -apple-system,Segoe UI,Roboto,sans-serif;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.25);background:' +
      (ok ? '#12a150' : '#d92d20');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 4000);
  }

  var header =
    host + ' — разделов: ' + items.length + (usedFallback ? ' (по адресам ссылок, навигацию найти не удалось)' : '');

  /* Панель с копированием — ЗАПАСНОЙ путь: показывается, только если
     отправить в админку не вышло (сайт открыт не из карточки верификации,
     или админка не ответила). */
  function showPanel() {
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
  }

  var sent = sendToAdmin(function (ok, count) {
    if (ok) toast('Меню снято: ' + count + ' разделов', true);
    else {
      toast('Админка не ответила — скопируйте вручную', false);
      showPanel();
    }
  });
  if (!sent) showPanel();
})();
