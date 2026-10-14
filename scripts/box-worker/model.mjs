// Вызов Grok через opencode на боксе (OAuth-вход opencode, ключ API не нужен
// и не читается). Запуск в пустой временной папке своим агентом без инструментов — модели
// нечего трогать на диске. opencode требует PTY, поэтому через script(1).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const OPENCODE = process.env.OPENCODE_BIN || join(homedir(), '.opencode/bin/opencode');
export const DEFAULT_MODEL = process.env.BOX_WORKER_MODEL || 'xai/grok-4.20-0309-non-reasoning';

// Свой агент без инструментов: plan пишет «план ответа» вместо ответа,
// build запускает код. Этому агенту нельзя ничего, кроме ответа текстом.
const WORKER_CONFIG = {
  $schema: 'https://opencode.ai/config.json',
  agent: {
    'box-worker': {
      mode: 'primary',
      description: 'ИИ-воркер очереди ai_box_jobs',
      prompt: 'Ты выполняешь задание и отвечаешь только итоговым результатом в запрошенном формате, без пояснений. Инструменты не используешь.',
      tools: { '*': false },
      permission: { '*': 'deny' },
    },
  },
};

function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// Последний text-блок из потока --format json.
export function lastTextFromOpencodeJson(stdout) {
  let text = null;
  let error = null;
  for (const line of String(stdout).split(/\r?\n/)) {
    const i = line.indexOf('{');
    if (i === -1) continue;
    let ev;
    try { ev = JSON.parse(line.slice(i)); } catch { continue; }
    if (ev.type === 'text' && typeof ev.part?.text === 'string') text = ev.part.text;
    if (ev.type === 'error') error = ev.error?.data?.message || ev.error?.message || JSON.stringify(ev.error ?? ev);
  }
  if (text == null && error) {
    const e = new Error(error);
    const m = error.match(/\b(4\d\d|5\d\d)\b/);
    if (m) e.status = Number(m[1]);
    throw e;
  }
  if (text == null) throw new Error('opencode не вернул текст ответа');
  return text;
}

export async function runModel(prompt, { model = DEFAULT_MODEL, files = [], timeoutMs = 300_000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'box-worker-'));
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify(WORKER_CONFIG));
  const args = ['run', '--format', 'json', '--agent', 'box-worker', '-m', model, ...files.flatMap((f) => ['-f', f]), prompt];
  const cmd = [OPENCODE, ...args].map(shq).join(' ');
  const env = { ...process.env };
  delete env.XAI_API_KEY;
  try {
    const stdout = await new Promise((resolve, reject) => {
      const p = spawn('script', ['-qec', cmd, '/dev/null'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { p.kill('SIGTERM'); reject(new Error('timeout: opencode не ответил')); }, timeoutMs);
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { err += d; });
      p.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.includes('"type":"text"')) reject(new Error(`opencode завершился с кодом ${code}: ${err.slice(-300)}`));
        else resolve(out);
      });
    });
    return lastTextFromOpencodeJson(stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
