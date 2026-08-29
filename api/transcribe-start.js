// Vercel serverless function: старт расшифровки записи встречи через
// speech2text.ru — асинхронный API (submit → poll → result), в отличие от
// прежнего синхронного Whisper через ProxyAPI. Клиент грузит аудио ЦЕЛИКОМ
// (без нарезки на куски — задача асинхронная, лимит тела Vercel-функции на
// это не давит, файл едет через Storage, не напрямую в функцию) в приватный
// бакет meeting-audio, зовёт эту функцию с путём. Функция скачивает файл
// сервисным ключом, отправляет speech2text.ru и сразу удаляет файл из
// бакета — аудио в системе не хранится, дальше обработка идёт на стороне
// speech2text.ru, мы только опрашиваем статус (см. transcribe-poll.js).
//
// Работает только на Vercel-домене — на статическом хостинге бэкенда нет.

import { SPEECH2TEXT_BASE, speech2TextKeyProblem } from './_speech2text.js';
import { requireStaffAuth } from './_auth.js';

const BUCKET = 'meeting-audio';

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

// Best-effort: ошибка удаления не должна ронять уже полученный task id —
// мусорный файл в приватном бакете хуже, чем потерянный результат.
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
  const user = await requireStaffAuth(req, res);
  if (!user) return;
  const keyProblem = speech2TextKeyProblem();
  if (keyProblem) {
    res.status(500).json({ error: keyProblem });
    return;
  }

  const { path } = req.body ?? {};
  // Путь строго вида "uploads/<uuid>.<ext>" — защита от чтения чужих путей
  // сервисным ключом (никаких "../", слэшей в id и т.п.).
  if (typeof path !== 'string' || !/^uploads\/[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(path)) {
    res.status(400).json({ error: 'Некорректный путь аудиофайла' });
    return;
  }

  try {
    const { buffer, contentType } = await downloadFromStorage(path);

    const form = new FormData();
    const fileName = path.split('/').pop();
    form.append('file', new Blob([buffer], { type: contentType }), fileName);
    form.append('lang', 'ru');

    const resp = await fetch(`${SPEECH2TEXT_BASE}/api/recognitions/task/file?api-key=${process.env.SPEECH2TEXT_API_KEY}`, {
      method: 'POST',
      body: form,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ошибка отправки в speech2text (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    if (!data.id) {
      throw new Error('speech2text не вернул id задачи');
    }

    await deleteFromStorage(path);
    res.status(200).json({ taskId: data.id });
  } catch (err) {
    // Файл чистим и при ошибке — повторная попытка загрузит его заново.
    await deleteFromStorage(path);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось отправить запись на расшифровку' });
  }
}
