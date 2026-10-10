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
  it('оба каталога уехали (redirects.malls + redirects.offices)', () => {
    expect(domainSplit.enabled).toBe(false);
    expect(domainSplit.redirects?.malls).toBe(true);
    expect(domainSplit.redirects?.offices).toBe(true);
    expect(REDIRECT_MALLS_ENABLED).toBe(true);
    expect(REDIRECT_OFFICES_ENABLED).toBe(true);
    expect(CATALOG_DOMAIN_SPLIT_ENABLED).toBe(true);
  });

  it('catalogSiteUrl: ТЦ → malllist, БЦ → officelist', () => {
    expect(catalogSiteUrl('bc')).toBe('https://officelist.pro/minsk/bc');
    expect(catalogSiteUrl('tc')).toBe('https://malllist.pro/minsk/tc');
    expect(absoluteCatalogUrl('bc', '/minsk/bc/titan')).toBe('https://officelist.pro/minsk/bc/titan');
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

  it('crossDomainRedirect: ТЦ → malllist, БЦ → officelist', () => {
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/tc/dana-mall')).toBe(
      'https://malllist.pro/minsk/tc/dana-mall',
    );
    expect(crossDomainRedirect('www.redevelopment.pro', '/minsk/tc')).toBe('https://malllist.pro/minsk/tc');
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/bc')).toBe('https://officelist.pro/minsk/bc');
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/bc/titan')).toBe('https://officelist.pro/minsk/bc/titan');
    expect(crossDomainRedirect('www.redevelopment.pro', '/minsk/bc')).toBe('https://officelist.pro/minsk/bc');
    expect(crossDomainRedirect('redevelopment.pro', '/minsk/bcminsk/titan')).toBe(
      'https://officelist.pro/minsk/bc/titan',
    );
    expect(crossDomainRedirect('redevelopment.pro', '/bc/titan')).toBe('https://officelist.pro/minsk/bc/titan');
    expect(crossDomainRedirect('malllist.pro', '/minsk/tc')).toBeNull();
    expect(crossDomainRedirect('malllist.pro', '/')).toBe('https://malllist.pro/minsk/tc');
    expect(crossDomainRedirect('officelist.pro', '/minsk/bc')).toBeNull();
    expect(crossDomainRedirect('officelist.pro', '/')).toBe('https://officelist.pro/minsk/bc');
    expect(crossDomainRedirect('www.officelist.pro', '/minsk/bc')).toBe('https://officelist.pro/minsk/bc');
  });
});
