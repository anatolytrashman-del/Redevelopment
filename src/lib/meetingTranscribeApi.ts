import { supabase } from './supabase';
import { withRetry } from './withRetry';

// Саммери/предложения задач — тоже обычные запросы к нашим Vercel-функциям,
// подвержены той же сетевой ошибке "Load failed"/"Failed to fetch" ещё до
// ответа сервера (см. withRetry.ts), что и запросы к Supabase — один
// молчаливый повтор вместо немедленной ошибки. Таймаут длиннее обычного
// (60с, не 15с по умолчанию): gpt-4o на полном транскрипте часовой встречи
// отвечает не мгновенно, и это не повод обрывать ещё идущий запрос.
const AI_CALL_TIMEOUT_MS = 60000;

// Клиентская часть расшифровки аудиозаписей встреч через speech2text.ru —
// единственный провайдер (ProxyAPI/Whisper убраны из кода, владелец решил
// оставить только speech2text.ru). Схема, асинхронная в отличие от прежней:
//
//   файл целиком → в приватный бакет meeting-audio (anon может только
//   insert — читать/удалять умеет лишь service role в функции)
//        → api/transcribe-start.js: скачивает файл, отправляет
//          speech2text.ru, получает id задачи, сразу удаляет файл из бакета
//        → клиент опрашивает api/transcribe-poll.js по таймеру, пока
//          задача не завершится
//        → результат приходит уже готовым текстом (сервер сам разбирает
//          SRT-формат от speech2text.ru).
//
// Никакой нарезки на клиенте больше нет — она была нужна только из-за
// синхронного Whisper (лимит 25 МБ на файл, maxDuration на функцию не
// успевал за часовой записью одним вызовом). Асинхронный API speech2text.ru
// таких ограничений не создаёт: сервер один раз пересылает файл и дальше
// только опрашивает статус короткими запросами.

const POLL_INTERVAL_MS = 5000;
// Щедрый запас — длинная встреча может обрабатываться на стороне
// speech2text.ru не одну минуту, опрос идёт с клиента и не упирается в
// serverless-таймауты Vercel (каждый отдельный запрос короткий).
const POLL_MAX_ATTEMPTS = 600; // 600 × 5с = 50 минут

export interface TranscribeProgress {
  stage: 'uploading' | 'processing';
}

// Расширение — по нему speech2text.ru определяет контейнер файла.
function fileExt(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'mp3';
}

async function uploadFile(file: File): Promise<string> {
  const path = `uploads/${crypto.randomUUID()}.${fileExt(file)}`;
  const { error } = await supabase.storage.from('meeting-audio').upload(path, file);
  if (error) throw new Error(`Не удалось загрузить аудио в хранилище: ${error.message}`);
  return path;
}

async function startTranscription(path: string): Promise<string> {
  const resp = await fetch('/api/transcribe-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Ошибка отправки на расшифровку (${resp.status})`);
  if (!data.taskId) throw new Error('Сервер не вернул id задачи расшифровки');
  return data.taskId;
}

interface PollResult {
  status: 'processing' | 'done' | 'error';
  text?: string;
  error?: string;
}

async function pollOnce(taskId: string): Promise<PollResult> {
  const resp = await fetch(`/api/transcribe-poll?taskId=${encodeURIComponent(taskId)}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Ошибка проверки статуса (${resp.status})`);
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcribeAudioFile(
  file: File,
  onProgress: (p: TranscribeProgress) => void,
): Promise<string> {
  onProgress({ stage: 'uploading' });
  const path = await uploadFile(file);
  const taskId = await startTranscription(path);

  onProgress({ stage: 'processing' });
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(POLL_INTERVAL_MS);
    let result: PollResult;
    try {
      result = await pollOnce(taskId);
    } catch {
      // Отдельная сетевая икота посреди долгого опроса — не повод обрывать
      // уже запущенную (и оплаченную) расшифровку, пробуем ещё раз.
      continue;
    }
    if (result.status === 'processing') continue;
    if (result.status === 'error') throw new Error(result.error || 'Не удалось расшифровать запись');
    return (result.text ?? '').trim();
  }
  throw new Error('Расшифровка не завершилась за отведённое время — попробуйте позже');
}

export interface SuggestedTask {
  title: string;
  description: string;
  assignees: string[];
}

// alreadySuggested — заголовки уже имеющихся предложений (в т.ч. решённых):
// сервер передаёт их модели как «не повторять», чтобы повторная генерация
// не предлагала одно и то же.
export async function suggestTasksFromTranscript(
  transcript: string,
  assignees: string[],
  alreadySuggested: string[],
): Promise<SuggestedTask[]> {
  return withRetry(async () => {
    const resp = await fetch('/api/suggest-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, assignees, alreadySuggested }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Ошибка извлечения задач (${resp.status})`);
    return Array.isArray(data.tasks) ? data.tasks : [];
  }, 1000, AI_CALL_TIMEOUT_MS);
}

export async function summarizeTranscript(transcript: string): Promise<string> {
  return withRetry(async () => {
    const resp = await fetch('/api/summarize-meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Ошибка генерации саммери (${resp.status})`);
    return data.summary ?? '';
  }, 1000, AI_CALL_TIMEOUT_MS);
}
