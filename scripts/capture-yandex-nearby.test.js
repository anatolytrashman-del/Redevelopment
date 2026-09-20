import { describe, expect, it } from 'vitest';
import {
  candidatesToPlaces,
  classifyCandidate,
  extractCandidates,
  extractStateView,
  looksLikeCaptchaHtml,
  searchUrl,
} from './capture-yandex-nearby.mjs';
import { dedupePlaces } from './nearby-places-common.mjs';

// Формы взяты с живых выдач Яндекс.Карт 2026-09-20 (аптека/магазин/кафе/
// банкомат вокруг БЦ «Порт»): организация — числовой id и рубрика с русским
// названием, станция метро — id station__, остановка — stop__, а слой карты
// и блок «похожие» приезжают с рубрикой без кириллицы («common», «…·similar»).
const center = { slug: 'port', lat: 53.946157, lng: 27.682522 };

const organization = { name: 'Соцфарма', coordinates: [27.68047, 53.94324], id: 159900781874, categories: [{ name: 'Аптека' }, { name: 'sotsfarma' }, { name: 'business' }], address: 'просп. Независимости, 164' };
const station = { name: 'Уручье', coordinates: [27.688191739, 53.946029898], id: 'station__9880196', category: 'metro' };
const stationExit = { name: 'Уручье', coordinates: [27.6875, 53.9459], id: 'station__9880197', category: 'metro' };
const stop = { name: 'Шафарнянская', coordinates: [27.6807, 53.9455], id: 'stop__10045236', category: 'common' };
const mapNoise = { name: 'Станция метро Уручье', coordinates: [27.6875, 53.9462], id: 987654321, category: 'common' };
const similar = { name: 'Планета Здоровья', coordinates: [27.68178, 53.952068], id: 159900781875, categories: [{ name: 'planeta_zdorovya' }, { name: 'similar' }] };

describe('разбор состояния выдачи', () => {
  it('достаёт JSON из state-view и раскодирует HTML-сущности', () => {
    const html = `<html><script type="application/json" class="state-view">{&quot;name&quot;:&quot;Кафе &amp; бар&quot;}</script></html>`;
    expect(extractStateView(html)).toEqual({ name: 'Кафе & бар' });
  });

  it('возвращает null, если блока нет или в нём не JSON', () => {
    expect(extractStateView('<html></html>')).toBeNull();
    expect(extractStateView('<script type="application/json" class="state-view">{сломано</script>')).toBeNull();
  });

  it('узнаёт страницу с проверкой', () => {
    expect(looksLikeCaptchaHtml('<div class="SmartCaptcha">')).toBe(true);
    expect(looksLikeCaptchaHtml('<div>обычная выдача</div>')).toBe(false);
  });
});

describe('классификация объектов выдачи', () => {
  it('различает метро, остановку и организацию по форме id', () => {
    expect(classifyCandidate({ id: 'station__9880196', rubric: 'metro' }, 'shop')).toBe('metro');
    expect(classifyCandidate({ id: 'stop__10045236', rubric: 'common' }, 'shop')).toBe('transport_stop');
    expect(classifyCandidate({ id: '159900781874', rubric: 'Аптека · business' }, 'shop')).toBe('pharmacy');
  });

  it('отбрасывает слой карты и блок «похожие» — у них рубрика без кириллицы', () => {
    expect(classifyCandidate({ id: '987654321', rubric: 'common' }, 'pharmacy')).toBeNull();
    expect(classifyCandidate({ id: '159900781875', rubric: 'planeta_zdorovya · similar' }, 'shop')).toBeNull();
    expect(classifyCandidate({ id: '', rubric: 'Аптека' }, 'shop')).toBeNull();
  });
});

describe('выдача целиком → строки таблицы', () => {
  const state = { data: { items: [organization, station, stationExit, stop, mapNoise, similar] } };
  const places = dedupePlaces(
    candidatesToPlaces({
      candidates: extractCandidates(state),
      center,
      fallbackCategory: 'pharmacy',
      collectedAt: '2026-09-20T10:00:00Z',
    }),
  );

  it('оставляет организацию, станцию и остановку, отбрасывая мусор карты', () => {
    expect(places.map((place) => place.category).sort()).toEqual(['metro', 'pharmacy', 'transport_stop']);
    expect(places.find((place) => place.category === 'pharmacy')).toMatchObject({
      name: 'Соцфарма',
      source_url: 'https://yandex.ru/maps/org/159900781874',
      address: 'просп. Независимости, 164',
    });
  });

  it('склеивает выходы одной станции в одну запись — по имени, а не по id', () => {
    const metro = places.filter((place) => place.category === 'metro');
    expect(metro).toHaveLength(1);
    expect(metro[0].source_place_id).toBe('metro:уручье');
  });

  it('у транспорта не выдумывает ссылку на карточку организации', () => {
    for (const place of places.filter((p) => p.category !== 'pharmacy')) {
      expect(place.source_url).toBeNull();
      expect(place.subcategory).toBeNull();
    }
  });
});

describe('адрес страницы поиска', () => {
  it('кодирует запрос и ставит точку здания центром выдачи', () => {
    expect(searchUrl({ text: 'продуктовый магазин', center })).toBe(
      'https://yandex.by/maps/157/minsk/search/%D0%BF%D1%80%D0%BE%D0%B4%D1%83%D0%BA%D1%82%D0%BE%D0%B2%D1%8B%D0%B9%20%D0%BC%D0%B0%D0%B3%D0%B0%D0%B7%D0%B8%D0%BD/?ll=27.682522,53.946157&z=17',
    );
  });
});
