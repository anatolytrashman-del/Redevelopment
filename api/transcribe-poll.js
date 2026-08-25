// Vercel serverless function: опрос статуса задачи speech2text.ru (см.
// transcribe-start.js — она только отправляет файл и возвращает taskId,
// сама расшифровка асинхронная, на стороне speech2text.ru). Клиент дёргает
// эту функцию по таймеру, пока не придёт status:'done' или status:'error'.
//
// Результат запрашивается в формате SRT (стандартный формат субтитров —
// заголовок пронумерованных блоков "start --> end" + текст), а не в
// проприетарном JSON-формате speech2text — так результат разбирается
// детерминированно без знания их внутренней схемы сегментов/спикеров.

import { SPEECH2TEXT_BASE, speech2TextKeyProblem } from './_speech2text.js';

// [мм:сс] до часа, [ч:мм:сс] после — как в саммери владельца.
function formatTimestamp(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function parseSrtCues(srt) {
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;
    const match = lines[timeLineIdx].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->/);
    if (!match) continue;
    const start = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    const text = lines.slice(timeLineIdx + 1).join(' ').trim();
    if (text) cues.push({ start, text });
  }
  return cues;
}

// Метки времени вшиваем в текст не на каждую реплику — саммери (формат
// владельца, см. summarize-meeting.js) ссылается на таймкоды пунктов, но
// сплошная простыня "[00:01] ... [00:04] ..." на каждую фразу нечитаема.
const TIMESTAMP_EVERY_SECONDS = 45;

function cuesToText(cues) {
  let out = '';
  let lastMark = -Infinity;
  for (const cue of cues) {
    if (cue.start - lastMark >= TIMESTAMP_EVERY_SECONDS) {
      out += `${out ? '\n' : ''}[${formatTimestamp(cue.start)}] `;
      lastMark = cue.start;
    } else {
      out += ' ';
    }
    out += cue.text;
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const keyProblem = speech2TextKeyProblem();
  if (keyProblem) {
    res.status(500).json({ error: keyProblem });
    return;
  }

  const taskId = typeof req.query?.taskId === 'string' ? req.query.taskId : '';
  // Реальные id speech2text.ru содержат и подчёркивание, не только дефис
  // (пример: "RfZogu6P6sN2UfoeP-6sSIy_dfnE-335") — более узкая проверка без
  // "_" отбрасывала каждый такой id как "некорректный", из-за чего опрос
  // статуса всегда падал с 400 и клиент бесконечно молча повторял попытку,
  // никогда не добираясь до готового результата (см. журнал CLAUDE.md).
  if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    res.status(400).json({ error: 'Некорректный id задачи' });
    return;
  }
  const apiKey = process.env.SPEECH2TEXT_API_KEY;

  try {
    const statusResp = await fetch(`${SPEECH2TEXT_BASE}/api/recognitions/${taskId}?api-key=${apiKey}`);
    if (!statusResp.ok) {
      const text = await statusResp.text();
      throw new Error(`Ошибка проверки статуса (${statusResp.status}): ${text.slice(0, 300)}`);
    }
    const task = await statusResp.json();
    const statusValue = task?.status?.value;
    const description = task?.status?.description;

    // Официальная таблица статусов (из документации speech2text.ru):
    // value       code  описание
    // queued      0/30  задание создано / бот присоединился / ведёт запись
    // (без value) 80    контент получен (промежуточный шаг file-флоу)
    // (без value) 100   распознавание речи — этот и был единственный
    //                   "processing"-статус, реально увиденный вживую
    // paused      102   ПРИОСТАНОВЛЕНО — в аккаунте закончились доступные
    //                   минуты; результата не будет, пока не пополнят —
    //                   не то же самое, что "ещё считает", нельзя опрашивать
    //                   бесконечно как processing
    // done        200   успешно, есть результат
    // done        204   завершено, но речь не обнаружена — result: null
    // error       404/406/407/501/502  разные причины сбоя
    if (statusValue === 'queued' || statusValue === 'processing' || task?.status?.code === 80 || task?.status?.code === 100) {
      res.status(200).json({ status: 'processing' });
      return;
    }
    if (statusValue === 'paused') {
      res.status(200).json({ status: 'error', error: description || 'В аккаунте speech2text.ru закончились доступные минуты распознавания' });
      return;
    }
    if (statusValue === 'error') {
      res.status(200).json({ status: 'error', error: description || 'Не удалось расшифровать запись' });
      return;
    }

    // value === 'done' (или неизвестное будущее значение) — пробуем забрать
    // результат; code 204 ("речь не обнаружена") придёт сюда же и получит
    // понятное сообщение из description, а не свалится в общую ошибку.
    const resultResp = await fetch(`${SPEECH2TEXT_BASE}/api/recognitions/${taskId}/result/srt?api-key=${apiKey}`);
    if (!resultResp.ok) {
      const body = await resultResp.json().catch(() => ({}));
      const message = body.message || description || 'Распознавание не обнаружило речь в записи';
      res.status(200).json({ status: 'error', error: message });
      return;
    }

    const srt = await resultResp.text();
    const cues = parseSrtCues(srt);
    if (cues.length === 0) {
      res.status(200).json({ status: 'error', error: description || 'Распознавание не обнаружило речь в записи' });
      return;
    }

    res.status(200).json({ status: 'done', text: cuesToText(cues) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось проверить статус расшифровки' });
  }
}
