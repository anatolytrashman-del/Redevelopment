// Чтение публичных ключей из переменных окружения вместо литералов в коде.
// Значения задаются в .env (локально, файл в .gitignore), в секретах/переменных
// GitHub Actions или в Environment Variables проекта Vercel. Шаблон — .env.example.

/**
 * Первое непустое значение из списка переменных окружения.
 * @param {string | string[]} names имена переменных по приоритету
 * @param {{ required?: boolean, purpose?: string }} [opts]
 * @returns {string | undefined}
 */
export function readEnv(names, { required = true, purpose } = {}) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const value = process.env[name];
    if (value !== undefined && value !== '') return value;
  }
  if (!required) return undefined;
  throw new Error(
    `Не задана переменная окружения ${list.join(' или ')}` +
      (purpose ? ` (${purpose})` : '') +
      '. Задайте её в .env (см. .env.example) или в окружении CI.',
  );
}

/** Supabase publishable (anon) key. Публичный по замыслу, доступ ограничивает RLS. */
export const supabasePublishableKey = (opts) =>
  readEnv(['SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'], {
    purpose: 'Supabase publishable key',
    ...opts,
  });

/** Ключ IndexNow. Тот же, что в имени файла public/<ключ>.txt. */
export const indexNowKey = (opts) => readEnv('INDEXNOW_KEY', { purpose: 'ключ IndexNow', ...opts });
