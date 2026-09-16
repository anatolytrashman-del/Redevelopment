import { beforeEach, describe, expect, it, vi } from 'vitest';

// Решение «куда положить счёт» проверяем без сети: доступ к базе и ответ
// модели подменены. Проверяется именно РАЗВИЛКА — где автоматика пишет сама,
// а где обязана спросить человека. Живые данные (реальный счёт владельца,
// реальные поставки) прогонялись отдельно, разово, при разработке.
vi.mock('./_supplyDb.js', () => ({
  restGet: vi.fn(),
  restGetAll: vi.fn(),
  restInsert: vi.fn(),
  fetchRequestPositions: vi.fn(),
  fetchPositionsForRequests: vi.fn(),
}));

const db = await import('./_supplyDb.js');
const { routeInvoice } = await import('./_invoiceRouting.js');

const REQUESTS = [
  { id: 'req-tile', title: 'Керамогранит и плитка', section_title: 'Полы', estimate_id: 'e1', section_id: 's1' },
  { id: 'req-paint', title: 'Краски, обои и декоративные покрытия', section_title: 'Отделка', estimate_id: 'e1', section_id: 's2' },
  { id: 'req-universal', title: 'Универсальные поставщики', section_title: '', estimate_id: null, section_id: null },
];

const POSITIONS = {
  'req-tile': [{ id: 'p1', name: 'Керамогранит Alma Ceramica Urban Home 60x60 серый', quantity: 900, unit: 'м2' }],
  'req-paint': [{ id: 'p2', name: 'Краска Tikkurila Euro Power 7 белая', quantity: 40, unit: 'л' }],
  'req-universal': [],
};

const INVOICE = {
  isInvoice: true,
  supplierInn: '5029069967',
  supplierName: 'ООО «ЛЕ МОНЛИД»',
  supplierEmail: null,
  supplierSite: 'https://lemanapro.ru',
  items: [{ name: 'Керамогранит Alma Ceramica Urban Home 60x60 матовый серый', unit: 'шт' }],
};

// Ответ модели, выбирающей поставку: подменяем сам HTTP-вызов ProxyAPI.
function modelAnswers(requestId, confidence) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ requestId, confidence, reason: 'по позициям счёта' }) }],
      }),
    })),
  );
}

function withOffers(offers) {
  db.restGetAll.mockImplementation(async () => offers);
  db.restGet.mockImplementation(async (path) => (path.startsWith('supplier_research_requests') ? REQUESTS : []));
  db.fetchRequestPositions.mockImplementation(async (id) => POSITIONS[id] ?? []);
  db.fetchPositionsForRequests.mockImplementation(
    async (requests) => new Map(requests.map((r) => [r.id, POSITIONS[r.id] ?? []])),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROXYAPI_KEY = 'sk-test';
});

describe('routeInvoice', () => {
  it('поставщик опознан и его карточка в той самой поставке — пишем без вопросов', async () => {
    withOffers([
      { id: 'off-1', request_id: 'req-tile', name: 'Лемана ПРО', inn: '5029069967', email: '', website_url: 'lemanapro.ru' },
    ]);
    modelAnswers('req-tile', 0.95);

    const routed = await routeInvoice(INVOICE);
    expect(routed.offerId).toBe('off-1');
    expect(routed.requestId).toBe('req-tile');
    expect(routed.matchedBy).toBe('inn');
    expect(routed.ambiguous).toBeUndefined();
  });

  it('карточка универсальная, а счёт про керамогранит — спрашиваем, поставка по содержанию первая', async () => {
    withOffers([
      { id: 'off-u', request_id: 'req-universal', name: 'Лемана ПРО', inn: null, email: '', website_url: 'https://lemanapro.ru' },
    ]);
    modelAnswers('req-tile', 0.95);

    const routed = await routeInvoice(INVOICE);
    expect(routed.ambiguous).toBe(true);
    expect(routed.candidates[0]).toMatchObject({ requestId: 'req-tile', recommended: true, offerId: null });
    // Вариант «оставить у карточки, которая уже есть» из списка не пропадает.
    expect(routed.candidates.some((c) => c.offerId === 'off-u')).toBe(true);
  });

  it('поставщика в системе нет — заводим карточку в поставке по содержанию счёта', async () => {
    withOffers([{ id: 'off-x', request_id: 'req-paint', name: 'Совсем другая компания', inn: '7707083893', email: '', website_url: '' }]);
    modelAnswers('req-tile', 0.9);

    const routed = await routeInvoice({ ...INVOICE, supplierInn: null, supplierName: 'Неизвестный поставщик', supplierSite: '' });
    expect(routed.createNewOffer).toBe(true);
    expect(routed.requestId).toBe('req-tile');
  });

  it('содержание не распозналось, но карточка у поставщика одна — кладём в неё', async () => {
    withOffers([
      { id: 'off-1', request_id: 'req-paint', name: 'Лемана ПРО', inn: '5029069967', email: '', website_url: '' },
    ]);
    modelAnswers(null, 0);

    const routed = await routeInvoice(INVOICE);
    expect(routed.offerId).toBe('off-1');
    expect(routed.requestId).toBe('req-paint');
  });

  it('никого не опознали и содержание не помогло — спрашиваем, а не пишем наугад', async () => {
    withOffers([]);
    modelAnswers(null, 0);

    const routed = await routeInvoice({ ...INVOICE, supplierInn: null, supplierName: '', supplierSite: '', items: [] });
    expect(routed.ambiguous).toBe(true);
    expect(routed.candidates.length).toBeGreaterThan(0);
  });
});
