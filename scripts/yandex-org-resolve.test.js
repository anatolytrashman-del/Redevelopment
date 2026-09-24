import { describe, expect, it } from 'vitest';
import {
  isOrgTabUrl,
  nameVariants,
  normalizeOrgName,
  orgUrl,
  parseAddress,
  pickOrganization,
  searchTextsFor,
} from './yandex-org-resolve.mjs';

// Кандидаты — в той форме, что отдаёт extractCandidates по живым выдачам
// Яндекс.Карт 2026-09-23 (id, name, rubric «… · seoname · business», address,
// lat/lng).
const cand = (id, name, rubric, address, lat, lng) => ({ id, name, rubric, address, lat, lng });

describe('pickOrganization', () => {
  it('не берёт кинотеатр внутри ТРЦ «Замок», берёт сам ТРЦ', () => {
    const building = { slug: 'zamok', name: 'ТРЦ «Замок»', address: 'г. Минск, просп. Победителей, 65', lat: 53.9260584, lng: 27.517933 };
    const kino = cand('173046997273', '3D Кино', 'Кинотеатр · 3d_kino · business', 'Минск, просп. Победителей, 65', 53.925988, 27.517403);
    expect(pickOrganization({ candidates: [kino], building })).toBeNull();
    const zamok = cand('170174590947', 'Замок', 'Торговый центр · гипермаркет · zamok · business', 'просп. Победителей, 65', 53.926159, 27.517771);
    const home = cand('184226882638', 'Замок Home', 'Торговый центр · мебель для кухни · zamok_home · business', 'просп. Победителей, 65', 53.925358, 27.51708);
    const similar = cand('184226882638', 'Замок Home', 'zamok_home · similar', null, 53.925358, 27.51708);
    expect(pickOrganization({ candidates: [similar, home, kino, zamok], building })?.id).toBe('170174590947');
  });

  it('торговый центр важнее гипермаркета с тем же именем по тому же адресу', () => {
    const building = { slug: 'korona-v-uruche', name: 'Торговый центр «Корона в Уручье»', address: 'г. Минск, просп. Независимости, 154', lat: 53.9365113, lng: 27.6730761 };
    const hyper = cand('204330460449', 'Корона', 'Гипермаркет · магазин продуктов · korona · business', 'просп. Независимости, 154', 53.9364, 27.673013);
    const tc = cand('1187598279', 'Корона', 'Торговый центр · korona · business', 'просп. Независимости, 154', 53.936418, 27.67324);
    expect(pickOrganization({ candidates: [hyper, tc], building })?.id).toBe('1187598279');
  });

  it('супермаркет — арендатор, а не здание', () => {
    const building = { slug: 'almi-dzerzhinskogo', name: 'Торговый центр «Алми (Дзержинского)»', address: 'г. Минск, пр-т Дзержинского, 91', lat: 53.8592884, lng: 27.4824664 };
    const almi = cand('90478215777', 'Алми', 'Супермаркет · магазин продуктов · almi · business', 'просп. Дзержинского, 91', 53.859336, 27.481722);
    expect(pickOrganization({ candidates: [almi], building })).toBeNull();
  });

  it('далеко и без совпадения адреса — не берём; адрес совпал — берём при неверных координатах в базе', () => {
    const gum = cand('1272491908', 'ГУМ', 'Универмаг · gum · business', 'просп. Независимости, 21', 53.900452, 27.557942);
    const wrongCoords = { slug: 'gum', name: 'Универмаг «ГУМ»', lat: 53.9281475, lng: 27.6165742 };
    expect(pickOrganization({ candidates: [gum], building: { ...wrongCoords, address: 'г. Минск, просп. Независимости, 99' } })).toBeNull();
    expect(pickOrganization({ candidates: [gum], building: { ...wrongCoords, address: 'г. Минск, просп. Независимости, 21' } })?.id).toBe('1272491908');
  });

  it('безымянный ТЦ — по улице и дому', () => {
    const building = { slug: 'zhinovicha-7', name: 'Торговый центр на Жиновича, 7', address: 'г. Минск, ул. Жиновича, 7', lat: 53.9205942, lng: 27.4482441 };
    const bonus = cand('244596377415', 'Бонус', 'Торговый центр · bonus · business', 'ул. Владислава Голубка, 2', 53.926255, 27.443933);
    const own = cand('127819457559', 'Торговый центр', 'Торговый центр · torgovy_tsentr · business', 'ул. Иосифа Жиновича, 7', 53.920583, 27.448128);
    expect(pickOrganization({ candidates: [bonus, own], building })?.id).toBe('127819457559');
  });

  it('имя в другой записи — по адресу («Avia Mall» ↔ «Авиа Молл»)', () => {
    const building = { slug: 'avia-mall', name: 'ТРЦ «Avia Mall»', address: 'г. Минск, ул. Братская, 18', lat: 53.866435, lng: 27.5482848 };
    const avia = cand('174475631470', 'Авиа Молл', 'Торговый центр · развлекательный центр · avia_moll · business', 'Братская ул., 18', 53.867179, 27.548504);
    expect(pickOrganization({ candidates: [avia], building })?.id).toBe('174475631470');
  });
});

describe('вспомогательное', () => {
  it('нормализует имена и строит варианты', () => {
    expect(normalizeOrgName('ТРЦ «Galleria Minsk»')).toBe('galleria minsk');
    expect(normalizeOrgName('Комаровский рынок')).toBe('комаровский');
    expect(nameVariants('Торговый центр «Гиппо на Городецкой»')).toContain('гиппо');
    expect(nameVariants('Торговый центр «Алми (Дзержинского)»')).toContain('алми');
  });

  it('запросы: короткое имя, потом «… торговый центр»', () => {
    expect(searchTextsFor('ТРЦ «Замок»').slice(0, 2)).toEqual(['Замок', 'Замок торговый центр']);
  });

  it('разбирает адрес без корпуса', () => {
    expect(parseAddress('г. Минск, пр. Независимости, 155, корп. 1')).toEqual({ streetWords: ['независимости'], house: '155' });
  });

  it('адрес вкладки организации', () => {
    const org = { id: '1058481112', seoname: 'tsum' };
    expect(orgUrl(org, 'inside')).toBe('https://yandex.by/maps/org/tsum/1058481112/inside/');
    expect(isOrgTabUrl('https://yandex.by/maps/org/tsum/1058481112/reviews/?ll=1,2', '1058481112', 'reviews')).toBe(true);
    expect(isOrgTabUrl('https://yandex.by/maps/org/tsum/1058481112/', '1058481112', 'reviews')).toBe(false);
  });
});
