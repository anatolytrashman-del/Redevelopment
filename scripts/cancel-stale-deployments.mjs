#!/usr/bin/env node
// Отменяет устаревшие деплои Vercel: если по одной и той же ветке уже создан
// более новый деплой (QUEUED/BUILDING), а старый ещё не доехал до READY —
// старый всё равно будет перекрыт новым, как только тот соберётся. Смысла
// достраивать его нет, а на Hobby-конкурентности (1 билд одновременно) он
// просто блокирует очередь. Vercel сам отменяет деплои, ещё не начавшие
// сборку (QUEUED), при поступлении нового коммита в ту же ветку — но НЕ
// трогает уже BUILDING. Этот скрипт закрывает именно этот случай.
//
// Не трогает деплои, для которых более нового по той же ветке+target ещё нет
// — то есть единственный активный деплой ветки никогда не отменяется.
//
//   node scripts/cancel-stale-deployments.mjs             — только показать
//   node scripts/cancel-stale-deployments.mjs --confirm   — отменить найденное

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error('VERCEL_TOKEN не задан в окружении');
  process.exit(1);
}

const APP = process.env.VERCEL_APP || 'redevelopment';
const ACTIVE_STATES = new Set(['QUEUED', 'BUILDING', 'INITIALIZING', 'ANALYZING']);
const confirm = process.argv.includes('--confirm');

const res = await fetch(`https://api.vercel.com/v6/deployments?app=${APP}&limit=40`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`GET /v6/deployments: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { deployments } = await res.json();

const active = deployments.filter((d) => ACTIVE_STATES.has(d.state));

const groups = new Map(); // "target|branch" -> deployments, новые первыми
for (const d of active) {
  const branch = d.meta?.githubCommitRef ?? '(без ветки)';
  const key = `${d.target ?? 'preview'}|${branch}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(d);
}

const toCancel = [];
for (const [key, group] of groups) {
  if (group.length < 2) continue; // единственный активный деплой ветки — не трогаем
  group.sort((a, b) => b.createdAt - a.createdAt);
  const [newest, ...stale] = group;
  console.log(`${key}: оставляем ${newest.uid} (${newest.state}, ${new Date(newest.createdAt).toISOString()})`);
  for (const d of stale) {
    console.log(`  устарел: ${d.uid} (${d.state}, ${new Date(d.createdAt).toISOString()})`);
    toCancel.push(d);
  }
}

if (toCancel.length === 0) {
  console.log('Отменять нечего — по каждой ветке максимум один активный деплой.');
  process.exit(0);
}

console.log(`\nК отмене: ${toCancel.length}`);
if (!confirm) {
  console.log('Это dry-run. Повторить с --confirm, чтобы реально отменить.');
  process.exit(0);
}

for (const d of toCancel) {
  const cancelRes = await fetch(`https://api.vercel.com/v12/deployments/${d.uid}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!cancelRes.ok) {
    console.error(`  ${d.uid}: не удалось отменить — ${cancelRes.status} ${await cancelRes.text()}`);
    continue;
  }
  console.log(`  ${d.uid}: отменён`);
}
