import { supabase } from './supabase';

// Клиентская часть расшифровки аудиозаписей встреч. Схема:
//
//   файл → [если >20 МБ или длиннее ~6 минут: декодировать и порезать на
//           5-минутные WAV-куски]
//        → каждый кусок в приватный бакет meeting-audio (anon может только
//          insert — читать/удалять куски умеет лишь service role в функции)
//        → api/transcribe-meeting.js на каждый кусок (Whisper через
//          ProxyAPI; функция удаляет кусок после расшифровки)
//        → склейка текста по порядку.
//
// Почему нарезка на клиенте: у Whisper лимит 25 МБ на файл, у Vercel —
// 4.5 МБ на тело запроса (поэтому файл едет через Storage, не через
// функцию) и maxDuration на функцию (час аудио одним Whisper-вызовом не
// успевает — реальный 504). Часовая запись с диктофона — 30–60 МБ.
// WAV 16 кГц моно выбран как формат кусков, потому что кодируется в
// браузере тривиально (это сырой PCM с 44-байтовым заголовком) и
// мгновенно, в отличие от mp3-энкодеров на JS; 5 минут такого WAV — 9.6 МБ.
//
// Ограничение памяти: decodeAudioData разворачивает ВЕСЬ файл в PCM.
// На 16 кГц это ~230 МБ RAM на 2 часа записи — на десктопе нормально,
// на слабом телефоне может не хватить. Файлы ≤20 МБ поэтому вообще не
// декодируются — уходят как есть одним куском.

const DIRECT_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
// 3 минуты, не 5: при параллельной обработке (см. CHUNK_CONCURRENCY ниже)
// более мелкие куски дают более ровный прогресс и реже упираются в
// серверную отсечку на медленном ответе ProxyAPI.
const CHUNK_SECONDS = 3 * 60;
// Целиком (без нарезки) — только короткие записи. Ограничение по ВРЕМЕНИ, не
// только по размеру: сжатая m4a-запись часовой встречи весит меньше 20 МБ, но
// Whisper обрабатывает её дольше лимита Vercel-функции (реальный 504 на
// первом же прогоне владельца). Длинное = резать, каким бы маленьким ни было.
const DIRECT_LIMIT_SECONDS = 6 * 60;
const TARGET_SAMPLE_RATE = 16000;

export interface TranscribeProgress {
  stage: 'preparing' | 'transcribing';
  chunkIndex: number;
  chunkCount: number;
}

async function uploadChunk(blob: Blob, ext: string): Promise<string> {
  const path = `chunks/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('meeting-audio').upload(path, blob);
  if (error) throw new Error(`Не удалось загрузить аудио в хранилище: ${error.message}`);
  return path;
}

async function transcribeChunk(path: string, prompt: string, offsetSeconds: number): Promise<string> {
  const resp = await fetch('/api/transcribe-meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // offsetSeconds — позиция куска в целой записи: сервер вшивает в текст
    // метки времени, и они должны идти сквозной шкалой, а не с нуля на кусок.
    body: JSON.stringify({ path, prompt, offsetSeconds }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // 504 отдаёт сам Vercel (функция не уложилась в maxDuration), тела с
    // нашим сообщением у него нет — переводим на человеческий.
    const message = resp.status === 504
      ? 'Сервер не успел расшифровать кусок за отведённое время — попробуйте ещё раз'
      : data.error || `Ошибка расшифровки (${resp.status})`;
    const err = new Error(message) as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return data.text ?? '';
}

// Один упавший кусок не должен ронять всю многоминутную (и оплачиваемую)
// расшифровку — таймаут/икота Whisper на одном куске из дюжины реальна.
// Повторяем цикл целиком, включая загрузку в бакет: сервер удаляет файл
// из бакета даже при ошибке, к моменту повтора старого пути уже нет.
// Осмысленные отказы (4xx: битый ключ, кривой запрос) не повторяем.
const CHUNK_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2000, 5000];

async function uploadAndTranscribe(
  blob: Blob,
  ext: string,
  prompt: string,
  offsetSeconds: number,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < CHUNK_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    try {
      const path = await uploadChunk(blob, ext);
      return await transcribeChunk(path, prompt, offsetSeconds);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (typeof status === 'number' && status < 500) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

// Моно-микс + WAV-контейнер (PCM 16-бит little-endian) — стандартный
// минимальный заголовок, без сторонних библиотек.
function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function mixToMono(audio: AudioBuffer): Float32Array {
  const length = audio.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < audio.numberOfChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  return mono;
}

async function decodeToMono16k(file: File): Promise<Float32Array> {
  // sampleRate в конструкторе заставляет decodeAudioData ресемплить прямо
  // при декодировании — не держим в памяти исходные 44.1 кГц стерео.
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    return mixToMono(audio);
  } catch {
    throw new Error('Не удалось прочитать аудиофайл — поддерживаются mp3, m4a, wav, ogg');
  } finally {
    void ctx.close();
  }
}

// Расширение для Whisper — по нему сервис определяет контейнер.
function fileExt(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'mp3';
}

// Длительность по метаданным контейнера — <audio> читает только заголовок,
// файл целиком не декодируется. null = формат/метаданные не прочитались.
function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.preload = 'metadata';
    audio.src = url;
  });
}

async function transcribeWholeFile(
  file: File,
  onProgress: (p: TranscribeProgress) => void,
): Promise<string> {
  onProgress({ stage: 'transcribing', chunkIndex: 1, chunkCount: 1 });
  return (await uploadAndTranscribe(file, fileExt(file), '', 0)).trim();
}

export async function transcribeAudioFile(
  file: File,
  onProgress: (p: TranscribeProgress) => void,
): Promise<string> {
  // Целиком без нарезки — только маленький И короткий файл (см.
  // DIRECT_LIMIT_SECONDS: длинную запись любого размера нужно резать).
  const smallFile = file.size <= DIRECT_UPLOAD_LIMIT_BYTES;
  if (smallFile) {
    const duration = await getAudioDuration(file);
    if (duration !== null && duration <= DIRECT_LIMIT_SECONDS) {
      return transcribeWholeFile(file, onProgress);
    }
  }

  onProgress({ stage: 'preparing', chunkIndex: 0, chunkCount: 0 });
  let mono: Float32Array;
  try {
    mono = await decodeToMono16k(file);
  } catch (err) {
    // Не смогли декодировать для нарезки (экзотический контейнер?) — для
    // маленького файла последний шанс: отправить как есть одним куском.
    if (smallFile) return transcribeWholeFile(file, onProgress);
    throw err;
  }
  const samplesPerChunk = CHUNK_SECONDS * TARGET_SAMPLE_RATE;
  const chunkCount = Math.ceil(mono.length / samplesPerChunk);
  return transcribeChunksConcurrently(mono, samplesPerChunk, chunkCount, onProgress);
}

// Куски независимы друг от друга (кроме подсказки-prompt — а это просто
// намёк Whisper для связности шва, не обязательное условие корректности),
// поэтому расшифровываем их НЕСКОЛЬКО ОДНОВРЕМЕННО, а не строго по очереди.
// Строго последовательная обработка на медленном ProxyAPI означала полчаса
// ожидания на часовую запись — владелец успевал сходить в магазин между
// частями. Пул воркеров: каждый вытягивает следующий незанятый индекс,
// результат кладётся в results[i] по этому индексу — порядок склейки не
// зависит от того, в каком порядке куски реально доехали.
//
// 2, не больше: у ProxyAPI (и вообще у бюджетных шлюзов к OpenAI) нередко
// стоит лимит одновременных запросов с одного ключа — при превышении он не
// обязательно ответит 429, может просто держать лишние запросы в очереди
// без ответа, и тогда высокий параллелизм не ускоряет, а выглядит как
// зависание. 2 — компромисс: ускорение против последовательной обработки
// есть, а лимит подобных шлюзов обычно не ниже 2.
const CHUNK_CONCURRENCY = 2;

async function transcribeChunksConcurrently(
  mono: Float32Array,
  samplesPerChunk: number,
  chunkCount: number,
  onProgress: (p: TranscribeProgress) => void,
): Promise<string> {
  const results: string[] = new Array(chunkCount);
  let runningPrompt = '';
  let nextIndex = 0;
  let completed = 0;
  onProgress({ stage: 'transcribing', chunkIndex: 0, chunkCount });

  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= chunkCount) return;
      const slice = mono.subarray(i * samplesPerChunk, Math.min((i + 1) * samplesPerChunk, mono.length));
      const wav = encodeWavMono(slice, TARGET_SAMPLE_RATE);
      // Хвост текста, накопленного к моменту старта ЭТОГО куска — под
      // конкурентной обработкой это не всегда буквально предыдущий по
      // номеру кусок, но для контекстной подсказки Whisper точность до
      // соседнего куска не требуется.
      const prompt = runningPrompt.slice(-600);
      const text = (await uploadAndTranscribe(wav, 'wav', prompt, i * CHUNK_SECONDS)).trim();
      results[i] = text;
      runningPrompt += (runningPrompt ? ' ' : '') + text;
      completed++;
      onProgress({ stage: 'transcribing', chunkIndex: completed, chunkCount });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunkCount) }, () => worker()));
  return results.filter(Boolean).join('\n\n');
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
  const resp = await fetch('/api/suggest-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, assignees, alreadySuggested }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Ошибка извлечения задач (${resp.status})`);
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export async function summarizeTranscript(transcript: string): Promise<string> {
  const resp = await fetch('/api/summarize-meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Ошибка генерации саммери (${resp.status})`);
  return data.summary ?? '';
}
