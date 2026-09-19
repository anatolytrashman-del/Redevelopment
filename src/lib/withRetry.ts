const TIMEOUT_MS = 15000;
// Загрузка файлов (особенно тяжёлых рендеров в несколько МБ) на медленном
// канале легко не укладывается в обычный таймаут запроса к базе — а его
// срабатывание выглядит как "Load failed", хотя файл ещё грузился.
export const UPLOAD_TIMEOUT_MS = 60000;

// Если Supabase не отвечает (например, проект на бесплатном тарифе "спал"
// и просыпается), запрос иначе повисает без ошибки и без ответа — кнопки
// вида "Сохраняем..." зависают навсегда. Обрываем ожидание по таймауту.
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Сервер не отвечает. Попробуйте ещё раз')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ВАЖНО: fn должна быть ИДЕМПОТЕНТНОЙ — она вызывается заново на каждой
// попытке. Всё, что делает попытку уникальной (имя файла в Storage, id
// записи), считать ДО withRetry и передавать внутрь замыканием, иначе
// повтор создаёт второй объект вместо перезаписи первого. Живой случай
// 2026-09-20: `const path = crypto.randomUUID()` стоял внутри fn во всех
// двенадцати загрузчиках, а таймаут загрузки — 60 с. Веб-архив на 22 МБ в
// них не укладывался, withTimeout отдавал ошибку, но сам HTTP-запрос на
// сервере доходил — и повтор лил тот же файл под новым именем. В бакете
// object-documents так накопилось 15 сирот на 337 МБ, ровно половина всех
// веб-архивов. Отсюда же upsert: true у всех .upload — без него повтор по
// тому же пути отбивается «Duplicate».
//
// Первый запрос к Supabase после паузы иногда рвётся сетевой ошибкой
// ("TypeError: Load failed" / "Failed to fetch") ещё до ответа сервера —
// повторяем один раз молча, прежде чем показывать ошибку пользователю.
// retries=1 (по умолчанию) — как раньше; загрузка файлов с мобильной сети
// падает так чаще одного раза подряд, поэтому uploadObjectImage и
// uploadObjectDocument просят больше попыток с растущей паузой.
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 1000, timeoutMs = TIMEOUT_MS, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}
