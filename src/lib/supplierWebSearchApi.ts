import { withRetry } from './withRetry';
import { authFetch } from './authFetch';

// Веб-поиск поставщиков (вкладка "Ресерч" на странице Suppliers.tsx) —
// api/supplier-web-search.js, Claude Sonnet 5 через ProxyAPI. Результат не
// сохраняется в базу — это одноразовая подсказка, которую владелец либо
// добавляет как предложение (кнопка в модалке результатов), либо
// закрывает. Долго: модель реально делает 1-3 живых поисковых запроса
// (проверено вживую — 20-120+ секунд), поэтому таймаут заметно длиннее,
// чем у остальных AI-вызовов (meetingTranscribeApi.ts, 60с) — и БЕЗ
// повторной попытки при неудаче (withRetry с retries=0): при таком долгом
// вызове молчаливый повтор на всю его длительность ещё раз — плохой
// компромисс, лучше сразу показать ошибку.
const WEB_SEARCH_TIMEOUT_MS = 280000;

export interface SupplierSearchResult {
  name: string;
  website: string;
  phone: string;
  email: string;
  note: string;
}

export async function searchSuppliersOnline(itemsText: string, sectionTitle: string, extra: string): Promise<SupplierSearchResult[]> {
  return withRetry(
    async () => {
      const resp = await authFetch('/api/supplier-web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemsText, sectionTitle, extra }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Ошибка веб-поиска (${resp.status})`);
      return Array.isArray(data.results) ? data.results : [];
    },
    1000,
    WEB_SEARCH_TIMEOUT_MS,
    0,
  );
}
