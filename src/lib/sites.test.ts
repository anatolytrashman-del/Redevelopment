import { describe, expect, it } from 'vitest';
import domainSplit from '../data/domain-split.json';
import {
  CATALOG_DOMAIN_SPLIT_ENABLED,
  REDIRECT_MALLS_ENABLED,
  REDIRECT_OFFICES_ENABLED,
  absoluteCatalogUrl,
  catalogSiteUrl,
  crossDomainRedirect,
  siteIdForPath,
  siteIdFromHostname,
} from './sites';

describe('sites / domain split', () => {
  it('ТЦ уже на malllist (redirects.malls), БЦ ещё на платформе', () => {
    expect(domainSplit.enabled).toBe(false);
    expect(domainSplit.redirects?.malls).toBe(true);
    expect(domainSplit.redirects?.offices).toBe(false);
    expect(REDIRECT_MALLS_ENABLED).toBe(true);
    expect(REDIRECT_OFFICES_ENABLED).toBe(false);
    expect(CATALOG_DOMAIN_SPLIT_ENABLED).toBe(true);
  });

  it('catalogSiteUrl: ТЦ → malllist, БЦ → платформа', () => {
    expect(catalogSiteUrl('bc')).toBe('https://redevelopment.pro/minsk/bc');
    expect(catalogSiteUrl('tc')).toBe('https://malllist.pro/minsk/tc');
    expect(absoluteCatalogUrl('bc', '/minsk/bc/titan')).toBe('https://redevelopment.pro/minsk/bc/titan');
    expect(absoluteCatalogUrl('tc', '/minsk/tc/dana-mall')).toBe('https://malllist.pro/minsk/tc/dana-mall');
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

  it('siteIdFromHostname — только прод-хосты (для своего счётчика)', () => {
    expect(siteIdFromHostname('redevelopment.pro')).toBe('platform');
    expect(siteIdFromHostname('www.redevelopment.pro')).toBe('platform');
    expect(siteIdFromHostname('malllist.pro')).toBe('malls');
    expect(siteIdFromHostname('www.malllist.pro')).toBe('malls');
    expect(siteIdFromHostname('officelist.pro')).toBe('offices');
    expect(siteIdFromHostname('localhost')).toBeNull();
    expect(siteIdFromHostname('domain-split-catalogs-5bba.vercel.app')).toBeNull();
  });

  it('crossDomainRedirect: ТЦ с платформы → malllist, БЦ не трогает', () => {
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/tc/dana-mall')).toBe(
      'https://malllist.pro/minsk/tc/dana-mall',
    );
    expect(crossDomainRedirect('www.redevelopment.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/bc')).toBeNull();
    expect(crossDomainRedirect('malllist.pro', '/minsk/tc')).toBeNull();
    expect(crossDomainRedirect('malllist.pro', '/')).toBeNull();
  });
});

describe('sites / domain split (логика при enabled обоих)', () => {
  // Эти кейсы дублируют правила из crossDomainRedirect при полном сплите.
  // Сейчас offices ещё false — гоняем через локальную копию правил.

  function redirectWhenEnabled(host: string, pathname: string): string | null {
    const bare = host.replace(/^www\./, '').toLowerCase();
    const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const offices = 'https://officelist.pro';
    const malls = 'https://malllist.pro';
    const platform = 'https://redevelopment.pro';

    if (host.toLowerCase().startsWith('www.') && (bare === 'redevelopment.pro' || bare === 'officelist.pro' || bare === 'malllist.pro')) {
      const origin = bare === 'officelist.pro' ? offices : bare === 'malllist.pro' ? malls : platform;
      return `${origin}${pathname}`;
    }

    const siteId = siteIdForPath(path);
    if (siteId === 'offices') {
      if (bare === 'officelist.pro') {
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
    if (bare === 'officelist.pro' || bare === 'malllist.pro') {
      if (path === '/' || path === '') {
        // malllist — своя главная; officelist пока уходит в каталог БЦ.
        if (bare === 'malllist.pro') return null;
        return `${offices}/minsk/bc`;
      }
      return `${platform}${pathname}`;
    }
    return null;
  }

  it('с платформы каталог БЦ уходит на officelist с тем же путём', () => {
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bc')).toBe('https://officelist.pro/minsk/bc');
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bc/titan')).toBe('https://officelist.pro/minsk/bc/titan');
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bc/metro/nemiga')).toBe(
      'https://officelist.pro/minsk/bc/metro/nemiga',
    );
  });

  it('legacy bcminsk и /bc/:slug тоже на officelist', () => {
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/bcminsk/titan')).toBe('https://officelist.pro/minsk/bc/titan');
    expect(redirectWhenEnabled('redevelopment.pro', '/bc/titan')).toBe('https://officelist.pro/minsk/bc/titan');
  });

  it('с платформы каталог ТЦ уходит на malllist', () => {
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
    expect(redirectWhenEnabled('redevelopment.pro', '/minsk/tc/dana-mall')).toBe('https://malllist.pro/minsk/tc/dana-mall');
  });

  it('корень каталожного домена', () => {
    expect(redirectWhenEnabled('officelist.pro', '/')).toBe('https://officelist.pro/minsk/bc');
    // У malllist своя главная — с корня никуда не уводим.
    expect(redirectWhenEnabled('malllist.pro', '/')).toBeNull();
  });

  it('www схлопывается в apex', () => {
    expect(redirectWhenEnabled('www.officelist.pro', '/minsk/bc')).toBe('https://officelist.pro/minsk/bc');
    expect(redirectWhenEnabled('www.malllist.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
  });
});
