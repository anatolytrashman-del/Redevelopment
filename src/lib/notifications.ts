import { useSyncExternalStore } from 'react';

// Лёгкий локальный (в этом браузере) центр уведомлений — колокольчик в
// PageHeader был чистой декорацией (см. историю компонента), первый живой
// сценарий — долгие фоновые операции вроде расшифровки аудио: пользователь
// уходит в другую вкладку, а когда результат готов, хочет узнать об этом,
// не проверяя вкладку руками. Ничего не льётся в Supabase — это не
// межустройственный центр уведомлений, а просто "не потерять результат,
// пока вкладка открыта где-то в этом браузере" (см. addNotification).
export interface AppNotification {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
}

const STORAGE_KEY = 'redevelopment-notifications';
const MAX_STORED = 30;

function readFromStorage(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// useSyncExternalStore требует, чтобы getSnapshot возвращал СТАБИЛЬНУЮ
// ссылку, пока данные не поменялись — иначе (например, если бы getSnapshot
// был просто readFromStorage(), парсящим JSON заново на каждый вызов) React
// на каждом рендере видел бы "новый" массив и уходил в бесконечный цикле
// ре-рендеров ("Maximum update depth exceeded", поймано мок-тестом). Поэтому
// снапшот кэшируется отдельно и обновляется только в writeAll/storage-событии.
let cachedSnapshot: AppNotification[] = typeof window !== 'undefined' ? readFromStorage() : [];

const listeners = new Set<() => void>();

function writeAll(list: AppNotification[]): void {
  const trimmed = list.slice(0, MAX_STORED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Переполненный/недоступный localStorage (приватный режим и т.п.) не
    // должен ронять фичу — просто не сохранится между перезагрузками.
  }
  cachedSnapshot = trimmed;
  listeners.forEach((l) => l());
}

export function addNotification(input: { title: string; body?: string }): void {
  const notification: AppNotification = {
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
    read: false,
  };
  writeAll([notification, ...readFromStorage()]);
  fireBrowserNotification(notification);
}

export function markAllNotificationsRead(): void {
  const all = readFromStorage();
  if (all.every((n) => n.read)) return;
  writeAll(all.map((n) => ({ ...n, read: true })));
}

// storage-событие приходит только в ДРУГИХ вкладках того же браузера, не в
// той, что вызвала запись — вместе с прямым listeners.forEach в writeAll
// (для своей вкладки) это и даёт синхронизацию колокольчика между всеми
// открытыми вкладками CRM, не только в той, где расшифровка реально шла.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    cachedSnapshot = readFromStorage();
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AppNotification[] {
  return cachedSnapshot;
}

const EMPTY_SNAPSHOT: AppNotification[] = [];

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
}

// Разрешение на нотификации браузер спрашивает только по прямому вызову из
// пользовательского жеста (клика) — вызывать из обработчика клика на кнопке
// "Загрузить запись", не из фонового кода. Не переспрашиваем повторно в
// рамках вкладки, если пользователь уже один раз ответил (свойство
// Notification.permission у браузера и так не 'default' после первого раза).
let permissionRequestedThisTab = false;
export function ensureNotificationPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'default' || permissionRequestedThisTab) return;
  permissionRequestedThisTab = true;
  Notification.requestPermission().catch(() => {
    // намеренно молча — колокольчик в интерфейсе всё равно покажет уведомление
  });
}

// Настоящее системное уведомление — работает, пока вкладка CRM открыта где-
// то в этом браузере (даже свёрнутая/в фоне), без вкладки узнавать не о чем:
// опрос статуса расшифровки идёт полностью на клиенте (см.
// meetingTranscribeApi.ts), закрытая вкладка останавливает и его.
function fireBrowserNotification(n: AppNotification): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const browserNotification = new Notification(n.title, { body: n.body, icon: '/favicon.png' });
    browserNotification.onclick = () => {
      window.focus();
      browserNotification.close();
    };
  } catch {
    // Некоторые окружения (например, часть мобильных браузеров) бросают при
    // создании Notification даже при разрешении — уведомление в колокольчике
    // при этом уже сохранено выше, ничего не теряется.
  }
}
