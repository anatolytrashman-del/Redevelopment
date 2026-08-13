const STORAGE_KEY = 'backlog_last_viewed_at';
const VIEWED_EVENT = 'backlog-viewed';

export function getBacklogLastViewedAt(): string {
  return localStorage.getItem(STORAGE_KEY) ?? new Date(0).toISOString();
}

export function markBacklogViewed() {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  window.dispatchEvent(new Event(VIEWED_EVENT));
}

export function onBacklogViewed(handler: () => void): () => void {
  window.addEventListener(VIEWED_EVENT, handler);
  return () => window.removeEventListener(VIEWED_EVENT, handler);
}
