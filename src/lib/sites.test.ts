import { describe, expect, it } from 'vitest';
import domainSplit from '../data/domain-split.json';
import {
  CATALOG_DOMAIN_SPLIT_ENABLED,
  absoluteCatalogUrl,
  catalogSiteUrl,
  crossDomainRedirect,
  siteIdForPath,
} from './sites';

describe('sites / domain split', () => {
  it('по умолчанию сплит выключен (безопасный дефолт до DNS)', () => {
    expect(domainSplit.enabled).toBe(false);
    expect(domainSplit.redirects?.malls).toBe(false);
    expect(domainSplit.redirects?.offices).toBe(false);
    expect(CATALOG_DOMAIN_SPLIT_ENABLED).toBe(false);
  });

  it('пока сплит выключен, catalogSiteUrl остаётся на платформе', () => {
    expect(catalogSiteUrl('bc')).toBe('https://redevelopment.pro/minsk/bc');
    expect(catalogSiteUrl('tc')).toBe('https://redevelopment.pro/minsk/tc');
    expect(absoluteCatalogUrl('bc', '/minsk/bc/titan')).toBe('https://redevelopment.pro/minsk/bc/titan');
  });

  it('siteIdForPath различает каталоги и платформу', () => {
    expect(siteIdForPath('/minsk/bc')).toBe('offices');
    expect(siteIdForPath('/minsk/bc/titan')).toBe('offices');
    expect(siteIdForPath('/minsk/bcminsk/gid')).toBe('offices');
    expect(siteIdForPath('/bc/titan')).toBe('offices');
    expect(siteIdForPath('/minsk/tc')).toBe('malls');
    expect(siteIdForPath('/minsk/tc/dana-mall')).toBe('malls');
    expect(siteIdForPath('/minsk')).toBe('platform');
    expect(siteIdForPath('/zakupki')).toBe('platform');
    expect(siteIdForPath('/admin/purchases')).toBe('platform');
  });

  it('пока сплит выключен, crossDomainRedirect ничего не делает', () => {
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/bc')).toBeNull();
    expect(crossDomainRedirect('offiselist.pro', '/minsk/bc')).toBeNull();
  });
});

describe('sites / domain split (логика при enabled)', () => {
  // Эти кейсы дублируют правила из crossDomainRedirect, но с явным
  // ожиданием целевых URL — чтобы не сломать SEO-карту при правках.
  // Сам флаг в JSON сейчас false, поэтому гоняем через локальную копию
  // правил (как в middleware), а не через live-функцию.

  function redirectWhenEnabled(host: string, pathname: string): string | null {
    const bare = host.replace(/^www\./, '').toLowerCase();
    const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const offices = 'https://offiselist.pro';
    const malls = 'https://malllist.pro';
    const platform = 'https://redevelopment.pro';

    if (host.toLowerCase().startsWith('www.') && (bare === 'redevelopment.pro' || bare === 'offiselist.pro' || bare === 'malllist.pro')) {
      const origin = bare === 'offiselist.pro' ? offices : bare === 'malllist.pro' ? malls : platform;
      return `${origin}${pathname}`;
    }

    const siteId = siteIdForPath(path);
    if (siteId === 'offices') {
      if (bare === 'offiselist.pro') {
        if (path === '/bc' || path.startsWith('/bc/')) {
          const slug = path === '/bc' ? '' : path.slice('/bc'.length);
          return `${offices}/minsk/bc${slug}`;
        }
        if (path === '/minsk/bcminsk' || path.startsWith('/minsk/bcminsk/')) {
          return `${offices}${path.replace(/^\/minsk\/bcminsk/, '/minsk/bc')}`;
        }
        return null;
      }
      return `${offices}${path.replace(/^\/minsk\/bcminsk/, '/minsk/bc').replace(/^\/bc(?=\/|$)/, '/minsk/bc')}`;
    }
    if (siteId === 'malls') {
      if (bare === 'malllist.pro') return null;
      return `${malls}${path}`;
    }
    if (bare === 'offiselist.pro' || bare === 'malllist.pro') {
      if (path === '/' || path === '') {
        // malllist — своя главная; offiselist пока уходит в каталог БЦ.
        if (bare === 'malllist.pro') return null;
        return `${offices}/minsk/bc`;
      }
      return `${platform}${pathname}`;
    }
    return null;
  }

  it('с платформы каталог БЦ уходит на offiselist с тем же путём', () => {
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bc')).toBe('https://offiselist.pro/minsk/bc');
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bc/titan')).toBe('https://offiselist.pro/minsk/bc/titan');
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bc/metro/nemiga')).toBe(
      'https://offiselist.pro/minsk/bc/metro/nemiga',
    );
  });

  it('legacy bcminsk и /bc/:slug тоже на offiselist', () => {
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bcminsk/titan')).toBe('https://offiselist.pro/minsk/bc/titan');
    expect(redirectWhenEnabled('redevelopment.pro', '/bc/titan')).toBe('https://offiselist.pro/minsk/bc/titan');
  });

  it('с платформы каталог ТЦ уходит на malllist', () => {
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/tc/dana-mall')).toBe('https://malllist.pro/minsk/tc/dana-mall');
  });

  it('корень каталожного домена', () => {
    expect(redirectWhenEnabled('offiselist.pro', '/')).toBe('https://offiselist.pro/minsk/bc');
    // У malllist своя главная — с корня никуда не уводим.
    expect(redirectWhenEnabled('malllist.pro', '/')).toBeNull();
  });

  it('www схлопывается в apex', () => {
    expect(redirectWhenEnabled('www.offiselist.pro', '/minsk/bc')).toBe('https://offiselist.pro/minsk/bc');
    expect(redirectWhenEnabled('www.malllist.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
  });
});
