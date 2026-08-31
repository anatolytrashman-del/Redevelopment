// Общая проверка PROXYAPI_KEY для функций, ходящих в ProxyAPI — как в
// OpenAI-совместимый путь (meeting-ai.js, gpt-4o), так и в отдельный
// Anthropic-совместимый путь того же шлюза (supplier-web-search.js,
// claude-sonnet-5) — ключ один и тот же на оба пути.
//
// Проверка на посторонние символы — не перестраховка: ключ, скопированный
// из личного кабинета ProxyAPI в замаскированном виде (sk-…•••••), ронял
// fetch внутри функции с невнятным «Cannot convert argument to a
// ByteString…» при установке заголовка Authorization. Ловим это ДО fetch
// и говорим словами, что именно не так.
export function proxyApiKeyProblem() {
  const key = process.env.PROXYAPI_KEY;
  if (!key) {
    return 'PROXYAPI_KEY не настроен в переменных окружения Vercel';
  }
  if (/[^\x21-\x7e]/.test(key)) {
    return 'PROXYAPI_KEY на Vercel повреждён: в значении есть посторонние символы (похоже, ключ скопирован в замаскированном виде — с точками «•»). Вставьте полный ключ заново и передеплойте.';
  }
  return null;
}
