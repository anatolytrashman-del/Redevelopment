// Обработчики заданий очереди ai_box_jobs. Промпты и разбор ответа — те же,
// что у серверного распознавания (api/_invoiceRecognition.js) и саммери
// (api/meeting-ai.js), чтобы результат с бокса не отличался от прежнего.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SYSTEM_PROMPT, normalizeRecognized } from '../../api/_invoiceRecognition.js';
import { DEFAULT_SUMMARY_PROMPT } from '../../api/meeting-ai.js';
import { extractDocxText } from '../../api/_docxText.js';
import { extractXlsxText } from '../../api/_xlsxText.js';

const pexec = promisify(execFile);
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'gif'];
const DOC_TEXT_LIMIT = 20_000;
const TRANSCRIPT_LIMIT = 200_000;

export function parseJsonLoose(text) {
  const s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b < a) throw new Error('Модель не вернула JSON в ожидаемом формате');
  return JSON.parse(s.slice(a, b + 1));
}

async function defaultFetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error(`Не удалось скачать файл (${r.status})`); e.status = r.status >= 500 ? r.status : 400; throw e; }
  return Buffer.from(await r.arrayBuffer());
}

async function pdfText(buf) {
  const dir = mkdtempSync(join(tmpdir(), 'bw-pdf-'));
  try {
    const f = join(dir, 'in.pdf');
    writeFileSync(f, buf);
    const { stdout } = await pexec('pdftotext', ['-layout', '-l', '3', f, '-'], { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function contextText(ctx) {
  if (!ctx) return '';
  const subject = String(ctx.subject ?? '').trim();
  const body = String(ctx.body ?? '').split(/\n\s*>/)[0].trim().slice(0, 800);
  if (!subject && !body) return '';
  return `Письмо, с которым пришёл документ (справочно, числа из него не брать):\nТема: ${subject}\n${body}\n\n`;
}

// payload: { fileUrl, fileName, emailContext? } (или localPath для локальной проверки)
export async function handleInvoice(payload, { runModel, fetchBytes = defaultFetchBytes, readLocal } = {}) {
  const fileName = String(payload?.fileName ?? '');
  const ext = fileName.split('.').pop()?.toLowerCase();
  const buf = payload.localPath ? await readLocal(payload.localPath) : await fetchBytes(payload.fileUrl);
  const ask = 'Определи, счёт/КП ли это, и если да — извлеки данные строго по формату из системной инструкции. Ответь только JSON.';
  let prompt;
  const files = [];
  let tmp = null;
  if (ext === 'pdf' || ext === 'docx' || ext === 'xlsx') {
    const text = ext === 'pdf' ? await pdfText(buf) : ext === 'xlsx' ? await extractXlsxText(buf) : await extractDocxText(buf);
    if (!text.trim()) {
      if (ext !== 'pdf') { const e = new Error(`Не удалось извлечь текст из .${ext}`); e.status = 400; throw e; }
      // PDF-скан без текстового слоя — отдаём файлом.
      tmp = mkdtempSync(join(tmpdir(), 'bw-att-'));
      const f = join(tmp, `doc.pdf`);
      writeFileSync(f, buf);
      files.push(f);
      prompt = `${SYSTEM_PROMPT}\n\n${contextText(payload.emailContext)}Документ «${fileName}» приложен файлом.\n${ask}`;
    } else {
      prompt = `${SYSTEM_PROMPT}\n\n${contextText(payload.emailContext)}Текст документа «${fileName}»:\n\n${text.slice(0, DOC_TEXT_LIMIT)}\n\n${ask}`;
    }
  } else if (IMAGE_EXT.includes(ext)) {
    tmp = mkdtempSync(join(tmpdir(), 'bw-att-'));
    const f = join(tmp, `img.${ext === 'jfif' || ext === 'jpe' ? 'jpg' : ext}`);
    writeFileSync(f, buf);
    files.push(f);
    prompt = `${SYSTEM_PROMPT}\n\n${contextText(payload.emailContext)}Документ «${fileName}» приложен картинкой.\n${ask}`;
  } else {
    const e = new Error('Неподдерживаемый тип файла для распознавания');
    e.status = 400;
    throw e;
  }
  try {
    const answer = await runModel(prompt, { files });
    let parsed;
    try { parsed = parseJsonLoose(answer); } catch (e) { throw new Error(`${e.message}; начало ответа: ${String(answer).slice(0, 200)}`); }
    return { ...normalizeRecognized(parsed), recognizedAt: new Date().toISOString(), recognizedBy: 'box-worker' };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

// payload: { transcript, prompt? } — расшифровка с метками [мм:сс].
export async function handleMeeting(payload, { runModel } = {}) {
  const transcript = String(payload?.transcript ?? '').trim();
  if (transcript.length < 20) { const e = new Error('Пустая расшифровка'); e.status = 400; throw e; }
  const system = String(payload.prompt ?? '').trim() || DEFAULT_SUMMARY_PROMPT;
  const answer = await runModel(`${system}\n\nРасшифровка:\n\n${transcript.slice(0, TRANSCRIPT_LIMIT)}`, { model: payload.model });
  const summary = String(answer).trim();
  if (!summary) throw new Error('Модель вернула пустое саммери');
  return { summary, generatedAt: new Date().toISOString(), generatedBy: 'box-worker' };
}

export const HANDLERS = { invoice_recognition: handleInvoice, meeting_summary: handleMeeting };
