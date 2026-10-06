#!/usr/bin/env node
// Одна команда на весь сбор с Яндекс Карт по зданиям каталога (владелец,
// 2026-09-24: «мне нужен 1 общий скрипт, а не 2»): сначала арендаторы с
// этажами (capture-yandex-bc-tenants.mjs), потом карточка здания и отзывы
// (capture-yandex-reviews.mjs). Места вокруг (capture-yandex-nearby.mjs) НЕ
// собираются — «инфраструктуру вокруг не собираем вообще».
//
// Шаги идут строго по очереди: оба открывают Chrome на одном профиле
// (tmp/yandex-maps-profile), параллельно он не откроется. Все аргументы
// передаются обоим шагам как есть; у каждого своя отметка «уже собрано»
// для --skip-collected.
//   node scripts/capture-yandex-all.mjs --kind tc --slug siluet-tc,expobel --write-db
//   node scripts/capture-yandex-all.mjs --kind cw --write-db
// --only tenants|reviews — один шаг (например, добрать упавший).

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;
// --manual здесь больше не передаём (владелец, 2026-09-29: «не нравится
// открывать руками список организаций»): автоматический режим сам спрашивает
// человека только о карточке здания, которую не нашёл, а вкладки «Внутри» и
// «Отзывы» открывает сам. Отдельные скрипты --manual по-прежнему понимают.
const passArgs = (onlyIndex >= 0 ? args.filter((_, i) => i !== onlyIndex && i !== onlyIndex + 1) : args)
  .filter((arg) => arg !== '--manual');
if (args.includes('--manual')) console.log('--manual не нужен: здания, которые Яндекс не найдёт сам, скрипт попросит открыть в окне Chrome');

const kindIndex = passArgs.indexOf('--kind');
const catalogKind = kindIndex >= 0 ? passArgs[kindIndex + 1] : 'bc';
// У коворкинга нужна только его карточка и рейтинг/отзывы, не арендаторы
// внутри здания (владелец, 2026-10-06).
const steps = [
  { key: 'tenants', title: 'Арендаторы и этажи', script: 'capture-yandex-bc-tenants.mjs' },
  { key: 'reviews', title: 'Карточка коворкинга и отзывы', script: 'capture-yandex-reviews.mjs' },
].filter((step) => {
  if (only && step.key !== only) return false;
  if (catalogKind === 'cw' && step.key === 'tenants') return false;
  return true;
});

if (steps.length === 0) {
  console.error('--only: tenants или reviews');
  process.exit(1);
}

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), ...passArgs], { stdio: 'inherit' });
    child.on('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

const results = [];
for (const [index, step] of steps.entries()) {
  console.log(`\n=== Шаг ${index + 1} из ${steps.length}: ${step.title} ===\n`);
  const code = await run(step.script);
  results.push({ ...step, code });
  // Упавший шаг не останавливает следующий: отзывы не зависят от арендаторов.
  if (code !== 0) console.log(`\nШаг «${step.title}» завершился с ошибкой (код ${code}) — иду дальше`);
}

console.log('\n=== Итог ===');
for (const step of results) console.log(`${step.code === 0 ? 'готово' : 'ОШИБКА'}: ${step.title}`);
process.exit(results.some((step) => step.code !== 0) ? 1 : 0);
