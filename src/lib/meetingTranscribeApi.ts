import { supabase } from './supabase';

// Клиентская часть расшифровки аудиозаписей встреч. Схема:
//
//   файл → [если >20 МБ: декодировать и порезать на 5-минутные WAV-куски]
//        → каждый кусок в приватный бакет meeting-audio (anon может только
//          insert — читать/удалять куски умеет лишь service role в функции)
//        → api/transcribe-meeting.js на каждый кусок (Whisper через
//          ProxyAPI; функция удаляет кусок после расшифровки)
//        → склейка текста по порядку.
//
// Почему нарезка на клиенте: у Whisper лимит 25 МБ на файл, у Vercel —
// 4.5 МБ на тело запроса (поэтому файл едет через Storage, не через
// функцию). Часовая запись с диктофона — 30–60 МБ, без нарезки никак.
// WAV 16 кГц моно выбран как формат кусков, потому что кодируется в
// браузере тривиально (это сырой PCM с 44-байтовым заголовком) и
// мгновенно, в отличие от mp3-энкодеров на JS; 5 минут такого WAV — 9.6 МБ.
//
// Ограничение памяти: decodeAudioData разворачивает ВЕСЬ файл в PCM.
// На 16 кГц это ~230 МБ RAM на 2 часа записи — на десктопе нормально,
// на слабом телефоне может не хватить. Файлы ≤20 МБ поэтому вообще не
// декодируются — уходят как есть одним куском.

const DIRECT_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const CHUNK_SECONDS = 5 * 60;
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
  if (!resp.ok) throw new Error(data.error || `Ошибка расшифровки (${resp.status})`);
  return data.text ?? '';
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

export async function transcribeAudioFile(
  file: File,
  onProgress: (p: TranscribeProgress) => void,
): Promise<string> {
  // Небольшой файл — без декодирования и нарезки, одним куском как есть.
  if (file.size <= DIRECT_UPLOAD_LIMIT_BYTES) {
    onProgress({ stage: 'transcribing', chunkIndex: 1, chunkCount: 1 });
    const path = await uploadChunk(file, fileExt(file));
    return (await transcribeChunk(path, '', 0)).trim();
  }

  onProgress({ stage: 'preparing', chunkIndex: 0, chunkCount: 0 });
  const mono = await decodeToMono16k(file);
  const samplesPerChunk = CHUNK_SECONDS * TARGET_SAMPLE_RATE;
  const chunkCount = Math.ceil(mono.length / samplesPerChunk);

  const parts: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    onProgress({ stage: 'transcribing', chunkIndex: i + 1, chunkCount });
    const slice = mono.subarray(i * samplesPerChunk, Math.min((i + 1) * samplesPerChunk, mono.length));
    const wav = encodeWavMono(slice, TARGET_SAMPLE_RATE);
    const path = await uploadChunk(wav, 'wav');
    // Хвост уже расшифрованного текста — как контекст-подсказка Whisper для
    // связного шва между кусками (см. prompt в transcribe-meeting.js).
    const prompt = parts.join(' ').slice(-600);
    parts.push((await transcribeChunk(path, prompt, i * CHUNK_SECONDS)).trim());
  }
  return parts.filter(Boolean).join('\n\n');
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
