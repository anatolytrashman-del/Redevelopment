import { supabase } from './supabase';
import { isLikelyBot } from './botDetection';
import { aiSourceFromHostname } from './aiReferrer';

// Собственный счётчик посещаемости без cookie (владелец, 2026-09-28) — см.
// supabase/migrations/20260928-page-views-daily.sql и src/data/pageViews.ts.
// Считает только два числа на пару (день, путь): просмотры и визиты (первый
// просмотр загрузки страницы). Никаких cookie/localStorage/sessionStorage —
// пишет напрямую в Supabase через track_page_view (RPC, SECURITY DEFINER),
// fire-and-forget: ошибка сети не должна ничего ломать и не должна шуметь в
// консоли (в отличие от withRetry-обёрнутых запросов админки, тут это не
// критичная операция — один потерянный просмотр не стоит повторов/таймаутов).
//
// entries=true — только для ПЕРВОЙ отслеженной страницы этой загрузки
// документа, когда document.referrer пуст или ведёт на другой хост (значит
// человек только что зашёл на сайт, а не кликнул по SPA-ссылке внутри него).
// Для известных поисковиков и ИИ-чатов дополнительно записываем агрегат
// source/day (track_search_visit); сам referrer не отправляем и не сохраняем.
// Это основной счётчик для «Показателей»: Метрика включается только после
// принятия cookies и поэтому недосчитывает.
// Дальнейшие переходы внутри той же загрузки (React Router, без перезагрузки
// страницы) — entries=false, это продолжение того же визита.
let hasTrackedEntryThisLoad = false;

// Дедуп одного и того же пути подряд — только модульная переменная, без
// стораджа (см. правило "никаких cookie"). Нужен из-за React StrictMode:
// в dev-режиме эффекты монтируются дважды подряд на одном и том же пути —
// без дедупа это посчиталось бы двумя просмотрами. Дедуп универсальный
// (не завязан на dev/prod), поэтому заодно гасит и любые другие двойные
// срабатывания эффекта на неизменившемся пути.
let lastTrackedPath: string | null = null;

function isOwnHost(): boolean {
  try {
    return window.location.hostname === 'redevelopment.pro';
  } catch {
    return false;
  }
}

function referrerIsExternal(): boolean {
  const ref = document.referrer;
  if (!ref) return true;
  try {
    return new URL(ref).hostname !== window.location.hostname;
  } catch {
    return true;
  }
}

function searchSourceFromReferrer(): string | null {
  try {
    const host = new URL(document.referrer).hostname.toLowerCase().replace(/\.$/, '');
    const ai = aiSourceFromHostname(host);
    if (ai) return ai;
    const domains: Record<string, string[]> = {
      yandex: ['yandex.ru', 'yandex.by', 'yandex.kz', 'yandex.com', 'yandex.com.tr', 'ya.ru'],
      bing: ['bing.com'],
      duckduckgo: ['duckduckgo.com'],
      yahoo: ['search.yahoo.com', 'yahoo.com'],
      baidu: ['baidu.com'],
      ecosia: ['ecosia.org'],
      brave: ['search.brave.com', 'brave.com'],
    };
    for (const [source, roots] of Object.entries(domains)) {
      if (roots.some((root) => host === root || host.endsWith(`.${root}`))) return source;
    }
    if (/(^|\.)google\.(?:[a-z]{2,}|com\.[a-z]{2,}|co\.[a-z]{2,})$/.test(host)) return 'google';
  } catch {
    // Пустой или некорректный referrer остаётся обычным внешним визитом.
  }
  return null;
}

// pathname — БЕЗ search/hash: смена только query-строки или #якоря (например,
// переключение фильтра каталога через URL) не считается новым просмотром
// страницы для этого счётчика.
export function trackPageView(pathname: string): void {
  if (!isOwnHost()) return; // превью/localhost/GH-зеркало (если вдруг) не должны засорять прод-статистику
  if (pathname.startsWith('/admin')) return; // считаем только публичную часть
  if (isLikelyBot()) return;
  try {
    if (new URLSearchParams(window.location.search).get('prerender') === '1') return;
  } catch {
    // не должен падать в браузере, но на всякий случай просто не считаем
    return;
  }
  if (pathname === lastTrackedPath) return; // StrictMode/повторный вызов на тот же путь
  lastTrackedPath = pathname;

  const isEntry = !hasTrackedEntryThisLoad && referrerIsExternal();
  hasTrackedEntryThisLoad = true;

  const searchSource = isEntry ? searchSourceFromReferrer() : null;
  if (searchSource) {
    void supabase
      .rpc('track_search_visit', { p_source: searchSource })
      .then(() => undefined, () => undefined);
  }

  void supabase
    .rpc('track_page_view', { p_path: pathname, p_entry: isEntry })
    .then(
      () => undefined,
      () => undefined,
    );
}
