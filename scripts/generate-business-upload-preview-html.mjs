// Рабочая ссылка для сбора организаций по домам (/business-upload) — тот же
// случай, что и /tz/:token и /estimate/:token (см. generate-tz-preview-html.mjs,
// тот же комментарий объясняет, почему вообще нужен отдельный статический
// HTML-шелл): index.html один на весь сайт, его <title>/og:* заточены под
// продающую страницу, а noindex ставился только клиентским JS (setNoIndex
// при монтировании) — бот без JS (или не дождавшийся рендера) видел бы
// "index, follow" из статики. В отличие от остальных токен-страниц у этой
// нет :token в пути — рерайт в vercel.json на точный путь, не на маску.
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'Организации по домам — Минск Мир';
const DESCRIPTION = 'Рабочий инструмент для сбора данных об организациях по домам района';

let html = readFileSync('dist/index.html', 'utf8');

html = html
  .replace(/<title>.*?<\/title>/, `<title>${TITLE}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1https://redevelopment.pro/business-upload$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  // noindex прямо в статике — см. комментарий выше и в generate-tz-preview-html.mjs.
  // canonical убран — вместе с noindex это был бы конфликтующий сигнал.
  .replace(/(<meta name="robots" content=")[^"]*(")/, `$1noindex, nofollow$2`)
  .replace(/\s*<link rel="canonical"[^>]*>/, '');

writeFileSync('dist/business-upload.html', html);
