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

// Первый запрос к Supabase после паузы иногда рвётся сетевой ошибкой
// ("TypeError: Load failed" / "Failed to fetch") ещё до ответа сервера —
// повторяем один раз молча, прежде чем показывать ошибку пользователю.
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 1000, timeoutMs = TIMEOUT_MS): Promise<T> {
  try {
    return await withTimeout(fn(), timeoutMs);
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withTimeout(fn(), timeoutMs).catch(() => {
      throw err;
    });
  }
}
