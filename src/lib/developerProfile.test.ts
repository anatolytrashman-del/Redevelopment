import { describe, expect, it } from 'vitest';
import type { DeveloperInfo, DeveloperPortfolioEntry } from '../data/businessCenters';
import {
  collectDeveloperSources,
  developerAboutFaqAnswer,
  developerCompaniesFaqAnswer,
  developerMainName,
  developerPortfolioFaqAnswer,
  developerProfileSentence,
  developerSectionSize,
  formatDeveloperArea,
  groupPortfolio,
  hasDeveloperDeepData,
  mergeDeveloperFormFields,
  normalizeDeveloperInfo,
  portfolioMeta,
  websiteLink,
} from './developerProfile';

const base = {
  logoUrl: null,
  description: 'Сеть торговых центров.',
  phone: '+375 17 000-00-00',
  address: null,
  hours: null,
  website: 'korona.by',
  email: null,
};

const entry = (over: Partial<DeveloperPortfolioEntry> = {}): DeveloperPortfolioEntry => ({
  name: 'ТЦ «Корона»',
  kind: 'ТЦ',
  city: 'Минск',
  year: '2005',
  area: '12 300 м²',
  note: null,
  owner: null,
  source: null,
  sourceUrl: null,
  ...over,
});

describe('normalizeDeveloperInfo', () => {
  it('null и не-объекты → null', () => {
    expect(normalizeDeveloperInfo(null)).toBeNull();
    expect(normalizeDeveloperInfo('x')).toBeNull();
    expect(normalizeDeveloperInfo([])).toBeNull();
  });

  it('старая форма без новых полей остаётся прежней', () => {
    const info = normalizeDeveloperInfo({ ...base, phone: '  ' });
    expect(info).toEqual({ ...base, phone: null });
    expect(hasDeveloperDeepData(info)).toBe(false);
    expect(info && 'companies' in info).toBe(false);
  });

  it('разбирает новые поля и отбрасывает кривые записи', () => {
    const info = normalizeDeveloperInfo({
      ...base,
      companies: [
        { role: 'генподрядчик', name: 'Rönesans', legal_name: 'Rönesans Holding', years: 2011, country: 'Турция', text: 'Строит.' },
        { role: 'архитектор' },
        'мусор',
        { name: 'Без роли' },
      ],
      profile: {
        name: '«Табак-инвест»',
        founded: 1996,
        hq: 'Минск',
        scale: [{ label: 'торговых центров', value: 25, date: '2024' }, { label: 'без значения' }],
        people: [{ name: 'И. Иванов', role: 'директор' }, { name: 'Без роли' }],
      },
      portfolio: [{ name: 'ТЦ «Корона»', area: 12300, year: 2005 }, { kind: 'ТЦ' }],
      facts: [{ label: 'Первый ТЦ', text: 'Открыт в 1999 году.' }, { label: 'Пусто' }],
    });
    expect(info?.companies).toHaveLength(1);
    expect(info?.companies?.[0]).toMatchObject({ legalName: 'Rönesans Holding', years: '2011', text: 'Строит.' });
    expect(info?.profile).toMatchObject({ name: '«Табак-инвест»', founded: '1996', business: null });
    expect(info?.profile?.scale).toEqual([
      { label: 'торговых центров', value: '25', date: '2024', source: null, sourceUrl: null },
    ]);
    expect(info?.profile?.people).toHaveLength(1);
    expect(info?.portfolio).toEqual([
      entry({ kind: null, city: null, area: '12 300 м²' }),
    ]);
    expect(info?.facts).toHaveLength(1);
    expect(hasDeveloperDeepData(info)).toBe(true);
  });

  it('пустые массивы и профиль без имени не кладутся', () => {
    const info = normalizeDeveloperInfo({ ...base, companies: [], profile: { hq: 'Минск' }, portfolio: [{}], facts: null });
    expect(info && Object.keys(info).sort()).toEqual(Object.keys(base).sort());
  });

  it('незнакомые ключи сохраняются как есть', () => {
    const info = normalizeDeveloperInfo({ ...base, contactsSourceUrl: 'https://x.by' }) as unknown as Record<string, unknown>;
    expect(info.contactsSourceUrl).toBe('https://x.by');
  });

  it('повторный разбор ничего не меняет', () => {
    const once = normalizeDeveloperInfo({ ...base, portfolio: [{ name: 'А', area: 5000 }] });
    expect(normalizeDeveloperInfo(once)).toEqual(once);
  });
});

describe('mergeDeveloperFormFields', () => {
  const empty = { logoUrl: null, description: null, phone: null, address: null, hours: null, website: null, email: null };

  it('сохраняет новые поля, которых нет в форме', () => {
    const existing = normalizeDeveloperInfo({
      ...base,
      companies: [{ role: 'генподрядчик', name: 'Rönesans' }],
      facts: [{ text: 'Факт.' }],
    });
    const merged = mergeDeveloperFormFields({ ...empty, description: 'Новое описание' }, existing);
    expect(merged?.description).toBe('Новое описание');
    expect(merged?.phone).toBeNull();
    expect(merged?.companies).toEqual(existing?.companies);
    expect(merged?.facts).toEqual(existing?.facts);
  });

  it('пустая форма без переносимого → null, как раньше', () => {
    expect(mergeDeveloperFormFields(empty, null)).toBeNull();
    expect(mergeDeveloperFormFields(empty, { ...base })).toBeNull();
  });

  it('пустая форма, но есть развёрнутый блок → объект остаётся', () => {
    const existing = normalizeDeveloperInfo({ ...base, profile: { name: 'Корона' } });
    const merged = mergeDeveloperFormFields(empty, existing);
    expect(merged?.profile?.name).toBe('Корона');
    expect(merged?.description).toBeNull();
  });
});

describe('форматирование', () => {
  it('formatDeveloperArea', () => {
    expect(formatDeveloperArea(12300)).toBe('12 300 м²');
    expect(formatDeveloperArea(0)).toBeNull();
    expect(formatDeveloperArea('около 40 тыс. м²')).toBe('около 40 тыс. м²');
    expect(formatDeveloperArea(null)).toBeNull();
  });

  it('portfolioMeta склеивает только заполненное', () => {
    expect(portfolioMeta(entry())).toBe('ТЦ · Минск · 2005 · 12 300 м²');
    expect(portfolioMeta(entry({ kind: null, area: null }))).toBe('Минск · 2005');
  });

  it('websiteLink', () => {
    expect(websiteLink('korona.by')).toEqual({ href: 'https://korona.by/', label: 'korona.by' });
    expect(websiteLink('https://www.ronesans.com/ru')).toEqual({ href: 'https://www.ronesans.com/ru', label: 'ronesans.com' });
    expect(websiteLink('нет сайта')).toBeNull();
    expect(websiteLink(null)).toBeNull();
  });

  it('developerMainName: профиль, иначе developer', () => {
    expect(developerMainName(normalizeDeveloperInfo({ ...base, profile: { name: 'Корона' } }), 'ТИ')).toBe('Корона');
    expect(developerMainName(normalizeDeveloperInfo(base), 'ТИ')).toBe('ТИ');
    expect(developerMainName(null, null)).toBeNull();
  });
});

describe('groupPortfolio', () => {
  it('один владелец — одна группа без подписи', () => {
    const groups = groupPortfolio([entry({ owner: 'А' }), entry({ owner: 'А' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].owner).toBeNull();
  });

  it('несколько владельцев — группы в порядке появления', () => {
    const groups = groupPortfolio([entry({ owner: 'Б', name: '1' }), entry({ owner: 'А', name: '2' }), entry({ owner: 'Б', name: '3' })]);
    expect(groups.map((g) => [g.owner, g.items.map((i) => i.name)])).toEqual([
      ['Б', ['1', '3']],
      ['А', ['2']],
    ]);
  });

  it('пусто — пусто', () => {
    expect(groupPortfolio([])).toEqual([]);
  });

  it('limit режет после группировки: подпись группы есть и в превью', () => {
    const list = [entry({ owner: 'А', name: '1' }), entry({ owner: 'А', name: '2' }), entry({ owner: 'Б', name: '3' })];
    expect(groupPortfolio(list, 2).map((g) => [g.owner, g.items.map((i) => i.name)])).toEqual([['А', ['1', '2']]]);
    expect(groupPortfolio(list, 3)).toHaveLength(2);
  });
});

describe('источники и высота', () => {
  it('collectDeveloperSources собирает из всех частей', () => {
    const info = normalizeDeveloperInfo({
      ...base,
      profile: { name: 'К', scale: [{ label: 'a', value: 1, source: 'S1' }] },
      companies: [{ role: 'r', name: 'n', source: 'S2', sourceUrl: 'https://s2.by' }],
      facts: [{ text: 't', source: 'S3' }],
    }) as DeveloperInfo;
    expect(collectDeveloperSources(info).map((s) => s.source)).toEqual(['S1', 'S2', 'S3']);
  });

  it('без новых полей высота — строки описания, как раньше', () => {
    expect(developerSectionSize(null)).toBe(0);
    expect(developerSectionSize(normalizeDeveloperInfo(base))).toBe(1);
  });

  it('с новыми полями растёт с портфелем, но не дальше превью', () => {
    const make = (n: number) =>
      normalizeDeveloperInfo({ ...base, portfolio: Array.from({ length: n }, (_, i) => ({ name: `О${i}` })) });
    expect(developerSectionSize(make(4))).toBeGreaterThan(developerSectionSize(normalizeDeveloperInfo(base)));
    expect(developerSectionSize(make(8))).toBeGreaterThan(developerSectionSize(make(4)));
    // 20 объектов — те же 8 на экране плюс кнопка «Показать ещё».
    expect(developerSectionSize(make(20)) - developerSectionSize(make(8))).toBeLessThanOrEqual(3);
  });
});

describe('FAQ', () => {
  it('developerProfileSentence', () => {
    expect(
      developerProfileSentence({ name: 'Корона', founded: '1996', hq: 'Минск', business: 'Сеть ТЦ', scale: [], people: [] }),
    ).toBe('Корона: основана в 1996 году, штаб-квартира — Минск. Сеть ТЦ.');
    expect(developerProfileSentence({ name: 'К', founded: null, hq: null, business: null, scale: [], people: [] })).toBeNull();
    expect(developerProfileSentence(null)).toBeNull();
  });

  it('developerCompaniesFaqAnswer — по участнику в строку', () => {
    const info = normalizeDeveloperInfo({
      ...base,
      companies: [
        { role: 'инвестор и застройщик', name: 'Галерея Концепт', years: '2011–н. в.', country: 'Беларусь', text: 'Построила комплекс' },
        { role: 'генподрядчик', name: 'Rönesans' },
      ],
    });
    expect(developerCompaniesFaqAnswer(info?.companies)).toBe(
      'Инвестор и застройщик — Галерея Концепт (2011–н. в. · Беларусь). Построила комплекс.\nГенподрядчик — Rönesans.',
    );
    expect(developerCompaniesFaqAnswer(undefined)).toBeNull();
  });

  it('developerPortfolioFaqAnswer — с группами по владельцам', () => {
    expect(developerPortfolioFaqAnswer([entry(), entry({ name: 'Prime Hall', kind: 'БЦ', area: null, year: null })])).toBe(
      'ТЦ «Корона» (ТЦ · Минск · 2005 · 12 300 м²); Prime Hall (БЦ · Минск).',
    );
    expect(developerPortfolioFaqAnswer([entry({ owner: 'А' }), entry({ owner: 'Б', name: 'X', kind: null, city: null, year: null, area: null })])).toBe(
      'А: ТЦ «Корона» (ТЦ · Минск · 2005 · 12 300 м²).\nБ: X.',
    );
    expect(developerPortfolioFaqAnswer([])).toBeNull();
  });

  it('developerAboutFaqAnswer — цифры, люди, факты без повтора профиля', () => {
    const info = normalizeDeveloperInfo({
      ...base,
      profile: {
        name: 'Корона',
        founded: 1996,
        scale: [{ label: 'торговых центров', value: '25', date: '2024-05' }],
        people: [{ name: 'И. Иванов', role: 'основатель' }],
      },
      facts: [{ label: 'Первый ТЦ', text: 'Открыт в 1999 году' }, { text: 'Без подписи' }],
    });
    expect(developerAboutFaqAnswer(info)).toBe(
      'В цифрах: торговых центров — 25 (май 2024).\nОснователь — И. Иванов.\nПервый ТЦ. Открыт в 1999 году.\nБез подписи.',
    );
    expect(developerAboutFaqAnswer(normalizeDeveloperInfo(base))).toBeNull();
  });
});
