// Vercel serverless function: веб-поиск реальных поставщиков под список
// материалов запроса на вкладке "Ресерч" (Suppliers.tsx) — владелец,
// 2026-08-31: "веб-поиск поставщиков делай через клод, модель sonnet5".
//
// Ходит не в OpenAI-совместимый путь ProxyAPI (как meeting-ai.js), а в
// отдельный Anthropic-совместимый путь того же шлюза (тот же PROXYAPI_KEY,
// другой заголовок — x-api-key вместо Authorization: Bearer, и другой base
// path). Подтверждено вживую: GET /anthropic/v1/models с этим ключом отдаёт
// список моделей Claude, включая claude-sonnet-5.
//
// Модель сама вызывает свой инструмент web_search (server-side, реальный
// поиск, не выдумывает) несколько раз и в конце возвращает JSON-массив
// найденных компаний. Это медленно — на 1-2 реальных поисковых запроса
// модели уходит 20-120+ секунд (проверено вживую curl'ом), поэтому
// maxDuration функции поднят до 300 (см. vercel.json, тот же приём, что и у
// transcribe-start.js/meeting-ai.js на Hobby-плане с fluid compute).
import { proxyApiKeyProblem } from './_proxyapi.js';
import { requireStaffAuth } from './_auth.js';

const MODEL = 'claude-sonnet-5';

// Ограничиваем число реальных поисковых запросов модели — не только ради
// скорости: неограниченный поиск легко утягивает функцию за maxDuration
// без единого ответа клиенту.
const MAX_SEARCHES = 3;

const SYSTEM_PROMPT = `Ты помогаешь найти реальных поставщиков строительных материалов в Беларуси
(преимущественно Минск) через веб-поиск для девелоперской компании.
Используй инструмент web_search 1-3 раза (не больше), чтобы найти 3-6
конкретных компаний-поставщиков с сайтом и, если реально нашёл, телефоном
или email. Не выдумывай контакты — бери только то, что действительно
нашёл в поиске, для неизвестного поля оставляй пустую строку.

После поиска верни ОТВЕТ ЦЕЛИКОМ в виде JSON-массива, без markdown-разметки,
без пояснений до или после, без \`\`\` — строго формат:
[{"name": "...", "website": "...", "phone": "...", "email": "...", "note": "..."}]

"note" — одна короткая фраза по-русски: что продают/чем подходят под запрос.
Если ничего подходящего не нашёл — верни пустой массив [].`;

function buildUserQuery(itemsText, sectionTitle) {
  const parts = [];
  if (sectionTitle) parts.push(`Раздел: ${sectionTitle}.`);
  parts.push(`Материалы: ${itemsText}.`);
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
    .slice(0, 10)
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

  const { itemsText, sectionTitle } = req.body ?? {};
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
        max_tokens: 2000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_SEARCHES }],
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserQuery(itemsText.trim(), typeof sectionTitle === 'string' ? sectionTitle.trim() : '') }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ошибка веб-поиска (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    const results = sanitizeResults(extractJsonArray(data.content));
    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось выполнить веб-поиск поставщиков' });
  }
}
