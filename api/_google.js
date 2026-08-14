// Общие хелперы для работы с Google Docs/Drive API — используются и
// admin-генератором документов (generate-document.js), и подписанием
// соглашения о намерениях (agreement-otp-verify.js), чтобы не дублировать
// логику получения токена/копирования/заполнения шаблона.

export async function getGoogleAccessToken() {
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

export function extractDocId(url) {
  const match = typeof url === 'string' ? url.match(/\/d\/([a-zA-Z0-9_-]+)/) : null;
  return match ? match[1] : null;
}

export async function copyDoc(docId, title, accessToken) {
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

export async function batchUpdateDoc(docId, requests, accessToken) {
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

// Экспортирует гугл-документ как PDF и возвращает бинарные данные — нужно,
// чтобы сохранить подписанное соглашение как самостоятельный файл в
// Supabase Storage, а не полагаться на доступность гугл-ссылки.
export async function exportDocAsPdf(docId, accessToken) {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application/pdf`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Не удалось экспортировать документ в PDF');
  return resp.arrayBuffer();
}

export async function deleteDoc(docId, accessToken) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${docId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function fetchDocumentTemplate(templateId) {
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
