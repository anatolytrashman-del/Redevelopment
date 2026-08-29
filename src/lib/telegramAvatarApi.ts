import { authFetch } from './authFetch';

// Best-effort: любая неудача (профиль скрыт, сеть, юзернейма не существует) —
// просто null, без исключения наверх. Автоподтягивание аватара — приятная
// мелочь, а не обязательный шаг: не должно мешать сохранению лида ни при
// каких обстоятельствах.
export async function fetchTelegramAvatarBlob(handle: string): Promise<Blob | null> {
  try {
    const resp = await authFetch(`/api/telegram-avatar?handle=${encodeURIComponent(handle)}`);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}
