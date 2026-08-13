// Vercel serverless function: копирует гугл-документ шаблона и подставляет
// значения полей вместо меток {{ключ}} через Docs API.
// Работает только на Vercel-домене — на GitHub Pages бэкенда нет.

function extractDocId(url) {
  const match = typeof url === 'string' ? url.match(/\/d\/([a-zA-Z0-9_-]+)/) : null;
  return match ? match[1] : null;
}

function formatValue(field, rawValue) {
  if (field.type === 'date' && rawValue) {
    const d = new Date(rawValue);
    if (!Number.isNaN(d.getTime())) {
      const month = d.toLocaleDateString('ru-RU', { month: 'long' });
      return `«${d.getDate()}» ${month} ${d.getFullYear()} г.`;
    }
  }
  return String(rawValue ?? '');
}

async function fetchTemplate(templateId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/document_templates?id=eq.${templateId}&select=*`;
  const resp = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) throw new Error('Не удалось загрузить шаблон из базы');
  const rows = await resp.json();
  if (!rows[0]) throw new Error('Шаблон не найден');
  return rows[0];
}

async function getGoogleAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Не удалось получить доступ к Google API');
  const data = await resp.json();
  return data.access_token;
}

async function copyDoc(docId, title, accessToken) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${docId}/copy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: title }),
  });
  if (!resp.ok) throw new Error('Не удалось скопировать документ-шаблон');
  return resp.json();
}

async function batchUpdateDoc(docId, requests, accessToken) {
  if (requests.length === 0) return;
  const resp = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Не удалось заполнить документ: ${text}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { templateId, values } = req.body ?? {};
  if (!templateId || typeof values !== 'object' || values === null) {
    res.status(400).json({ error: 'templateId и values обязательны' });
    return;
  }

  try {
    const template = await fetchTemplate(templateId);
    const docId = extractDocId(template.url);
    if (!docId) throw new Error('Не удалось определить ID документа из ссылки шаблона');

    const accessToken = await getGoogleAccessToken();
    const title = `${template.name} — ${new Date().toLocaleDateString('ru-RU')}`;
    const copy = await copyDoc(docId, title, accessToken);

    const fields = template.fields ?? [];
    const requests = fields
      .filter((f) => values[f.key] !== undefined && values[f.key] !== '')
      .map((f) => ({
        replaceAllText: {
          containsText: { text: `{{${f.key}}}`, matchCase: true },
          replaceText: formatValue(f, values[f.key]),
        },
      }));
    await batchUpdateDoc(copy.id, requests, accessToken);

    res.status(200).json({ url: `https://docs.google.com/document/d/${copy.id}/edit` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Не удалось сгенерировать документ' });
  }
}
