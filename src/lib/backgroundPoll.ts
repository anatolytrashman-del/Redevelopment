import { useEffect } from 'react';

// Общая механика фоновых опросов админки (вотчеры уведомлений в AppLayout).
//
// Трафик (2026-09-24): открытая вкладка админки раз в минуту выкачивала
// ВСЮ переписку с поставщиками (`select *` с телами писем, ~1,1 МБ) и все
// задания поиска и обогащения — ~1,5 ГБ в сутки на одну вкладку, больше,
// чем весь сайт. Бесплатный тариф Supabase — 5 ГБ трафика в МЕСЯЦ. Отсюда
// два правила для любого фонового опроса:
// 1. спрашивать только новое — строки позже «отметки» (watermark), а не
//    весь список ради сравнения id; пустой ответ — это два байта;
// 2. в скрытой вкладке опрашивать реже: браузерное уведомление всё равно
//    придёт, просто с задержкой до HIDDEN_INTERVAL_MS.
const VISIBLE_INTERVAL_MS = 60_000;
const HIDDEN_INTERVAL_MS = 5 * 60_000;

export function useBackgroundPoll(poll: () => Promise<void>): void {
  useEffect(() => {
    let lastRun = 0;
    const run = () => {
      lastRun = Date.now();
      poll().catch(() => {
        // Фоновый опрос — молчаливая неудача не должна мешать работе в CRM,
        // следующий тик просто попробует ещё раз.
      });
    };
    const tick = () => {
      const interval = document.visibilityState === 'visible' ? VISIBLE_INTERVAL_MS : HIDDEN_INTERVAL_MS;
      if (Date.now() - lastRun >= interval - 1000) run();
    };
    // Вернулись во вкладку после долгой паузы — проверяем сразу, не ждём тика.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun >= VISIBLE_INTERVAL_MS) run();
    };
    run();
    const timer = window.setInterval(tick, VISIBLE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);
}

// Отметка «до какого момента уже смотрели» — значение временной колонки
// самой базы (created_at / completed_at), а не часы браузера: у разных
// машин часы расходятся, а сравнение идёт на сервере.
export const EPOCH = '1970-01-01T00:00:00Z';

export function readWatermark(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeWatermark(key: string, value: string | null | undefined): void {
  if (!value) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // не критично: без отметки следующий опрос просто заново её поставит
  }
}
