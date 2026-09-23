import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLASS_SLUGS,
  DISTRICT_SLUGS,
  MICRODISTRICT_SLUGS,
  MIN_INDEXABLE_HUB_CENTERS,
  microdistrictHubUrl,
  metroHubIncludesMicrodistrict,
} from './businessCenterHubs';

// Грушевка/Уручье/Каменная Горка — один и тот же slug у станции метро и у
// микрорайона, а данные микрорайона (2GIS-контур) заметно беднее данных
// станции (проверка по базе 2026-09-21: 2 БЦ в микрорайоне против 6 у
// станции для Грушевки, 2 против 5 для Уручья, 3 против 4 для Каменной
// Горки) — решили не плодить 2 слабые страницы под один и тот же поисковый
// запрос, а ссылаться и редиректить (vercel.json) на страницу станции.

describe('microdistrictHubUrl — коллизия с одноимённой станцией метро', () => {
  it('ведёт на хаб станции для трёх известных коллизий', () => {
    expect(microdistrictHubUrl('Грушевка')).toBe('/minsk/bc/metro/grushevka');
    expect(microdistrictHubUrl('Уручье')).toBe('/minsk/bc/metro/uruchye');
    expect(microdistrictHubUrl('Каменная Горка')).toBe('/minsk/bc/metro/kamennaya-gorka');
  });

  it('обычный микрорайон без коллизии ведёт на свою страницу', () => {
    expect(microdistrictHubUrl('Комаровка')).toBe('/minsk/bc/area/komarovka');
  });

  it('неизвестный микрорайон — null', () => {
    expect(microdistrictHubUrl('Не существует')).toBeNull();
  });

  it('Сухарево ведёт на хаб ул. Лобанка — тот же дубль по составу, не по имени', () => {
    expect(microdistrictHubUrl('Сухарево')).toBe('/minsk/bc/street/lobanka');
  });
});

describe('metroHubIncludesMicrodistrict — не терять здания без расстояния до станции', () => {
  it('подхватывает БЦ микрорайона, у которого 2GIS не проставил станцию (случай «Каменногорского»)', () => {
    expect(metroHubIncludesMicrodistrict({ microdistrict: 'Каменная Горка' }, 'Каменная горка')).toBe(true);
    expect(metroHubIncludesMicrodistrict({ microdistrict: 'Грушевка' }, 'Грушевка')).toBe(true);
    expect(metroHubIncludesMicrodistrict({ microdistrict: 'Уручье' }, 'Уручье')).toBe(true);
  });

  it('не подхватывает чужой микрорайон и станции без коллизии', () => {
    expect(metroHubIncludesMicrodistrict({ microdistrict: 'Комаровка' }, 'Каменная горка')).toBe(false);
    expect(metroHubIncludesMicrodistrict({ microdistrict: 'Грушевка' }, 'Московская')).toBe(false);
    expect(metroHubIncludesMicrodistrict({ microdistrict: null }, 'Грушевка')).toBe(false);
  });
});

// Порог индексации тонких срезов и карты слагов продублированы в
// scripts/generate-sitemap.mjs (скрипт сборки без TS-загрузчика, тот же
// приём, что у метро и улиц там же). Расхождение означает, что sitemap
// зовёт краулера ровно на те страницы, которые сайт отдаёт с noindex, —
// поэтому копии сверяет тест, а не внимательность.
describe('порог тонких срезов — копия в scripts/generate-sitemap.mjs', () => {
  const script = readFileSync(new URL('../../scripts/generate-sitemap.mjs', import.meta.url), 'utf-8');

  it('порог совпадает', () => {
    const match = script.match(/const MIN_INDEXABLE_HUB_CENTERS = (\d+);/);
    expect(match?.[1]).toBe(String(MIN_INDEXABLE_HUB_CENTERS));
  });

  it('карты слагов класса, района и микрорайона совпадают', () => {
    for (const [name, slug] of [
      ...Object.entries(CLASS_SLUGS),
      ...Object.entries(DISTRICT_SLUGS),
      ...Object.entries(MICRODISTRICT_SLUGS),
    ]) {
      expect(script, `${name} → ${slug}`).toContain(`: '${slug}'`);
    }
  });
});
