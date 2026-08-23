// Vercel serverless function: расшифровка куска аудиозаписи встречи через
// ProxyAPI (https://proxyapi.ru — российский шлюз к OpenAI, оплата
// российской картой; ключ владельца в PROXYAPI_KEY). Клиент грузит аудио
// (целиком или порезанное на куски, см. lib/meetingTranscribeApi.ts) в
// приватный бакет meeting-audio и зовёт эту функцию с путём. Функция
// скачивает файл сервисным ключом, шлёт в Whisper и УДАЛЯЕТ файл из
// бакета — аудио в системе не хранится, остаётся только текст.
//
// Прямо в функцию файл не передаётся из-за лимита тела запроса Vercel
// (4.5 МБ) — кусок аудио в разы больше. Лимит самого Whisper — 25 МБ на
// файл, за нарезку отвечает клиент.
//
// Работает только на Vercel-домене — на статическом хостинге бэкенда нет.

const BUCKET = 'meeting-audio';
const WHISPER_MODEL = 'whisper-1';

async function downloadFromStorage(path) {
  const resp = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Не удалось получить аудиофайл из хранилища (${resp.status})`);
  }
  const contentType = resp.headers.get('content-type') || 'application/octet-stream';
  const buffer = await resp.arrayBuffer();
  return { buffer, contentType };
}

// Best-effort: ошибка удаления не должна ронять уже полученную расшифровку —
// мусорный файл в приватном бакете хуже, чем потерянные минуты Whisper.
async function deleteFromStorage(path) {
  try {
    await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  } catch {
    // осознанно молча
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.PROXYAPI_KEY) {
    res.status(500).json({ error: 'PROXYAPI_KEY не настроен в переменных окружения Vercel' });
    return;
  }

  const { path, prompt } = req.body ?? {};
  // Путь строго вида "chunks/<uuid>.<ext>" — защита от чтения чужих путей
  // сервисным ключом (никаких "../", слэшей в id и т.п.).
  if (typeof path !== 'string' || !/^chunks\/[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(path)) {
    res.status(400).json({ error: 'Некорректный путь аудиофайла' });
    return;
  }

  try {
    const { buffer, contentType } = await downloadFromStorage(path);

    const form = new FormData();
    const fileName = path.split('/').pop();
    form.append('file', new Blob([buffer], { type: contentType }), fileName);
    form.append('model', WHISPER_MODEL);
    form.append('language', 'ru');
    form.append('response_format', 'json');
    // Хвост расшифровки предыдущего куска — Whisper использует prompt как
    // контекст: имена/термины из прошлого куска не «переизобретаются», шов
    // между кусками получается связным.
    if (typeof prompt === 'string' && prompt.trim()) {
      form.append('prompt', prompt.slice(-600));
    }

    const resp = await fetch('https://api.proxyapi.ru/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PROXYAPI_KEY}` },
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ошибка распознавания (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();

    await deleteFromStorage(path);
    res.status(200).json({ text: data.text ?? '' });
  } catch (err) {
    // Файл-кусок чистим и при ошибке — повторная попытка загрузит его заново.
    await deleteFromStorage(path);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось расшифровать запись' });
  }
}
