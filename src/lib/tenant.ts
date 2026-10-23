// Определение клиентского хоста «Основа» (блок 1 auth).
// CLIENT_HOSTS — прод-хосты клиента (punycode + кириллица + latin alias).
// isClientAdminHost() учитывает:
// - прямой матч по хосту клиента
// - превью-override ТОЛЬКО при __VERCEL_ENV__ === 'preview' на *.vercel.app:
//   ?tenant=osnova в URL → ставим sessionStorage + cookie (для middleware)
//   или наличие флага osnova_preview в storage/cookie.
// На проде override не работает (даже с ?tenant).

import { deployedSiteMode } from './sites';

export const CLIENT_HOSTS: Record<string, string> = {
  'xn--80ad6adbq.redevelopment.pro': 'matreshka',
  'основа.redevelopment.pro': 'matreshka',
  'osnova.redevelopment.pro': 'matreshka',
};

const PREVIEW_FLAG = 'osnova_preview';

function getHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.toLowerCase();
}

function hasPreviewOverrideParam(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('tenant') === 'osnova';
}

function hasPreviewFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(PREVIEW_FLAG) === '1') return true;
    if (document.cookie.includes(`${PREVIEW_FLAG}=1`)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function setPreviewFlag() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PREVIEW_FLAG, '1');
    // cookie для middleware (edge) — path=/ , 1 час
    document.cookie = `${PREVIEW_FLAG}=1; path=/; max-age=3600; samesite=lax`;
  } catch {
    /* private mode */
  }
}

export function getClientSlugForHost(hostname: string): string | null {
  const h = (hostname || '').toLowerCase().replace(/^www\./, '');
  return CLIENT_HOSTS[h] ?? null;
}

export function isClientAdminHost(): boolean {
  // На отдельных проектах (malls/offices) клиентской админки нет.
  if (deployedSiteMode() !== 'platform') return false;

  const host = getHostname();
  if (getClientSlugForHost(host)) return true;

  // Превью-override только на preview-деплоях и только *.vercel.app
  const vercelEnv = typeof __VERCEL_ENV__ === 'string' ? __VERCEL_ENV__ : '';
  if (vercelEnv !== 'preview') return false;
  if (!host.endsWith('.vercel.app')) return false;

  if (hasPreviewOverrideParam()) {
    setPreviewFlag();
    return true;
  }
  return hasPreviewFlag();
}

export function getCurrentClientSlug(): string | null {
  if (!isClientAdminHost()) return null;
  // Для клиентского хоста всегда 'matreshka' (пока один клиент)
  const host = getHostname();
  return getClientSlugForHost(host) || 'matreshka';
}
