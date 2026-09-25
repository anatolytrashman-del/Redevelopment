import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import data from '../../../docs/codex-tasks/tc-numbers-galleria.json';
import { TradeCenterNumbersCard } from './TradeCenterNumbers';

const entries = data.numbers.filter((entry) => !entry.skip);

describe('блок «ТЦ в цифрах»', () => {
  it('показывает группы в заданном порядке, скрывает пояснения и метаданные', () => {
    const html = renderToStaticMarkup(<TradeCenterNumbersCard numbers={entries} />);
    expect(html.indexOf('Масштаб')).toBeLessThan(html.indexOf('Праздники в атриуме'));
    expect(html.indexOf('Праздники в атриуме')).toBeLessThan(html.indexOf('Здание'));
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(5);
    expect(html.match(/hidden=""/g)).toHaveLength(5);
    expect(html).toContain('width:75.5%');
    expect(html).toContain('≈ 14 футбольных полей');
    expect(html).not.toMatch(/по данным ТЦ|2015-09|aria-expanded="true"/);
    expect(html.match(/id="numbers"/g)).toHaveLength(1);
  });
  it('малый набор показывает плитками без групп, пустой скрывает', () => {
    const html = renderToStaticMarkup(<TradeCenterNumbersCard numbers={entries.slice(0, 3)} />);
    expect(html).not.toMatch(/Масштаб|Праздники в атриуме|Здание/);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(renderToStaticMarkup(<TradeCenterNumbersCard numbers={[]} />)).toBe('');
  });
});
