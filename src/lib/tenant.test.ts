import { describe, expect, it, vi } from 'vitest';
import { getClientSlugForHost, isClientAdminHost, isPlatformRootLogin, CLIENT_HOSTS } from './tenant';
import { MATRESHKA_HOSTS } from './matreshkaHosts.js';

// Мокаем define, который подставляет vite
declare const __VERCEL_ENV__: string;

describe('tenant / client hosts', () => {
  it('CLIENT_HOSTS содержит все алиасы матрёшки', () => {
    expect(MATRESHKA_HOSTS.length).toBe(3);
    for (const h of MATRESHKA_HOSTS) expect(CLIENT_HOSTS[h]).toBe('matreshka');
  });

  it('getClientSlugForHost нормализует', () => {
    for (const h of MATRESHKA_HOSTS) {
      expect(getClientSlugForHost(h)).toBe('matreshka');
      expect(getClientSlugForHost(`www.${h.toUpperCase()}`)).toBe('matreshka');
    }
    expect(getClientSlugForHost('redevelopment.pro')).toBeNull();
  });

  it('isClientAdminHost false на обычном хосте', () => {
    vi.stubGlobal('window', { location: { hostname: 'redevelopment.pro', search: '' }, document: { cookie: '' } });
    expect(isClientAdminHost()).toBe(false);
  });

  it('превью override только при preview + vercel.app + tenant=matreshka', () => {
    (globalThis as any).__VERCEL_ENV__ = 'preview';
    vi.stubGlobal('window', {
      location: { hostname: 'foo-bar-123.vercel.app', search: '?tenant=matreshka' },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      document: { cookie: '' },
    });
    expect(isClientAdminHost()).toBe(true);
  });

  it('на проде override не работает даже с флагом', () => {
    (globalThis as any).__VERCEL_ENV__ = 'production';
    vi.stubGlobal('window', {
      location: { hostname: 'foo.vercel.app', search: '?tenant=matreshka' },
      sessionStorage: { getItem: () => '1' },
      document: { cookie: '' },
    });
    expect(isClientAdminHost()).toBe(false);
  });

  it('«/» на redevelopment.pro и www — вход «Матрешка»; другие пути — нет', () => {
    (globalThis as any).__VERCEL_ENV__ = 'production';
    for (const hostname of ['redevelopment.pro', 'www.redevelopment.pro']) {
      vi.stubGlobal('window', { location: { hostname, search: '', pathname: '/' } });
      expect(isPlatformRootLogin()).toBe(true);
      expect(isClientAdminHost()).toBe(false);
      vi.stubGlobal('window', { location: { hostname, search: '', pathname: '/katalog' } });
      expect(isPlatformRootLogin()).toBe(false);
      vi.stubGlobal('window', { location: { hostname, search: '', pathname: '/minsk' } });
      expect(isPlatformRootLogin()).toBe(false);
    }
  });

  it('вход на «/» не включается на officelist/malllist и на проде через simulate_host', () => {
    (globalThis as any).__VERCEL_ENV__ = 'production';
    for (const hostname of ['officelist.pro', 'malllist.pro', 'foo.vercel.app']) {
      vi.stubGlobal('window', { location: { hostname, search: '?simulate_host=redevelopment.pro', pathname: '/' } });
      expect(isPlatformRootLogin()).toBe(false);
    }
  });

  it('превью: simulate_host=redevelopment.pro на *.vercel.app', () => {
    (globalThis as any).__VERCEL_ENV__ = 'preview';
    vi.stubGlobal('window', { location: { hostname: 'foo.vercel.app', search: '?simulate_host=redevelopment.pro', pathname: '/' } });
    expect(isPlatformRootLogin()).toBe(true);
    vi.stubGlobal('window', { location: { hostname: 'foo.vercel.app', search: '', pathname: '/' } });
    expect(isPlatformRootLogin()).toBe(false);
  });
});
