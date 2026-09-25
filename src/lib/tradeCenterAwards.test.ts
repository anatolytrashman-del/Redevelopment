import { describe, expect, it } from 'vitest';
import data from './__fixtures__/tc-awards.json';
import { normalizeRetailInfo } from './tradeCenterRetail';
import {
  awardCategory, awardPill, rankingBadge, rankingSource, shortAwardTitle,
  shortRankingTitle, sortAwardTiles, sortRankingTiles,
} from './tradeCenterAwards';

const dana = normalizeRetailInfo(data['dana-mall'])!;
const galleria = normalizeRetailInfo(data['galleria-minsk'])!;
const zamok = normalizeRetailInfo(data.zamok)!;
const entry = galleria.ranking[0];
const award = galleria.awards[0];

describe('короткие подписи рейтингов', () => {
  it('сокращает реальные данные трёх ТЦ', () => {
    expect(shortRankingTitle(entry)).toBe('Крупнейших ТЦ Минска по арендопригодной площади');
    expect(shortRankingTitle(galleria.ranking[1])).toBe('Самый посещаемый ТРЦ Минска');
    expect(shortRankingTitle(dana.ranking[2])).toBe('По посещаемости среди ТЦ Минска');
    expect(shortRankingTitle(galleria.ranking[4])).toBe('Лучшие паркинги у торговых центров Минска');
    expect(shortRankingTitle(zamok.ranking[1])).toBe('Самых узнаваемых ТРЦ Минска');
    expect(shortRankingTitle(zamok.ranking[2])).toBe('Самых посещаемых ТРЦ Минска');
    expect(shortRankingTitle(zamok.ranking[5])).toBe('Крупнейших ТЦ Минска');
    expect(shortRankingTitle(dana.ranking[1])).not.toContain('2021');
  });
  it.each(['9-й', '9-е', '9-я'])('убирает числовое начало %s', (prefix) => {
    expect(shortRankingTitle({ ...entry, headline: `${prefix} торговый центр Минска` })).toBe('Торговый центр Минска');
  });
  it.each(['Первое', 'Второй', 'Третий'])('убирает начало %s место в', (prefix) => {
    expect(shortRankingTitle({ ...entry, headline: `${prefix} место в рейтинге торговых центров` })).toBe('Рейтинге торговых центров');
  });
  it('сохраняет короткий остаток и несовпадающий порядковый номер', () => {
    expect(shortRankingTitle({ ...entry, headline: '8-е место среди ТЦ' })).toBe('8-е место среди ТЦ');
    expect(shortRankingTitle({ ...entry, headline: 'Первый торговый центр Минска' })).toBe('Первый торговый центр Минска');
    expect(shortRankingTitle({ ...entry, headline: null })).toBe('Арендопригодная площадь ТЦ Минска');
  });
  it('выбирает источник по приоритету и краткий критерий', () => {
    expect(rankingSource(galleria.ranking[1])).toBe('Опрос MASMI');
    expect(rankingSource({ ...entry, scope: 'опрос жителей', source: 'Onliner' })).toBe('Опрос горожан');
    expect(rankingSource(entry)).toBe('Onliner');
    expect(rankingSource({ ...entry, source: null })).toBe('По арендной площади');
    expect(rankingSource({ ...entry, source: null, criterion: 'общая площадь по проекту' })).toBe('По общей площади');
    expect(rankingSource({ ...entry, org: 'MASMI' })).toBe('Опрос MASMI');
  });
  it('отличает оценку от места и не считает ноль отсутствующим', () => {
    expect(rankingBadge(galleria.ranking[4])).toEqual({ main: '9/10', sub: 'баллов' });
    expect(rankingBadge(zamok.ranking[3])).toEqual({ main: '8/10', sub: 'баллов' });
    expect(rankingBadge({ ...entry, total: null })).toEqual({ main: '№8', sub: null });
    expect(rankingBadge({ ...entry, total: 0, value: '9 баллов из 10' })).toEqual({ main: '№8', sub: 'из 0' });
    expect(rankingBadge({ ...entry, criterion: 'оценка', value: '0 баллов из 10' }).main).toBe('0/10');
  });
});

describe('короткие подписи наград', () => {
  it('убирает результат и год из названия', () => {
    expect(shortAwardTitle(award)).toBe('Республиканский конкурс на лучшее архитектурное произведение');
    expect(shortAwardTitle(galleria.awards[1])).toBe('GRREAt');
    expect(shortAwardTitle(dana.awards[0])).toBe('Realt Golden Key');
    expect(shortAwardTitle(zamok.awards[0])).toBe('«Битва торговых центров» Onliner');
  });
  it('выбирает русскую номинацию, включая вторые скобки', () => {
    expect(awardCategory(dana.awards[1])).toBe('Концепция и дизайн проекта года');
    expect(awardCategory(dana.awards[4])).toBe('Крупный торговый проект, более 50 000 м²');
    expect(awardCategory(galleria.awards[3])).toBe('Маркетинг в сферах ритейла и коммерческой недвижимости');
    expect(awardCategory({ ...galleria.awards[3], category: null })).toBe('За популяризацию культурной самобытности');
    expect(awardCategory({ ...award, category: null })).toBe('');
  });
  it('сокращает плашку, сохраняя степень медали', () => {
    expect(awardPill(award)).toBe('Медаль I степени');
    expect(awardPill({ ...award, resultText: 'медаль и диплом III степени' })).toBe('Медаль III степени');
    expect(awardPill(galleria.awards[3])).toBe('Награда');
    expect(awardPill(galleria.awards[2])).toBe('Финалист');
    expect(awardPill({ ...award, result: 'winner', resultText: null })).toBe('Победитель');
  });
});

describe('порядок плиток', () => {
  it('ставит первые места перед остальными, затем сортирует по году без изменения данных', () => {
    const before = [...zamok.ranking];
    expect(sortRankingTiles(before).map((item) => [item.place, item.year])).toEqual([
      [1, 2025], [1, 2015], [1, 2012], [3, 2024], [7, 2024], [3, 2024], [3, 2021],
    ]);
    expect(before).toEqual(zamok.ranking);
  });
  it('сортирует награды только по году, неизвестный год в конце', () => {
    const input = [...galleria.awards, { ...award, year: null }];
    expect(sortAwardTiles(input).map((item) => item.year)).toEqual(['2025', '2021', '2021', '2017', null]);
    expect(input[0].year).toBe('2017');
    expect(sortAwardTiles([{ ...award, year: '2014–2018' }, { ...award, year: '2017' }])[0].year).toBe('2014–2018');
  });
});
