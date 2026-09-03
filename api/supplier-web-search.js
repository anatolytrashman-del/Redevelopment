// Vercel serverless function: веб-поиск реальных поставщиков под список
// материалов запроса на вкладке "Ресерч" (Suppliers.tsx). Несмотря на имя
// файла (осталось от первой версии), также обрабатывает
// action:'recognize-invoice' — ручное распознавание счёта/КП из вложения
// письма (кнопка "Распознать данные автоматически" в предпросмотре,
// SupplierCorrespondenceTab.tsx) — та же логика, что и у автоматического
// срабатывания на входящих (purchase-email-webhook.js), общий хелпер
// api/_invoiceRecognition.js. Один файл на оба случая — лимит 12
// serverless-функций на Vercel Hobby уже выбран, новый файл заводить нельзя.
//
// 2026-08-31, дважды за день. Первая версия (claude-sonnet-5, Anthropic-путь
// ProxyAPI) обошлась в 358 ₽ за 4 запроса (~90 ₽/запрос) — владелец увидел
// это в отчёте расходов ProxyAPI и попросил модель подешевле. Первая
// попытка чинить — перевести на gpt-4o-mini-search-preview
// (OpenAI-совместимый путь) — не сработала: ProxyAPI отдаёт на этот
// эндпоинт `400 Model not supported`, хотя модель числится в каталоге
// `/openai/v1/models` (то же самое для gpt-4o-search-preview и
// gpt-5-search-api — проверено вживую curl'ом, ни одна search-модель
// OpenAI через этот шлюз не работает, каталог не значит поддержку).
//
// Настоящая причина дороговизны Sonnet 5 — не сама модель, а то, что она
// без явного указания заворачивает вызов web_search в "программный вызов
// инструмента" (пишет и исполняет код, который сам зовёт web_search) —
// это видно в сыром ответе API как отдельный блок `code_execution`
// server_tool_use РЯДОМ с `web_search`, и именно эта обвязка раздувала
// input_tokens до 41-45 тысяч на тривиальный запрос. Найдено случайно:
// claude-haiku-4-5 без явного `allowed_callers` на web_search вообще
// отказывается работать с ошибкой "does not support programmatic tool
// calling... explicitly set allowed_callers=['direct']" — то есть сама
// Anthropic считает эту обвязку побочным поведением, которое не все
// модели готовы включать молча. Добавление `allowed_callers: ['direct']`
// на инструмент запрещает эту обвязку и модели, которые её поддерживают
// (Sonnet 5) — тоже. Живой прогон claude-haiku-4-5 + allowed_callers:
// input_tokens 13 943 (было 41-45 тыс.), 8 секунд (было 20-115 с.),
// нашёл реальные телефоны/email 5 поставщиков. И модель дешевле яруса
// Haiku, и токенов на порядок меньше — комбинированная экономия в разы
// больше, чем просто смена модели.
import { proxyApiKeyProblem } from './_proxyapi.js';
import { requireStaffAuth } from './_auth.js';
import { recognizeInvoice } from './_invoiceRecognition.js';

const MODEL = 'claude-haiku-4-5-20251001';

// Владелец, 2026-09-03: "пусть ищет более основательно, мало ссылок было,
// давай минимум 20 валидных источников делать, если найдется" — было 3
// (хватало на 3-6 компаний), для 20 нужно заметно больше реальных поисковых
// запросов (разными формулировками/категориями/площадками), не один заход.
// Всё ещё ограничено (не unlimited) — по той же причине, что и раньше:
// защита от утягивания функции за maxDuration (300с, см. vercel.json) без
// единого ответа клиенту.
const MAX_SEARCHES = 10;

const SYSTEM_PROMPT = `Ты помогаешь найти реальных поставщиков строительных материалов в Беларуси
(преимущественно Минск) через веб-поиск для девелоперской компании.
Ищи ОСНОВАТЕЛЬНО — используй инструмент web_search до ${MAX_SEARCHES} раз,
разными запросами (конкретные позиции по отдельности, синонимы, категории,
разные каталоги/маркетплейсы/агрегаторы), чтобы найти МАКСИМУМ реальных
компаний-поставщиков — стремись к 20, если реально столько существует и
находится. Для каждой — сайт и, если реально нашёл, телефон или email.
Не выдумывай компании и контакты ради количества — бери только то, что
действительно нашёл в поиске, для неизвестного поля оставляй пустую строку.
Лучше меньше, но реальных, чем ровно 20 с придуманными.

После поиска верни ОТВЕТ ЦЕЛИКОМ в виде JSON-массива, без markdown-разметки,
без пояснений до или после, без \`\`\` — строго формат:
[{"name": "...", "website": "...", "phone": "...", "email": "...", "note": "..."}]

"note" — одна короткая фраза по-русски: что продают/чем подходят под запрос.
Если ничего подходящего не нашёл — верни пустой массив [].`;

function buildUserQuery(itemsText, sectionTitle, extra) {
  const parts = [];
  if (sectionTitle) parts.push(`Раздел: ${sectionTitle}.`);
  parts.push(`Материалы: ${itemsText}.`);
  if (extra) parts.push(`Дополнительные пожелания: ${extra}.`);
  parts.push('Найди поставщиков этих материалов в Минске/Беларуси.');
  return parts.join(' ');
}

// Ответ модели после tool use — несколько текстовых блоков (в них же могут
// попадать цитаты найденных страниц), финальный JSON — их конкатенация.
// Модель иногда оборачивает JSON в ```json несмотря на прямой запрет —
// снимаем обёртку перед парсингом.
function extractJsonArray(content) {
  const text = (Array.isArray(content) ? content : [])
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Модель не вернула список поставщиков в ожидаемом формате');
  }
  const parsed = JSON.parse(stripped.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('Модель вернула не массив');
  return parsed;
}

function sanitizeResults(raw) {
  return raw
    .filter((r) => r && typeof r.name === 'string' && r.name.trim())
    .slice(0, 20)
    .map((r) => ({
      name: r.name.trim(),
      website: typeof r.website === 'string' ? r.website.trim() : '',
      phone: typeof r.phone === 'string' ? r.phone.trim() : '',
      email: typeof r.email === 'string' ? r.email.trim() : '',
      note: typeof r.note === 'string' ? r.note.trim() : '',
    }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;
  const keyProblem = proxyApiKeyProblem();
  if (keyProblem) {
    res.status(500).json({ error: keyProblem });
    return;
  }

  if (req.body?.action === 'recognize-invoice') {
    const { fileUrl, fileName } = req.body ?? {};
    if (typeof fileUrl !== 'string' || !fileUrl.trim()) {
      res.status(400).json({ error: 'Не указан файл' });
      return;
    }
    try {
      const recognized = await recognizeInvoice(fileUrl.trim(), typeof fileName === 'string' ? fileName : '');
      res.status(200).json({ recognized });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось распознать документ' });
    }
    return;
  }

  const { itemsText, sectionTitle, extra } = req.body ?? {};
  if (typeof itemsText !== 'string' || !itemsText.trim()) {
    res.status(400).json({ error: 'Список материалов пуст' });
    return;
  }

  try {
    const resp = await fetch('https://api.proxyapi.ru/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.PROXYAPI_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        // Было 2000 — хватало на 3-6 компаний и 1-3 поиска. При до 10
        // поисков и до 20 компаний в финальном JSON модели нужно больше
        // места и на сами tool_use-блоки поисков, и на развёрнутый ответ.
        max_tokens: 6000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES, allowed_callers: ['direct'] }],
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildUserQuery(
              itemsText.trim(),
              typeof sectionTitle === 'string' ? sectionTitle.trim() : '',
              typeof extra === 'string' ? extra.trim() : '',
            ),
          },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      // 402 — недостаточно средств на балансе ProxyAPI. Проверено вживую:
      // тот же баланс общий для OpenAI- и Anthropic-путей шлюза (meeting-ai.js
      // на gpt-4o упадёт с той же ошибкой) — не проблема конкретно этого
      // эндпоинта, а нужно пополнить счёт в личном кабинете ProxyAPI.
      if (resp.status === 402) {
        throw new Error('Недостаточно средств на балансе ProxyAPI — пополните счёт в личном кабинете ProxyAPI (тот же баланс используют и остальные AI-функции проекта).');
      }
      throw new Error(`Ошибка веб-поиска (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    const results = sanitizeResults(extractJsonArray(data.content));
    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось выполнить веб-поиск поставщиков' });
  }
}
