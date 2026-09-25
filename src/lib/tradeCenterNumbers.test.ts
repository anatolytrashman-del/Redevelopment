import { describe, expect, it } from 'vitest';
import data from '../../docs/codex-tasks/tc-numbers-galleria.json';
import type { RetailFigureEntry } from '../data/businessCenters';
import { groupNumbers, holidayDate, numberFormat, numberIcon, numberLabel } from './tradeCenterNumbers';

const entries = data.numbers.filter((entry) => !entry.skip);
const figure = (label: string, text = ''): RetailFigureEntry => ({ label, text, value: '10', date: null, note: null, source: null, sourceUrl: null });

describe('цифры Galleria', () => {
  it('разделяет масштаб, праздники и здание, сохраняя записи', () => {
    const groups = groupNumbers(entries);
    expect(groups.map((group) => group.label)).toEqual(['Масштаб', 'Праздники в атриуме', 'Здание']);
    expect(groups.map((group) => group.entries.map((entry) => entry.value))).toEqual([
      ['12 млн+', '100 000 м²'], ['120 м', '40 000', '1 000'], ['16 т', '5 400 м²', '750', '27 000 м²', '500 м'],
    ]);
    expect(groups.flatMap((group) => group.entries)).toHaveLength(entries.length);
  });
  it('распознаёт население Беларуси и 14 полей', () => {
    expect(numberFormat(entries[0])).toEqual({ kind: 'comparison', label: 'Жители Беларуси', value: '9,06 млн', ratio: 9.06 / 12 });
    expect(numberFormat(entries[1])).toEqual({ kind: 'fields', count: 14, caption: '≈ 14 футбольных полей' });
  });
  it('выбирает иконки по смыслу и короткие даты праздников', () => {
    const groups = groupNumbers(entries);
    expect(groups[2].entries.map(numberIcon)).toEqual(['Monitor', 'PanelsTopLeft', 'HardHat', 'Car', 'Flag']);
    expect(groups[1].entries.map(holidayDate)).toEqual(['Новый год 2025', 'Весна 2025', 'Новый год 2026']);
  });
});

describe('пограничные случаи', () => {
  it('не группирует меньше четырёх цифр и не создаёт пустые группы', () => {
    expect(groupNumbers([])).toEqual([]);
    expect(groupNumbers(entries.slice(0, 3))).toEqual([{ kind: 'building', label: '', entries: entries.slice(0, 3) }]);
    expect(groupNumbers(Array.from({ length: 4 }, () => figure('Лифты'))).map((group) => group.kind)).toEqual(['building']);
  });
  it('оставляет максимум две масштабные цифры и отдаёт праздникам приоритет', () => {
    const input = [figure('Магазины'), figure('Торговая площадь'), figure('Арендаторы'), figure('Посетители новогодней инсталляции')];
    const snapshot = JSON.stringify(input);
    expect(groupNumbers(input).map((group) => group.entries.length)).toEqual([2, 1, 1]);
    expect(groupNumbers(input)[2].entries[0].label).toBe('Арендаторы');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('распознаёт весенние украшения, но не любую весеннюю цифру', () => {
    const groups = groupNumbers([figure('Весной украсили зал'), figure('Весной выросла площадь'), figure('Лифты'), figure('Этажи')]);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[0].kind).toBe('holidays');
  });
  it('ограничивает число полей и сохраняет короткий остаток фразы', () => {
    expect(numberFormat({ value: '100', text: '14 футбольных полей в центре. Дальше.' })).toEqual({ kind: 'fields', count: 14, caption: '≈ 14 футбольных полей в центре' });
    for (const count of ['0', '41', '140', '1,5']) expect(numberFormat({ value: '100', text: `${count} футбольных полей.` }).kind).toBe('plain');
  });
  it('не делит на ноль, понимает тысячи и оставляет первое предложение', () => {
    expect(numberFormat({ value: '0', text: 'Больше, чем 9 млн жителей.' }).kind).toBe('plain');
    expect(numberFormat({ value: '12 тыс.', text: 'Больше, чем 9 тыс. жителей города.' })).toMatchObject({ kind: 'comparison', ratio: 0.75 });
    expect(numberFormat({ value: '10', text: 'Первое предложение. Второе.' })).toEqual({ kind: 'plain', text: 'Первое предложение.' });
    expect(numberFormat({ value: '10', text: null })).toEqual({ kind: 'plain', text: '' });
  });
  it('переносит декабрь на следующий Новый год и сохраняет обычные даты', () => {
    expect(holidayDate({ ...figure('Новогодняя ёлка'), date: 'декабрь 2024' })).toBe('Новый год 2025');
    expect(holidayDate({ ...figure('Декорация'), date: 'апрель 2025' })).toBe('Апрель 2025');
    expect(holidayDate(figure('Ёлка'))).toBeNull();
  });
  it('обрезает подпись по слову и распознаёт оставшиеся иконки', () => {
    const label = 'Длинная подпись '.repeat(6);
    expect(numberLabel(label).length).toBeLessThanOrEqual(60);
    expect(numberLabel(label)).toBe('Длинная подпись Длинная подпись Длинная подпись Длинная…');
    expect(['Эскалаторы', 'Высота', 'Другое'].map((label) => numberIcon(figure(label)))).toEqual(['ArrowUpDown', 'Building2', 'Sparkles']);
  });
});
