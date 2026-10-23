import { describe, expect, it, vi } from 'vitest';
import { getClientSlugForHost, isClientAdminHost, CLIENT_HOSTS } from './tenant';

// Мокаем define, который подставляет vite
declare const __VERCEL_ENV__: string;

describe('tenant / client hosts', () => {
  it('CLIENT_HOSTS содержит все алиасы матрёшки', () => {
    expect(CLIENT_HOSTS['osnova.redevelopment.pro']).toBe('matreshka');
    expect(CLIENT_HOSTS['основа.redevelopment.pro']).toBe('matreshka');
    expect(CLIENT_HOSTS['xn--80ad6adbq.redevelopment.pro']).toBe('matreshka');
  });

  it('getClientSlugForHost нормализует', () => {
    expect(getClientSlugForHost('osnova.redevelopment.pro')).toBe('matreshka');
    expect(getClientSlugForHost('www.osnova.redevelopment.pro')).toBe('matreshka');
    expect(getClientSlugForHost('redevelopment.pro')).toBeNull();
  });

  it('isClientAdminHost false на обычном хосте', () => {
    vi.stubGlobal('window', { location: { hostname: 'redevelopment.pro', search: '' }, document: { cookie: '' } });
    expect(isClientAdminHost()).toBe(false);
  });

  it('превью override только при preview + vercel.app + tenant=osnova', () => {
    (globalThis as any).__VERCEL_ENV__ = 'preview';
    vi.stubGlobal('window', {
      location: { hostname: 'foo-bar-123.vercel.app', search: '?tenant=osnova' },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      document: { cookie: '' },
    });
    expect(isClientAdminHost()).toBe(true);
  });

  it('на проде override не работает даже с флагом', () => {
    (globalThis as any).__VERCEL_ENV__ = 'production';
    vi.stubGlobal('window', {
      location: { hostname: 'foo.vercel.app', search: '?tenant=osnova' },
      sessionStorage: { getItem: () => '1' },
      document: { cookie: '' },
    });
    expect(isClientAdminHost()).toBe(false);
  });
});
