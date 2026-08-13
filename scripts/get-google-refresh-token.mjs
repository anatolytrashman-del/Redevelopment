// Разовый локальный скрипт: получает refresh token для доступа к Google
// Docs/Drive API от имени вашего аккаунта. Запускать один раз на своей
// машине (не в GitHub Actions), результат — секрет GOOGLE_OAUTH_REFRESH_TOKEN.
//
// Использование:
//   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/get-google-refresh-token.mjs

import http from 'node:http';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Задайте GOOGLE_OAUTH_CLIENT_ID и GOOGLE_OAUTH_CLIENT_SECRET перед запуском.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents');

console.log('\nОткройте эту ссылку в браузере и войдите под своим Google-аккаунтом:\n');
console.log(authUrl.toString());
console.log('\nЖду авторизации...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Нет кода авторизации в ответе Google.');
    return;
  }

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResp.json();

  if (tokens.refresh_token) {
    console.log('\nГотово! Ваш refresh token:\n');
    console.log(tokens.refresh_token);
    console.log('\nСохраните его как секрет GOOGLE_OAUTH_REFRESH_TOKEN.\n');
    res.end('Авторизация прошла успешно, можно закрыть эту вкладку. Refresh token выведен в терминал.');
  } else {
    console.error('Не получили refresh_token. Ответ Google:', tokens);
    res.end('Ошибка — смотрите терминал, где запущен скрипт.');
  }

  server.close();
});

server.listen(PORT);
