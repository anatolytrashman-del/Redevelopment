import { describe, expect, it } from 'vitest';
import { microdistrictHubUrl, metroHubIncludesMicrodistrict } from './businessCenterHubs';

// Грушевка/Уручье/Каменная Горка — один и тот же slug у станции метро и у
// микрорайона, а данные микрорайона (2GIS-контур) заметно беднее данных
// станции (проверка по базе 2026-09-21: 2 БЦ в микрорайоне против 6 у
// станции для Грушевки, 2 против 5 для Уручья, 3 против 4 для Каменной
// Горки) — решили не плодить 2 слабые страницы под один и тот же поисковый
// запрос, а ссылаться и редиректить (vercel.json) на страницу станции.

describe('microdistrictHubUrl — коллизия с одноимённой станцией метро', () => {
  it('ведёт на хаб станции для трёх известных коллизий', () => {
    expect(microdistrictHubUrl('Грушевка')).toBe('/minsk/bcminsk/metro/grushevka');
    expect(microdistrictHubUrl('Уручье')).toBe('/minsk/bcminsk/metro/uruchye');
    expect(microdistrictHubUrl('Каменная Горка')).toBe('/minsk/bcminsk/metro/kamennaya-gorka');
  });

  it('обычный микрорайон без коллизии ведёт на свою страницу', () => {
    expect(microdistrictHubUrl('Комаровка')).toBe('/minsk/bcminsk/microrayon/komarovka');
  });

  it('неизвестный микрорайон — null', () => {
    expect(microdistrictHubUrl('Не существует')).toBeNull();
  });

  it('Сухарево ведёт на хаб ул. Лобанка — тот же дубль по составу, не по имени', () => {
    expect(microdistrictHubUrl('Сухарево')).toBe('/minsk/bcminsk/ulitsa/ul-lobanka');
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
