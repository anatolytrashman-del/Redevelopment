import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import data from '../../lib/__fixtures__/tc-business-galleria.json';
import { normalizeRetailInfo } from '../../lib/tradeCenterRetail';
import { tcQuickJumpChips } from '../../lib/tradeCenterHero';
import { TradeCenterAdvertising, TradeCenterLeasing } from './TradeCenterBusiness';
import { BuildingOffersSection } from './BuildingOffersSection';

const info = normalizeRetailInfo(data)!;
describe('секции бизнеса ТЦ', () => {
  it('показывает контакты без форм, один якорь и заглушку', () => {
    const html = renderToStaticMarkup(<TradeCenterLeasing info={info} name="Galleria Minsk" sale={null} rent={null} />);
    expect(html.match(/id="offers"/g)).toHaveLength(1);
    expect(html).toContain('ТЦ не публикует список свободных площадей');
    expect(html).toContain('tel:+375445971888');
    expect(html).toContain('mailto:arenda@galleriaminsk.com');
    expect(html).toContain('trendpark@galleriaminsk.com');
    expect(html).not.toMatch(/<form|оставить заявку|Кабинет арендатора|Трафик для арендатора/);
    expect(renderToStaticMarkup(<TradeCenterLeasing info={null} name="ТЦ" sale={null} rent={null} />)).toBe('');
  });
  it('переиспользует vacancies без вложенного якоря и сохраняет нулевую цену', () => {
    const withVacancies = normalizeRetailInfo({ vacancies: [{ size: 20, floor: '0', type: 'Остров', deal: 'rent', pricePerSqm: 0 }] })!;
    withVacancies.vacancies[0].pricePerSqm = 0;
    const html = renderToStaticMarkup(<TradeCenterLeasing info={withVacancies} name="ТЦ" sale={null} rent={null} />);
    expect(html.match(/id="offers"/g)).toHaveLength(1);
    expect(html).toContain('Свободно по данным ТЦ');
    expect(html).toContain('0 этаж');
    expect(html).not.toMatch(/не публикует|цена по запросу/);
    const bc = renderToStaticMarkup(<BuildingOffersSection sale={null} rent={null} listed={withVacancies.vacancies} />);
    expect(bc).toContain('Что сейчас сдают и продают в здании');
  });
  it('показывает рекламу при одной аудитории и корректные переходы', () => {
    const audienceOnly = normalizeRetailInfo({ audience: data.audience })!;
    expect(renderToStaticMarkup(<TradeCenterAdvertising info={audienceOnly} name="ТЦ" />)).toContain('25–35');
    const html = renderToStaticMarkup(<TradeCenterAdvertising info={info} name="Galleria Minsk" />);
    expect(html).toContain('id="advertising"');
    expect(html).toContain('mailto:reklama@galleriaminsk.com');
    expect(html).not.toContain('id="business"');
    expect(tcQuickJumpChips(info).map((chip) => chip.id)).toEqual(['offers', 'advertising']);
    expect(tcQuickJumpChips(audienceOnly).map((chip) => chip.id)).toEqual(['advertising']);
  });
});
