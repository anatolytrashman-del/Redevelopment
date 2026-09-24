import { describe, expect, it } from 'vitest';
import { fillTenantFloors, floorFromText, levelFromOrgHtml } from './yandex-tenant-floors.mjs';

// Урезанный state-view карточки организации: сама карточка и «похожее место»
// с другим уровнем — брать надо уровень именно своей карточки.
const orgHtml = (id, level, additionalAddress = null) => `<html><script type="application/json" class="state-view">${JSON.stringify({
  stack: [{ results: { items: [
    { id: '999', businessProperties: { level: '5' } },
    { id, businessProperties: level ? { level } : {}, additionalAddress },
  ] } }],
})}</script></html>`;

describe('floorFromText', () => {
  it('читает «2 этаж», «этаж 4» и минус', () => {
    expect(floorFromText('Stradivarius Магазин одежды Рейтинг 4,8 2 этаж')).toBe('2');
    expect(floorFromText('офис 401, этаж 4')).toBe('4');
    expect(floorFromText('Гиппо −1 этаж')).toBe('-1');
    expect(floorFromText('Рейтинг 4,8 В подборке')).toBeNull();
  });
});

describe('levelFromOrgHtml', () => {
  it('берёт уровень плана своей карточки, а не соседней', () => {
    expect(levelFromOrgHtml(orgHtml('42', '-1'), '42')).toBe('-1');
  });
  it('без уровня — этаж из дополнительного адреса', () => {
    expect(levelFromOrgHtml(orgHtml('42', null, 'этаж 3'), '42')).toBe('3');
  });
  it('нет своей карточки — null', () => {
    expect(levelFromOrgHtml(orgHtml('42', '2'), '7')).toBeNull();
  });
});

describe('fillTenantFloors', () => {
  it('ходит в карточку только за теми, у кого этажа нет в тексте', async () => {
    const fetched = [];
    const { organizations, stats } = await fillTenantFloors(
      [
        { name: 'A', sourceId: '1', sourceUrl: 'https://yandex.by/maps/org/a/1/', rawText: 'A Рейтинг 4,8 2 этаж' },
        { name: 'B', sourceId: '2', sourceUrl: 'https://yandex.by/maps/org/b/2/', rawText: 'B Магазин' },
      ],
      { fetchHtml: async (url) => { fetched.push(url); return orgHtml('2', '6'); } },
    );
    expect(fetched).toEqual(['https://yandex.by/maps/org/b/2/']);
    expect(organizations.map((o) => o.floor)).toEqual(['2', '6']);
    expect(stats).toMatchObject({ fromText: 1, fromCard: 1, missing: 0, stopped: false });
  });

  it('на CAPTCHA без человека останавливается и сохраняет найденное', async () => {
    const { organizations, stats } = await fillTenantFloors(
      [{ name: 'B', sourceId: '2', sourceUrl: 'https://yandex.by/maps/org/b/2/', rawText: 'B' }],
      { fetchHtml: async () => '<form action="/checkcaptcha">SmartCaptcha</form>' },
    );
    expect(stats.stopped).toBe(true);
    expect(organizations[0].floor).toBeUndefined();
  });
});
