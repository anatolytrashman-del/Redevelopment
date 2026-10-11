// В конце build:app: если деплой officelist (PUBLIC_SITE=offices) — прогнать
// эталонный пререндер БЦ + OG. На платформе no-op (exit 0).
import { spawnSync } from 'node:child_process';
import { DEPLOYED_SITE_MODE } from './domainSplit.mjs';

if (DEPLOYED_SITE_MODE !== 'offices') process.exit(0);

console.log('[offices-prerender] PUBLIC_SITE=offices — пререндер БЦ с платформы + OG');
for (const script of ['prerender.mjs', 'generate-og-cards.mjs']) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status) process.exit(result.status ?? 1);
}
