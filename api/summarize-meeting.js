// Vercel serverless function: саммери встречи из готовой расшифровки
// (transcript) через LLM на ProxyAPI. Отдельный эндпоинт от расшифровки:
// саммери может перегенерироваться много раз (правка промта, другая
// модель) без повторной оплаты Whisper-минут.
//
// ВАЖНО ПРО ПРОМТ: владелец обещал прислать свой формат саммери — когда
// пришлёт, заменить DEFAULT_SUMMARY_PROMPT ниже (это осознанная заглушка
// с разумным дефолтом, а не финальная версия).

const MODEL = 'gpt-4o-mini';

const DEFAULT_SUMMARY_PROMPT = `Ты — ассистент, который готовит саммери деловых встреч по расшифровке аудиозаписи.
Составь конспект на русском в формате markdown:

## Ключевые темы
- краткий список обсуждавшихся тем

## Договорённости
- конкретные решения и договорённости (кто, что, в какой срок — если это прозвучало)

## Открытые вопросы
- что осталось нерешённым или требует уточнения

Пиши сжато, фактами из разговора, ничего не выдумывай. Если в расшифровке
нет информации для какого-то раздела — напиши в нём «—».`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.PROXYAPI_KEY) {
    res.status(500).json({ error: 'PROXYAPI_KEY не настроен в переменных окружения Vercel' });
    return;
  }

  const { transcript } = req.body ?? {};
  if (typeof transcript !== 'string' || !transcript.trim()) {
    res.status(400).json({ error: 'Пустая расшифровка' });
    return;
  }

  try {
    const resp = await fetch('https://api.proxyapi.ru/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PROXYAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: DEFAULT_SUMMARY_PROMPT },
          { role: 'user', content: `Расшифровка встречи:\n\n${transcript}` },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ошибка генерации саммери (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    const summary = data.choices?.[0]?.message?.content ?? '';
    if (!summary.trim()) throw new Error('Модель вернула пустой ответ');

    res.status(200).json({ summary });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось сгенерировать саммери' });
  }
}
