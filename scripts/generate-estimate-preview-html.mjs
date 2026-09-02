// Публичная ссылка на построчную смету (/estimate/:token) — тот же случай,
// что и /tz/:token (см. generate-tz-preview-html.mjs, тот же комментарий
// объясняет, почему вообще нужен отдельный статический HTML-шелл): index.html
// один на весь сайт, его <title>/og:* заточены под продающую страницу, а
// noindex ставился только клиентским JS (setNoIndex при монтировании) — бот
// без JS (или не дождавшийся рендера) видел бы "index, follow" из статики.
// Владелец обнаружил живое подтверждение 2026-08-27: смета попала в
// поисковую выдачу Google при живом clientside-only noindex. После сборки
// клонируем dist/index.html в dist/estimate.html с noindex прямо в статике;
// vercel.json подключает его рерайтом на /estimate/(.*) раньше общего
// фолбэка на index.html.
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'Построчная смета';
const DESCRIPTION = 'Смета ремонтных работ по объекту — согласование позиций и материалов со строителем';

let html = readFileSync('dist/index.html', 'utf8');

html = html
  .replace(/<title>.*?<\/title>/, `<title>${TITLE}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1https://redevelopment.pro/estimate$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  // noindex прямо в статике — см. комментарий выше и в generate-tz-preview-html.mjs.
  // canonical убран — вместе с noindex это был бы конфликтующий сигнал.
  .replace(/(<meta name="robots" content=")[^"]*(")/, `$1noindex, nofollow$2`)
  .replace(/\s*<link rel="canonical"[^>]*>/, '');

writeFileSync('dist/estimate.html', html);
