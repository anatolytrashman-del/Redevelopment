// Публичная ссылка на избранное (/favorites/:id) — обычный SPA-роут внутри
// того же React-приложения, что и каталог БЦ. index.html один на весь сайт
// с title/og под продающую страницу — при пересылке ссылки на подборку в
// мессенджер превью показывало бы совсем не то (и, что важнее, генеральный
// фолбэк на index.html через каталог рерайтов в vercel.json ненадёжен для
// произвольных динамических путей — см. tz.html/plan.html/estimate.html/
// summary.html: у каждого токен-роута свой шелл именно поэтому). Клонируем
// dist/index.html в dist/favorites.html с другими title/description —
// тот же JS-бандл, та же страница, только другой HTML-шелл. vercel.json
// подключает его рерайтом на /favorites/(.*) раньше общего фолбэка.
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'Избранные бизнес-центры — REDEVELOPMENT';
const DESCRIPTION = 'Подборка бизнес-центров Минска, сохранённая по ссылке — без регистрации';

let html = readFileSync('dist/index.html', 'utf8');

html = html
  .replace(/<title>.*?<\/title>/, `<title>${TITLE}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1https://redevelopment.pro/favorites$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  // Список избранного — данные конкретного посетителя, в поиске быть не
  // должен (см. setNoIndex() в FavoritesPage.tsx — тот же сигнал, только
  // сразу в статике, а не только после выполнения JS). canonical вместе с
  // noindex — конфликтующий сигнал, убираем.
  .replace(/(<meta name="robots" content=")[^"]*(")/, `$1noindex, nofollow$2`)
  .replace(/\s*<link rel="canonical"[^>]*>/, '');

writeFileSync('dist/favorites.html', html);
