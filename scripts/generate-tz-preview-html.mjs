// Публичная страница техзадания (/tz/:token) — обычный SPA-роут внутри
// того же React-приложения, что и продающая страница объекта. index.html
// один на весь сайт, а его <title>/og:* заточены под продающую страницу
// ("Клубный деловой центр Minsk One") — если поделиться ссылкой на
// техзадание в мессенджере, превью показывало бы совсем не то. Своего
// сервера для генерации разных <head> под разные роуты у SPA нет, поэтому
// после сборки просто клонируем dist/index.html в dist/tz.html с другими
// title/description — тот же JS-бандл, та же страница, только другой
// HTML-шелл для превью. vercel.json подключает его рерайтом на /tz/(.*)
// раньше общего фолбэка на index.html.
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'Техзадание на просчет объемов';
const DESCRIPTION = 'Реновация отдельностоящего здания';

let html = readFileSync('dist/index.html', 'utf8');

html = html
  .replace(/<title>.*?<\/title>/, `<title>${TITLE}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`)
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1https://redevelopment.pro/tz$2`)
  .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`)
  .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${DESCRIPTION}$2`);

writeFileSync('dist/tz.html', html);
