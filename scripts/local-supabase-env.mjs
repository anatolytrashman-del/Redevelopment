// Ключ Supabase для яндексовских скриптов на ноуте владельца — из одного
// файла, а не из переменных окружения терминала.
//
// Зачем (2026-09-23): прогон по ТЦ упал у владельца с «Invalid API key» во
// всех трёх скриптах сразу, хотя зашитый publishable-ключ и Management API
// рабочие. Виноваты оказались старые SUPABASE_* переменные в окружении
// терминала: скрипты берут их раньше ключа по умолчанию. Искать, где на
// маке лежит устаревший export, — долго; поэтому, если файл есть, он
// становится ЕДИНСТВЕННЫМ источником ключей: унаследованные SUPABASE_*
// переменные сбрасываются.
//
// Файл: ~/.config/redevelopment/supabase.env, одна строка
//   SUPABASE_KEY=<ключ>
// Тип ключа определяется по началу:
//   sbp_…            — personal access token (Management API) → SUPABASE_ACCESS_TOKEN
//   sb_secret_… / eyJ… — секретный (service_role) ключ проекта → SUPABASE_SERVICE_ROLE_KEY
// Можно и явными строками SUPABASE_ACCESS_TOKEN=… / SUPABASE_SERVICE_ROLE_KEY=….
//
// Импортировать ПЕРВЫМ импортом скрипта: ключ проверяется запросом до
// старта браузера, и при отказе скрипт сразу говорит, что делать.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const PROJECT_REF = 'iohcdylttyuhwovztrbk';
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
export const LOCAL_ENV_FILE = path.join(os.homedir(), '.config', 'redevelopment', 'supabase.env');

const INHERITED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN'];

function parse(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (value) values[key] = value;
  }
  return values;
}

function classify(value) {
  if (value.startsWith('sbp_')) return 'SUPABASE_ACCESS_TOKEN';
  if (value.startsWith('sb_secret_') || value.startsWith('eyJ')) return 'SUPABASE_SERVICE_ROLE_KEY';
  return null;
}

async function verify(name, value) {
  const response = name === 'SUPABASE_ACCESS_TOKEN'
    ? await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}`, { headers: { Authorization: `Bearer ${value}` } })
    : await fetch(`${PROJECT_URL}/rest/v1/business_centers?select=slug&limit=1`, { headers: { apikey: value, Authorization: `Bearer ${value}` } });
  return response.ok;
}

if (existsSync(LOCAL_ENV_FILE)) {
  const values = parse(readFileSync(LOCAL_ENV_FILE, 'utf8'));
  for (const name of INHERITED) delete process.env[name];
  const resolved = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === 'SUPABASE_KEY') {
      const name = classify(value);
      if (!name) {
        console.error(`[ключ] В ${LOCAL_ENV_FILE} ключ не похож ни на токен (sbp_…), ни на секретный ключ проекта (sb_secret_… / eyJ…).`);
        process.exit(1);
      }
      resolved[name] = value;
    } else if (INHERITED.includes(key)) {
      resolved[key] = value;
    }
  }
  for (const [name, value] of Object.entries(resolved)) {
    let ok = false;
    try {
      ok = await verify(name, value);
    } catch (error) {
      console.error(`[ключ] Не удалось проверить ключ: ${error.message}. Есть ли интернет?`);
      process.exit(1);
    }
    if (!ok) {
      console.error(
        name === 'SUPABASE_ACCESS_TOKEN'
          ? `[ключ] Supabase не принял токен из ${LOCAL_ENV_FILE}. Создайте новый на https://supabase.com/dashboard/account/tokens и сохраните его той же командой.`
          : `[ключ] Supabase не принял секретный ключ из ${LOCAL_ENV_FILE}. Возьмите актуальный в Supabase → Project Settings → API Keys (или токен на https://supabase.com/dashboard/account/tokens) и сохраните той же командой.`,
      );
      process.exit(1);
    }
    process.env[name] = value;
  }
  const kinds = Object.keys(resolved).map((name) => (name === 'SUPABASE_ACCESS_TOKEN' ? 'токен' : 'секретный ключ')).join(' + ');
  console.log(`[ключ] ${kinds || 'нет ключей'} из ${LOCAL_ENV_FILE} — принят Supabase`);
}
