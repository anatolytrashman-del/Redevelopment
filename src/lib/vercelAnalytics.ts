// Свои визиты не должны попадать в Vercel Web Analytics (redevelopment.pro,
// officelist.pro, malllist.pro — один и тот же index.html).
//
// Счётчик вшит в <head> и стартует раньше бандла, поэтому браузер исполняет
// исходник vercelAnalyticsImpl.js: vercelAnalyticsHeadScript() вставляется
// в index.html. Правка логики — в impl; тест сверяет, что страница содержит
// тот же текст.

import {
  applyVaDisableQueryImpl,
  installVercelAnalyticsOptOutImpl,
  isVercelAnalyticsDisabledImpl,
  VA_DISABLE_KEY,
  vercelAnalyticsBeforeSendImpl,
} from './vercelAnalyticsImpl.js';

export { VA_DISABLE_KEY };

declare global {
  interface Window {
    /** Этот заход не слать в Vercel Analytics, даже если localStorage не записался. */
    __vaDisabled?: boolean;
    __vercelAnalyticsBeforeSend?: (event: unknown) => unknown;
  }
}

export interface VaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface VaLocation {
  pathname?: string;
  search?: string;
  hash?: string;
}

interface VaHistory {
  state: unknown;
  replaceState(state: unknown, title: string, url?: string): void;
}

export interface VaWindow {
  location?: VaLocation;
  history?: VaHistory;
  localStorage?: VaStorage;
  __vaDisabled?: boolean;
}

export interface VaDisableQuery {
  action: 'none' | 'set' | 'remove' | 'strip';
  search: string;
}

function readBrowserStorage(): VaStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Ключ va-disable записан и не пустой. Нет storage / SecurityError — false. */
export function isVercelAnalyticsDisabled(storage: VaStorage | null | undefined): boolean {
  return isVercelAnalyticsDisabledImpl(storage);
}

/**
 * ?va-disable=1 включает отказ, =0 снимает, любое другое значение только
 * убирает параметр из query. Остальные параметры сохраняются.
 */
export function applyVaDisableQuery(search: string): VaDisableQuery {
  return applyVaDisableQueryImpl(search);
}

/** beforeSend для Vercel Web Analytics: null — событие не отправлять. */
export function vercelAnalyticsBeforeSend<E>(event: E, storage?: VaStorage | null): E | null {
  try {
    const resolved = storage === undefined ? readBrowserStorage() : storage;
    return vercelAnalyticsBeforeSendImpl(event, resolved);
  } catch {
    return event;
  }
}

/**
 * Прочитать ?va-disable до старта счётчика и убрать параметр из адреса.
 * Без window (SSR) и без localStorage — no-op, без исключения.
 */
export function installVercelAnalyticsOptOut(win?: VaWindow | null): void {
  const target = win === undefined ? (typeof window === 'undefined' ? null : window) : win;
  installVercelAnalyticsOptOutImpl(target);
}

/** Исходник для index.html. Должен стоять раньше загрузки /_vercel/insights/script.js. */
export function vercelAnalyticsHeadScript(): string {
  return `(function () {
  var VA_DISABLE_KEY = ${JSON.stringify(VA_DISABLE_KEY)};
  ${isVercelAnalyticsDisabledImpl.toString()}
  ${applyVaDisableQueryImpl.toString()}
  ${vercelAnalyticsBeforeSendImpl.toString()}
  ${installVercelAnalyticsOptOutImpl.toString()}
  try {
    installVercelAnalyticsOptOutImpl(typeof window === 'undefined' ? null : window);
  } catch (e) {}
  try {
    if (typeof window === 'undefined') return;
    window.__vercelAnalyticsBeforeSend = function (event) {
      var storage = null;
      try { storage = window.localStorage; } catch (e) { storage = null; }
      try { return vercelAnalyticsBeforeSendImpl(event, storage); } catch (e) { return event; }
    };
  } catch (e) {}
})();`;
}
