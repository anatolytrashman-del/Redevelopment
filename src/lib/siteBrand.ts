// Бренд, под которым показываются /admin и /platform (2026-10-25).
// lobsters.pro — «Lobsters» (логотип-картинка), всё остальное — как было
// («RED»EVELOPMENT). Источник — window.__SITE_BRAND__ из HTML-шелла
// (scripts/generate-lobsters-shells.mjs; на превью шелл отдаётся по
// ?brand=lobsters) и, на всякий случай, сам hostname.
import { isLobstersHost } from './lobsters';

export type SiteBrand = 'redevelopment' | 'lobsters';

export function siteBrand(): SiteBrand {
  if (typeof window === 'undefined') return 'redevelopment';
  const w = window as Window & { __SITE_BRAND__?: string };
  if (w.__SITE_BRAND__ === 'lobsters') return 'lobsters';
  if (isLobstersHost(window.location?.hostname)) return 'lobsters';
  return 'redevelopment';
}

export function isLobstersBrand(): boolean {
  return siteBrand() === 'lobsters';
}

/** Имя бренда для заголовков вкладок: «Redevelopment» / «Lobsters». */
export function siteBrandName(): string {
  return isLobstersBrand() ? 'Lobsters' : 'Redevelopment';
}
