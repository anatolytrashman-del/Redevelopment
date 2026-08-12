// Первый запрос к Supabase после паузы иногда рвётся сетевой ошибкой
// ("TypeError: Load failed" / "Failed to fetch") ещё до ответа сервера —
// повторяем один раз молча, прежде чем показывать ошибку пользователю.
export async function withRetry<T>(fn: () => Promise<T>, delayMs = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn().catch(() => {
      throw err;
    });
  }
}
