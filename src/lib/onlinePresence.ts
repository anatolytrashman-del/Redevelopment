import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isLikelyBot } from './botDetection';

// "Сколько человек сейчас на сайте" — через Supabase Realtime Presence, без
// своей таблицы и без поллинга: presence живёт только в памяти realtime-
// сервера, обновления приходят по сокету почти мгновенно. Один общий канал:
// маркетинговые страницы (useOnlinePresenceTracker, зовётся из App.tsx для
// всего, что не /admin) джойнятся в него, админка (useOnlineVisitorsCount,
// Sidebar) просто слушает синхронизацию и считает участников — сама не
// трекается, поэтому открытая CRM не прибавляет единицу к счётчику
// посетителей сайта.
const CHANNEL_NAME = 'online-visitors';

// Ключ presence — ОДИН НА БРАУЗЕР, не на вкладку (2026-09-17). Раньше он был
// случайным при каждом монтировании, и один человек с тремя открытыми
// вкладками показывался как три посетителя онлайн. Presence считает
// уникальные ключи, поэтому вкладки одного браузера теперь схлопываются в
// одного. localStorage может быть недоступен (приватный режим, запрет
// сторонних данных) — тогда падаем на случайный ключ, это не хуже прежнего.
const PRESENCE_KEY_STORAGE = 'online-visitor-key';

// Сколько секунд вкладка должна быть ОТКРЫТА И ВИДИМА, прежде чем посетитель
// попадёт в счётчик (2026-09-17, владелец: «очистить онлайн от ИИ-агентов»).
// Это второй рубеж после isLikelyBot: агент/краулер, которого не выдал ни
// webdriver, ни UA, всё равно забирает страницу и уходит за секунды — он
// просто не доживает до порога. Живой человек, читающий лендинг, доживает
// всегда. Побочный эффект в плюс: случайный заход «не туда, закрыл» тоже не
// мигает единицей в сайдбаре.
const JOIN_AFTER_VISIBLE_MS = 12_000;

function randomPresenceKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function presenceKey(): string {
  try {
    const stored = localStorage.getItem(PRESENCE_KEY_STORAGE);
    if (stored) return stored;
    const fresh = randomPresenceKey();
    localStorage.setItem(PRESENCE_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return randomPresenceKey();
  }
}

export function useOnlinePresenceTracker(active: boolean): void {
  useEffect(() => {
    if (!active || isLikelyBot()) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const join = () => {
      if (channel) return;
      channel = supabase.channel(CHANNEL_NAME, {
        config: { presence: { key: presenceKey() } },
      });
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel?.track({ online_at: Date.now() });
        }
      });
    };

    const leave = () => {
      if (!channel) return;
      supabase.removeChannel(channel);
      channel = null;
    };

    // Отсчёт идёт только пока вкладка видима: свёрнутое окно/фоновая вкладка
    // не должны дозревать до "онлайн", а ушедший в фон посетитель — оставаться
    // в счётчике. Вернулся — отсчёт начинается заново.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(join, JOIN_AFTER_VISIBLE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        schedule();
      } else {
        if (timer) clearTimeout(timer);
        timer = null;
        leave();
      }
    };

    if (document.visibilityState === 'visible') schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer) clearTimeout(timer);
      leave();
    };
  }, [active]);
}

// null, пока первая синхронизация ещё не пришла — отличаем от настоящего
// нуля, чтобы индикатор в сайдбаре не мигал "0" на долю секунды при заходе.
export function useOnlineVisitorsCount(active: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setCount(null);
      return;
    }
    const channel = supabase.channel(CHANNEL_NAME);
    channel.on('presence', { event: 'sync' }, () => {
      setCount(Object.keys(channel.presenceState()).length);
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [active]);

  return count;
}
