import { describe, expect, it } from 'vitest';
import { publicationSource, secondLevelHost } from './businessCenterSourcesApi';

const siteHosts = new Set(['ajax-bc.by', 'ibiz.by']);
const pub = (url: string, outlet: string | null = null) => publicationSource(url, outlet, siteHosts);

describe('secondLevelHost', () => {
  it('снимает поддомен и www', () => {
    expect(secondLevelHost('realt.onliner.by')).toBe('onliner.by');
    expect(secondLevelHost('www.belta.by')).toBe('belta.by');
    expect(secondLevelHost('belta.by')).toBe('belta.by');
  });
});

describe('publicationSource', () => {
  it('берёт название издания из реестра, а не домен', () => {
    expect(pub('https://realt.onliner.by/2025/05/18/it-xab')?.site).toEqual({
      href: 'https://realt.onliner.by/',
      label: 'Onliner',
    });
  });

  it('для издания без логотипа берёт подпись из самой публикации', () => {
    expect(pub('https://ais.by/story/446', 'Архитектура и строительство')?.site.label).toBe(
      'Архитектура и строительство',
    );
  });

  it('без подписи показывает полный хост, а дедуплицирует по второму уровню', () => {
    const found = pub('https://darriuss.livejournal.com/123.html');
    expect(found?.site).toEqual({ href: 'https://darriuss.livejournal.com/', label: 'darriuss.livejournal.com' });
    expect(found?.key).toBe('livejournal.com');
  });

  it('не дублирует источники, уже перечисленные в DATA_SOURCE_GROUPS', () => {
    expect(pub('https://realt.by/news/article/1/')).toBeNull();
    expect(pub('https://prometr.by/bc/x')).toBeNull();
    expect(pub('https://re.kufar.by/l/minsk/snyat/ofis')).toBeNull();
    expect(pub('https://ru.wikipedia.org/wiki/Минск-Мир')).toBeNull();
  });

  it('не выводит экстремистские ресурсы', () => {
    expect(pub('https://news.zerkalo.io/economics/1', 'Зеркало')).toBeNull();
    expect(pub('https://nn.by/x')).toBeNull();
  });

  it('не считает изданием сайт здания или застройщика, в том числе на поддомене', () => {
    expect(pub('https://ajax-bc.by/about')).toBeNull();
    expect(pub('https://absheron.ibiz.by/')).toBeNull();
  });

  it('молча пропускает пустое и мусорное', () => {
    expect(pub('')).toBeNull();
    expect(publicationSource(null, null, siteHosts)).toBeNull();
    expect(pub('не ссылка')).toBeNull();
  });
});
