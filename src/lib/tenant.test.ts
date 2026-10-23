import { describe, expect, it, vi } from 'vitest';
import { getClientSlugForHost, isClientAdminHost, CLIENT_HOSTS } from './tenant';
import { MATRESHKA_HOSTS } from './matreshkaHosts.js';

// Мокаем define, который подставляет vite
declare const __VERCEL_ENV__: string;

describe('tenant / client hosts', () => {
  it('CLIENT_HOSTS содержит все алиасы матрёшки', () => {
    expect(MATRESHKA_HOSTS.length).toBe(4);
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

  it('redevelopment.pro и www — не клиентская админка (главная платформы на «/»)', () => {
    (globalThis as any).__VERCEL_ENV__ = 'production';
    for (const hostname of ['redevelopment.pro', 'www.redevelopment.pro']) {
      vi.stubGlobal('window', { location: { hostname, search: '', pathname: '/' } });
      expect(isClientAdminHost()).toBe(false);
    }
  });

  it('matreshka.redevelopment.pro — клиент matreshka', () => {
    expect(getClientSlugForHost('matreshka.redevelopment.pro')).toBe('matreshka');
  });
});
