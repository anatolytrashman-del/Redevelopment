// Vercel serverless function: копирует гугл-документ шаблона и подставляет
// значения полей вместо меток {{ключ}} через Docs API.
// Работает только на Vercel-домене — на GitHub Pages бэкенда нет.

import { batchUpdateDoc, copyDoc, extractDocId, fetchDocumentTemplate, getGoogleAccessToken } from './_google.js';
import { requireStaffAuth } from './_auth.js';

// Родительный падеж месяцев ("13 августа", а не "13 август") — Intl с одним
// только { month: 'long' } отдаёт именительный, поэтому склоняем вручную.
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatValue(field, rawValue) {
  if (field.type === 'date' && rawValue) {
    const d = new Date(rawValue);
    if (!Number.isNaN(d.getTime())) {
      return `«${d.getDate()}» ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()} г.`;
    }
  }
  return String(rawValue ?? '');
}

// Для поля типа "gender" по значению "Мужчина"/"Женщина" дополнительно
// генерируем производные метки {{key_title}} и {{key_suffix}} —
// "Гражданин"/"Гражданка", "проживающий"/"проживающая".
function genderReplacements(field, rawValue) {
  const isMale = rawValue === 'Мужчина';
  return [
    { key: `${field.key}_title`, text: isMale ? 'Гражданин' : 'Гражданка' },
    { key: `${field.key}_suffix`, text: isMale ? 'проживающий' : 'проживающая' },
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const user = await requireStaffAuth(req, res);
  if (!user) return;

  const { templateId, values } = req.body ?? {};
  if (!templateId || typeof values !== 'object' || values === null) {
    res.status(400).json({ error: 'templateId и values обязательны' });
    return;
  }

  try {
    const template = await fetchDocumentTemplate(templateId);
    const docId = extractDocId(template.url);
    if (!docId) throw new Error('Не удалось определить ID документа из ссылки шаблона');

    const accessToken = await getGoogleAccessToken();
    const surname = typeof values.buyer_name === 'string' ? values.buyer_name.trim().split(/\s+/)[0] : '';
    const dateStr = new Date().toLocaleDateString('ru-RU');
    const title = surname ? `${template.name} — ${surname} — ${dateStr}` : `${template.name} — ${dateStr}`;
    const copy = await copyDoc(docId, title, accessToken);

    const fields = template.fields ?? [];
    const filled = fields.filter((f) => values[f.key] !== undefined && values[f.key] !== '');

    const requests = filled.map((f) => ({
      replaceAllText: {
        containsText: { text: `{{${f.key}}}`, matchCase: true },
        replaceText: formatValue(f, values[f.key]),
      },
    }));

    for (const f of filled.filter((f) => f.type === 'gender')) {
      for (const { key, text } of genderReplacements(f, values[f.key])) {
        requests.push({
          replaceAllText: {
            containsText: { text: `{{${key}}}`, matchCase: true },
            replaceText: text,
          },
        });
      }
    }

    await batchUpdateDoc(copy.id, requests, accessToken);

    res.status(200).json({ url: `https://docs.google.com/document/d/${copy.id}/edit`, title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось сгенерировать документ' });
  }
}
