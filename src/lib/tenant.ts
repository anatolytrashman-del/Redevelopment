// Определение режима клиентской админки «Матрешка» в браузере (блок 1 auth).
// Хосты — из общего src/lib/matreshkaHosts.js (единственное место с доменными строками).
// isClientAdminHost() учитывает:
// - прямой матч по хосту клиента;
// - превью-override ТОЛЬКО при __VERCEL_ENV__ === 'preview' на *.vercel.app:
//   ?tenant=matreshka в URL → ставим sessionStorage + cookie (для middleware)
//   или наличие флага matreshka_preview в storage/cookie.
// На проде override не работает (даже с ?tenant).

import { deployedSiteMode } from './sites';
import {
  MATRESHKA_CLIENT_SLUG,
  MATRESHKA_HOSTS,
  MATRESHKA_PREVIEW_FLAG,
  MATRESHKA_TENANT_PARAM,
  isPreviewVercelHost,
  matreshkaSlugForHost,
} from './matreshkaHosts.js';

export const CLIENT_HOSTS: Record<string, string> = Object.fromEntries(
  MATRESHKA_HOSTS.map((h) => [h, MATRESHKA_CLIENT_SLUG]),
);

function getHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.toLowerCase();
}

function getSearchParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function getVercelEnv(): string {
  return typeof __VERCEL_ENV__ === 'string' ? __VERCEL_ENV__ : '';
}

function hasPreviewFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(MATRESHKA_PREVIEW_FLAG) === '1') return true;
    if (document.cookie.includes(`${MATRESHKA_PREVIEW_FLAG}=1`)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function setPreviewFlag() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(MATRESHKA_PREVIEW_FLAG, '1');
    // cookie для middleware (edge) — path=/ , 1 час
    document.cookie = `${MATRESHKA_PREVIEW_FLAG}=1; path=/; max-age=3600; samesite=lax`;
  } catch {
    /* private mode */
  }
}

export function getClientSlugForHost(hostname: string): string | null {
  return matreshkaSlugForHost(hostname);
}

export function isClientAdminHost(): boolean {
  // На отдельных проектах (malls/offices) клиентской админки нет.
  if (deployedSiteMode() !== 'platform') return false;

  const host = getHostname();
  if (getClientSlugForHost(host)) return true;

  // Превью-override только на preview-деплоях и только *.vercel.app
  if (!isPreviewVercelHost(host, getVercelEnv())) return false;

  if (getSearchParam('tenant') === MATRESHKA_TENANT_PARAM) {
    setPreviewFlag();
    return true;
  }
  return hasPreviewFlag();
}

export function getCurrentClientSlug(): string | null {
  if (!isClientAdminHost()) return null;
  // Пока один клиент — 'matreshka'
  return getClientSlugForHost(getHostname()) || MATRESHKA_CLIENT_SLUG;
}
