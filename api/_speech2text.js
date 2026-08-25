// Общее для функций, ходящих в speech2text.ru (api.speech2text.ru) —
// единственный провайдер расшифровки аудио (ProxyAPI/Whisper убраны из кода,
// см. transcribe-start.js/transcribe-poll.js).
export const SPEECH2TEXT_BASE = 'https://api.speech2text.ru';

export function speech2TextKeyProblem() {
  const key = process.env.SPEECH2TEXT_API_KEY;
  if (!key) {
    return 'SPEECH2TEXT_API_KEY не настроен в переменных окружения Vercel';
  }
  // Та же защита, что и у PROXYAPI_KEY (см. _proxyapi.js) — ключ, вставленный
  // в замаскированном виде из личного кабинета, ронял бы fetch невнятной
  // ошибкой про ByteString вместо понятного сообщения.
  if (/[^\x21-\x7e]/.test(key)) {
    return 'SPEECH2TEXT_API_KEY на Vercel повреждён: в значении есть посторонние символы. Вставьте полный ключ заново и передеплойте.';
  }
  return null;
}
