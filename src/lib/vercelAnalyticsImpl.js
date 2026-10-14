// Реализация opt-out для Vercel Web Analytics. Файл на голом JS: его
// Function#toString вставляется в index.html и должен остаться валидным
// скриптом без типов. Типы — в vercelAnalyticsImpl.d.ts, обёртка —
// vercelAnalytics.ts.

export const VA_DISABLE_KEY = 'va-disable';

export function isVercelAnalyticsDisabledImpl(storage) {
  try {
    if (!storage) return false;
    const value = storage.getItem(VA_DISABLE_KEY);
    return value != null && value !== '';
  } catch {
    return false;
  }
}

export function applyVaDisableQueryImpl(search) {
  const raw = search || '';
  const params = new URLSearchParams(raw.charAt(0) === '?' ? raw.slice(1) : raw);
  if (!params.has(VA_DISABLE_KEY)) return { action: 'none', search: params.toString() };
  const value = params.get(VA_DISABLE_KEY);
  params.delete(VA_DISABLE_KEY);
  const next = params.toString();
  if (value === '1') return { action: 'set', search: next };
  if (value === '0') return { action: 'remove', search: next };
  return { action: 'strip', search: next };
}

export function vercelAnalyticsBeforeSendImpl(event, storage) {
  try {
    // Тот же заход, если storage не записал флаг (приватный режим): install
    // ставит window.__vaDisabled до старта счётчика.
    if (typeof window !== 'undefined' && window.__vaDisabled) return null;
  } catch {
    // window нет (SSR) или доступ к нему закрыт — решаем только по storage
  }
  if (isVercelAnalyticsDisabledImpl(storage)) return null;
  return event;
}

export function installVercelAnalyticsOptOutImpl(win) {
  try {
    if (!win || !win.location) return;
    let storage = null;
    try {
      storage = win.localStorage || null;
    } catch {
      storage = null;
    }
    const applied = applyVaDisableQueryImpl(win.location.search || '');
    if (applied.action === 'set') {
      win.__vaDisabled = true;
      try {
        if (storage) storage.setItem(VA_DISABLE_KEY, '1');
      } catch {
        // приватный режим — на этот заход хватит __vaDisabled, дальше не запомнится
      }
    } else if (applied.action === 'remove') {
      win.__vaDisabled = false;
      try {
        if (storage) storage.removeItem(VA_DISABLE_KEY);
      } catch {
        // то же: снять флаг нечем, адрес всё равно почистим ниже
      }
    }
    if (applied.action === 'none') return;
    const path = win.location.pathname || '/';
    const hash = win.location.hash || '';
    const next = path + (applied.search ? `?${applied.search}` : '') + hash;
    if (win.history && typeof win.history.replaceState === 'function') {
      try {
        win.history.replaceState(win.history.state, '', next);
      } catch {
        // нет history (SSR, песочница) — параметр останется в адресе
      }
    }
  } catch {
    // любой сбой opt-out не должен ломать страницу
  }
}
