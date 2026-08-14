const STORAGE_KEY = 'leads_last_viewed_at';
const VIEWED_EVENT = 'leads-viewed';

export function getLeadsLastViewedAt(): string {
  return localStorage.getItem(STORAGE_KEY) ?? new Date(0).toISOString();
}

export function markLeadsViewed() {
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  window.dispatchEvent(new Event(VIEWED_EVENT));
}

export function onLeadsViewed(handler: () => void): () => void {
  window.addEventListener(VIEWED_EVENT, handler);
  return () => window.removeEventListener(VIEWED_EVENT, handler);
}
