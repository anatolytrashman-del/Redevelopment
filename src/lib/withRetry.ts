const TIMEOUT_MS = 15000;

// Если Supabase не отвечает (например, проект на бесплатном тарифе "спал"
// и просыпается), запрос иначе повисает без ошибки и без ответа — кнопки
// вида "Сохраняем..." зависают навсегда. Обрываем ожидание по таймауту.
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Сервер не отвечает. Попробуйте ещё раз')), TIMEOUT_MS);
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
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 1000): Promise<T> {
  try {
    return await withTimeout(fn());
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withTimeout(fn()).catch(() => {
      throw err;
    });
  }
}
