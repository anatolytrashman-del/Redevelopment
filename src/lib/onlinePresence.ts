import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// "Сколько человек сейчас на сайте" — через Supabase Realtime Presence, без
// своей таблицы и без поллинга: presence живёt только в памяти realtime-
// сервера, обновления приходят по сокету почти мгновенно. Один общий канал:
// маркетинговые страницы (useOnlinePresenceTracker, зовётся из App.tsx для
// всего, что не /admin) джойнятся в него под случайным ключом на вкладку,
// админка (useOnlineVisitorsCount, Sidebar) просто слушает синхронизацию и
// считает участников — сама не трекается, поэтому открытая CRM не
// прибавляет единицу к счётчику посетителей сайта.
const CHANNEL_NAME = 'online-visitors';

function randomPresenceKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Headless-браузеры (Playwright/Puppeteer/Selenium — на них работает большинство
// ИИ-агентов и скрейперов, выполняющих JS страницы) выставляют navigator.webdriver
// в true; обычный браузер человека — никогда. Плюс явные строки UA известных ботов
// и AI-краулеров, которые тоже рендерят JS (значит без этой проверки попадали бы
// в presence). Не претендует на 100% точность — просто убирает основной шум.
const BOT_UA_PATTERN =
  /bot|spider|crawl|slurp|headless|puppeteer|playwright|selenium|phantomjs|gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic-ai|ccbot|perplexitybot|bytespider|petalbot|mj12bot|dotbot|ahrefsbot|semrushbot|facebookexternalhit|telegrambot|discordbot|whatsapp/i;

function isLikelyBot(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (navigator.webdriver) return true;
  return BOT_UA_PATTERN.test(navigator.userAgent);
}

export function useOnlinePresenceTracker(active: boolean): void {
  useEffect(() => {
    if (!active || isLikelyBot()) return;
    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: randomPresenceKey() } },
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ online_at: Date.now() });
      }
    });
    return () => {
      supabase.removeChannel(channel);
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
