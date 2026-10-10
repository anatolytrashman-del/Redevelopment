// В конце build:app: если деплой malllist (PUBLIC_SITE=malls) — прогнать
// эталонный пререндер ТЦ + OG. На платформе no-op (exit 0), чтобы
// build:app оставался ~10с. Так Vercel malllist с Build Command
// `npm run build:app` получает ту же оптимизацию, что build:malls.
import { spawnSync } from 'node:child_process';
import { DEPLOYED_SITE_MODE } from './domainSplit.mjs';

if (DEPLOYED_SITE_MODE !== 'malls') process.exit(0);

console.log('[malls-prerender] PUBLIC_SITE=malls — пререндер ТЦ с платформы + OG');
for (const script of ['prerender.mjs', 'generate-og-cards.mjs']) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status) process.exit(result.status ?? 1);
}
